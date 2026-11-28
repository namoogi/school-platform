import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { portalDocument } from '@/lib/portal';
import { PageHeader } from '@/components/ui';
import { PrintButton } from '@/components/PrintButton';
import { RecordDocumentView } from '@/components/RecordDocumentView';
import { I18nProvider } from '@/components/I18nProvider';
import { getI18n, providerValue, userLang } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** 62차: 발행본 보기 — 발행 때 저장한 내용(스냅샷)만 그린다(지침 5). 75차: 교직원 화면과 같은 보기·인쇄 */
export default async function MyDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { doc, uiLang } = await asUser(userId, async (db) => ({ doc: await portalDocument(db, id), uiLang: await userLang(db) }));
  const i18n = await getI18n(uiLang);
  const { t, locale } = i18n;
  const c = doc.content as { title?: string };
  return (
    <I18nProvider value={providerValue(i18n)}>
    <div className="portal" lang={i18n.lang} dir={i18n.dir}>
      <header className="portal-top"><Link href="/my">{t('my.back')}</Link></header>
      <main className="content-inner content-narrow portal-main" id="main">
        <PageHeader title={c.title ?? t('recdoc.title')} crumbs={[{ label: t('my.title') }, { label: t('recdoc.title') }]}
          description={t('my.docDesc', { when: new Date(doc.published_at).toLocaleDateString(locale, { timeZone: 'Asia/Seoul' }), hash: doc.sha256.slice(0, 12) })}
          actions={<PrintButton />} />
        <div className="paper-wrap" data-testid="my-document"><div className="paper"><RecordDocumentView content={doc.content as Record<string, unknown>} /></div></div>
      </main>
    </div>
    </I18nProvider>
  );
}
