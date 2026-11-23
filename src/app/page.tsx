import { redirect } from 'next/navigation';
import { loadForPage } from '@/lib/page';

export const dynamic = 'force-dynamic';

/** 첫 화면: 작업 학교의 홈(오늘의 학사 업무)으로. 학교가 없는 전체 관리자는 loadForPage가 전체 관리로 보낸다. */
export default async function Root() {
  await loadForPage(async () => ({}));
  redirect('/home');
}
