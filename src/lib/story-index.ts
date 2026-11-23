import type { Content, LText } from './site-shared';

export type StoryIndexItem = { key: string; meta: Record<string, string>; title: LText };
export type StoryGroup<T extends StoryIndexItem> = { virtue: string; character: string; stories: T[] };

/** 성품·캐릭터가 같은 이야기만 묶는다. 공개 목록의 순서와 제목을 그대로 유지한다. */
export function groupStories<T extends StoryIndexItem>(items: T[]) {
  const groups = new Map<string, StoryGroup<T>>();
  const together: T[] = [];
  for (const story of items) {
    const virtue = story.meta.virtue?.trim() ?? '';
    const character = story.meta.character?.trim() ?? '';
    if (!virtue) { together.push(story); continue; }
    const key = JSON.stringify([virtue, character]);
    const group = groups.get(key) ?? { virtue, character, stories: [] };
    group.stories.push(story);
    groups.set(key, group);
  }
  return { groups: [...groups.values()], together };
}

/** 공개된 캐릭터 PNG 갤러리의 이름을 사용한다. 장면 그림이나 시안 자산을 대표 그림으로 추측하지 않는다. */
export function characterPortraits(contents: Content[]): Record<string, string> {
  const portraits: Record<string, string> = Object.create(null);
  for (const content of contents) {
    for (const block of content.blocks) {
      if (block.hidden || block.type !== 'gallery' || block.download !== 'png') continue;
      for (const item of block.items ?? []) {
        for (const name of Object.values(item.alt ?? {})) {
          const key = name?.trim();
          if (key && !Object.hasOwn(portraits, key)) portraits[key] = item.asset;
        }
      }
    }
  }
  return portraits;
}

// 사용자가 목록에 표시하도록 지정한 원본 캐릭터의 경량 사본.
// 특정 동화의 공개·내림과 별개인 목록 장식이며, 시안 자산을 조회하지 않는다.
const RUNGARUN_CHARACTERS: Record<string, string> = {
  사슴: 'deer', 고슴도치: 'hedgehog', 양: 'sheep', 다람쥐: 'squirrel',
  펠리컨: 'pelican', 나비: 'butterfly', 코끼리: 'elephant', 곰: 'bear',
};

export function storyPortraitUrls(slug: string, contents: Content[], asset: (id: string) => string): Record<string, string> {
  const urls: Record<string, string> = Object.create(null);
  for (const [name, id] of Object.entries(characterPortraits(contents))) urls[name] = asset(id);
  if (slug === 'rungarunsuksa') {
    for (const [name, file] of Object.entries(RUNGARUN_CHARACTERS)) {
      urls[name] = `/story-characters/rungarunsuksa/${file}.webp`;
    }
  }
  return urls;
}
