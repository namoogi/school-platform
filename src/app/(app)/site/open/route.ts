import { NextResponse } from 'next/server';
import { asUser } from '@/lib/db';
import { currentUserId, isInspector, sessionCookieOptions } from '@/lib/auth';
import { enterSchool } from '@/lib/admin';
import { SCHOOL_COOKIE } from '@/lib/context';
import { safeBack } from '@/lib/next-path';

/**
 * 48차: 공개 화면에서 '교직원 로그인'(이 화면 편집) → 로그인 → 그 쪽의 화면 편집으로 바로 간다 (ADR 0011 1단계 남은 일).
 * ?slug=<학교 주소 이름>&kind=page|news|story&key=<주소 이름>&back=<돌아갈 공개 화면>
 * - 로그인 안 했으면 로그인 화면으로(끝나면 이 주소로 돌아옴).
 * - 그 학교의 관리자만(RLS·app.is_school_admin). 학교 id는 주소 이름에서 서버가 정하고, 작업 학교 쿠키도 그 학교로 맞춘다.
 * - 항목이 없거나 목록 화면이면 홈페이지 관리로.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';
  const kind = url.searchParams.get('kind') ?? '';
  const key = url.searchParams.get('key') ?? '';
  const back = safeBack(url.searchParams.get('back'));
  // 49차: 관리 막대의 다른 길 — 소식 쓰기·홈페이지 관리·개선 요청(대화창)
  const goto = url.searchParams.get('to') ?? 'edit';
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url), 303);
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return NextResponse.redirect(new URL('/site', url), 303);
  const found = await asUser(userId, async (db) => {
    const { rows: [s] } = await db.query<{ school_id: string; admin: boolean }>(
      'select school_id, app.is_school_admin(school_id) as admin from public.site_settings where public_slug = $1', [slug]);
    if (!s) return null;
    // 전체 관리자가 다른 학교에 들어가면 입장 기록이 남는다(학교 전환과 같은 길). 점검 계정은 읽기 전용이라 기록하지 않는다
    if (s.admin && !isInspector(userId)) await enterSchool(db, s.school_id);
    const ok = ['page', 'news', 'story'].includes(kind) && /^[a-z0-9][a-z0-9-]{0,59}$/.test(key);
    const { rows: [e] } = ok
      ? await db.query<{ id: string }>('select id from public.site_entries where school_id = $1 and kind = $2 and key = $3 and archived_at is null', [s.school_id, kind, key])
      : { rows: [] as { id: string }[] };
    return { school: s.school_id, admin: s.admin, entry: e?.id ?? null };
  }).catch(() => null);
  if (!found) return NextResponse.redirect(new URL('/locked?reason=admin', url), 303);
  if (!found.admin) return NextResponse.redirect(new URL('/locked?reason=admin', url), 303);
  const to = goto === 'news' ? '/site?box=news&new=1'
    : goto === 'manage' ? '/site'
    : goto === 'chat' ? '/site?chat=1'
    : found.entry
      ? `/site/edit/${found.entry}${back ? `?back=${encodeURIComponent(back)}` : ''}`
      : `/site${kind === 'news' ? '?box=news' : kind === 'story' ? '?box=story' : ''}`;
  const res = NextResponse.redirect(new URL(to, url), 303);
  res.cookies.set(SCHOOL_COOKIE, found.school, sessionCookieOptions());
  return res;
}
