import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listEntries } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { PageHeader, StatusBadge } from '@/components/ui';

/** 65차(ADR 0031): 홈페이지 템플릿 둘러보기 — 형식 7종. 미리보기 후 고르면 시안 쪽을 만든다 */
export default async function TemplatesPage() {
  const { pages } = await loadForPage(async ({ db, school }) => ({
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
  }), { module: 'homepage' });
  return (
    <>
      <PageHeader title="홈페이지 템플릿" crumbs={[{ label: '학교 홈페이지', href: '/site' }, { label: '템플릿' }]}
        description="학교 홈페이지 형식을 조사해 일곱 가지로 정리했습니다. 둘러보고 우리 학교에 맞는 형식을 고르면 쪽 시안이 만들어집니다. 공개는 내용을 채운 뒤 직접 합니다."
        meta={<span>지금 쪽 {pages.length}개</span>} />
      <div className="template-grid" data-testid="template-grid">
        {SITE_TEMPLATES.map((t) => (
          <article key={t.key} className="card template-card">
            <div className="between"><h2>{t.name}</h2><StatusBadge tone="neutral">{t.theme === 'dawn' ? '새벽빛 테마' : '캠퍼스 테마'}</StatusBadge></div>
            <p>{t.summary}</p>
            <dl className="facts">
              <dt>맞는 학교</dt><dd>{t.fits.join(' · ')}</dd>
              <dt>첫 화면</dt><dd>{t.firstScreen}</dd>
              <dt>쪽</dt><dd>{t.pages.length}개{t.langs.length > 1 ? ` · ${t.langs.join('/')}` : ''}</dd>
              <dt>채울 칸</dt><dd>{t.slots.length}개</dd>
            </dl>
            <div className="form-actions"><Link className="btn" href={`/site/templates/${t.key}`} data-testid={`template-open-${t.key}`}>미리보기</Link></div>
          </article>
        ))}
      </div>
      <p className="fine">조사 근거: 한국 공립·대안학교, 미국 사립, 국제학교, 기독교 학교, 호주 NSW 공립, 태국 공립 학교 홈페이지(저장소 docs/research/homepage-templates-2026-11.md).</p>
    </>
  );
}
