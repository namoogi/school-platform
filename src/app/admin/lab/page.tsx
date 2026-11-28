import { loadForPlatform } from '@/lib/page';
import { directiveCounts, listItems } from '@/lib/lab';
import { getI18n, userLang } from '@/lib/i18n/server';
import { labLabels } from './labels';
import { LabBoard } from './LabBoard';
import { Banner, PageHeader, withLink } from '@/components/ui';
import Link from 'next/link';

/** 81차: 개발·연구소 — 카드 격자(요약·진행·도식 수). 상세에서 표·도식으로 보고, 하단 지침으로 세션에 맡긴다 */
export default async function LabPage() {
  const { items, open, counts, uiLang } = await loadForPlatform(async ({ db }) => ({
    uiLang: await userLang(db),
    items: await listItems(db, true),
    open: (await db.query<{ n: number }>("select count(*)::int as n from public.control_requests where status in ('open', 'parked', 'proceeding') and door is distinct from 'notice'")).rows[0].n,
    counts: await directiveCounts(db),
  }));
  const { t } = await getI18n(uiLang);
  const { kinds, priorities } = labLabels(t);
  return (
    <>
      <PageHeader title={t('nav.lab.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.lab.title') }]}
        description={t('lab.lead')} />
      <Banner tone={open ? 'warning' : 'info'}>
        {withLink(t('lab.banner', { open: open ? t('lab.bannerOpen', { n: open }) : '' }), <Link href="/admin/control">{t('nav.control.title')}</Link>)}
      </Banner>
      <LabBoard items={JSON.parse(JSON.stringify(items))} kinds={kinds} priorities={priorities} counts={counts} />
    </>
  );
}
