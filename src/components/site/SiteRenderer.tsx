import Link from 'next/link';
import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ArrowRight, FileDown, Plus } from 'lucide-react';
import { fileSize, pick, type Block, type Content, type GalleryItem, type Lang, type LText } from '@/lib/site-shared';
import type { EditPath } from '@/lib/site-edit';
import { isStoryOutline, storyImageAsset } from '@/lib/story-language';
import { StoryBook } from './StoryBook';
import { GalleryGrid } from './GalleryGrid';
import { TagFilter } from './TagFilter';
import { InquiryForm } from './InquiryForm';
import { RainbowArc, Ribbon } from './Rainbow';

/** 공개 화면 낱말 (블록 안) */
const W = {
  prev: { ko: '이전 쪽', en: 'Previous', th: 'ก่อนหน้า' }, next: { ko: '다음 쪽', en: 'Next', th: 'ถัดไป' }, page: { ko: '쪽', en: 'Page', th: 'หน้า' },
  all: { ko: '전체', en: 'All', th: 'ทั้งหมด' }, close: { ko: '닫기', en: 'Close', th: 'ปิด' },
  prevPhoto: { ko: '이전 사진', en: 'Previous photo', th: 'ภาพก่อนหน้า' }, nextPhoto: { ko: '다음 사진', en: 'Next photo', th: 'ภาพถัดไป' },
  photos: { ko: '장', en: ' photos', th: ' ภาพ' }, watch: { ko: '영상 보기', en: 'Watch the video', th: 'ดูวิดีโอ' },
  allNews: { ko: '소식 모두 보기', en: 'All news', th: 'ข่าวทั้งหมด' }, byTag: { ko: '분류로 거르기', en: 'Filter by category', th: 'กรองตามหมวด' }, read: { ko: '읽기', en: 'Read', th: 'อ่าน' },
  more: { ko: '더 보기', en: 'Read more', th: 'อ่านเพิ่มเติม' },
  characters: { ko: '장면별 캐릭터', en: 'Characters by scene', th: 'ตัวละครในแต่ละฉาก' },
  scene: { ko: '장면', en: 'Scene', th: 'ฉาก' },
  outline: { ko: '이야기 줄거리', en: 'Story summary', th: 'เรื่องย่อ' },
  sceneStory: { ko: '이 장면의 이야기', en: 'The story in this scene', th: 'เรื่องราวในฉากนี้' },
  png: { ko: 'PNG 내려받기', en: 'Download PNG', th: 'ดาวน์โหลด PNG' },
  download: { ko: 'PDF 내려받기', en: 'Download PDF', th: 'ดาวน์โหลด PDF' },
} as const;
const w = (k: keyof typeof W, lang: Lang) => W[k][lang];
/** 42차: 링크·단추 끝 화살표(옛 사이트 ArrowLink). 새벽빛에서만 보인다 */
const Arrow = () => <ArrowRight className="link-arrow" size={22} strokeWidth={1.4} aria-hidden="true" />;

export type NewsItem = { key: string; title: LText; summary?: LText | null; cover?: string | null; published_at?: string };

/** 내용 안 위치: ['blocks', 2, 'items', 0, 'title'] 처럼 Content 에서 고칠 칸까지의 길 */
export type { EditPath };

/**
 * 35차(ADR 0011): 화면 편집 갈고리. 편집 화면만 넘긴다. 없으면 방문자 화면과 똑같이 그린다.
 * 렌더러는 '어디에 무엇이 있는지(길)'만 알려 주고, 고치는 칸·사진 고르기·구역 막대는 편집 화면이 만든다.
 */
export type EditHooks = {
  text: (path: EditPath, value: LText | undefined, o: { label: string; multiline?: boolean }) => ReactNode;
  image: (path: EditPath, asset: string | undefined, o: { label: string; altPath?: EditPath; optional?: boolean }, img: ReactNode) => ReactNode;
  wrap: (i: number, b: Block, node: ReactNode) => ReactNode;
  /** 비어 있는 선택 칸(머리말·설명 등)을 보일지: 고르고 있는 구역만 보인다 */
  showEmpty: (i: number) => boolean;
};

/**
 * 쪽 머리: 머리말 · 제목 · 소개. dawn 에서는 잡지형 머리(.editorial-heading), 첫 화면은 표지 사진이 붙는 여는 머리.
 * 42차(옛 사이트 맞춤): 여는 머리는 무지개 호 · 링크 · 표지 날짜표 · 7색 띠, 안쪽 쪽은 '홈 / 제목' 길잡이(crumb)를 단다.
 */
export function PageHead({ content, lang, fallback, asset, meta, ed, crumb, link = (h) => h }: {
  content: Content; lang: Lang; fallback: Lang; asset: (id: string) => string; meta?: string; ed?: EditHooks;
  /** 안쪽 쪽 길잡이: 홈 링크 주소와 이름 */ crumb?: { href: string; label: string };
  /** 사이트 안 경로 → 공개 주소 */ link?: (href: string) => string;
}) {
  const t = (x: LText | null | undefined) => pick(x, lang, fallback);
  const T = (path: EditPath, x: LText | undefined, label: string, multiline = false) => (ed ? ed.text(path, x, { label, multiline }) : t(x));
  const show = (x: LText | undefined) => Boolean(t(x)) || Boolean(ed?.showEmpty(-1));
  const opening = content.head?.layout === 'opening';
  // eslint-disable-next-line @next/next/no-img-element
  const cover = content.cover ? <img src={asset(content.cover)} alt="" /> : null;
  const more = content.head?.link && (t(content.head.link.label) || ed) ? content.head.link : null;
  const moreLabel = more ? T(['head', 'link', 'label'], more.label, '머리 링크 이름') : null;
  const moreLink = more && (ed
    ? <span className="site-link" data-href={more.href}>{moreLabel}<Arrow /></span>
    : <Link className="site-link" href={more.href.startsWith('/') ? link(more.href) : more.href}>{moreLabel}<Arrow /></Link>);
  const eyebrow = show(content.head?.eyebrow) && <span className="sec-eyebrow">{T(['head', 'eyebrow'], content.head?.eyebrow, '쪽 머리말')}</span>;
  const h1 = <h1 className="site-h1">{T(['title'], content.title, '쪽 제목')}</h1>;
  const lead = show(content.summary) && <p className="site-lead">{T(['summary'], content.summary, '쪽 소개', true)}</p>;
  if (opening) return (
    <header className="site-head site-opening">
      <div className="site-masthead">{eyebrow}{h1}</div>
      <div className="site-side"><RainbowArc />{lead}{moreLink}</div>
      {(cover || ed) && (
        <figure className="site-panorama">
          {ed ? ed.image(['cover'], content.cover, { label: '표지 사진', optional: true }, cover) : cover}
          {show(content.head?.note) && <figcaption className="photo-date">{T(['head', 'note'], content.head?.note, '표지 사진 날짜')}</figcaption>}
        </figure>
      )}
      <Ribbon />
    </header>
  );
  return (
    <header className="site-head">
      {crumb && <nav className="site-crumb" aria-label={crumb.label}><Link href={crumb.href}>{crumb.label}</Link><span aria-hidden="true">/</span><span>{t(content.title)}</span></nav>}
      {eyebrow}{h1}
      {meta && <p className="site-meta">{meta}</p>}
      {lead}{moreLink}
    </header>
  );
}

/**
 * 27차·31차: 홈페이지 블록 그리기 (공개 화면·구성원 미리보기·화면 편집 공용).
 * 글은 텍스트로만 넣는다(HTML 해석 없음). 그림 주소·사이트 안 링크는 호출하는 쪽이 정한다(공개 판 / 구성원 미리보기).
 * 35차: 숨긴 블록(hidden)은 방문자에게 그리지 않는다. 편집 갈고리(ed)가 있으면 숨긴 블록도 그리고 칸마다 고치기를 단다.
 */
export function SiteBlocks({ content, lang, fallback, assetUrl, link = (h) => h, news = [], textInImage = false, ed, inquiry }: {
  content: Content; lang: Lang; fallback: Lang; assetUrl: (id: string) => string; link?: (href: string) => string; news?: NewsItem[];
  /** 동화 쪽 그림 안에 글이 이미 들어 있으면 글을 그림 위에 다시 쓰지 않고 대체 글로 준다 */
  textInImage?: boolean;
  ed?: EditHooks;
  /** 91차: 방문·상담 신청 칸 — 학교가 신청을 켰을 때만(open). slug가 null이면 미리보기(보내지 않음) */
  inquiry?: { slug: string | null; open: boolean; page: string };
}) {
  const t = (x: LText | null | undefined) => pick(x, lang, fallback);
  // 42차: 줄마다 '· '로 시작하는 문단은 점 목록으로(옛 사이트 교육 단계 핵심)
  const paras = (x: LText | null | undefined) => t(x).split(/\n{2,}/).filter(Boolean).map((p, j) => {
    const lines = p.split('\n');
    return lines.length > 1 && lines.every((l) => l.startsWith('· '))
      ? <ul key={j} className="site-bullets">{lines.map((l, k) => <li key={k}>{l.slice(2)}</li>)}</ul>
      : <p key={j}>{p}</p>;
  });
  const storyPages = content.blocks.filter((b): b is Extract<Block, { type: 'story_page' }> => b.type === 'story_page' && !b.hidden);

  // 129차: 짧은 글 구역(모양 없는 text)이 이어지면 [제목 | 글] 두 칸 격자로 맞춘다. 이웃 판정은 방문자에게 보이는 구역 기준이고,
  // 편집 화면(구역마다 감싸개가 있음)에서도 같은 표시가 붙도록 CSS 형제 선택자 대신 여기서 정한다.
  // data-run: first(묶음 첫 구역) · next(앞 구역에 이어짐). data-run-head: 제목·머리말이 있을 때만 두 칸(없으면 본문이 온 폭)
  // 그리는 차례: 방문자 화면의 그림책 쪽은 캐릭터 그림(PNG) 모음을 맨 뒤로 보낸다. 이웃 판정도 이 차례로 한다
  const orderedBlocks = content.blocks.map((b, i) => ({ b, i }));
  if (!ed && storyPages.length) orderedBlocks.sort((a, b) => Number(a.b.type === 'gallery' && a.b.download === 'png') - Number(b.b.type === 'gallery' && b.b.download === 'png'));
  const plainText = (x: { b: Block; i: number } | undefined) => x?.b.type === 'section' && x.b.template === 'text' && !x.b.variant
    && !(!ed && textInImage && isStoryOutline(content.blocks, x.i)); // 줄거리 칸으로 바뀌는 구역은 글 구역이 아니다
  // 방문자에게 아무것도 그리지 않는 구역(닫힌 신청 칸, 소식 없는 소식 목록, 그림책으로 넘긴 장면)은 이웃 판정에서 뺀다 — 아래 renderBlock의 null 조건과 같게
  const drawsNothing = (b: Block) => !ed && ((b.type === 'inquiry' && !inquiry?.open) || (b.type === 'news_list' && !news.length) || b.type === 'story_page');
  const shown = orderedBlocks.filter(({ b }) => !b.hidden && !drawsNothing(b));
  // 133차: 하위 쪽은 구역 제목이 곧 쪽 제목이다. 첫 구역 제목이 쪽 제목과 같으면 보이는 제목만 감춘다(제목 구조·표 설명은 남김). 편집 화면은 그대로
  const pageTitle = t(content.title);
  const dupHeadAt = !ed && shown[0] && pageTitle && shown[0].b.type === 'section' && t(shown[0].b.title) === pageTitle ? shown[0].i : -1;
  const runOf = new Map<number, 'first' | 'next'>();
  shown.forEach((x, k) => {
    if (!plainText(x)) return;
    if (plainText(shown[k - 1])) runOf.set(x.i, 'next');
    else if (plainText(shown[k + 1])) runOf.set(x.i, 'first');
  });

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
      return ed ? ed.image(path, id, { label, altPath: path.includes('images') ? at('alt') : [...path.slice(0, -1), 'alt'], optional }, img) : img;
    };
    switch (b.type) {
      case 'heading': return <h2 className="site-h2">{T(at('text'), b.text, '제목')}</h2>;
      case 'text': return <div className="site-text">{P(at('text'), b.text, '글')}</div>;
      case 'notice': return <p className="site-notice" role="note">{ed ? ed.text(at('text'), b.text, { label: '알림', multiline: true }) : t(b.text)}</p>;
      case 'image': return (
        <figure className="site-figure">
          {photo(b.images?.[lang] ? at('images', lang, 'asset') : at('asset'), storyImageAsset(b, lang), b.alt, b.images?.[lang] ? '선택 언어 그림' : '원본 그림', false)}
          {show(b.caption) && <figcaption>{T(at('caption'), b.caption, '그림 설명')}</figcaption>}
        </figure>
      );
      case 'gallery': {
        const items: GalleryItem[] = b.items ?? b.assets.map((a) => ({ asset: a }));
        const caption = b.download === 'png' ? [b.scene ? `${w('scene', lang)} ${b.scene}` : '', t(b.caption) || w('characters', lang)].filter(Boolean).join(' · ') : t(b.caption);
        const grid = <GalleryGrid caption={ed && !b.download ? '' : caption} downloadLabel={b.download === 'png' && !ed ? w('png', lang) : undefined}
          items={items.map((g) => ({ src: assetUrl(g.asset), alt: t(g.alt), category: g.category, fileName: g.file_name, size: fileSize(g.size_bytes) }))}
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
      case 'inquiry': {
        if (ed) return <section className="sec site-inquiry" data-template="inquiry"><h2 className="site-h2">{T(at('title'), b.title, '신청 칸 제목')}</h2><p className="fine">방문·상담 신청 칸(설정에서 '신청 받기'를 켜면 방문자에게 보입니다)</p></section>;
        if (!inquiry?.open) return null; // 학교가 신청을 받지 않으면 방문자에게 보이지 않는다
        return <InquiryForm slug={inquiry.slug} lang={lang} page={inquiry.page} title={t(b.title) || undefined} body={t(b.body) || undefined} anchor={b.anchor} />;
      }
      case 'download': {
        // 34차: PDF 내려받기. 파일 이름·크기는 판에 저장된 값(스냅샷)을 쓴다. 서버는 PDF를 attachment 로만 준다
        const name = b.file_name ?? 'story.pdf';
        const inner = <>
          <FileDown size={20} aria-hidden="true" />
          <span><b>{ed ? T(at('label'), b.label, '내려받기 이름') : (t(b.label) || w('download', lang))}</b><span className="site-download-meta">PDF{b.size_bytes ? ` · ${fileSize(b.size_bytes)}` : ''}</span></span>
        </>;
        return (
          <p className="site-download" data-testid="download-block">
            {ed ? <span className="site-download-link">{inner}</span> : <a href={assetUrl(b.asset)} download={name}>{inner}</a>}
            {show(b.note) && <span className="site-download-note">{T(at('note'), b.note, '내려받기 설명')}</span>}
          </p>
        );
      }
      case 'news_list': {
        const list = news.slice(0, b.count);
        if (!list.length && !ed) return null; // 볼 것이 없으면 방문자에게 보이지 않는다
        return (
          <section className="site-section lb-feature" data-style={b.style} data-testid="news-list">
            <div className="sec-copy">
              {show(b.eyebrow) && <span className="sec-eyebrow">{T(at('eyebrow'), b.eyebrow, '소식 구역 머리말')}</span>}
              {show(b.title) && <h2 className="site-h2">{T(at('title'), b.title, '소식 구역 제목')}</h2>}
              {show(b.body) && <p className="site-lead">{T(at('body'), b.body, '소식 구역 소개')}</p>}
              <A className="site-link" to="/news">{w('allNews', lang)}<Arrow /></A>
            </div>
            {!list.length && <p className="le-placeholder">공개한 소식이 생기면 최근 {b.count}개가 여기에 보입니다.</p>}
            {list.length > 0 && (b.style === 'list'
              ? <ul className="lb-board">{list.map((n) => (
                  <li key={n.key}><time>{n.published_at?.slice(0, 10)}</time><Link href={link(`/news/${n.key}`)}>{t(n.title)}</Link></li>))}</ul>
              : <ul className="site-cards story-grid">{list.map((n) => (
                  <li key={n.key}><Link href={link(`/news/${n.key}`)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {n.cover && <img src={assetUrl(n.cover)} alt="" loading="lazy" />}
                    <b>{t(n.title)}</b>{t(n.summary) && <span>{t(n.summary)}</span>}<span className="card-more">{w('read', lang)}<Arrow /></span></Link></li>))}</ul>)}
          </section>
        );
      }
      case 'section': {
        if (!ed && textInImage && isStoryOutline(content.blocks, i)) return (
          <section className="story-synopsis" data-testid="story-synopsis" lang={lang}>
            <h2>{w('outline', lang)}</h2>
            {b.title && <p className="story-synopsis-subtitle">{t(b.title)}</p>}
            {b.items?.map((item, j) => <p key={j}>{item.title && <strong>{t(item.title)} · </strong>}{t(item.body)}</p>)}
          </section>
        );
        const v = b.variant;
        const head = <>
          {show(b.eyebrow) && <span className="sec-eyebrow">{T(at('eyebrow'), b.eyebrow, '머리말')}</span>}
          {show(b.title) && b.template !== 'quote' && <h2 className={i === dupHeadAt ? 'site-h2 sr-only' : 'site-h2'}>{T(at('title'), b.title, '구역 제목')}</h2>}
        </>;
        const btn = b.button && (t(b.button.label) || ed)
          ? <A className="site-button" to={b.button.href}>{T(at('button', 'label'), b.button.label, '단추 이름')}<Arrow /></A>
          : null;
        const items = b.items ?? [];
        const filterable = v === 'filter' || v === 'feature-filter' || v === 'portfolio';
        const body = show(b.body) ? P(at('body'), b.body, b.template === 'quote' ? '문장' : '구역 글') : null;
        if (b.template === 'quote') return (
          <figure className="sec sec-quote" data-template="quote" data-variant={v}><blockquote>{body}</blockquote>{show(b.title) && <figcaption>{T(at('title'), b.title, '말한 사람')}</figcaption>}</figure>
        );
        const hasPhoto = b.template === 'banner' || b.template === 'media-left' || b.template === 'media-right';
        const figure = hasPhoto && (b.asset || ed) ? (
          <figure className="sec-photo">
            {photo(at('asset'), b.asset, b.alt, '구역 사진')}
            {v === 'portrait' && <RainbowArc />}
            {show(b.caption) && <figcaption>{T(at('caption'), b.caption, '사진 설명')}</figcaption>}
          </figure>
        ) : null;
        // 118차: 안내 띠(cta)의 그림은 사진이 아니라 장식이다 — 대체 글 없이 띠 오른쪽에 번지듯 깐다(선생님 지시: 변형 그림은 디자인 요소로만)
        // eslint-disable-next-line @next/next/no-img-element
        const decorImg = b.asset ? <img src={assetUrl(b.asset)} alt="" loading="lazy" /> : null;
        const decor = b.template === 'cta' && (b.asset || ed) ? (
          <div className="sec-decor" aria-hidden={ed ? undefined : true}>
            {ed ? ed.image(at('asset'), b.asset, { label: '장식 그림(사진 아님)', optional: true }, decorImg) : decorImg}
          </div>
        ) : null;
        // 42차: 구역 모양(variant)별 항목 그리기 — 정보 줄(facts·overview), 접는 질문(faq), 번호 상자(index), 사진 셋(moments), 사진–글 줄(rows)
        const asFacts = b.template === 'facts' || v === 'overview';
        const itemList = items.length === 0 ? null
          : v === 'faq'
            ? <div className="sec-faq">{items.map((it, k) => (
                <details key={k} open={ed ? true : undefined}>
                  <summary>{T(at('items', k, 'title'), it.title, `${k + 1}번 질문`)}<Plus size={20} strokeWidth={1.4} aria-hidden="true" /></summary>
                  {P(at('items', k, 'body'), it.body, `${k + 1}번 답`)}
                </details>))}</div>
            : asFacts && v === 'curriculum'
              ? <table className="sec-curriculum"><caption className="sr-only">{t(b.title)}</caption><tbody>{items.map((it, k) => <tr key={k}><th scope="row">{T(at('items', k, 'title'), it.title, `${k + 1}번 항목`)}</th><td>{P(at('items', k, 'body'), it.body, `${k + 1}번 내용`)}</td></tr>)}</tbody></table>
              : asFacts
              ? <dl className="sec-facts">{items.map((it, k) => <div key={k}><dt>{T(at('items', k, 'title'), it.title, `${k + 1}번 항목`)}</dt><dd>{P(at('items', k, 'body'), it.body, `${k + 1}번 내용`)}</dd></div>)}</dl>
              : b.template === 'steps'
                ? <ol className="sec-steps">{items.map((it, k) => <li key={k}><span aria-hidden="true">{String(k + 1).padStart(2, '0')}</span><div>{show(it.title) && <h3>{T(at('items', k, 'title'), it.title, `${k + 1}단계 제목`)}</h3>}{P(at('items', k, 'body'), it.body, `${k + 1}단계 글`)}</div></li>)}</ol>
                : <ul className={b.template === 'photos' ? 'sec-photos' : 'sec-cards'}>{items.map((it, k) => {
                    const num = String(k + 1).padStart(2, '0');
                    const pic = (it.asset || (ed && (b.template === 'photos' || b.template === 'cards'))) && v !== 'index' ? photo(at('items', k, 'asset'), it.asset, it.alt, `${k + 1}번 사진`) : null;
                    const inner = b.template === 'photos'
                      ? <>
                          {pic}
                          {(t(it.tag) || (ed && filterable)) && <span className="sec-tag">{T(at('items', k, 'tag'), it.tag, `${k + 1}번 분류`)}</span>}
                          {show(it.title) && <span>{T(at('items', k, 'title'), it.title, `${k + 1}번 사진 이름`)}</span>}
                          {v === 'moments' && <span className="sec-label">{num}{(t(it.body) || ed) && <> · {T(at('items', k, 'body'), it.body, `${k + 1}번 이름표`)}</>}<Arrow /></span>}
                        </>
                      : <>
                          {pic}
                          {v === 'index' && <span className="sec-index">{num}</span>}
                          <div className="sec-item-copy">
                            {/* 107차: 행사 카드는 분류 칸을 날짜 배지로 쓴다 */}
                            {v === 'events' && (t(it.tag) || ed) && <span className="sec-date">{T(at('items', k, 'tag'), it.tag, `${k + 1}번 날짜`)}</span>}
                            {v !== 'events' && (t(it.tag) || (ed && filterable)) && <span className="sec-tag">{T(at('items', k, 'tag'), it.tag, `${k + 1}번 분류`)}</span>}
                            {show(it.title) && <h3>{T(at('items', k, 'title'), it.title, `${k + 1}번 카드 제목`)}</h3>}
                            {show(it.body) ? P(at('items', k, 'body'), it.body, `${k + 1}번 카드 글`) : null}
                            {v === 'rows' && it.href && <span className="site-link">{w('more', lang)}<Arrow /></span>}
                          </div>
                          {v === 'index' && <Arrow />}
                        </>;
                    return <li key={k} data-tag={t(it.tag) || undefined}>{it.href ? <A to={it.href}>{inner}</A> : inner}</li>;
                  })}</ul>;
        /** 항목 뒤에 링크를 두는 모양: 개요, 문의 사무실(전화 아래 Facebook), 한눈에 보기(facts 기본) */
        const tags = [...new Set(items.map((it) => t(it.tag)).filter(Boolean))] as string[];
        const btnAfter = v === 'overview' || (v === 'half' && items.length > 0) || (b.template === 'facts' && !v && items.length > 0); // 52차: 한눈에 보기도 항목 뒤에
        return (
          <section className="sec" data-template={b.template} data-variant={v} data-decor={decor && b.asset ? '' : undefined}
            data-run={runOf.get(i)} data-run-head={runOf.has(i) && (t(b.title) || t(b.eyebrow)) ? '' : undefined}>
            {decor}
            {b.template === 'banner' && figure}
            <div className="sec-copy">{head}{body}{!btnAfter && btn}</div>
            {(b.template === 'media-left' || b.template === 'media-right') && figure}
            {/* 거르기는 분류를 가진 카드·사진 목록에서만(정보·단계 목록에는 분류 칸이 없음) */}
            {filterable && !ed && itemList && tags.length > 1 && (b.template === 'cards' || b.template === 'photos')
              ? <TagFilter key={JSON.stringify([v, tags])} tags={tags} allLabel={w('all', lang)} label={w('byTag', lang)}>{itemList}</TagFilter>
              : itemList}
            {btnAfter && btn}
          </section>
        );
      }
      case 'story_page': {
        if (!ed) return null; // 방문자에게는 위의 그림책으로 넘겨 본다
        return (
          <figure className="le-story-page">
            {photo(b.images?.[lang] ? at('images', lang, 'asset') : at('asset'), storyImageAsset(b, lang), undefined, b.images?.[lang] ? '선택 언어 쪽 그림' : '원본 쪽 그림')}
            <figcaption>{ed.text(at('text'), b.text, { label: '쪽 글', multiline: true })}</figcaption>
          </figure>
        );
      }
      default: return null;
    }
  }

  return (
    <div className="site-blocks">
      {!ed && textInImage && content.blocks.some((b) => !b.hidden && (b.type === 'image' || b.type === 'story_page') && b.asset && !b.images?.[lang]) && <p className="site-lead">{{
        ko: '별도 번역 그림이 없는 장면은 원본 그림을 사용해요. 선택한 언어의 줄거리와 이야기는 그림 아래에서 읽을 수 있어요.',
        en: 'Where a translated illustration is not available, the original is shown. Read the summary or story in your chosen language below the picture.',
        th: 'หากยังไม่มีภาพฉบับแปล จะแสดงภาพต้นฉบับ อ่านเรื่องย่อหรือเรื่องราวในภาษาที่เลือกได้ใต้ภาพ',
      }[lang]}</p>}
      {!ed && storyPages.length > 0 && (
        <StoryBook key={lang} pages={storyPages.map((p) => { const image = storyImageAsset(p, lang); return { image: image ? assetUrl(image) : null, text: t(p.text) }; })}
          labels={{ prev: w('prev', lang), next: w('next', lang), page: w('page', lang), story: w('sceneStory', lang) }} />
      )}
      {orderedBlocks.map(({ b, i }) => {
        if (ed) return <Fragment key={i}>{ed.wrap(i, b, renderBlock(b, i))}</Fragment>;
        if (b.hidden) return null;
        // 126차(ADR 0046): 메뉴 주소가 있는 구역은 그 이름을 id로 달아 하위 메뉴(`#주소`)가 바로 이 구역으로 온다.
        // 화면 요소(section·h2)일 때만 붙인다. 부품(신청 칸)은 anchor를 받아 스스로 단다
        const el = renderBlock(b, i);
        return <Fragment key={i}>{b.anchor && isValidElement(el) && typeof el.type === 'string' ? cloneElement(el as ReactElement<{ id?: string }>, { id: b.anchor }) : el}</Fragment>;
      })}
    </div>
  );
}

