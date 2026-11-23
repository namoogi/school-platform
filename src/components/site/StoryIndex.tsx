import Link from 'next/link';
import { pick, type Lang } from '@/lib/site-shared';
import { groupStories, type StoryIndexItem } from '@/lib/story-index';
import { storyTerm } from '@/lib/story-language';

const WORDS = {
  ko: { intro: '캐릭터와 함께 성품을 만나고, 읽고 싶은 이야기를 골라 보세요.', together: '함께 읽는 이야기', unnamed: '이야기', empty: '아직 한국어로 공개된 동화가 없습니다.' },
  en: { intro: 'Meet the characters and choose a story to explore each virtue.', together: 'Stories to read together', unnamed: 'Stories', empty: 'No stories are available in English yet.' },
  th: { intro: 'รู้จักคุณธรรมผ่านตัวละคร แล้วเลือกนิทานที่อยากอ่าน', together: 'นิทานอ่านด้วยกัน', unnamed: 'นิทาน', empty: 'ยังไม่มีนิทานที่เผยแพร่เป็นภาษาไทย' },
};

export function StoryIndex({ items, portraits, lang, fallback, link }: {
  items: StoryIndexItem[]; portraits: Record<string, string>; lang: Lang; fallback: Lang;
  link: (path: string) => string;
}) {
  const { groups, together } = groupStories(items);
  const words = WORDS[lang];
  const titles = (stories: StoryIndexItem[]) => <ul className="virtue-episodes">{stories.map((s) => (
    <li key={s.key}><Link href={link(`/stories/${s.key}`)}>{pick(s.title, lang, fallback)}</Link></li>
  ))}</ul>;
  return <div className="virtue-story-index" data-testid="site-list">
    <p className="site-lead">{items.length ? words.intro : words.empty}</p>
    <div className="virtue-groups">
      {groups.map((group) => {
        const portrait = Object.hasOwn(portraits, group.character) ? portraits[group.character] : undefined;
        return <section className="virtue-group" data-portrait={Boolean(portrait)} key={JSON.stringify([group.virtue, group.character])}>
          {portrait && /* eslint-disable-next-line @next/next/no-img-element */ <img className="virtue-portrait" src={portrait} alt="" width={128} height={176} loading="lazy" />}
          <div className="virtue-stories">
            <header className="virtue-character">
              <h2>{storyTerm(group.virtue, lang)}</h2><p>{storyTerm(group.character, lang) || words.unnamed}</p>
            </header>
            {titles(group.stories)}
          </div>
        </section>;
      })}
    </div>
    {together.length > 0 && <section className="virtue-together"><h2>{words.together}</h2>{titles(together)}</section>}
  </div>;
}
