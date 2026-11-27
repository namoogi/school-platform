import { NextResponse } from 'next/server';
import { asVisitor } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { parseInquiry, submitInquiry } from '@/lib/site-inquiries';

/**
 * 91차(ADR 0036): 방문자 방문·상담 신청(로그인 없음). body: { slug, kind, name, contact, preferred_date?, message?, lang?, page?, consent, website }
 * - 같은 출처만 받는다. website(사람에게 안 보이는 칸)가 채워져 있으면 자동 입력으로 보고 저장하지 않은 채 성공처럼 답한다.
 * - 학교는 slug로 찾고(DB 함수가 열린 홈페이지·신청 받기를 확인), 그 밖의 학교 ID는 받지 않는다.
 */
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let same = false;
  try { same = origin ? new URL(origin).host === host : req.headers.get('sec-fetch-site') !== 'cross-site'; } catch { same = false; }
  if (!same) return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || typeof b.slug !== 'string') return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    if (typeof b.website === 'string' && b.website.trim()) return NextResponse.json({ ok: true });
    const input = parseInquiry(b);
    const slug = b.slug.trim().toLowerCase();
    return NextResponse.json(await asVisitor((db) => submitInquiry(db, slug, input)));
  } catch (e) {
    return errorResponse(e);
  }
}
