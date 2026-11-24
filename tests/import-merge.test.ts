/** 50차: 다시 가져오기 '빠진 칸만 채우기' — 지금 판을 덮지 않는다 */
import { describe, expect, it } from 'vitest';
import { FILE_REF, mergeMissing, refsIn } from '@/lib/site-import';
import type { Content } from '@/lib/site-shared';

const current: Content = {
  title: { ko: '고친 제목', th: 'แก้แล้ว' }, // 사람이 고친 제목
  blocks: [
    { type: 'section', template: 'text', title: { ko: '이름 뜻' }, body: { ko: '사람이 다시 쓴 글' } },
    { type: 'section', template: 'cards', title: { ko: '교육 단계' }, items: [{ title: { ko: '유아' } }, { title: { ko: '초등' }, body: { ko: '이미 있음' } }] },
    { type: 'text', text: { ko: '사람이 더한 문단' } },
    { type: 'news_list', title: { ko: '소식' }, count: 2, style: 'cards' },
  ],
};
const planned: Content = {
  title: { ko: '옛 제목', th: 'เดิม', en: 'Old title' },
  head: { eyebrow: { en: 'UBON RATCHATHANI' } },
  blocks: [
    { type: 'section', template: 'text', variant: 'split', eyebrow: { en: 'RUNG · ARUN' }, title: { ko: '옛 이름 뜻' }, body: { ko: '옛 글' }, button: { label: { ko: '학교 소개' }, href: '/p/about' } },
    { type: 'section', template: 'media-left', title: { ko: '옛 사진 구역' }, asset: `${FILE_REF}assets/a.webp` },
    { type: 'section', template: 'cards', variant: 'index', items: [{ title: { ko: '유아(옛)' }, body: { ko: '처음' }, href: '/p/curriculum' }, { title: { ko: '초등(옛)' }, body: { ko: '옛 글' } }] },
    { type: 'news_list', eyebrow: { en: 'SCHOOL JOURNAL' }, title: { ko: '옛 소식' }, count: 2, style: 'cards' },
  ],
};

describe('빠진 칸만 채우기', () => {
  const r = mergeMissing(current, planned);
  it('사람이 고친 글·제목은 그대로, 없는 언어만 더한다', () => {
    expect(r.content.title).toEqual({ ko: '고친 제목', th: 'แก้แล้ว', en: 'Old title' });
    const s0 = r.content.blocks[0] as Extract<typeof r.content.blocks[0], { type: 'section' }>;
    expect(s0.title).toEqual({ ko: '이름 뜻' });
    expect(s0.body).toEqual({ ko: '사람이 다시 쓴 글' });
  });
  it('빈 칸(머리말·배치·단추·쪽 머리)만 채운다', () => {
    const s0 = r.content.blocks[0] as Extract<typeof r.content.blocks[0], { type: 'section' }>;
    expect(s0).toMatchObject({ variant: 'split', eyebrow: { en: 'RUNG · ARUN' }, button: { href: '/p/about' } });
    expect(r.content.head).toEqual({ eyebrow: { en: 'UBON RATCHATHANI' } });
    expect(r.filled).toEqual(expect.arrayContaining(['1번째 구역(이름 뜻) 머리말', '1번째 구역(이름 뜻) 배치 모양', '1번째 구역(이름 뜻) 단추', '쪽 머리']));
  });
  it('항목은 개수가 같으면 항목마다 빈 칸만', () => {
    const s1 = r.content.blocks[1] as Extract<typeof r.content.blocks[0], { type: 'section' }>;
    expect(s1.variant).toBe('index');
    expect(s1.items![0]).toEqual({ title: { ko: '유아' }, body: { ko: '처음' }, href: '/p/curriculum' });
    expect(s1.items![1]).toEqual({ title: { ko: '초등' }, body: { ko: '이미 있음' } });
  });
  it('사람이 더한 블록은 그대로, 짝 없는 옛 구역은 넣지 않고 알린다', () => {
    expect(r.content.blocks).toHaveLength(4);
    expect(r.content.blocks[2]).toEqual({ type: 'text', text: { ko: '사람이 더한 문단' } });
    expect(r.skipped).toEqual(['2번째 구역(옛 사진 구역)']);
    expect(r.content.blocks[3]).toMatchObject({ eyebrow: { en: 'SCHOOL JOURNAL' }, title: { ko: '소식' } });
  });
  it('채울 것이 없으면 그대로, 쓰인 그림만 올린다', () => {
    const again = mergeMissing(r.content, planned);
    expect(again.filled).toEqual([]);
    expect(again.content).toEqual(r.content);
    expect(refsIn(r.content)).toEqual([]); // 짝 없는 사진 구역을 넣지 않았으므로 올릴 그림 없음
  });
});

describe('다시 가져오기 판단', () => {
  it('동화는 그대로, 고치지 않은 가져온 판은 바꾸고, 고친 판은 빈 칸만', async () => {
    const { decideReimport, IMPORT_NOTE } = await import('@/lib/site-import');
    expect(decideReimport('story', { note: null, content: current }, planned).action).toBe('keep');
    const rep = decideReimport('page', { note: `${IMPORT_NOTE} (2026-11-23 묶음)`, content: current }, planned);
    expect(rep.action).toBe('replace');
    const m = decideReimport('page', { note: '사람이 고침', content: current }, planned);
    expect(m.action).toBe('merge');
    const none = decideReimport('page', { note: null, content: (m as { content: Content }).content }, planned);
    // 빈 칸만 채운 판은 다음 가져오기에서 바뀌지 않는다(사람이 고친 내용 보존)
    expect(decideReimport('page', { note: `${IMPORT_NOTE} (2026-11-24 묶음) — 빠진 칸만 채움`, content: (m as { content: Content }).content }, planned).action).toBe('none');
    expect(none.action).toBe('none');
  });
});

describe('사이트 설정 빈 칸만', () => {
  it('제목은 없는 언어만, 언어는 더하기만, 테마는 기본일 때만', async () => {
    const { mergeSettings } = await import('@/lib/site-import');
    const plan = { site_title: { th: 'โรงเรียน', en: 'School' }, langs: ['th', 'en', 'ko'] as ('th' | 'en' | 'ko')[], default_lang: 'th' as const, theme: 'dawn' as const };
    expect(mergeSettings({ site_title: { ko: '우리 학교' }, langs: ['ko'], default_lang: 'ko', theme: 'campus' }, plan))
      .toEqual({ site_title: { th: 'โรงเรียน', en: 'School', ko: '우리 학교' }, langs: ['ko', 'th', 'en'], default_lang: 'ko', theme: 'dawn' });
    expect(mergeSettings({ site_title: { th: 'แก้แล้ว', en: 'Edited', ko: '고침' }, langs: ['th', 'en', 'ko'], default_lang: 'th', theme: 'dawn' }, plan)).toBeNull();
  });
});
