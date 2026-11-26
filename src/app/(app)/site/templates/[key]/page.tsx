import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadForPage } from '@/lib/page';
import { listEntries, LANG_LABEL, type Lang } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { PageHead } from '@/components/site/load';
import { PageHeader } from '@/components/ui';
import { ApplyTemplate } from '../TemplatesClient';

export const dynamic = 'force-dynamic';

/** 65차: 템플릿 미리보기 — 방문자 화면과 같은 그리기 코드에 템플릿 안내 내용을 넣는다(DB의 학교 자료는 읽지 않음) */
export default async function TemplatePreview({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ page?: string; lang?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const t = SITE_TEMPLATES.find((x) => x.key === key);
  if (!t) notFound();
  const { school, pages } = await loadForPage(async ({ db, school }) => ({
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
  }), { module: 'homepage' });
  const pg = t.pages.find((p) => p.key === sp.page) ?? t.pages[0];
  const lang = (t.langs as string[]).includes(sp.lang ?? '') ? (sp.lang as Lang) : (t.langs[0] as Lang);
  const slots = t.slots.filter((s) => s.page === pg.key);
  return (
    <>
      <PageHeader title={`템플릿: ${t.name}`} crumbs={[{ label: '학교 홈페이지', href: '/site' }, { label: '템플릿', href: '/site/templates' }, { label: t.name }]}
        description={t.summary} />
      <div className="template-layout">
        <aside className="card stack" aria-label="템플릿 정보">
          <h2>쪽</h2>
          <nav className="stack" aria-label="템플릿 쪽">
            {t.pages.map((p) => <Link key={p.key} href={`/site/templates/${t.key}?page=${p.key}&lang=${lang}`} aria-current={p.key === pg.key ? 'page' : undefined}>
              {p.key === 'home' ? '홈' : p.content.title[lang] ?? Object.values(p.content.title)[0]} <small className="muted">/{p.key === 'home' ? '' : `p/${p.key}`}{pages.includes(p.key) ? ' · 이미 있음' : ''}</small></Link>)}
          </nav>
          {t.langs.length > 1 && <p className="fine">언어: {t.langs.map((l) => <Link key={l} href={`/site/templates/${t.key}?page=${pg.key}&lang=${l}`} aria-current={l === lang ? 'true' : undefined} style={{ marginRight: 8 }}>{LANG_LABEL[l as Lang]}</Link>)}</p>}
          <h2>이 쪽에서 채울 칸</h2>
          {slots.length === 0 ? <p className="muted">없음</p> : <ul className="issue-list">{slots.map((s) => <li key={s.id}><span><strong>{s.label}</strong> <small className="muted">{s.hint}</small></span></li>)}</ul>}
          <h2>꼭 알릴 정보</h2>
          <ul className="issue-list">{t.mustHave.map((m) => <li key={m}>{m}</li>)}</ul>
          {school.isAdmin ? <ApplyTemplate templateKey={t.key} name={t.name} existing={t.pages.map((p) => p.key).filter((k) => pages.includes(k))} />
            : <p className="muted">템플릿 적용은 학교 관리자가 합니다.</p>}
        </aside>
        <div className="site site-preview template-preview" data-theme={t.theme} lang={lang} data-testid="template-preview">
          <main className="site-wrap site-main">
            <PageHead content={pg.content} lang={lang} fallback={t.langs[0] as Lang} asset={() => ''} />
            <SiteBlocks content={pg.content} lang={lang} fallback={t.langs[0] as Lang} assetUrl={() => ''} link={() => '#'} />
          </main>
        </div>
      </div>
    </>
  );
}
