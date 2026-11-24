import { handle } from '@/lib/api';
import { createEntry, listEntries } from '@/lib/site';

/** 이 학교 항목 목록(최신 판·공개 판 번호) — 관제 세션·스크립트용 (구성원) */
export async function GET(req: Request) {
  return handle(req, ({ db, school }) => listEntries(db, school.id), { module: 'homepage' });
}

/** 새 쪽·소식·동화 시안 (구성원). 동화는 성품 동화 기능이 켜진 학교만(RLS) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => createEntry(db, school.id, body ?? {}), { module: 'homepage' });
}
