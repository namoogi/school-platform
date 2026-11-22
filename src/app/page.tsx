import { redirect } from 'next/navigation';
import { loadForPage } from '@/lib/page';

export const dynamic = 'force-dynamic';

/** 첫 화면: 작업 학교의 첫 기능으로. 학교가 없는 전체 관리자는 전체 관리로. */
export default async function Home() {
  const { school } = await loadForPage(async () => ({}));
  if (school.modules.includes('intake')) redirect('/intake');
  if (school.modules.includes('records')) redirect('/documents');
  redirect(school.isAdmin ? '/settings' : '/locked');
}
