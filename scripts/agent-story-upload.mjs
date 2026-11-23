#!/usr/bin/env node
// 34차: 외부 작업 토큰으로 성품 동화에 캐릭터 그림·PDF를 올리고 새 판(시안)을 만든다. (ADR 0012, docs/agents/story-agent.md)
//
// 사용:
//   export SCHOOL_AGENT_TOKEN=agt_...   # 학교 관리자가 /site → 설정 → '외부 작업 토큰'에서 발급 (원문은 출력하지 않음)
//   node scripts/agent-story-upload.mjs <폴더> [--dry-run] [--base https://onschools.vercel.app]
//
// 폴더 안: manifest.json + 그 안에 적은 파일들 (캐릭터 PNG, PDF)
// 하는 일: 1) 토큰 확인 2) 동화의 최신 판 읽기 3) 파일 올리기(같은 파일은 다시 올리지 않음)
//          4) 최신 판 블록 + '캐릭터 소개' 구역 + 'PDF 내려받기' 블록으로 새 판 저장(이전에 이 스크립트가 붙인 블록은 바꿔 끼움)
// 공개는 하지 않는다. 학교 관리자가 /site 의 성품 동화 함에서 시안 미리보기를 보고 공개한다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry-run');
const baseArg = args.indexOf('--base');
const BASE = (baseArg >= 0 ? args[baseArg + 1] : process.env.ONSCHOOLS_URL) || 'https://onschools.vercel.app';
const TOKEN = process.env.SCHOOL_AGENT_TOKEN ?? '';

function fail(msg) { console.error(`오류: ${msg}`); process.exit(1); }
if (!dir) fail('폴더를 적어 주세요. 예: node scripts/agent-story-upload.mjs ./out/brave-elephant');
if (!/^agt_[0-9a-f]{64}$/.test(TOKEN)) fail('환경 변수 SCHOOL_AGENT_TOKEN 에 작업 토큰(agt_…)을 넣어 주세요.');
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) fail('주소는 https 이어야 합니다(로컬 시험만 http://localhost 허용).');

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };
const LIMIT = { 'application/pdf': 4 * 1024 * 1024, image: 5 * 1024 * 1024 };
const LANGS = ['ko', 'en', 'th'];

const manifestPath = path.join(dir, 'manifest.json');
if (!fs.existsSync(manifestPath)) fail(`${manifestPath} 가 없습니다. docs/agents/story-agent.md 의 manifest 예시를 보세요.`);
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(m.story_key ?? '')) fail('manifest.story_key 는 동화 주소 이름(영문 소문자·숫자·-)이어야 합니다.');
const lt = (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k, s]) => LANGS.includes(k) && typeof s === 'string' && s)) : typeof v === 'string' ? { ko: v } : undefined);
const sameText = (a, b) => !!a && !!b && LANGS.some((l) => a[l] && a[l] === b[l]);

// ── 서버 요청 (토큰은 머리에만, 출력에는 남기지 않음) ─────
async function api(method, p, body, type) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'x-agent-token': TOKEN, ...(type ? { 'content-type': type } : body ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : type ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${method} ${p.split('?')[0]} → ${res.status} ${data.error ?? ''}`);
  return data;
}

function readFile(rel) {
  const full = path.resolve(dir, rel);
  if (!full.startsWith(path.resolve(dir) + path.sep)) fail(`${rel}: 폴더 밖 파일은 올리지 않습니다.`);
  if (!fs.existsSync(full)) fail(`${rel} 파일이 없습니다.`);
  const ext = path.extname(full).slice(1).toLowerCase();
  const mime = MIME[ext];
  if (!mime) fail(`${rel}: PNG·JPG·WEBP·PDF만 올릴 수 있습니다.`);
  const bytes = fs.readFileSync(full);
  const limit = mime === 'application/pdf' ? LIMIT[mime] : LIMIT.image;
  if (bytes.length > limit) fail(`${rel}: ${(bytes.length / 1024 / 1024).toFixed(1)}MB — ${mime === 'application/pdf' ? 'PDF는 4MB 이하(웹용 150dpi 정도로 줄이기)' : '그림은 5MB 이하'}여야 합니다.`);
  if (mime === 'image/png') {
    // 권장 규격 확인(경고만): 투명 배경(RGBA 또는 tRNS), 긴 변 1024px 안팎
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20), colorType = bytes[25];
    const alpha = colorType === 6 || colorType === 4 || bytes.includes(Buffer.from('tRNS'));
    if (!alpha) console.warn(`  주의: ${rel} 은 투명 배경이 아닙니다(캐릭터는 투명 PNG 권장).`);
    if (Math.max(w, h) < 768 || Math.max(w, h) > 2048) console.warn(`  주의: ${rel} 크기 ${w}×${h} — 긴 변 1024px 정도를 권장합니다.`);
  }
  return { name: path.basename(full), mime, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

// ── 1) 토큰·동화 확인 ─────────────────────────────────────
const me = await api('GET', '/api/agent/me');
console.log(`학교: ${me.school} · 토큰: ${me.label} · 범위: ${me.story_key ? `동화 /${me.story_key}` : '성품 동화 모두'} · 기한 ${String(me.expires_at).slice(0, 10)}`);
const story = await api('GET', `/api/agent/stories/${m.story_key}`);
console.log(`동화 /${story.key}: 최신 ${story.latest.version}판 · 공개 ${story.live_version ?? '없음'}`);

// ── 2) 파일 준비 ──────────────────────────────────────────
const chars = m.characters?.items ?? [];
if (chars.length > 12) fail('캐릭터는 12명까지 한 구역에 넣을 수 있습니다.');
const pdfs = m.pdfs ?? (m.pdf ? [m.pdf] : []);
const files = [...chars.map((c) => readFile(c.file)), ...pdfs.map((p) => readFile(p.file))];
for (const p of pdfs) if (MIME[path.extname(p.file).slice(1).toLowerCase()] !== 'application/pdf') fail(`${p.file}: pdfs 에는 PDF만 넣습니다.`);

const existing = new Map((await api('GET', '/api/agent/assets')).map((a) => [a.sha256, a.id]));
const ids = [];
for (const f of files) {
  if (existing.has(f.sha256)) { ids.push(existing.get(f.sha256)); console.log(`  있음: ${f.name}`); continue; }
  if (dry) { ids.push(`(올릴 예정: ${f.name})`); console.log(`  올릴 예정: ${f.name} (${(f.bytes.length / 1024).toFixed(0)}KB)`); continue; }
  const r = await api('POST', `/api/agent/assets?name=${encodeURIComponent(f.name)}`, f.bytes, f.mime);
  ids.push(r.id);
  console.log(`  올림: ${f.name}`);
}

// ── 3) 새 판 만들기 ───────────────────────────────────────
const sectionTitle = lt(m.characters?.title) ?? { ko: '등장인물', en: 'Characters', th: 'ตัวละคร' };
const blocks = story.latest.content.blocks.filter((b) =>
  !(b.type === 'download') && !(b.type === 'section' && b.template === 'cards' && sameText(b.title, sectionTitle)));
if (chars.length) {
  blocks.push({
    type: 'section', template: 'cards', title: sectionTitle, eyebrow: lt(m.characters?.eyebrow), body: lt(m.characters?.body),
    items: chars.map((c, i) => ({ title: lt(c.name), body: lt(c.body), asset: ids[i], alt: lt(c.alt) ?? lt(c.name) })),
  });
}
pdfs.forEach((p, i) => blocks.push({ type: 'download', asset: ids[chars.length + i], label: lt(p.label), note: lt(p.note) }));
const content = { ...story.latest.content, blocks };
const note = String(m.note ?? `캐릭터 ${chars.length}명 · PDF ${pdfs.length}개`).slice(0, 200);

if (dry) {
  console.log(`\n(시험 실행) 저장하지 않았습니다. 새 판 블록 ${blocks.length}개: ${blocks.map((b) => b.type).join(', ')}`);
  process.exit(0);
}
// base_version: 읽은 판. 그 사이 사람이나 다른 에이전트가 새 판을 만들었으면 서버가 409로 거부한다(덮지 않음) → 다시 실행
const v = await api('POST', `/api/agent/stories/${m.story_key}/versions`, { content, note, base_version: story.latest.version });
console.log(`\n새 판 저장: ${v.version}판 (시안, 공개 안 됨). 학교 관리자가 ${BASE}/site?box=story 에서 미리보기 → 공개하세요.`);
