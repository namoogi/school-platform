import { loadForPage } from '@/lib/page';
import { getSettings } from '@/lib/site';
import { listInquiries } from '@/lib/site-inquiries';
import { PageHeader } from '@/components/ui';
import { InquiriesClient } from './InquiriesClient';
import { getI18n, userLang } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** 91차(ADR 0036): 받은 방문·상담 신청 — 학교 관리자만(RLS도 관리자만). 지우지 않고 처리 표시·보존 기간 뒤 가리기만 한다 */
export default async function InquiriesPage() {
  const { inquiries, settings, school, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    inquiries: await listInquiries(db, school.id),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage', admin: true });
  const { t } = await getI18n(uiLang, school.locale);
  return (
    <>
      <PageHeader title={t('site.home.inquiries')} crumbs={[{ label: t('site.home.title'), href: '/site' }, { label: t('site.home.inquiries') }]}
        description={t('site.inq.lead')}
        meta={<span>{settings?.inquiry_open ? t('site.inq.openNow') : t('site.inq.closedNow')}</span>} />
      <InquiriesClient inquiries={JSON.parse(JSON.stringify(inquiries))} />
    </>
  );
}
