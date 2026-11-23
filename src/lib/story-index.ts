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
