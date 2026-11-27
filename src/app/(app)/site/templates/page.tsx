import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { getSettings, listEntries, LANG_LABEL, SITE_THEMES, type Lang } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { PageHeader, StatusBadge } from '@/components/ui';
import { MigrateStart } from './TemplatesClient';

/** 65차(ADR 0031): 홈페이지 템플릿 둘러보기 — 형식 7종. 미리보기 후 고르면 시안 쪽을 만든다 */
export default async function TemplatesPage() {
  const { pages, school, settings } = await loadForPage(async ({ db, school }) => ({
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage' });
  const designName = (k: string | null | undefined) => SITE_THEMES.find((x) => x.key === k)?.name ?? null;
  const siteState = { exists: !!settings, open: !!settings?.is_open, theme: settings?.theme ?? null, themeName: designName(settings?.theme) };
  return (
    <>
      <PageHeader title="홈페이지 템플릿" crumbs={[{ label: '학교 홈페이지', href: '/site' }, { label: '템플릿' }]}
        description="템플릿마다 디자인(색·글꼴·첫 화면)과 쪽 구성이 함께 들어 있습니다. 미리보기로 완성 모습을 보고 고르면 쪽 시안이 만들어집니다. 공개는 내용을 채운 뒤 직접 합니다."
        meta={<span>지금 쪽 {pages.length}개</span>} />
      {school.isAdmin && <MigrateStart site={siteState} templates={SITE_TEMPLATES.map((t) => ({ key: t.key, name: t.name, summary: t.summary, designName: designName(t.theme) ?? t.theme }))} />}
      <h2 className="section-title">템플릿 둘러보기</h2>
      <div className="template-grid" data-testid="template-grid">
        {SITE_TEMPLATES.map((t) => (
          <article key={t.key} className="card template-card">
            {/* 89차(ADR 0034): 첫 화면과 안쪽 쪽을 겹친 썸네일 — 누르면 전체 화면 미리보기. 다시 찍기: npm run templates:thumbs */}
            <Link className="template-thumb" href={`/templates/${t.key}`} tabIndex={-1} aria-hidden="true">
              <img src={`/site-templates/${t.key}.jpg`} alt="" width={960} height={600} loading="lazy" />
            </Link>
            <div className="template-card-head">
              <h2>{t.name}</h2>
              <StatusBadge tone="neutral">디자인 · {designName(t.theme)}</StatusBadge>
            </div>
            <p>{t.summary}</p>
            <p className="template-chips fine">
              <span>쪽 {t.pages.length}개</span>
              <span>{t.langs.map((l) => LANG_LABEL[l as Lang]).join('·')}</span>
              <span>채울 칸 {t.slots.length}개</span>
            </p>
            <p className="fine muted">맞는 학교: {t.fits.join(' · ')}</p>
            <div className="form-actions">
              <Link className="btn btn-primary" href={`/templates/${t.key}`} data-testid={`template-live-${t.key}`}>미리보기</Link>
              <Link className="btn" href={`/site/templates/${t.key}`} data-testid={`template-open-${t.key}`}>자세히 · 시작하기</Link>
            </div>
          </article>
        ))}
      </div>
      <p className="fine">조사 근거: 한국 공립·대안학교, 미국 사립, 국제학교, 기독교 학교, 호주 NSW 공립, 태국 공립 학교 홈페이지(저장소 docs/research/homepage-templates-2026-11.md).</p>
    </>
  );
}
