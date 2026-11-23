import { pick, type Block, type Content, type Lang } from '@/lib/site';
import { StoryBook } from './StoryBook';

/**
 * 27차: 홈페이지 블록 그리기 (공개 화면·구성원 미리보기 공용).
 * 글은 텍스트로만 넣는다(HTML 해석 없음). 그림 주소는 호출하는 쪽이 정한다(공개 판 / 구성원 미리보기).
 */
export function SiteBlocks({ content, lang, fallback, assetUrl }: { content: Content; lang: Lang; fallback: Lang; assetUrl: (id: string) => string }) {
  const storyPages = content.blocks.filter((b): b is Extract<Block, { type: 'story_page' }> => b.type === 'story_page');
  return (
    <div className="site-blocks">
      {storyPages.length > 0 && (
        <StoryBook pages={storyPages.map((p) => ({ image: p.asset ? assetUrl(p.asset) : null, text: pick(p.text, lang, fallback) }))}
          labels={{ prev: lang === 'th' ? 'ก่อนหน้า' : lang === 'en' ? 'Previous' : '이전 쪽', next: lang === 'th' ? 'ถัดไป' : lang === 'en' ? 'Next' : '다음 쪽', page: lang === 'th' ? 'หน้า' : lang === 'en' ? 'Page' : '쪽' }} />
      )}
      {content.blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': return <h2 key={i} className="site-h2">{pick(b.text, lang, fallback)}</h2>;
          case 'text': return <div key={i} className="site-text">{pick(b.text, lang, fallback).split(/\n{2,}/).map((p, j) => <p key={j}>{p}</p>)}</div>;
          case 'notice': return <p key={i} className="site-notice" role="note">{pick(b.text, lang, fallback)}</p>;
          case 'image': return (
            <figure key={i} className="site-figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(b.asset)} alt={pick(b.alt, lang, fallback)} loading="lazy" />
              {pick(b.caption, lang, fallback) && <figcaption>{pick(b.caption, lang, fallback)}</figcaption>}
            </figure>
          );
          case 'gallery': return (
            <figure key={i} className="site-gallery">
              <div>{/* eslint-disable-next-line @next/next/no-img-element */}
                {b.assets.map((a) => <img key={a} src={assetUrl(a)} alt="" loading="lazy" />)}</div>
              {pick(b.caption, lang, fallback) && <figcaption>{pick(b.caption, lang, fallback)}</figcaption>}
            </figure>
          );
          case 'video': {
            const url = pick(b.url, lang, fallback);
            const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/);
            return yt
              ? <div key={i} className="site-video"><iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} title={pick(content.title, lang, fallback)} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>
              : <p key={i}><a href={url} target="_blank" rel="noopener noreferrer">{lang === 'th' ? 'ดูวิดีโอ' : lang === 'en' ? 'Watch the video' : '영상 보기'}</a></p>;
          }
          default: return null;
        }
      })}
    </div>
  );
}
