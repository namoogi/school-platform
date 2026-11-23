import { handle } from '@/lib/api';
import { saveSettings } from '@/lib/site';

/** 홈페이지 설정 저장 (학교 관리자, 홈페이지 기능) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => saveSettings(db, school.id, body ?? {}), { module: 'homepage', admin: true });
}
