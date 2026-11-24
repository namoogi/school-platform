import { PLATFORM_ORIGIN, slugForHost } from './site-hosts';

/** 48차: 로그인 뒤 돌아갈 곳. 이 사이트 안 경로만(다른 사이트로 보내는 열린 넘겨주기 방지) */
export function safeNext(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > 600 || !s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return null;
  return s;
}

/** 48차: 편집을 마치고 돌아갈 공개 화면. 플랫폼 공개 경로(/s/…)나 등록된 학교 주소의 https 주소만 */
export function safeBack(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > 600) return null;
  if (s.startsWith('/s/') && !s.includes('\\') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' && (slugForHost(u.host) || u.origin === PLATFORM_ORIGIN)) return u.toString();
  } catch { /* 아래 */ }
  return null;
}
