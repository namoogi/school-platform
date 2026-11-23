import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { pick, type Block, type Content, type GalleryItem, type Lang, type LText } from '@/lib/site-shared';
import type { EditPath } from '@/lib/site-edit';
import { StoryBook } from './StoryBook';
import { GalleryGrid } from './GalleryGrid';

/** 공개 화면 낱말 (블록 안) */
const W = {
  prev: { ko: '이전 쪽', en: 'Previous', th: 'ก่อนหน้า' }, next: { ko: '다음 쪽', en: 'Next', th: 'ถัดไป' }, page: { ko: '쪽', en: 'Page', th: 'หน้า' },
  all: { ko: '전체', en: 'All', th: 'ทั้งหมด' }, close: { ko: '닫기', en: 'Close', th: 'ปิด' },
  prevPhoto: { ko: '이전 사진', en: 'Previous photo', th: 'ภาพก่อนหน้า' }, nextPhoto: { ko: '다음 사진', en: 'Next photo', th: 'ภาพถัดไป' },
  photos: { ko: '장', en: ' photos', th: ' ภาพ' }, watch: { ko: '영상 보기', en: 'Watch the video', th: 'ดูวิดีโอ' },
  allNews: { ko: '소식 모두 보기', en: 'All news', th: 'ข่าวทั้งหมด' }, read: { ko: '읽기', en: 'Read', th: 'อ่าน' },
} as const;
const w = (k: keyof typeof W, lang: Lang) => W[k][lang];

export type NewsItem = { key: string; title: LText; summary?: LText | null; cover?: string | null; published_at?: string };

/** 내용 안 위치: ['blocks', 2, 'items', 0, 'title'] 처럼 Content 에서 고칠 칸까지의 길 */
export type { EditPath };

/**
 * 34차(ADR 0011): 화면 편집 갈고리. 편집 화면만 넘긴다. 없으면 방문자 화면과 똑같이 그린다.
 * 렌더러는 '어디에 무엇이 있는지(길)'만 알려 주고, 고치는 칸·사진 고르기·구역 막대는 편집 화면이 만든다.
 */
export type EditHooks = {
  text: (path: EditPath, value: LText | undefined, o: { label: string; multiline?: boolean }) => ReactNode;
  image: (path: EditPath, asset: string | undefined, o: { label: string; altPath?: EditPath; optional?: boolean }, img: ReactNode) => ReactNode;
  wrap: (i: number, b: Block, node: ReactNode) => ReactNode;
  /** 비어 있는 선택 칸(머리말·설명 등)을 보일지: 고르고 있는 구역만 보인다 */
  showEmpty: (i: number) => boolean;
};

/** 쪽 머리: 머리말 · 제목 · 소개. dawn 에서는 잡지형 머리(.editorial-heading), 첫 화면은 표지 사진이 붙는 여는 머리. */
export function PageHead({ content, lang, fallback, asset, meta, ed }: { content: Content; lang: Lang; fallback: Lang; asset: (id: string) => string; meta?: string; ed?: EditHooks }) {
  const t = (x: LText | null | undefined) => pick(x, lang, fallback);
  const T = (path: EditPath, x: LText | undefined, label: string, multiline = false) => (ed ? ed.text(path, x, { label, multiline }) : t(x));
  const show = (x: LText | undefined) => Boolean(t(x)) || Boolean(ed?.showEmpty(-1));
  const opening = content.head?.layout === 'opening';
  // eslint-disable-next-line @next/next/no-img-element
  const cover = content.cover ? <img src={asset(content.cover)} alt="" /> : null;
  return (
    <header className={opening ? 'site-head site-opening' : 'site-head'}>
      {show(content.head?.eyebrow) && <span className="sec-eyebrow">{T(['head', 'eyebrow'], content.head?.eyebrow, '쪽 머리말')}</span>}
      <h1 className="site-h1">{T(['title'], content.title, '쪽 제목')}</h1>
      {meta && <p className="site-meta">{meta}</p>}
      {show(content.summary) && <p className="site-lead">{T(['summary'], content.summary, '쪽 소개', true)}</p>}
      {opening && (cover || ed) && <figure className="site-panorama">{ed ? ed.image(['cover'], content.cover, { label: '표지 사진', optional: true }, cover) : cover}</figure>}
    </header>
  );
}

/**
 * 27차·31차: 홈페이지 블록 그리기 (공개 화면·구성원 미리보기·화면 편집 공용).
 * 글은 텍스트로만 넣는다(HTML 해석 없음). 그림 주소·사이트 안 링크는 호출하는 쪽이 정한다(공개 판 / 구성원 미리보기).
 * 34차: 숨긴 블록(hidden)은 방문자에게 그리지 않는다. 편집 갈고리(ed)가 있으면 숨긴 블록도 그리고 칸마다 고치기를 단다.
 */
export function SiteBlocks({ content, lang, fallback, assetUrl, link = (h) => h, news = [], textInImage = false, ed }: {
  content: Content; lang: Lang; fallback: Lang; assetUrl: (id: string) => string; link?: (href: string) => string; news?: NewsItem[];
  /** 동화 쪽 그림 안에 글이 이미 들어 있으면 글을 그림 위에 다시 쓰지 않고 대체 글로 준다 */
  textInImage?: boolean;
  ed?: EditHooks;
}) {
  const t = (x: LText | null | undefined) => pick(x, lang, fallback);
  const paras = (x: LText | null | undefined) => t(x).split(/\n{2,}/).filter(Boolean).map((p, j) => <p key={j}>{p}</p>);
  const storyPages = content.blocks.filter((b): b is Extract<Block, { type: 'story_page' }> => b.type === 'story_page' && !b.hidden);
  const href = (h: string) => (h.startsWith('/') || h.startsWith('#') ? link(h) : h);
  const ext = (h: string) => !(h.startsWith('/') || h.startsWith('#'));
  /** 편집 중에는 링크 대신 같은 모양의 span: 고치는 칸·사진 단추가 링크 안에 들어가지 않게(중첩 대화형 요소 금지) */
  const A = ({ to, className, children }: { to: string; className?: string; children: ReactNode }) => (ed
    ? <span className={className} data-href={to}>{children}</span>
    : <Link className={className} href={href(to)} {...(ext(to) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</Link>);

  function renderBlock(b: Block, i: number): ReactNode {
    const at = (...p: EditPath): EditPath => ['blocks', i, ...p];
    /** 한 줄 글 */
    const T = (path: EditPath, x: LText | undefined, label: string) => (ed ? ed.text(path, x, { label }) : t(x));
    /** 여러 문단 글: 방문자에게는 문단(<p>)으로, 편집에서는 한 칸(빈 줄로 문단 나눔) */
    const P = (path: EditPath, x: LText | undefined, label: string) => (ed ? <p>{ed.text(path, x, { label, multiline: true })}</p> : paras(x));
    const show = (x: LText | undefined) => Boolean(t(x)) || Boolean(ed?.showEmpty(i));
    const photo = (path: EditPath, id: string | undefined, alt: LText | undefined, label: string, optional = true) => {
      // eslint-disable-next-line @next/next/no-img-element
      const img = id ? <img src={assetUrl(id)} alt={t(alt)} loading="lazy" /> : null;
      return ed ? ed.image(path, id, { label, altPath: [...path.slice(0, -1), 'alt'], optional }, img) : img;
    };
    switch (b.type) {
      case 'heading': return <h2 className="site-h2">{T(at('text'), b.text, '제목')}</h2>;
      case 'text': return <div className="site-text">{P(at('text'), b.text, '글')}</div>;
      case 'notice': return <p className="site-notice" role="note">{ed ? ed.text(at('text'), b.text, { label: '알림', multiline: true }) : t(b.text)}</p>;
      case 'image': return (
        <figure className="site-figure">
          {photo(at('asset'), b.asset, b.alt, '그림', false)}
          {show(b.caption) && <figcaption>{T(at('caption'), b.caption, '그림 설명')}</figcaption>}
        </figure>
      );
      case 'gallery': {
        const items: GalleryItem[] = b.items ?? b.assets.map((a) => ({ asset: a }));
        const grid = <GalleryGrid caption={ed ? '' : t(b.caption)}
          items={items.map((g) => ({ src: assetUrl(g.asset), alt: t(g.alt), category: g.category }))}
          filters={(b.filters ?? []).map((f) => ({ key: f.key, label: t(f.label) }))}
          labels={{ all: w('all', lang), close: w('close', lang), prev: w('prevPhoto', lang), next: w('nextPhoto', lang), count: `{n}${w('photos', lang)}` }} />;
        return ed ? <div className="le-gallery">{grid}{show(b.caption) && <p className="le-caption">{T(at('caption'), b.caption, '사진 묶음 설명')}</p>}</div> : grid;
      }
      case 'video': {
        const url = t(b.url);
        const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/);
        if (ed && !url) return <p className="le-placeholder">영상 주소를 구역 설정에서 넣어 주세요.</p>;
        return yt
          ? <div className="site-video"><iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} title={t(content.title)} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>
          : <p><a href={url} target="_blank" rel="noopener noreferrer">{w('watch', lang)}</a></p>;
      }
      case 'news_list': {
        const list = news.slice(0, b.count);
        if (!list.length && !ed) return null; // 볼 것이 없으면 방문자에게 보이지 않는다
        return (
          <section className="site-section lb-feature" data-style={b.style} data-testid="news-list">
            {show(b.title) && <h2 className="site-h2">{T(at('title'), b.title, '소식 구역 제목')}</h2>}
            {show(b.body) && <p className="site-lead">{T(at('body'), b.body, '소식 구역 소개')}</p>}
            {!list.length && <p className="le-placeholder">공개한 소식이 생기면 최근 {b.count}개가 여기에 보입니다.</p>}
            {list.length > 0 && (b.style === 'list'
              ? <ul className="lb-board">{list.map((n) => (
                  <li key={n.key}><time>{n.published_at?.slice(0, 10)}</time><Link href={link(`/news/${n.key}`)}>{t(n.title)}</Link></li>))}</ul>
              : <ul className="site-cards story-grid">{list.map((n) => (
                  <li key={n.key}><Link href={link(`/news/${n.key}`)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {n.cover && <img src={assetUrl(n.cover)} alt="" loading="lazy" />}
                    <b>{t(n.title)}</b>{t(n.summary) && <span>{t(n.summary)}</span>}</Link></li>))}</ul>)}
            <Link className="site-link" href={link('/news')}>{w('allNews', lang)}</Link>
          </section>
        );
      }
      case 'section': {
        const head = <>
          {show(b.eyebrow) && <span className="sec-eyebrow">{T(at('eyebrow'), b.eyebrow, '머리말')}</span>}
          {show(b.title) && b.template !== 'quote' && <h2 className="site-h2">{T(at('title'), b.title, '구역 제목')}</h2>}
        </>;
        const btn = b.button && (t(b.button.label) || ed)
          ? <A className="site-button" to={b.button.href}>{T(at('button', 'label'), b.button.label, '단추 이름')}</A>
          : null;
        const items = b.items ?? [];
        const body = show(b.body) ? P(at('body'), b.body, b.template === 'quote' ? '문장' : '구역 글') : null;
        if (b.template === 'quote') return (
          <figure className="sec sec-quote" data-template="quote"><blockquote>{body}</blockquote>{show(b.title) && <figcaption>{T(at('title'), b.title, '말한 사람')}</figcaption>}</figure>
        );
        const hasPhoto = b.template === 'banner' || b.template === 'media-left' || b.template === 'media-right';
        const figure = hasPhoto && (b.asset || ed) ? <figure className="sec-photo">{photo(at('asset'), b.asset, b.alt, '구역 사진')}</figure> : null;
        return (
          <section className="sec" data-template={b.template}>
            {b.template === 'banner' && figure}
            <div className="sec-copy">{head}{body}{btn}</div>
            {(b.template === 'media-left' || b.template === 'media-right') && figure}
            {items.length > 0 && (
              b.template === 'facts'
                ? <dl className="sec-facts">{items.map((it, k) => <div key={k}><dt>{T(at('items', k, 'title'), it.title, `${k + 1}번 항목`)}</dt><dd>{P(at('items', k, 'body'), it.body, `${k + 1}번 내용`)}</dd></div>)}</dl>
                : b.template === 'steps'
                  ? <ol className="sec-steps">{items.map((it, k) => <li key={k}><span aria-hidden="true">{String(k + 1).padStart(2, '0')}</span><div>{show(it.title) && <h3>{T(at('items', k, 'title'), it.title, `${k + 1}단계 제목`)}</h3>}{P(at('items', k, 'body'), it.body, `${k + 1}단계 글`)}</div></li>)}</ol>
                  : <ul className={b.template === 'photos' ? 'sec-photos' : 'sec-cards'}>{items.map((it, k) => {
                      const inner = <>
                        {(it.asset || (ed && (b.template === 'photos' || b.template === 'cards'))) && photo(at('items', k, 'asset'), it.asset, it.alt, `${k + 1}번 사진`)}
                        {show(it.title) && (b.template === 'photos' ? <span>{T(at('items', k, 'title'), it.title, `${k + 1}번 사진 이름`)}</span> : <h3>{T(at('items', k, 'title'), it.title, `${k + 1}번 카드 제목`)}</h3>)}
                        {b.template !== 'photos' && (show(it.body) ? P(at('items', k, 'body'), it.body, `${k + 1}번 카드 글`) : null)}
                      </>;
                      return <li key={k}>{it.href ? <A to={it.href}>{inner}</A> : inner}</li>;
                    })}</ul>
            )}
          </section>
        );
      }
      case 'story_page': {
        if (!ed) return null; // 방문자에게는 위의 그림책으로 넘겨 본다
        return (
          <figure className="le-story-page">
            {photo(at('asset'), b.asset, undefined, '쪽 그림')}
            <figcaption>{ed.text(at('text'), b.text, { label: '쪽 글', multiline: true })}</figcaption>
          </figure>
        );
      }
      default: return null;
    }
  }

  return (
    <div className="site-blocks">
      {!ed && storyPages.length > 0 && (
        <StoryBook pages={storyPages.map((p) => ({ image: p.asset ? assetUrl(p.asset) : null, text: t(p.text) }))} textInImage={textInImage}
          labels={{ prev: w('prev', lang), next: w('next', lang), page: w('page', lang) }} />
      )}
      {content.blocks.map((b, i) => {
        if (ed) return <Fragment key={i}>{ed.wrap(i, b, renderBlock(b, i))}</Fragment>;
        return b.hidden ? null : <Fragment key={i}>{renderBlock(b, i)}</Fragment>;
      })}
    </div>
  );
}

