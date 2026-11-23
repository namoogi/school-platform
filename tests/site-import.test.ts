/** 31차: 기존 홈페이지 가져오기 변환 — 합성 묶음(실제 학교 글 아님)으로 쪽·소식·동화·숨은 쪽과 그림 자리를 확인한다 */
import { describe, expect, it } from 'vitest';
import { fillAssets, FILE_REF, planImport } from '@/lib/site-import';
import { validateContent } from '@/lib/site';

const L = (en: string) => ({ th: `ไทย ${en}`, en, ko: `한 ${en}` });
const asset = (src: string, category: string) => ({ src, w: 10, h: 10, category, alt: L(`alt ${src}`) });
const content = {
  format: 'rung-arun-export/1', exportedAt: '2026-11-23T00:00:00Z',
  languages: { school: ['th', 'en', 'ko'], friends: ['ko', 'en'] },
  defaults: {
    name: L('Example School'), location: L('Somewhere'), intro: L('Intro'), hero: L('Hero'), nameMeaning: L('Name meaning'),
    philosophyTitle: L('Philosophy'), philosophyIntro: L('Philosophy intro'), knownNote: L('Known note'), curriculumNote: L('Curriculum note'),
    galleryIntro: L('Gallery intro'), dayTitle: L('Day title'), dayNote: L('Day note'), admissionsIntro: L('Admissions intro'),
    admissionsArchive: L('Archive'), contactIntro: L('Contact intro'), contactNote: L('Contact note'), officeHours: L('08:30-16:30'),
    address: '1 Example Road', addressThai: 'ถนนตัวอย่าง 1', phone: ['000-0000000', '<전화>'], facebook: 'https://www.facebook.com/example',
    ui: Object.fromEntries(['home', 'about', 'curriculum', 'life', 'gallery', 'news', 'admissions', 'contact', 'visit', 'contactSchool', 'viewGallery',
      'stages', 'activities', 'nameTitle', 'location', 'nextStep', 'nextStepBody', 'documents', 'faq', 'office', 'hours', 'map', 'facebook', 'poster',
      'classroom', 'art', 'grounds'].map((k) => [k, L(k)])),
    values: [{ title: L('Value 1'), body: L('Value body') }],
    stages: [{ id: 'early', title: L('Early'), subtitle: L('Sub'), body: L('Stage body'), photo: 'workshop', points: [L('Point A'), L('Point B')], note: L('Note') }],
    activities: [{ title: L('Act'), body: L('Act body') }],
    dayQuestions: [L('Q1'), L('Q2')], admissionSteps: [{ title: L('Step'), body: L('Step body') }], documents: [L('Doc')],
    faq: [{ q: L('Fee?'), a: L('Ask') }],
    stories: [{ id: 'making', photo: 'together', title: L('<b>Making</b>'), teaser: L('Teaser'), body: [L('Para 1'), L('Para 2')], secondary: 'artwork' }],
    assets: {
      campus: asset('/assets/campus-large-1920.webp', 'grounds'), workshop: asset('/assets/art-workshop.jpg', 'classroom'),
      together: asset('/assets/learning-together.jpg', 'classroom'), artwork: asset('/assets/artwork.jpg', 'art'),
      circle: asset('/assets/circle-activity.jpg', 'classroom'), classroom: asset('/assets/classroom.jpg', 'classroom'),
      entrance: asset('/assets/school-entrance.jpg', 'grounds'), poster: asset('/assets/school-poster.jpg', 'admissions'), logo: asset('/assets/school-logo.jpg', 'brand'),
    },
    copy: { homeTitle: L('Home<br>title'), homeIdentity: L('Identity'), homePortraitTitle: L('Portrait'), homePortraitBody: L('Portrait body'), homeMomentsTitle: L('Moments'), newsSourceNote: L('Source note') },
  },
  tables: { news_posts: [], photos: [{ path: 'school/2026/11/x.webp', in_gallery: true, category: 'art', alt_en: 'Bucket' }, { path: 'school/2026/11/y.webp', in_gallery: false }] },
};
const files = [
  'content.json', 'manifest.json',
  'assets/site/assets/campus-large-1280.webp', 'assets/site/assets/campus-large-1920.webp', 'assets/site/assets/art-workshop-1280.webp', 'assets/site/assets/art-workshop.jpg',
  'assets/site/assets/learning-together-1280.webp', 'assets/site/assets/artwork-960.webp', 'assets/site/assets/circle-activity-1280.webp',
  'assets/site/assets/classroom-1108.webp', 'assets/site/assets/school-entrance-880.webp', 'assets/site/assets/school-poster.jpg', 'assets/site/assets/school-logo.jpg',
  'assets/bucket/school/2026/11/x.webp',
  'stories/rain/book.json', 'stories/rain/pages/01.jpg', 'stories/rain/pages/02.jpg',
];
const book = { slug: 'rain', locale: 'th', title: 'ฝน', title_ko: '비', character: ['ช้าง(코끼리)', 'หมี(곰)'], virtue: null, video: { file: 'video/x.mp4' },
  pages: [{ no: 2, image: 'pages/02.jpg', text: 'สอง' }, { no: 1, image: 'pages/01.jpg', text: 'หนึ่ง' }] };
const friends = { format: 'school-platform-pages/1', pages: [
  { key: 'friends', content: { title: { ko: '후원', en: 'Support' }, cover: `${FILE_REF}assets/site/assets/campus-large-1280.webp`, blocks: [{ type: 'text', text: { ko: '글' } }] } },
  { key: 'friends-about', content: { title: { ko: '소개' }, blocks: [{ type: 'image', asset: `${FILE_REF}assets/site/assets/missing.webp` }] } },
] };

const fake = (paths: string[]) => Object.fromEntries(paths.map((p, i) => [p, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));

describe('기존 홈페이지 가져오기 변환', () => {
  const plan = planImport(content, files, book, friends);
  const ids = fake(plan.files);

  it('쪽 7개(home·about·curriculum·life·gallery·admissions·contact), 소식, 동화, 숨은 쪽을 만든다', () => {
    expect(plan.entries.filter((e) => e.kind === 'page' && e.visibility === 'public').map((e) => e.key))
      .toEqual(['home', 'about', 'curriculum', 'life', 'gallery', 'admissions', 'contact']);
    expect(plan.entries.filter((e) => e.kind === 'news').map((e) => e.key)).toEqual(['making']);
    expect(plan.entries.filter((e) => e.visibility === 'unlisted').map((e) => e.key)).toEqual(['friends', 'friends-about']);
    expect(plan.settings).toMatchObject({ theme: 'dawn', default_lang: 'th', langs: ['th', 'en', 'ko'] });
  });

  it('사진은 1280급 webp를 먼저 고르고, 없으면 원본을 쓴다. 갤러리에 넣지 않은 버킷 사진은 올리지 않는다', () => {
    expect(plan.files).toContain('assets/site/assets/campus-large-1280.webp');
    expect(plan.files).not.toContain('assets/site/assets/campus-large-1920.webp');
    expect(plan.files).toContain('assets/site/assets/school-poster.jpg');
    expect(plan.files).toContain('assets/bucket/school/2026/11/x.webp');
    expect(plan.files.some((f) => f.includes('y.webp'))).toBe(false);
  });

  it('모든 시안이 서버 내용 검사를 통과한다(그림 자리를 id로 바꾼 뒤)', () => {
    for (const e of plan.entries) expect(() => validateContent(fillAssets(e.content, ids))).not.toThrow();
  });

  it('옛 글의 <br>은 줄바꿈, 다른 태그는 지운다. 단계 핵심은 목록 줄로 남는다', () => {
    const home = plan.entries.find((e) => e.key === 'home')!;
    expect(home.content.title.en).toBe('Home\ntitle');
    expect(plan.entries.find((e) => e.key === 'making')!.content.title.en).toBe('Making');
    const stage = plan.entries.find((e) => e.key === 'curriculum')!.content.blocks[0];
    expect(stage.type === 'section' && stage.body?.en).toContain('· Point A\n· Point B');
  });

  it('첫 화면 판에 머리·바닥 정보(로고·주소·전화·페이스북)를 담고, 형식이 틀린 전화는 뺀다', () => {
    const site = plan.entries.find((e) => e.key === 'home')!.content.site!;
    expect(site.logo).toBe(`${FILE_REF}assets/site/assets/school-logo.jpg`);
    expect(site.phone).toEqual(['000-0000000']);
    expect(site.address).toEqual({ th: 'ถนนตัวอย่าง 1', en: '1 Example Road', ko: '1 Example Road' });
    expect(site.facebook).toBe('https://www.facebook.com/example');
  });

  it('갤러리는 묶음 거르기(교실·미술·운동장)와 사진별 묶음을 갖는다', () => {
    const g = plan.entries.find((e) => e.key === 'gallery')!.content.blocks[0];
    expect(g.type).toBe('gallery');
    if (g.type !== 'gallery') return;
    expect(g.filters!.map((f) => f.key)).toEqual(['classroom', 'art', 'grounds']);
    expect(g.items![0]).toMatchObject({ category: 'art' }); // 버킷 사진이 맨 앞
  });

  it('동화는 쪽 번호 순서, 그림 안 글 표시, 영상·성품 이름 안내를 남긴다', () => {
    const s = plan.entries.find((e) => e.kind === 'story')!;
    expect(s).toMatchObject({ key: 'rain', text_in_image: true, character: 'ช้าง(코끼리) · หมี(곰)' });
    expect(s.content.blocks.map((b) => (b.type === 'story_page' ? b.text.th : ''))).toEqual(['หนึ่ง', 'สอง']);
    expect(plan.notes.some((n) => n.includes('영상'))).toBe(true);
    expect(plan.notes.some((n) => n.includes('성품 이름'))).toBe(true);
  });

  it('묶음에 없는 그림은 안내에 남기고, 채울 때 그 자리를 지운다', () => {
    expect(plan.notes.some((n) => n.includes('missing.webp'))).toBe(true);
    const about = plan.entries.find((e) => e.key === 'friends-about')!;
    expect(validateContent(fillAssets(about.content, ids)).blocks).toEqual([]); // 그림 없는 그림 블록은 검사에서 걸러지므로 빈 블록으로 남지 않게
  });

  it('형식이 다른 묶음은 거부한다', () => {
    expect(() => planImport({ format: 'other' }, [], null, null)).toThrow(/rung-arun-export/);
  });
});
