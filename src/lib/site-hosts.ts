/**
 * 47차: 학교 자체 주소(호스트) → 공개 홈페이지 (ADR 0023). 순수 함수만 — proxy.ts 와 화면이 함께 쓴다.
 * - 그 주소로 들어오면 학교 홈페이지가 맨 위(/)에서 열리고, 주소창에는 /about · /news/making 처럼 깨끗한 경로가 보인다.
 * - 옛 사이트 주소(/about, /friends/letters/welcome …)도 그대로 열린다(넘겨주기 없이).
 * - 관리 화면(/login·/site·/admin …)은 플랫폼 주소로 보낸다.
 * 목록은 여기(코드)와 환경 변수 SCHOOL_HOSTS="host=slug,host2=slug2"(코드보다 우선)로 정한다. 주소 연결 자체는 Vercel 프로젝트 도메인에서 한다.
 */
export const SCHOOL_HOSTS: Record<string, string> = {
  'rungarunsuksa.vercel.app': 'rungarunsuksa',
};
export const PLATFORM_ORIGIN = 'https://onschools.vercel.app';
export const SCHOOL_HOST_HEADER = 'x-school-host';

function table(): Record<string, string> {
  const env = typeof process !== 'undefined' ? process.env.SCHOOL_HOSTS : undefined;
  if (!env) return SCHOOL_HOSTS;
  const out: Record<string, string> = { ...SCHOOL_HOSTS };
  for (const pair of env.split(',')) {
    const [h, s] = pair.split('=').map((x) => x?.trim().toLowerCase());
    if (h && s && /^[a-z0-9.-]+$/.test(h) && /^[a-z0-9][a-z0-9-]{1,39}$/.test(s)) out[h] = s;
  }
  return out;
}
export function slugForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  return table()[host.toLowerCase().replace(/:\d+$/, '')] ?? null;
}
export function hostForSlug(slug: string): string | null {
  return Object.entries(table()).find(([, s]) => s === slug)?.[0] ?? null;
}

/** 공개 홈페이지의 고정 경로. 이 이름들은 쪽 주소로 쓰지 않는다 */
export const SITE_RESERVED = new Set(['news', 'stories', 'p', 'a', 's', 'friends', 'api', '_next']);
const PLATFORM_PATHS = new Set(['login', 'logout', 'admin', 'site', 'home', 'intake', 'review', 'documents', 'settings', 'locked', 'invite', 'auth']);
const KEY = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** 옛 후원자 주소(/friends …) → 숨은 쪽 주소 이름 (31차 호환과 같은 규칙) */
export function friendsKey(rest: string[]): string {
  const ok = (s: string) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(s);
  if (rest[0] === 'letters' && rest[1] && ok(rest[1])) return `friends-letter-${rest[1]}`;
  if (rest[0] && ok(rest[0]) && rest[0] !== 'admin') return `friends-${rest[0]}`;
  return 'friends';
}

export type HostRoute =
  | { kind: 'pass' }
  | { kind: 'platform'; to: string }
  | { kind: 'rewrite'; to: string; defaultLang?: string };

/** 학교 주소로 온 요청을 어디로 보낼지 (경로만 다룸, 질의는 proxy 가 이어 붙임) */
export function routeSchoolHost(slug: string, pathname: string): HostRoute {
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0] ?? '';
  if (first === '_next' || first === 's' || first === 'api' || /\.[a-z0-9]{2,5}$/i.test(pathname)) return { kind: 'pass' };
  if (PLATFORM_PATHS.has(first)) return { kind: 'platform', to: `${PLATFORM_ORIGIN}${first === 'auth' ? '/login' : pathname}` };
  const base = `/s/${slug}`;
  if (!parts.length) return { kind: 'rewrite', to: base };
  if (first === 'friends') return { kind: 'rewrite', to: `${base}/p/${friendsKey(parts.slice(1))}`, defaultLang: 'ko' };
  if (first === 'news' || first === 'stories' || first === 'p' || first === 'a') return { kind: 'rewrite', to: `${base}${pathname}` };
  if (parts.length === 1 && KEY.test(first)) return { kind: 'rewrite', to: `${base}/p/${first}` };
  return { kind: 'rewrite', to: `${base}${pathname}` };
}

/** 학교 주소에서 보일 링크: /p/about → /about (고정 경로와 겹치지 않을 때) */
export function hostLink(path: string): string {
  const m = /^\/p\/([a-z0-9][a-z0-9-]{0,59})$/.exec(path);
  return m && !SITE_RESERVED.has(m[1]) ? `/${m[1]}` : path;
}
