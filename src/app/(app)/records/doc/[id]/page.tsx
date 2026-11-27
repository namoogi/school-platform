import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { recordDocument, verifyRecordDocument } from '@/lib/records';
import { disclosuresOf } from '@/lib/recordbook';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { PrintButton } from '@/components/PrintButton';
import { RecordDocumentView } from '@/components/RecordDocumentView';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 목적 이름은 사전의 disc.purpose.*
const PURPOSES = ['issued_to_student', 'transfer', 'admission', 'other'];

/** 75차: 발행본 보기·인쇄 — 저장한 스냅샷만 그리고(지침 5), 해시를 다시 계산해 바뀌지 않았음을 보인다. 공개 기록(받는 곳·목적·근거) */
export default async function RecordDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { doc, ok, disclosures, uiLang, school } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db), doc: await recordDocument(db, school.id, id), ok: await verifyRecordDocument(db, school.id, id), disclosures: await disclosuresOf(db, school.id, id),
  }), { module: 'records', admin: true });
  const { t, locale } = await getI18n(uiLang, school.locale);
  const PURPOSE = PURPOSES.map((value) => ({ value, label: t(`disc.purpose.${value}` as MsgKey) }));
  const issues = (doc.issues ?? []) as { level: string; where: string; message: string }[];
  const back = doc.person_id ? `/records?p=${doc.person_id}` : '/records';
  return (
    <>
      <PageHeader title={(doc.content?.title as string) ?? t('recdoc.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.records'), href: back }, { label: t('recdoc.title') }]}
        description={t('recdoc.desc', { when: new Date(doc.published_at).toLocaleString(locale), hash: String(doc.content_sha256).slice(0, 16) })}
        meta={<>{ok ? <StatusBadge tone="success">{t('recdoc.verified')}</StatusBadge> : <StatusBadge tone="danger">{t('recdoc.mismatch')}</StatusBadge>}{doc.blind ? <StatusBadge tone="neutral">{t('recdoc.blind')}</StatusBadge> : null}</>}
        actions={<><Link className="btn" href={back}>{t('recdoc.back')}</Link><PrintButton /></>} />
      {issues.length > 0 && (
        <section className="card stack" data-testid="doc-issues">
          <h2>{t('recdoc.issues')} <small className="muted">{issues.length}</small></h2>
          <ul className="issue-list">{issues.map((i, n) => <li key={n}><span>{i.level === 'question' ? <StatusBadge tone="danger">{t('recdoc.question')}</StatusBadge> : <StatusBadge tone="neutral">{t('recdoc.note')}</StatusBadge>} <strong>{i.where}</strong> {i.message}</span></li>)}</ul>
        </section>)}
      <div className="paper-wrap"><div className="paper"><RecordDocumentView content={doc.content} /></div></div>
      <section className="card stack" data-testid="disclosures">
        <h2>{t('recdoc.disclosures')} <small className="muted">{t('recdoc.disclosuresSub')}</small></h2>
        {disclosures.length === 0 ? <p className="muted">{t('recdoc.noDisclosures')}</p> : (
          <ul className="issue-list">{disclosures.map((d) => <li key={d.id}><span><strong>{d.recipient}</strong> <small className="muted">{PURPOSE.find((p) => p.value === d.purpose)?.label ?? d.purpose} · {new Date(d.disclosed_at).toLocaleString(locale)}{d.basis ? ` · ${d.basis}` : ''}</small></span></li>)}</ul>)}
        <ActionForm url="/api/records" action="disclose" extra={{ documentId: doc.id }} inline submitLabel={t('recdoc.addDisclosure')} successText={t('recdoc.disclosureAdded')} testId="disclose-form"
          fields={[{ name: 'recipient', label: t('recdoc.recipient'), required: true, placeholder: t('recdoc.recipientPlaceholder') }, { name: 'purpose', label: t('recdoc.purpose'), type: 'select', options: PURPOSE },
            { name: 'basis', label: t('recdoc.basis'), placeholder: t('recdoc.basisPlaceholder') }]} />
      </section>
    </>
  );
}
