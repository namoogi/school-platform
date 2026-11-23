import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadForPage } from '@/lib/page';
import { NotFoundError } from '@/lib/services';
import { getEntry, getSettings, LANG_LABEL, type Lang } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { PageHead } from '@/components/site/load';

export const dynamic = 'force-dynamic';

/** 시안 미리보기 (학교 구성원만). 방문자 화면과 같은 그리기 코드에 시안 판을 넣는다. */
export default async function SitePreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; lang?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await loadForPage(async ({ db, school }) => {
    try { return { detail: await getEntry(db, school.id, id), settings: await getSettings(db, school.id) }; }
    catch (e) { if (e instanceof NotFoundError) return null; throw e; }
  }, { module: 'homepage' });
  if (!data?.detail) notFound();
  const { detail, settings } = data;
  const v = detail.versions.find((x) => String(x.version) === sp.v) ?? detail.versions[0];
  const langs = (settings?.langs ?? ['ko']) as Lang[];
  const fallback = (settings?.default_lang ?? 'ko') as Lang;
  const lang = langs.includes(sp.lang as Lang) ? (sp.lang as Lang) : fallback;
  return (
    <>
      <p className="banner" data-tone="warning" role="note" data-testid="preview-banner">
        시안 미리보기 · {v.version}판{v.id === detail.liveVersionId ? ' (공개 중인 판)' : ' — 방문자에게는 보이지 않습니다'}
        {' · '}{langs.map((l) => <Link key={l} href={`/site/preview/${id}?v=${v.version}&lang=${l}`} aria-current={l === lang ? 'true' : undefined} style={{ marginRight: 8 }}>{LANG_LABEL[l]}</Link>)}
      </p>
      <div className="site site-preview" data-theme={settings?.theme ?? 'campus'} lang={lang}>
        <main className="site-wrap site-main">
          <PageHead content={v.content} lang={lang} fallback={fallback} asset={(a) => `/site/assets/${a}`} />
          {/* 시안에서는 사이트 안 링크를 따라가지 않는다(공개 주소가 아직 없을 수 있음) */}
          <SiteBlocks content={v.content} lang={lang} fallback={fallback} assetUrl={(a) => `/site/assets/${a}`} link={() => '#'}
            textInImage={String(detail.entry.meta.text_in_image) === 'true'} />
        </main>
      </div>
    </>
  );
}
