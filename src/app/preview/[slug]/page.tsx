import { notFound } from 'next/navigation';
import { loadForPlatform } from '@/lib/page';
import { ARCHETYPES, archetypeBySlug } from '@/components/archetypes/meta';
import { ARCHETYPE_VIEWS } from '@/components/archetypes/registry';
import { PreviewBar } from './PreviewBar';
import { I18nProvider } from '@/components/I18nProvider';
import { getI18n, providerValue, userLang } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * 디자인 원형 전체 화면 시안(전체 관리자 전용). 학교 화면 셸 밖에서 원형 고유의 탐색·레이아웃을 그대로 보여 준다.
 * 내용은 합성 자료(src/components/archetypes/data.ts)이며 DB를 읽지 않는다.
 */
export default async function PreviewPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ thumb?: string }>;
}) {
  const { uiLang } = await loadForPlatform(async ({ db }) => ({ uiLang: await userLang(db) }));
  const i18n = await getI18n(uiLang);
  const { slug } = await params;
  const { thumb } = await searchParams;
  const meta = archetypeBySlug(slug);
  const View = ARCHETYPE_VIEWS[slug];
  if (!meta || !View) notFound();
  const i = ARCHETYPES.indexOf(meta);
  const prev = ARCHETYPES[(i - 1 + ARCHETYPES.length) % ARCHETYPES.length].slug;
  const next = ARCHETYPES[(i + 1) % ARCHETYPES.length].slug;
  return (
    <div className="pv-root" data-archetype={slug}>
      <View />
      {thumb ? null : <I18nProvider value={providerValue(i18n)}><PreviewBar no={meta.no} total={ARCHETYPES.length} name={meta.name} prev={prev} next={next} /></I18nProvider>}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = archetypeBySlug(slug);
  const { t } = await getI18n();
  return { title: meta ? t('pv.metaTitle', { no: meta.no, name: meta.name }) : t('pv.metaTitleBare') };
}
