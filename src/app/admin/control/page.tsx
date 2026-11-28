import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { listControl, NEEDS_USER } from '@/lib/control';
import { isUuid } from '@/lib/services';
import { Kpi, PageHeader } from '@/components/ui';
import { ControlCenter } from './ControlCenter';
import { withLink } from '@/components/ui';
import { getI18n, userLang } from '@/lib/i18n/server';

export default async function ControlPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const { requests, sessions, lab, uiLang } = await loadForPlatform(async ({ db }) => {
    const data = await listControl(db);
    // 개발·연구소 항목에서 '세션에 지시'로 들어오면 그 항목의 제목·내용을 새 지시에 채운다
    const lab = from && isUuid(from)
      ? (await db.query<{ id: string; title: string; body: string }>('select id, title, body from public.platform_items where id = $1', [from])).rows[0] ?? null
      : null;
    return { ...data, lab, uiLang: await userLang(db) };
  });
  const { t } = await getI18n(uiLang);
  // 알림 카드는 답할 일이 아니므로 '답 필요' 숫자에서 뺀다(ADR 0048)
  const count = (s: string[]) => requests.filter((r) => s.includes(r.status) && !(r.door === 'notice' && NEEDS_USER.includes(r.status))).length;
  return (
    <>
      <PageHeader title={t('nav.control.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.control.title') }]}
        description={withLink(t('cc.lead'), <Link href="/admin/lab">{t('nav.lab.title')}</Link>)} />
      <div className="kpis" data-testid="control-summary">
        <Kpi label={t('cc.kpi.need')} value={t('common.countItems', { n: count(NEEDS_USER) })} tone={count(NEEDS_USER) ? 'warning' : undefined}
          hint={t('cc.kpi.needHint', { parked: count(['parked']), proceeding: count(['proceeding']) })} />
        <Kpi label={t('control.status.answered')} value={t('common.countItems', { n: count(['answered']) })} hint={t('cc.kpi.answeredHint')} />
        <Kpi label={t('control.status.delivered')} value={t('common.countItems', { n: count(['delivered']) })} hint={t('cc.kpi.deliveredHint')} />
      </div>
      <ControlCenter requests={JSON.parse(JSON.stringify(requests))} sessions={sessions} lab={lab} />
    </>
  );
}
