import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ValidationError } from './services';

/**
 * 67차 ADR 0031 — 기존 학교 홈페이지 읽기(크롤링). 학교 관리자가 준 주소에서 같은 사이트 안의 쪽 몇 개를 읽어 글·그림 목록을 만든다.
 * 안전: 공개 인터넷 주소만(사설·내부·메타데이터 주소 거부, 리디렉트마다 다시 검사), http(s)·기본 포트만, robots.txt 를 따른다,
 * 쪽 수·시간·크기 한도. 읽은 글은 내용으로만 다루고 지시로 해석하지 않는다.
 */
export type CrawledPage = { url: string; title: string; text: string; images: { src: string; alt: string }[] };
export type CrawlResult = { start: string; pages: CrawledPage[]; skipped: { url: string; why: string }[] };
type Opts = { maxPages?: number; timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch; allowPrivate?: boolean; budgetMs?: number };

const UA = 'SchoolPlatformMigrator/1.0 (+school homepage migration on request of the school)';

function privateV4(ip: string) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 198 && (b === 18 || b === 19));
}
function privateV6(ip: string) {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('::ffff:')) return privateV4(s.slice(7));
  return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff');
}
export function isPrivateAddress(ip: string) {
  return isIP(ip) === 4 ? privateV4(ip) : isIP(ip) === 6 ? privateV6(ip) : true;
}

/** 공개 인터넷 주소인지 확인(주소 모양 + DNS 결과 모두) */
export async function assertPublicUrl(raw: string, allowPrivate = false): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ValidationError('주소 형식이 올바르지 않습니다.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ValidationError('http·https 주소만 읽습니다.');
  if (u.username || u.password) throw new ValidationError('사용자 정보가 든 주소는 읽지 않습니다.');
  if (allowPrivate) return u; // 시험 전용(코드에서만 켬, API로는 켤 수 없음)
  if (u.port && !['80', '443'].includes(u.port)) throw new ValidationError('기본 포트(80·443) 주소만 읽습니다.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new ValidationError('내부 주소는 읽지 않습니다.');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new ValidationError('주소를 찾을 수 없습니다.'); });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new ValidationError('공개 인터넷 주소만 읽습니다.');
  return u;
}

async function get(url: string, o: Required<Pick<Opts, 'timeoutMs' | 'maxBytes'>> & Opts, accept: string) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current, o.allowPrivate);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs);
    try {
      const res = await (o.fetchImpl ?? fetch)(u.toString(), { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': UA, accept } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, u).toString(); continue; }
      if (!res.ok) return { url: u.toString(), status: res.status, type: '', bytes: Buffer.alloc(0) };
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > o.maxBytes) return { url: u.toString(), status: 413, type: '', bytes: Buffer.alloc(0) };
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = []; let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > o.maxBytes) { await reader.cancel(); return { url: u.toString(), status: 413, type: '', bytes: Buffer.alloc(0) }; }
          chunks.push(value);
        }
      }
      return { url: u.toString(), status: res.status, type: res.headers.get('content-type') ?? '', bytes: Buffer.concat(chunks) };
    } finally { clearTimeout(timer); }
  }
  throw new ValidationError('리디렉트가 너무 많습니다.');
}

/** robots.txt 의 'User-agent: *' 묶음 Disallow 규칙(접두어) */
export function robotsDisallow(txt: string): string[] {
  const out: string[] = []; let applies = false; let sawRule = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(); const v = m[2].trim();
    if (k === 'user-agent') { if (sawRule) { applies = false; sawRule = false; } applies = applies || v === '*'; }
    else if (k === 'disallow') { sawRule = true; if (applies && v) out.push(v); }
    else if (k === 'allow') sawRule = true;
  }
  return out;
}

/** HTML → 줄글(제목은 따로 한 줄, 목록은 '- '). 스크립트·스타일·폼은 버린다. 그림은 주소·대체 글 */
export async function htmlToText(html: string, base: string) {
  const { parse } = await import('node-html-parser');
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  for (const el of root.querySelectorAll('script,style,noscript,svg,form,iframe,template')) el.remove();
  const title = (root.querySelector('title')?.text ?? root.querySelector('h1')?.text ?? '').replace(/\s+/g, ' ').trim();
  const lines: string[] = [];
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,p,li,dt,dd,td,th,address,blockquote,figcaption')) {
    const tag = el.rawTagName.toLowerCase();
    // 안쪽 블록에 다시 나올 글은 바깥에서 빼지 않도록, 블록 안 블록이 있으면 건너뛴다
    if (el.querySelector('p,li,h1,h2,h3,h4,h5,dd,td')) continue;
    const t = clean(el.text);
    if (!t) continue;
    lines.push(tag === 'li' ? `- ${t}` : /^h\d$/.test(tag) ? `\n${t}` : tag === 'dt' ? `${t}:` : t);
  }
  const images: { src: string; alt: string }[] = [];
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? img.getAttribute('data-src') ?? '';
    if (!src || src.startsWith('data:')) continue;
    try { const abs = new URL(src, base); if (abs.protocol.startsWith('http')) images.push({ src: abs.toString(), alt: clean(img.getAttribute('alt') ?? '') }); } catch { /* 건너뜀 */ }
  }
  const links: string[] = [];
  for (const a of root.querySelectorAll('a[href]')) {
    try { const abs = new URL(a.getAttribute('href')!, base); abs.hash = ''; links.push(abs.toString()); } catch { /* 건너뜀 */ }
  }
  return { title, text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), images, links };
}

/** 같은 사이트(같은 호스트) 안의 쪽을 너비 우선으로 읽는다 */
export async function crawlSite(start: string, opts: Opts = {}): Promise<CrawlResult> {
  const o = { maxPages: 10, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, budgetMs: 40000, ...opts };
  const deadline = Date.now() + o.budgetMs;
  const first = await assertPublicUrl(start, o.allowPrivate);
  const origin = first.origin;
  // 69차: 시작 주소가 하위 경로(예: /s/학교)면 그 경로 아래만 읽는다(같은 호스트의 다른 사이트·로그인 쪽 제외)
  const prefix = first.pathname === '/' ? '/' : first.pathname.replace(/\/[^/]*\.[a-z0-9]+$/i, '').replace(/\/$/, '');
  let disallow: string[] = [];
  try {
    const r = await get(`${origin}/robots.txt`, o, 'text/plain');
    if (r.status === 200) disallow = robotsDisallow(r.bytes.toString('utf8'));
  } catch { /* robots 가 없으면 제한 없음 */ }
  const blocked = (u: URL) => disallow.some((d) => d === '/' || u.pathname.startsWith(d));
  const queue = [first.toString()];
  const seen = new Set<string>(queue);
  const pages: CrawledPage[] = []; const skipped: { url: string; why: string }[] = [];
  while (queue.length && pages.length < o.maxPages) {
    const url = queue.shift()!;
    if (Date.now() > deadline) { skipped.push({ url, why: '시간 한도로 멈춤' }); break; }
    const u = new URL(url);
    if (blocked(u)) { skipped.push({ url, why: 'robots.txt 가 막음' }); continue; }
    let r;
    try { r = await get(url, o, 'text/html'); } catch (e) { skipped.push({ url, why: (e as Error).message || '읽지 못함' }); continue; }
    if (r.status !== 200) { skipped.push({ url, why: `응답 ${r.status}` }); continue; }
    const fu = new URL(r.url);
    if (fu.origin !== origin || (prefix !== '/' && fu.pathname !== prefix && !fu.pathname.startsWith(`${prefix}/`))) { skipped.push({ url, why: '사이트 밖으로 넘어감' }); continue; }
    if (!/text\/html|application\/xhtml/i.test(r.type)) { skipped.push({ url, why: 'HTML 쪽이 아님' }); continue; }
    const { title, text, images, links } = await htmlToText(r.bytes.toString('utf8'), r.url);
    pages.push({ url: r.url, title, text, images });
    for (const l of links) {
      const lu = new URL(l);
      if (lu.origin !== origin || (prefix !== '/' && lu.pathname !== prefix && !lu.pathname.startsWith(`${prefix}/`)) || seen.has(l) || /\.(pdf|jpe?g|png|gif|webp|zip|hwp|docx?|xlsx?|pptx?|mp4|mp3)$/i.test(lu.pathname)) continue;
      if (lu.search.length > 60) continue;
      seen.add(l); queue.push(l);
    }
  }
  return { start: first.toString(), pages, skipped };
}

/** 그림 하나 가져오기(같은 안전 검사, 5MB) */
export async function fetchImage(url: string, opts: Opts = {}) {
  const r = await get(url, { timeoutMs: 8000, maxBytes: 5 * 1024 * 1024, ...opts }, 'image/*');
  if (r.status !== 200) throw new ValidationError(`그림을 받지 못했습니다(응답 ${r.status}).`);
  return { bytes: r.bytes, type: r.type.split(';')[0].trim(), name: decodeURIComponent(new URL(r.url).pathname.split('/').pop() || 'image').slice(0, 120) };
}
