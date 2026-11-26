import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { portalDocument } from '@/lib/portal';
import { PageHeader } from '@/components/ui';
import { PrintButton } from '@/components/PrintButton';
import { RecordDocumentView } from '@/components/RecordDocumentView';

export const dynamic = 'force-dynamic';

/** 62차: 발행본 보기 — 발행 때 저장한 내용(스냅샷)만 그린다(지침 5). 75차: 교직원 화면과 같은 보기·인쇄 */
export default async function MyDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const doc = await asUser(userId, (db) => portalDocument(db, id));
  const c = doc.content as { title?: string };
  return (
    <div className="portal">
      <header className="portal-top"><Link href="/my">← 내 기록</Link></header>
      <main className="content-inner content-narrow portal-main" id="main">
        <PageHeader title={c.title ?? '발행본'} crumbs={[{ label: '내 기록' }, { label: '발행본' }]}
          description={`발행 ${new Date(doc.published_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} · 확인값 ${doc.sha256.slice(0, 12)}…`}
          actions={<PrintButton />} />
        <div className="paper-wrap" data-testid="my-document"><div className="paper"><RecordDocumentView content={doc.content as Record<string, unknown>} /></div></div>
      </main>
    </div>
  );
}
