import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { fileSize, pick, type Block, type Content, type GalleryItem, type Lang, type LText } from '@/lib/site-shared';
import { StoryBook } from './StoryBook';
import { GalleryGrid } from './GalleryGrid';

/** 공개 화면 낱말 (블록 안) */
const W = {
  prev: { ko: '이전 쪽', en: 'Previous', th: 'ก่อนหน้า' }, next: { ko: '다음 쪽', en: 'Next', th: 'ถัดไป' }, page: { ko: '쪽', en: 'Page', th: 'หน้า' },
  all: { ko: '전체', en: 'All', th: 'ทั้งหมด' }, close: { ko: '닫기', en: 'Close', th: 'ปิด' },
  prevPhoto: { ko: '이전 사진', en: 'Previous photo', th: 'ภาพก่อนหน้า' }, nextPhoto: { ko: '다음 사진', en: 'Next photo', th: 'ภาพถัดไป' },
  photos: { ko: '장', en: ' photos', th: ' ภาพ' }, watch: { ko: '영상 보기', en: 'Watch the video', th: 'ดูวิดีโอ' },
  allNews: { ko: '소식 모두 보기', en: 'All news', th: 'ข่าวทั้งหมด' }, read: { ko: '읽기', en: 'Read', th: 'อ่าน' },
  download: { ko: 'PDF 내려받기', en: 'Download PDF', th: 'ดาวน์โหลด PDF' },
} as const;
const w = (k: keyof typeof W, lang: Lang) => W[k][lang];

export type NewsItem = { key: string; title: LText; summary?: LText | null; cover?: string | null; published_at?: string };

/**
 * 27차·31차: 홈페이지 블록 그리기 (공개 화면·구성원 미리보기 공용).
 * 글은 텍스트로만 넣는다(HTML 해석 없음). 그림 주소·사이트 안 링크는 호출하는 쪽이 정한다(공개 판 / 구성원 미리보기).
 */
export function SiteBlocks({ content, lang, fallback, assetUrl, link = (h) => h, news = [], textInImage = false }: {
  content: Content; lang: Lang; fallback: Lang; assetUrl: (id: string) => string; link?: (href: string) => string; news?: NewsItem[];
  /** 동화 쪽 그림 안에 글이 이미 들어 있으면 글을 그림 위에 다시 쓰지 않고 대체 글로 준다 */
  textInImage?: boolean;
}) {
  const t = (x: LText | null | undefined) => pick(x, lang, fallback);
  const paras = (x: LText | null | undefined) => t(x).split(/\n{2,}/).filter(Boolean).map((p, j) => <p key={j}>{p}</p>);
  const storyPages = content.blocks.filter((b): b is Extract<Block, { type: 'story_page' }> => b.type === 'story_page');
  const href = (h: string) => (h.startsWith('/') || h.startsWith('#') ? link(h) : h);
  const ext = (h: string) => !(h.startsWith('/') || h.startsWith('#'));
  return (
    <div className="site-blocks">
      {storyPages.length > 0 && (
        <StoryBook pages={storyPages.map((p) => ({ image: p.asset ? assetUrl(p.asset) : null, text: t(p.text) }))} textInImage={textInImage}
          labels={{ prev: w('prev', lang), next: w('next', lang), page: w('page', lang) }} />
      )}
      {content.blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': return <h2 key={i} className="site-h2">{t(b.text)}</h2>;
          case 'text': return <div key={i} className="site-text">{paras(b.text)}</div>;
          case 'notice': return <p key={i} className="site-notice" role="note">{t(b.text)}</p>;
          case 'image': return (
            <figure key={i} className="site-figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(b.asset)} alt={t(b.alt)} loading="lazy" />
              {t(b.caption) && <figcaption>{t(b.caption)}</figcaption>}
            </figure>
          );
          case 'gallery': {
            const items: GalleryItem[] = b.items ?? b.assets.map((a) => ({ asset: a }));
            return <GalleryGrid key={i} caption={t(b.caption)}
              items={items.map((g) => ({ src: assetUrl(g.asset), alt: t(g.alt), category: g.category }))}
              filters={(b.filters ?? []).map((f) => ({ key: f.key, label: t(f.label) }))}
              labels={{ all: w('all', lang), close: w('close', lang), prev: w('prevPhoto', lang), next: w('nextPhoto', lang), count: `{n}${w('photos', lang)}` }} />;
          }
          case 'video': {
            const url = t(b.url);
            const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/);
            return yt
              ? <div key={i} className="site-video"><iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} title={t(content.title)} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>
              : <p key={i}><a href={url} target="_blank" rel="noopener noreferrer">{w('watch', lang)}</a></p>;
          }
          case 'download': {
            // 34차: PDF 내려받기. 파일 이름·크기는 판에 저장된 값(스냅샷)을 쓴다. 서버는 PDF를 attachment 로만 준다
            const name = b.file_name ?? 'story.pdf';
            return (
              <p key={i} className="site-download" data-testid="download-block">
                <a href={assetUrl(b.asset)} download={name}>
                  <FileDown size={20} aria-hidden="true" />
                  <span><b>{t(b.label) || w('download', lang)}</b><span className="site-download-meta">PDF{b.size_bytes ? ` · ${fileSize(b.size_bytes)}` : ''}</span></span>
                </a>
                {t(b.note) && <span className="site-download-note">{t(b.note)}</span>}
              </p>
            );
          }
          case 'news_list': {
            const list = news.slice(0, b.count);
            if (!list.length) return null; // 볼 것이 없으면 방문자에게 보이지 않는다
            return (
              <section key={i} className="site-section lb-feature" data-style={b.style} data-testid="news-list">
                {t(b.title) && <h2 className="site-h2">{t(b.title)}</h2>}
                {t(b.body) && <p className="site-lead">{t(b.body)}</p>}
                {b.style === 'list'
                  ? <ul className="lb-board">{list.map((n) => (
                      <li key={n.key}><time>{n.published_at?.slice(0, 10)}</time><Link href={link(`/news/${n.key}`)}>{t(n.title)}</Link></li>))}</ul>
                  : <ul className="site-cards story-grid">{list.map((n) => (
                      <li key={n.key}><Link href={link(`/news/${n.key}`)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {n.cover && <img src={assetUrl(n.cover)} alt="" loading="lazy" />}
                        <b>{t(n.title)}</b>{t(n.summary) && <span>{t(n.summary)}</span>}</Link></li>))}</ul>}
                <Link className="site-link" href={link('/news')}>{w('allNews', lang)}</Link>
              </section>
            );
          }
          case 'section': {
            const photo = b.asset ? <figure className="sec-photo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={assetUrl(b.asset)} alt={t(b.alt)} loading="lazy" /></figure> : null;
            const head = <>{t(b.eyebrow) && <span className="sec-eyebrow">{t(b.eyebrow)}</span>}{t(b.title) && b.template !== 'quote' && <h2 className="site-h2">{t(b.title)}</h2>}</>;
            const btn = b.button && t(b.button.label) ? <Link className="site-button" href={href(b.button.href)} {...(ext(b.button.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{t(b.button.label)}</Link> : null;
            const items = b.items ?? [];
            if (b.template === 'quote') return (
              <figure key={i} className="sec sec-quote" data-template="quote"><blockquote>{paras(b.body)}</blockquote>{t(b.title) && <figcaption>{t(b.title)}</figcaption>}</figure>
            );
            return (
              <section key={i} className="sec" data-template={b.template}>
                {b.template === 'banner' && photo}
                <div className="sec-copy">{head}{paras(b.body)}{btn}</div>
                {(b.template === 'media-left' || b.template === 'media-right') && photo}
                {items.length > 0 && (
                  b.template === 'facts'
                    ? <dl className="sec-facts">{items.map((it, k) => <div key={k}><dt>{t(it.title)}</dt><dd>{paras(it.body)}</dd></div>)}</dl>
                    : b.template === 'steps'
                      ? <ol className="sec-steps">{items.map((it, k) => <li key={k}><span aria-hidden="true">{String(k + 1).padStart(2, '0')}</span><div>{t(it.title) && <h3>{t(it.title)}</h3>}{paras(it.body)}</div></li>)}</ol>
                      : <ul className={b.template === 'photos' ? 'sec-photos' : 'sec-cards'}>{items.map((it, k) => {
                          const inner = <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {it.asset && <img src={assetUrl(it.asset)} alt={t(it.alt)} loading="lazy" />}
                            {t(it.title) && (b.template === 'photos' ? <span>{t(it.title)}</span> : <h3>{t(it.title)}</h3>)}
                            {b.template !== 'photos' && paras(it.body)}
                          </>;
                          return <li key={k}>{it.href ? <Link href={href(it.href)}>{inner}</Link> : inner}</li>;
                        })}</ul>
                )}
              </section>
            );
          }
          default: return null;
        }
      })}
    </div>
  );
}
