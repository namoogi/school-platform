import { loadForPage } from '@/lib/page';
import { getSettings } from '@/lib/site';
import { listInquiries } from '@/lib/site-inquiries';
import { PageHeader } from '@/components/ui';
import { InquiriesClient } from './InquiriesClient';

export const dynamic = 'force-dynamic';

/** 91차(ADR 0036): 받은 방문·상담 신청 — 학교 관리자만(RLS도 관리자만). 지우지 않고 처리 표시·보존 기간 뒤 가리기만 한다 */
export default async function InquiriesPage() {
  const { inquiries, settings } = await loadForPage(async ({ db, school }) => ({
    inquiries: await listInquiries(db, school.id),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage', admin: true });
  return (
    <>
      <PageHeader title="방문·상담 신청" crumbs={[{ label: '학교 홈페이지', href: '/site' }, { label: '방문·상담 신청' }]}
        description="홈페이지의 '방문·상담 신청' 칸으로 들어온 신청입니다. 학교 관리자만 봅니다. 연락한 뒤 '처리함'으로 표시하고, 오래된 신청은 이름·연락처를 가립니다."
        meta={<span>{settings?.inquiry_open ? '지금 신청을 받는 중' : '지금은 신청을 받지 않음(설정에서 켜기)'}</span>} />
      <InquiriesClient inquiries={JSON.parse(JSON.stringify(inquiries))} />
    </>
  );
}
