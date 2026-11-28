import type { Db } from './db';
import { checkUpload, createEntry, getEntry, listAssets, listEntries, saveVersion, uploadAsset, validateContent, type Block, type Content, type LText, type SiteTheme } from './site';
import { NotFoundError, ValidationError } from './services';
import { proposeFills, putProposal, type Proposal } from './site-autofill';
import { readPlainText } from './readers';
import { crawlSite, fetchImage } from './site-crawl';
import { movePath, splitSubmenuPages } from './site-template-split';
import type { TemplateFacets } from './site-template-facets';

/**
 * 65차 ADR 0031 — 학교 홈페이지 템플릿 7종.
 * 템플릿 = 추천 테마 + 쪽 목록(기존 블록 형식) + 빈 칸 목록(slots) + 공개 의무 안내. 고르면 그 학교에 시안 쪽(1판)을 만든다(공개는 사람).
 * 빈 칸 목록은 66차 자동 배치·67차 기존 사이트 이전이 채운다. 조사: docs/research/homepage-templates-2026-11.md
 */
export type SlotKind = 'text' | 'image' | 'list' | 'contact';
export type Slot = {
  id: string; page: string; path: (string | number)[]; kind: SlotKind; label: string; hint: string;
  /** 자료에서 이 칸을 찾을 때 쓰는 단서 낱말(한·영) */
  clues: string[];
};
export type TemplatePage = { kind: 'page'; key: string; sort: number; content: Content };
export type SiteTemplate = TemplateFacets & {
  key: string; version: number; name: string; summary: string; fits: string[]; firstScreen: string;
  theme: SiteTheme; langs: ('ko' | 'en' | 'th')[]; pages: TemplatePage[]; slots: Slot[]; mustHave: string[];
  /** 133차: 하위 메뉴를 쪽으로 나누기 전 원본(예시 글은 원본 순서대로 채운 뒤 같은 방식으로 나눈다). 한 쪽 구조는 없음 */
  source?: TemplatePage[];
};

// ── 블록 짓기 도우미 (안내 문구는 '[ … ]'로 감싼다: 자동 배치·사람이 바꿀 자리) ──
const ko = (s: string): LText => ({ ko: s });
const kb = (k: string, e: string): LText => ({ ko: k, en: e });
const section = (b: Omit<Extract<Block, { type: 'section' }>, 'type'>): Block => ({ type: 'section', ...b });
const news = (title: LText, count = 3, style: 'cards' | 'list' = 'cards'): Block => ({ type: 'news_list', title, count, style });
const contact = (visit?: { label: string; href: string; en?: string }): Content['site'] => ({
  ...(visit?.en
    // 두 언어 템플릿(ko·en): 바닥 연락처도 영어 안내 자리를 함께 둔다
    ? { tagline: kb('[학교를 한 줄로 소개하는 말]', '[One line about the school]'), address: kb('[학교 주소]', '[Address]'), footer: kb('[학교 이름] · [대표 전화] · [이메일]', '[School name] · [Phone] · [Email]') }
    : { tagline: ko('[학교를 한 줄로 소개하는 말]'), address: ko('[학교 주소]'), footer: ko('[학교 이름] · [대표 전화] · [이메일]') }),
  // 100차: 머리글 오른쪽·바닥글의 주요 행동 단추(학교가 이름과 가는 곳을 바꾼다)
  ...(visit ? { visit: { label: visit.en ? kb(visit.label, visit.en) : ko(visit.label), href: visit.href } } : {}),
});
// 107차: 학교 홈페이지 공통 구역(docs/design/school-site-ia.md 6절, template-reference-board.md 3절)
// 112차: 두 언어 템플릿(ko·en)은 e(영어 접두)를 주면 고정 문구·안내 자리를 영어로도 만든다(Codex 검토)
const L = (k: string, en?: string): LText => (en === undefined ? ko(k) : kb(k, en));
const quicklinks = (links: [string, string, string?][], p: string, e?: string): Block => section({ template: 'cards', variant: 'quicklinks', title: L('바로 가기', e && 'Quick links'),
  items: links.map(([title, href, titleEn], i) => ({ title: L(title, e && titleEn), body: L(`[${p} 바로가기 설명 ${i + 1}]`, e && `[${e} quick link ${i + 1}]`), href })) });
const stats = (p: string, n = 4, e?: string): Block => section({ template: 'facts', variant: 'stats', eyebrow: L('숫자로 보는 학교', e && 'At a glance'), title: L(`[${p} 숫자 띠 제목]`, e && `[${e} stats title]`),
  items: Array.from({ length: n }, (_, i) => ({ title: L(`[${p} 숫자 ${i + 1}]`, e && `[${e} number ${i + 1}]`), body: L(`[${p} 숫자 ${i + 1} 설명]`, e && `[${e} number ${i + 1} label]`) })) });
const events = (p: string, title: string, e?: string, titleEn?: string): Block => section({ template: 'cards', variant: 'events', eyebrow: L('다가오는 일정', e && 'Coming up'), title: L(title, e && titleEn),
  items: [1, 2, 3].map((i) => ({ tag: L(`[${p} 행사 ${i} 날짜]`, e && `[${e} event ${i} date]`), title: L(`[${p} 행사 ${i}]`, e && `[${e} event ${i}]`), body: L(`[${p} 행사 ${i} 안내]`, e && `[${e} event ${i} note]`) })) });
const voices = (p: string, title: string, e?: string, titleEn?: string): Block => section({ template: 'cards', variant: 'voices', eyebrow: L('함께하는 사람들의 목소리', e && 'Voices'), title: L(title, e && titleEn),
  body: L('[공개에 동의한 분의 말만 싣습니다]', e && '[Only words shared with consent]'), items: [1, 2, 3].map((i) => ({ title: L(`[${p} 말한 사람 ${i}]`, e && `[${e} speaker ${i}]`), body: L(`[${p} 목소리 ${i}]`, e && `[${e} voice ${i}]`) })) });
// 126차(ADR 0046): menu=true면 입학 하위 메뉴(절차·학비·질문·신청)에 메뉴 주소를 단다
const admissionPage = (p: string, sort: number, menu = false): TemplatePage => page('admission', sort, ko('입학 안내'), [
  section({ ...(menu ? { anchor: 'process' } : {}), template: 'steps', eyebrow: ko('처음 만나는 길'), title: ko('입학 절차'), items: [
    { title: ko('문의'), body: ko(`[${p} 문의 방법]`) }, { title: ko('견학·상담'), body: ko(`[${p} 견학 일정]`) }, { title: ko('지원'), body: ko(`[${p} 지원 서류·면담]`) }, { title: ko('입학'), body: ko(`[${p} 결과·등록]`) }] }),
  section({ ...(menu ? { anchor: 'fees' } : {}), template: 'facts', variant: 'curriculum', title: ko('학비와 비용'), items: [{ title: ko(`[${p} 수업료]`), body: ko(`[${p} 수업료 안내]`) }, { title: ko(`[${p} 기타 비용]`), body: ko(`[${p} 기타 비용 안내]`) }] }),
  section({ ...(menu ? { anchor: 'faq' } : {}), template: 'facts', variant: 'faq', title: ko('자주 묻는 질문'), items: [1, 2, 3].map((i) => ({ title: ko(`[${p} 질문 ${i}]`), body: ko(`[${p} 답 ${i}]`) })) }),
  { type: 'inquiry', title: ko('견학·상담 신청'), body: ko(`[${p} 신청 안내]`), ...(menu ? { anchor: 'apply' } : {}) },
  section({ template: 'media-left', eyebrow: ko('첫걸음'), title: ko('새로 온 학생의 첫 달'), body: ko(`[${p} 첫걸음 이야기]`) }),
]);
const page = (key: string, sort: number, title: LText, blocks: Block[], extra: Partial<Content> = {}): TemplatePage =>
  ({ kind: 'page', key, sort, content: { title, blocks, ...extra } });
const slot = (id: string, pg: string, path: (string | number)[], kind: SlotKind, label: string, hint: string, clues: string[]): Slot =>
  ({ id, page: pg, path, kind, label, hint, clues });
// 여러 템플릿에 공통인 빈 칸
const commonSlots = (): Slot[] => [
  slot('tagline', 'home', ['site', 'tagline'], 'text', '학교 한 줄 소개', '학교를 한 문장으로', ['슬로건', '표어', '한 줄', 'motto', 'tagline']),
  slot('address', 'home', ['site', 'address'], 'contact', '주소', '도로명 주소', ['주소', '오시는 길', 'address', 'location']),
  slot('footer', 'home', ['site', 'footer'], 'contact', '바닥 연락처', '학교 이름 · 대표 전화 · 이메일', ['전화', '연락처', '이메일', 'phone', 'email', 'contact']),
];

const RAW_TEMPLATES: SiteTemplate[] = [
  {
    key: 'notice', version: 6, name: '알림 중심형', theme: 'clear', langs: ['ko'],
    nav: 'side', first: 'board', contents: ['notice'],
    summary: '재학생 가정이 매일 찾는 알림·소식·학사일정·급식을 첫 화면에 둡니다.',
    fits: ['공립·지역 학교', '재학생 가정이 주 방문자', '공지가 많은 학교'], firstScreen: '알림 · 최근 소식 · 학사일정 · 급식',
    mustHave: ['학교 소개(인사말·연혁·교육목표)', '학사일정', '오시는 길', '입학·전학 안내'],
    pages: [
      page('home', 0, ko('[학교 이름]'), [
        // 89차: 완성 디자인(맑은 하늘)의 첫 화면 — 큰 사진 위 학교 한 줄(사진은 학교가 올림)
        section({ template: 'banner', title: ko('[학교를 한 문장으로 — 예: 마을과 함께 자라는 학교]'), button: { label: ko('학교 소개'), href: '/p/about' } }),
        // 107차: 첫 화면에 걸친 바로가기
        section({ template: 'cards', variant: 'quicklinks', title: ko('바로 가기'), items: [
          { title: ko('학사일정'), body: ko('[이번 달 주요 일정]'), href: '/p/school-life' },
          { title: ko('급식 안내'), body: ko('[이번 달 식단표는 학교 생활 쪽에]'), href: '/p/school-life' },
          { title: ko('입학·전학'), body: ko('[입학·전학 안내 한 줄]'), href: '/p/admission' },
          { title: ko('오시는 길'), body: ko('[대중교통·주차 안내]'), href: '/p/about' },
        ] }),
        { type: 'notice', text: ko('[이번 주 가장 중요한 알림 한 줄 — 예: 다음 주 월요일 재량 휴업일]') },
        news(ko('알림·가정통신문'), 6, 'list'),
        events('알림', '이번 달 학사일정'),
      ], { site: contact({ label: '오시는 길', href: '/p/about' }) }),
      page('about', 1, ko('학교 소개'), [
        section({ anchor: 'greeting', template: 'text', title: ko('인사말'), body: ko('[교장 인사말 3~5문장]') }),
        section({ anchor: 'goals', template: 'facts', title: ko('교육 목표'), items: [{ title: ko('[교육 목표 1]'), body: ko('[설명]') }, { title: ko('[교육 목표 2]'), body: ko('[설명]') }] }),
        section({ anchor: 'history', template: 'steps', title: ko('연혁'), items: [{ title: ko('[연도]'), body: ko('[개교·주요 일]') }, { title: ko('[연도]'), body: ko('[주요 일]') }] }),
        // 126차(ADR 0046): 학교 소개 아래 하위 메뉴 — 구역마다 메뉴 주소
        section({ anchor: 'symbols', template: 'cards', title: ko('학교 상징'), items: [1, 2, 3].map((i) => ({ title: ko(`[알림 상징 ${i}]`), body: ko(`[알림 상징 ${i} 설명]`) })) }),
        section({ anchor: 'way', template: 'text', title: ko('오시는 길'), body: ko('[주소·대중교통·주차]') }),
      ]),
      page('school-life', 2, ko('학교 생활'), [
        // 129차: 학사일정은 석 달 치(실제 학교 안내 길이) — 한 칸짜리 목록이 늘어나지 않게
        section({ anchor: 'calendar', template: 'facts', title: ko('학사일정'), items: [1, 2, 3].map((i) => ({ title: ko(`[알림 달 ${i}]`), body: ko(`[알림 달 ${i} 일정]`) })) }),
        section({ anchor: 'lunch', template: 'text', title: ko('급식'), body: ko('[급식 운영 안내 · 이번 달 식단표는 PDF로 올려 주세요]') }),
        section({ anchor: 'afterschool', template: 'text', title: ko('방과후·돌봄'), body: ko('[운영 시간·신청 방법]') }),
        section({ anchor: 'counsel', template: 'text', title: ko('상담·학교폭력 신고'), body: ko('[알림 상담 안내]') }),
      ]),
      page('admission', 3, ko('입학·전학'), [
        section({ anchor: 'process', template: 'steps', title: ko('입학·전학 절차'), items: [{ title: ko('문의'), body: ko('[알림 입학 문의]') }, { title: ko('서류 제출'), body: ko('[알림 입학 서류]') }, { title: ko('배정·안내'), body: ko('[알림 배정 안내]') }] }),
        section({ anchor: 'documents', template: 'facts', title: ko('준비할 서류'), items: [{ title: ko('[알림 서류 1]'), body: ko('[알림 서류 1 설명]') }, { title: ko('[알림 서류 2]'), body: ko('[알림 서류 2 설명]') }] }),
        section({ anchor: 'contact', template: 'cta', title: ko('입학·전학 문의'), body: ko('[알림 입학 연락처]') }),
      ]),
      // 126차: 소식 아래 하위 쪽 — 가정통신문
      page('letters', 4, ko('가정통신문'), [
        section({ template: 'text', title: ko('가정통신문 보는 법'), body: ko('[알림 가정통신문 안내]') }),
        section({ anchor: 'recent', template: 'cards', variant: 'events', title: ko('최근 가정통신문'), items: [1, 2, 3].map((i) => ({
          tag: ko(`[알림 통신문 ${i} 날짜]`), title: ko(`[알림 통신문 ${i}]`), body: ko(`[알림 통신문 ${i} 안내]`) })) }),
      ], { menu: { parent: 'news' } }),
    ],
    slots: [
      ...commonSlots(),
      slot('greeting', 'about', ['blocks', 0, 'body'], 'text', '인사말', '교장 인사말 3~5문장', ['인사말', '교장', '환영', 'principal', 'welcome']),
      slot('goals', 'about', ['blocks', 1, 'items'], 'list', '교육 목표', '목표 2~4개와 설명', ['교육목표', '교육 목표', '비전', 'goals', 'vision']),
      slot('history', 'about', ['blocks', 2, 'items'], 'list', '연혁', '연도와 주요 일', ['연혁', '개교', 'history', 'founded']),
      slot('calendar', 'school-life', ['blocks', 0, 'items'], 'list', '학사일정', '월별 주요 일정', ['학사일정', '일정', '방학', 'calendar', 'term dates']),
      slot('meals', 'school-life', ['blocks', 1, 'body'], 'text', '급식 안내', '급식 운영 방식', ['급식', '식단', 'lunch', 'meal']),
    ],
  },
  {
    key: 'story', version: 7, name: '이야기형', theme: 'ivory', langs: ['ko'],
    nav: 'top', first: 'magazine', contents: ['story'],
    summary: '교육철학과 학교의 하루를 사진과 이야기로 보여 줍니다.',
    fits: ['사립·대안학교', '교육철학으로 알려지는 학교'], firstScreen: '큰 사진 · 교육철학 · 하루 이야기',
    mustHave: ['교육철학', '배움(교육과정)', '입학 문의 방법'],
    pages: [
      page('home', 0, ko('[학교 이름]'), [
        // 90차 골격 A(편집형 반반): 글 | 사진, 사진 위에 겹친 '다가오는 행사' 카드
        section({ template: 'banner', variant: 'editorial', title: ko('[학교가 믿는 것을 한 문장으로]'), body: ko('[학교를 처음 만나는 분께 드리는 두 문장]'), button: { label: ko('교육철학 보기'), href: '/p/philosophy' },
          items: [{ title: ko('[다가오는 행사 — 예: 5월 12일 학교 여는 날]'), body: ko('[행사 한 줄 안내]'), href: '/p/community' }] }),
        quicklinks([['교육철학', '/p/philosophy'], ['학교의 하루', '/p/community#day'], ['입학 안내', '/p/admission'], ['소식', '/news']], '이야기'),
        section({ template: 'media-right', eyebrow: ko('학교의 하루'), title: ko('[아침부터 저녁까지, 우리 학교의 하루]'), body: ko('[하루 흐름을 이야기처럼]') }),
        section({ template: 'photos', variant: 'mosaic', eyebrow: ko('학교의 사계절'), title: ko('[사진으로 보는 우리 학교]'), items: [
          { title: ko('[사진 이름 1]') }, { title: ko('[사진 이름 2]') }, { title: ko('[사진 이름 3]') }, { title: ko('[사진 이름 4]') }, { title: ko('[사진 이름 5]') }] }),
        stats('이야기'),
        events('이야기', '함께 만나는 날'),
        voices('이야기', '숲속에서 자란 시간'),
        news(ko('이야기'), 3),
      ], { site: contact({ label: '입학 상담', href: '/p/admission' }) }),
      page('philosophy', 1, ko('교육철학'), [
        section({ template: 'quote', variant: 'editorial', title: ko('숲과 마을을 교실로 삼는 우리의 약속'), body: ko('[학교를 세운 마음을 담은 한마디]') }),
        section({ anchor: 'values', template: 'cards', variant: 'index', title: ko('우리가 소중히 여기는 것'), items: [{ title: ko('[가치 1]'), body: ko('[설명]') }, { title: ko('[가치 2]'), body: ko('[설명]') }, { title: ko('[가치 3]'), body: ko('[설명]') }] }),
        section({ template: 'media-left', eyebrow: ko('배움의 터전'), title: ko('[철학 사진 제목]'), body: ko('[철학 사진 설명]'), button: { label: ko('배움의 과정'), href: '/p/learning' } }),
        // 126차(ADR 0046): 교육철학 아래 하위 메뉴 — 걸어온 길(연혁)
        section({ anchor: 'history', template: 'steps', variant: 'timeline', title: ko('걸어온 길'), items: [1, 2, 3].map((i) => ({ title: ko(`[이야기 연혁 ${i}]`), body: ko(`[이야기 연혁 ${i} 내용]`) })) }),
      ]),
      page('learning', 2, ko('배움'), [
        section({ anchor: 'method', template: 'media-left', title: ko('[배움의 방식]'), body: ko('[수업이 어떻게 이루어지는지]') }),
        section({ template: 'media-right', eyebrow: ko('손으로 익히는 시간'), title: ko('[만들며 배우는 제목]'), body: ko('[만들며 배우는 설명]') }),
        section({ anchor: 'grades', template: 'facts', variant: 'curriculum', title: ko('학년별 배움'), items: [1, 2, 3].map(() => ({ title: ko('[학년·과정]'), body: ko('[주요 배움]') })) }),
      ]),
      page('community', 3, ko('공동체'), [
        section({ anchor: 'together', template: 'media-right', eyebrow: ko('학교 밖으로 이어지는 배움'), title: ko('함께 만드는 학교'), body: ko('[학부모·교사·학생이 함께하는 방식]') }),
        section({ anchor: 'day', template: 'steps', title: ko('학교의 하루'), items: [1, 2, 3, 4, 5].map((i) => ({ title: ko(`[이야기 하루 ${i}]`), body: ko(`[이야기 하루 ${i} 내용]`) })) }),
        section({ anchor: 'days', template: 'steps', variant: 'timeline', title: ko('함께 만나는 날'), items: [1, 2, 3].map(() => ({ title: ko('[공동체 일정]'), body: ko('[공동체 활동]') })) }),
        section({ template: 'cta', title: ko('학교가 궁금하신가요?'), body: ko('[견학·상담 안내]'), button: { label: ko('입학 안내'), href: '/p/admission' } }),
      ]),
      admissionPage('이야기', 4, true),
    ],
    slots: [
      ...commonSlots(),
      slot('belief', 'home', ['blocks', 0, 'title'], 'text', '학교가 믿는 것', '한 문장', ['교육철학', '설립 이념', '믿음', 'philosophy', 'belief']),
      slot('hero-photo', 'home', ['blocks', 0, 'asset'], 'image', '첫 화면 큰 사진', '학교 전경이나 수업 장면(가로 사진)', ['전경', '캠퍼스', 'campus']),
      slot('day', 'home', ['blocks', 2, 'body'], 'text', '학교의 하루', '하루 흐름', ['하루', '일과', '시간표', 'daily', 'schedule']),
      slot('values', 'philosophy', ['blocks', 1, 'items'], 'list', '소중히 여기는 것', '가치 3개', ['가치', '핵심', '인재상', 'values']),
      slot('method', 'learning', ['blocks', 0, 'body'], 'text', '배움의 방식', '수업 방식', ['수업', '교육과정', '배움', 'curriculum', 'learning']),
      slot('process', 'admission', ['blocks', 0, 'items'], 'list', '입학 절차', '문의→견학→지원→입학', ['입학', '전형', '모집', '원서', 'admission', 'apply']),
      slot('fees', 'admission', ['blocks', 1, 'items'], 'list', '학비와 비용', '금액은 자료 그대로', ['학비', '수업료', '등록금', '비용', 'tuition', 'fee']),
      slot('faq', 'admission', ['blocks', 2, 'items'], 'list', '자주 묻는 질문', '질문과 답', ['질문', 'FAQ', '문의']),
    ],
  },
  {
    key: 'admissions', version: 6, name: '입학 모집형', theme: 'bold', langs: ['ko', 'en'],
    nav: 'top', first: 'landing', contents: ['admission'],
    summary: '예비 학부모가 차별점을 보고 문의·견학·지원으로 이어지게 합니다.',
    fits: ['신입생을 모집하는 사립·국제학교'], firstScreen: '차별점 3가지 · 입학 단추',
    mustHave: ['입학 절차', '학비·추가 비용', '자주 묻는 질문', '문의처'],
    pages: [
      page('home', 0, kb('[학교 이름]', '[School name]'), [
        section({ template: 'banner', title: kb('[우리 학교를 고르는 이유 한 문장]', '[Why families choose us]'), button: { label: kb('입학 안내', 'Admissions'), href: '/p/admissions' } }),
        quicklinks([['왜 우리 학교인가', '/p/why', 'Why us'], ['교육과정', '/p/curriculum', 'Curriculum'], ['입학 안내', '/p/admissions', 'Admissions'], ['소식', '/news', 'News']], '입학', 'Admissions'),
        section({ template: 'cards', title: kb('무엇이 다른가요', 'What makes us different'), items: [
          { title: kb('[차별점 1]', '[Difference 1]'), body: kb('[근거가 되는 사실 한 줄]', '[One fact that shows it]') }, { title: kb('[차별점 2]', '[Difference 2]'), body: kb('[근거]', '[Evidence]') }, { title: kb('[차별점 3]', '[Difference 3]'), body: kb('[근거]', '[Evidence]') }] }),
        stats('입학', 4, 'Admissions'),
        voices('입학', '학부모·졸업생 이야기', 'Admissions', 'Parents and graduates'),
        events('입학', '입학 설명회 일정', 'Admissions', 'Open days'),
        news(kb('소식', 'News'), 3),
      ], { site: contact({ label: '입학 상담', href: '/p/admissions', en: 'Book a visit' }) }),
      page('why', 1, kb('왜 우리 학교인가', 'Why us'), [
        section({ template: 'media-left', title: kb('[졸업생·학부모 이야기]', '[A graduate or parent story]'), body: kb('[실제 이야기 — 이름은 허락받은 경우만]', '[A real story, names only with permission]') }),
        section({ anchor: 'glance', template: 'facts', variant: 'stats', title: kb('숫자로 보는 학교', 'At a glance'), items: [{ title: kb('[학생 수]', '[Number of students]'), body: kb('[설명]', '[Description]') }, { title: kb('[교사 1인당 학생]', '[Students per teacher]'), body: kb('[설명]', '[Description]') }] }),
        // 126차: 왜 우리 학교 하위 메뉴 — 졸업 후 진로
        section({ anchor: 'graduates', template: 'facts', title: kb('졸업 후 진로', 'After graduation'), items: [1, 2, 3].map((i) => ({ title: kb(`[입학 진로 ${i}]`, `[Admissions path ${i}]`), body: kb(`[입학 진로 ${i} 설명]`, `[Admissions path ${i} note]`) })) }),
      ]),
      page('curriculum', 2, kb('교육과정', 'Curriculum'), [
        section({ anchor: 'courses', template: 'steps', title: kb('학년별 과정', 'Courses by grade'), items: [{ title: kb('[과정 1]', '[Course 1]'), body: kb('[설명]', '[Description]') }, { title: kb('[과정 2]', '[Course 2]'), body: kb('[설명]', '[Description]') }] }),
        section({ anchor: 'beyond', template: 'cards', title: kb('비교과 활동', 'Beyond the classroom'), items: [1, 2, 3].map((i) => ({ title: kb(`[입학 비교과 ${i}]`, `[Admissions activity ${i}]`), body: kb(`[입학 비교과 ${i} 설명]`, `[Admissions activity ${i} note]`) })) }),
      ]),
      page('admissions', 3, kb('입학 안내', 'Admissions'), [
        section({ anchor: 'process', template: 'steps', title: kb('입학 절차', 'How to apply'), items: [{ title: kb('문의', 'Enquire'), body: kb('[문의 방법]', '[How to enquire]') }, { title: kb('견학·상담', 'Visit'), body: kb('[일정]', '[Schedule]') }, { title: kb('지원', 'Apply'), body: kb('[서류·전형]', '[Documents · assessment]') }, { title: kb('결과', 'Result'), body: kb('[발표·등록]', '[Results · enrolment]') }] }),
        section({ anchor: 'fees', template: 'facts', title: kb('학비와 비용', 'Tuition & fees'), items: [{ title: kb('[수업료]', '[Tuition]'), body: kb('[금액·납부]', '[Amount · payment]') }, { title: kb('[기타 비용]', '[Other costs]'), body: kb('[기숙사·급식·체험 등]', '[Boarding, meals, trips]') }] }),
        section({ anchor: 'faq', template: 'facts', variant: 'faq', title: kb('자주 묻는 질문', 'FAQ'), items: [{ title: kb('[질문]', '[Question]'), body: kb('[답]', '[Answer]') }] }),
        // 126차(ADR 0046): 입학 하위 메뉴 — 설명회
        { ...events('입학 설명회', '입학 설명회', 'Open day', 'Open days'), anchor: 'open-days' },
        { type: 'inquiry', title: kb('견학·상담 신청', 'Book a visit'), body: kb('[신청 안내 한 줄]', '[One line about booking]'), anchor: 'apply' },
        section({ template: 'cta', title: kb('견학 신청', 'Visit us'), body: kb('[연락처·견학 가능 요일]', '[Contact · visiting days]'), button: { label: kb('문의하기', 'Contact'), href: '/p/admissions' } }),
      ]),
    ],
    slots: [
      ...commonSlots(),
      slot('differences', 'home', ['blocks', 2, 'items'], 'list', '차별점 3가지', '차별점과 근거 사실', ['특징', '장점', '차별', 'why', 'unique']),
      slot('process', 'admissions', ['blocks', 0, 'items'], 'list', '입학 절차', '문의→견학→지원→결과', ['입학', '전형', '모집', '원서', 'admission', 'apply']),
      slot('fees', 'admissions', ['blocks', 1, 'items'], 'list', '학비와 비용', '금액은 자료 그대로', ['학비', '수업료', '등록금', '비용', 'tuition', 'fee']),
      slot('faq', 'admissions', ['blocks', 2, 'items'], 'list', '자주 묻는 질문', '질문과 답', ['질문', 'FAQ', '문의']),
    ],
  },
  {
    key: 'project', version: 8, name: '프로젝트형', theme: 'studio', langs: ['ko'],
    nav: 'top', first: 'gallery', contents: ['project'],
    summary: '학생 프로젝트와 작품을 사진 묶음으로 보여 주는 PBL 학교용입니다.',
    fits: ['PBL·프로젝트 중심 대안학교', '발표회·전시가 많은 학교'], firstScreen: '프로젝트 소개 · 발표회 소식',
    mustHave: ['배움의 방식(PBL 흐름)', '프로젝트 목록', '학생 작품 공개 허가'],
    pages: [
      page('home', 0, ko('[학교 이름]'), [
        section({ template: 'banner', title: ko('[문제를 찾고, 탐구하고, 만들어 나눕니다]'), button: { label: ko('프로젝트 보기'), href: '/p/projects' } }),
        quicklinks([['배움의 방식', '/p/how-we-learn'], ['프로젝트', '/p/projects'], ['학생 작품', '/p/works'], ['입학 안내', '/p/admission']], '프로젝트'),
        // 90차 골격 C(작품 갤러리형): 분야로 거르는 학생 작품 — 공개 허가 받은 작품만
        section({ template: 'photos', variant: 'filter', eyebrow: ko('학생 작품'), title: ko('[이번 학기 결과물]'), body: ko('[학생·보호자 공개 허가를 받은 작품만 싣습니다]'), items: [
          { title: ko('[작품 이름 1]'), tag: ko('[분야 1]') }, { title: ko('[작품 이름 2]'), tag: ko('[분야 2]') }, { title: ko('[작품 이름 3]'), tag: ko('[분야 3]') },
          { title: ko('[작품 이름 4]'), tag: ko('[분야 1]') }, { title: ko('[작품 이름 5]'), tag: ko('[분야 2]') }, { title: ko('[작품 이름 6]'), tag: ko('[분야 3]') }] }),
        section({ template: 'steps', title: ko('배움의 흐름'), items: [{ title: ko('문제 정의'), body: ko('[학생이 질문을 찾는 방법]') }, { title: ko('탐구'), body: ko('[자료·현장·전문가]') }, { title: ko('산출'), body: ko('[만드는 것]') }, { title: ko('나눔·피드백'), body: ko('[발표·전시]') }] }),
        stats('프로젝트'),
        section({ template: 'cards', variant: 'mentors', eyebrow: ko('곁에서 함께 묻는 사람들'), title: ko('마을의 멘토'), items: [1, 2, 3].map(() => ({ title: ko('[이름 · 맡은 분야]'), body: ko('[한 줄 소개]') })), button: { label: ko('배움의 방식 보기'), href: '/p/how-we-learn' } }),
        events('프로젝트', '발표회·전시 일정'),
        news(ko('발표회·전시 소식'), 3),
      ], { site: contact({ label: '입학 안내', href: '/p/admission' }) }),
      page('how-we-learn', 1, ko('배움의 방식'), [
        section({ anchor: 'why', template: 'media-left', eyebrow: ko('질문에서 세상으로'), title: ko('왜 프로젝트로 배우나요'), body: ko('[학교의 설명]') }),
        section({ anchor: 'semester', template: 'facts', variant: 'curriculum', title: ko('한 학기 흐름'), items: [1, 2, 3, 4].map(() => ({ title: ko('[주차]'), body: ko('[활동]') })) }),
        section({ anchor: 'mentors', template: 'cards', variant: 'mentors', eyebrow: ko('함께하는 사람'), title: ko('멘토와 교사'), items: [
          { title: ko('[이름 · 맡은 분야]'), body: ko('[한 줄 소개]') }, { title: ko('[이름 · 맡은 분야]'), body: ko('[한 줄 소개]') }, { title: ko('[이름 · 맡은 분야]'), body: ko('[한 줄 소개]') }] }),
      ]),
      page('projects', 2, ko('프로젝트'), [
        section({ template: 'cards', variant: 'feature-filter', eyebrow: ko('질문을 끝까지 따라간 기록'), title: ko('이번 학기 프로젝트'), items: [{ title: ko('[프로젝트 이름]'), body: ko('[질문 · 결과물 · 참여 학년]'), tag: ko('[학년 1]') }, { title: ko('[프로젝트 이름]'), body: ko('[설명]'), tag: ko('[학년 2]') }, { title: ko('[프로젝트 이름]'), body: ko('[프로젝트 확장 설명]'), tag: ko('[학년 1]') }] }),
      ]),
      page('works', 3, ko('학생 작품'), [
        section({ template: 'cards', variant: 'portfolio', eyebrow: ko('작은 시도, 새로운 발견'), title: ko('학생 작품 아카이브'), body: ko('[학생·보호자 공개 허가를 받은 작품만 올립니다]'), items: [1, 2, 3, 4, 5, 6].map((n) => ({ title: ko(`[작품 이름 ${n}]`), tag: ko(`[분야 ${(n - 1) % 3 + 1}]`), body: ko(`[작품 설명 ${n}]`) })) }),
      ], { menu: { parent: 'projects' } }), // 126차(ADR 0046): 프로젝트 아래 하위 쪽
      admissionPage('프로젝트', 4, true),
    ],
    slots: [
      ...commonSlots(),
      slot('flow', 'home', ['blocks', 3, 'items'], 'list', '배움의 흐름', '문제 정의→탐구→산출→피드백', ['PBL', '프로젝트', '탐구', '수업 흐름']),
      slot('why-pbl', 'how-we-learn', ['blocks', 0, 'body'], 'text', '왜 프로젝트로 배우나', '학교의 설명', ['교육철학', '프로젝트 수업', 'PBL']),
      slot('project-list', 'projects', ['blocks', 0, 'items'], 'list', '프로젝트 목록', '이름·질문·결과물', ['프로젝트', '주제', '발표회', 'project']),
      slot('works-photos', 'works', ['blocks', 0, 'items'], 'image', '학생 작품 사진', '공개 허가 받은 사진', ['작품', '전시', 'portfolio']),
      slot('process', 'admission', ['blocks', 0, 'items'], 'list', '입학 절차', '문의→견학→지원→입학', ['입학', '전형', '모집', '원서', 'admission', 'apply']),
      slot('fees', 'admission', ['blocks', 1, 'items'], 'list', '학비와 비용', '금액은 자료 그대로', ['학비', '수업료', '등록금', '비용', 'tuition', 'fee']),
      slot('faq', 'admission', ['blocks', 2, 'items'], 'list', '자주 묻는 질문', '질문과 답', ['질문', 'FAQ', '문의']),
    ],
  },
  {
    key: 'mission', version: 6, name: '사명·후원형', theme: 'lamp', langs: ['ko', 'en'],
    nav: 'top', first: 'hero', contents: ['mission'],
    summary: '학교의 사명과 함께하는 방법(후원·봉사·기도)을 분명히 알립니다.',
    fits: ['기독교·선교 학교', '후원으로 운영되는 비영리 학교'], firstScreen: '사명 · 후원 단추 · 소식',
    mustHave: ['사명·신앙 고백', '후원 방법과 쓰임', '재정 보고(있으면)'],
    pages: [
      page('home', 0, kb('[학교 이름]', '[School name]'), [
        section({ template: 'banner', title: kb('[학교의 사명 한 문장]', '[Our mission]'), button: { label: kb('함께하기', 'Get involved'), href: '/p/partner' } }),
        quicklinks([['사명과 신앙', '/p/mission', 'Mission & faith'], ['함께하기', '/p/partner', 'Partner with us'], ['후원금 쓰임', '/p/partner', 'Use of funds'], ['소식·기도 제목', '/news', 'News & prayer']], '사명', 'Mission'),
        section({ template: 'media-right', title: kb('[이 학교가 섬기는 아이들과 마을]', '[The children and village we serve]'), body: kb('[누구를, 어디에서, 왜]', '[Who, where and why]') }),
        stats('사명', 4, 'Mission'),
        events('사명', '기도·방문 일정', 'Mission', 'Prayer & visit dates'),
        voices('사명', '함께하는 분들의 이야기', 'Mission', 'Voices of our partners'),
        news(kb('소식·기도 제목', 'News & prayer'), 3),
      ], { site: contact({ label: '후원하기', href: '/p/partner', en: 'Give' }) }),
      page('mission', 1, kb('사명과 신앙', 'Mission & faith'), [
        section({ template: 'quote', body: kb('[사명 선언문]', '[Mission statement]') }),
        section({ anchor: 'beliefs', template: 'facts', title: kb('우리가 믿는 것', 'What we believe'), items: [{ title: kb('[고백 1]', '[Belief 1]'), body: kb('[설명]', '[Description]') },
          // 129차: 고백·쓰임은 세 가지(실제 길이) — 한 칸짜리 목록이 늘어나지 않게
          ...[2, 3].map((i) => ({ title: kb(`[고백 ${i}]`, `[Belief ${i}]`), body: kb(`[사명 고백 ${i} 설명]`, `[Mission belief ${i} note]`) }))] }),
        // 126차(ADR 0046): 사명과 신앙 아래 하위 메뉴 — 걸어온 길
        section({ anchor: 'story', template: 'steps', variant: 'timeline', title: kb('걸어온 길', 'Our story'), items: [1, 2, 3].map((i) => ({ title: kb(`[사명 연혁 ${i}]`, `[Mission year ${i}]`), body: kb(`[사명 연혁 ${i} 내용]`, `[Mission year ${i} note]`) })) }),
      ]),
      page('partner', 2, kb('함께하기', 'Partner with us'), [
        section({ anchor: 'ways', template: 'cards', title: kb('함께하는 방법', 'Ways to partner'), items: [{ title: kb('정기 후원', 'Monthly giving'), body: kb('[계좌·방법]', '[Account · how]') }, { title: kb('봉사', 'Volunteer'), body: kb('[필요한 봉사]', '[Volunteering needed]') }, { title: kb('기도', 'Prayer'), body: kb('[기도 제목 받는 방법]', '[How to receive prayer letters]') }] }),
        section({ anchor: 'funds', template: 'facts', title: kb('후원금은 이렇게 쓰입니다', 'How gifts are used'), items: [{ title: kb('[쓰임 1]', '[Use 1]'), body: kb('[비율·설명]', '[Share · note]') },
          ...[2, 3].map((i) => ({ title: kb(`[쓰임 ${i}]`, `[Use ${i}]`), body: kb(`[사명 쓰임 ${i} 설명]`, `[Mission use ${i} note]`) }))] }),
        section({ anchor: 'report', template: 'text', title: kb('재정 보고', 'Financial reports'), body: kb('[사명 재정 보고 안내]', '[Mission financial report note]') }),
        section({ anchor: 'contact', template: 'cta', title: kb('후원 문의', 'Partnership enquiries'), body: kb('[담당자 연락처]', '[Contact person]'), button: { label: kb('문의하기', 'Contact us'), href: '/p/partner' } }),
      ]),
      // 126차: 소식 아래 하위 쪽 — 기도 제목
      page('prayer', 3, kb('기도 제목', 'Prayer requests'), [
        section({ template: 'facts', title: kb('이번 달 기도 제목', 'This month'), items: [1, 2, 3].map((i) => ({ title: kb(`[사명 기도 ${i}]`, `[Mission prayer ${i}]`), body: kb(`[사명 기도 ${i} 내용]`, `[Mission prayer ${i} note]`) })) }),
      ], { menu: { parent: 'news' } }),
    ],
    slots: [
      ...commonSlots(),
      slot('mission', 'home', ['blocks', 0, 'title'], 'text', '사명 한 문장', '사명 선언', ['사명', '비전', 'mission', 'vision']),
      slot('statement', 'mission', ['blocks', 0, 'body'], 'text', '사명 선언문', '전문', ['사명 선언', '설립 목적', '신앙고백', 'statement of faith']),
      slot('ways', 'partner', ['blocks', 0, 'items'], 'list', '함께하는 방법', '후원·봉사·기도', ['후원', '기부', '봉사', 'donate', 'give', 'volunteer']),
      slot('use-of-funds', 'partner', ['blocks', 1, 'items'], 'list', '후원금 쓰임', '항목과 비율', ['재정', '예산', '사용', 'funds', 'budget']),
    ],
  },
  {
    key: 'international', version: 6, name: '국제·다국어형', theme: 'horizon', langs: ['en', 'ko', 'th'],
    nav: 'top', first: 'landing', contents: ['international', 'admission'],
    summary: '여러 언어로 교육과정 경로와 입학 여정을 안내합니다.',
    fits: ['국제학교', '외국 가정·현지 가정을 함께 받는 학교'], firstScreen: '다국어 소개 · 문의 단추',
    mustHave: ['교육과정 경로(학년·인가)', '입학 여정', '학생 생활(기숙·통학)', '언어별 연락처'],
    pages: [
      page('home', 0, { en: '[School name]', ko: '[학교 이름]', th: '[ชื่อโรงเรียน]' }, [
        section({ template: 'banner', title: { en: '[One sentence about the school]', ko: '[학교 소개 한 문장]', th: '[แนะนำโรงเรียนหนึ่งประโยค]' },
          button: { label: { en: 'Enquire', ko: '문의하기', th: 'ติดต่อสอบถาม' }, href: '/p/admissions' } }),
        section({ template: 'cards', variant: 'quicklinks', title: { en: 'Quick links', ko: '바로 가기', th: 'ลิงก์ด่วน' }, items: [
          { title: { en: 'Curriculum', ko: '교육과정', th: 'หลักสูตร' }, body: { en: '[Quick link 1]' }, href: '/p/curriculum' },
          { title: { en: 'Admissions', ko: '입학', th: 'การรับสมัคร' }, body: { en: '[Quick link 2]' }, href: '/p/admissions' },
          { title: { en: 'Student life', ko: '학생 생활', th: 'ชีวิตนักเรียน' }, body: { en: '[Quick link 3]' }, href: '/p/student-life' },
          { title: { en: 'News', ko: '소식', th: 'ข่าว' }, body: { en: '[Quick link 4]' }, href: '/news' }] }),
        section({ template: 'cards', variant: 'stages', title: { en: 'Pathways', ko: '교육과정 경로', th: 'หลักสูตร' }, items: [
          { title: { en: '[Early years]', ko: '[유아]' }, body: { en: '[Ages · programme]' } }, { title: { en: '[Primary]', ko: '[초등]' }, body: { en: '[Ages · programme]' } }, { title: { en: '[Secondary]', ko: '[중등]' }, body: { en: '[Ages · programme]' } }] }),
        section({ template: 'facts', variant: 'stats', eyebrow: { en: 'At a glance', ko: '숫자로 보는 학교' }, title: { en: '[At a glance title]' },
          items: [1, 2, 3, 4].map((i) => ({ title: { en: `[Number ${i}]` }, body: { en: `[Number ${i} label]` } })) }),
        section({ template: 'cards', variant: 'events', eyebrow: { en: 'Coming up', ko: '다가오는 일정' }, title: { en: 'Open days & events', ko: '설명회·행사' },
          items: [1, 2, 3].map((i) => ({ tag: { en: `[Event ${i} date]` }, title: { en: `[Event ${i}]` }, body: { en: `[Event ${i} note]` } })) }),
        news({ en: 'News', ko: '소식', th: 'ข่าว' }, 3),
      ], { site: { tagline: { en: '[One line about the school]' }, address: { en: '[Address]' }, footer: { en: '[School name] · [Phone] · [Email]' },
        visit: { label: { en: 'Enquire', ko: '문의하기', th: 'ติดต่อสอบถาม' }, href: '/p/admissions' } } }),
      // 126차(ADR 0046): About 상위 메뉴(환영·사명·아동 보호)
      page('about', 1, { en: 'About', ko: '학교 소개', th: 'เกี่ยวกับเรา' }, [
        section({ anchor: 'welcome', template: 'media-left', title: { en: 'Head’s welcome', ko: '교장 인사', th: 'สารจากครูใหญ่' }, body: { en: '[Intl welcome]' } }),
        section({ anchor: 'mission', template: 'facts', title: { en: 'Mission & values', ko: '사명과 가치', th: 'พันธกิจและคุณค่า' }, items: [1, 2, 3].map((i) => ({ title: { en: `[Intl value ${i}]` }, body: { en: `[Intl value ${i} note]` } })) }),
        section({ anchor: 'safeguarding', template: 'text', title: { en: 'Safeguarding', ko: '아동 보호', th: 'การคุ้มครองเด็ก' }, body: { en: '[Intl safeguarding]' } }),
      ]),
      page('curriculum', 2, { en: 'Curriculum', ko: '교육과정', th: 'หลักสูตร' }, [
        section({ anchor: 'pathway', template: 'steps', title: { en: 'Pathway', ko: '경로' }, // 129차: 경로는 세 단계, 학비는 세 줄(실제 안내 길이)
          items: [1, 2, 3].map((i) => ({ title: { en: `[Intl stage ${i}]` }, body: { en: `[Intl stage ${i} programme]` } })) }),
        section({ anchor: 'languages', template: 'cards', title: { en: 'Language support', ko: '언어 지원', th: 'การสนับสนุนด้านภาษา' }, items: [1, 2].map((i) => ({ title: { en: `[Intl language ${i}]` }, body: { en: `[Intl language ${i} note]` } })) }),
      ]),
      page('admissions', 3, { en: 'Admissions', ko: '입학', th: 'การรับสมัคร' }, [
        section({ anchor: 'journey', template: 'steps', title: { en: 'Admissions journey', ko: '입학 여정' }, items: [{ title: { en: 'Enquire' }, body: { en: '[How]' } }, { title: { en: 'Visit' }, body: { en: '[Tour days]' } }, { title: { en: 'Apply' }, body: { en: '[Documents · assessment]' } }, { title: { en: 'Join' }, body: { en: '[Enrolment]' } }] }),
        section({ anchor: 'fees', template: 'facts', title: { en: 'Fees', ko: '학비' }, items: [1, 2, 3].map((i) => ({ title: { en: `[Intl fee ${i}]` }, body: { en: `[Intl fee ${i} terms]` } })) }),
        { type: 'inquiry', anchor: 'enquire', title: { en: 'Enquire', ko: '문의하기', th: 'ติดต่อสอบถาม' }, body: { en: '[Intl enquiry note]' } },
      ]),
      page('student-life', 4, { en: 'Student life', ko: '학생 생활', th: 'ชีวิตนักเรียน' }, [
        section({ anchor: 'daily', template: 'media-left', title: { en: '[Boarding / day students]' }, body: { en: '[Daily life, activities, care]' } }),
        section({ anchor: 'activities', template: 'cards', title: { en: 'Clubs & activities', ko: '동아리·활동', th: 'ชมรมและกิจกรรม' }, items: [1, 2, 3].map((i) => ({ title: { en: `[Intl club ${i}]` }, body: { en: `[Intl club ${i} note]` } })) }),
        section({ anchor: 'care', template: 'text', title: { en: 'Pastoral care', ko: '생활·상담 돌봄', th: 'การดูแลนักเรียน' }, body: { en: '[Intl pastoral care]' } }),
      ]),
    ],
    slots: [
      slot('tagline', 'home', ['site', 'tagline'], 'text', 'One line (tagline)', 'One sentence', ['tagline', 'motto', '슬로건']),
      slot('address', 'home', ['site', 'address'], 'contact', 'Address', 'Address', ['address', '주소', 'ที่อยู่']),
      slot('footer', 'home', ['site', 'footer'], 'contact', 'Footer contact', 'Name · phone · email', ['phone', 'email', 'contact', '연락처']),
      slot('pathways', 'home', ['blocks', 2, 'items'], 'list', 'Pathways', 'Stages with ages and programme', ['IB', 'curriculum', 'programme', 'grade', '교육과정']),
      slot('journey', 'admissions', ['blocks', 0, 'items'], 'list', 'Admissions journey', 'Enquire → visit → apply → join', ['admission', 'apply', 'enrol', '입학']),
      slot('fees', 'admissions', ['blocks', 1, 'items'], 'list', 'Fees', 'As stated in source', ['fee', 'tuition', '학비']),
    ],
  },
  {
    // 90차: 대표 3종의 유치원(골격 D 그래픽 마스크형) — 둥글게 오린 놀이 사진, 연령별 반, 하루 일과 시간 띠, 학부모 질문
    key: 'kinder', version: 7, name: '유치원형', theme: 'play', langs: ['ko'],
    nav: 'top', first: 'hero', contents: ['kinder'],
    summary: '아이들의 하루와 반, 학부모가 궁금한 것을 사진과 함께 따뜻하게 보여 줍니다.',
    fits: ['유치원·어린이집', '초등 저학년 중심 학교'], firstScreen: '둥근 놀이 사진 · 우리 반 · 하루 일과',
    mustHave: ['연령별 반 안내', '하루 일과', '급식·건강 안내', '입학(입소) 상담 방법'],
    pages: [
      page('home', 0, ko('[유치원 이름]'), [
        section({ template: 'banner', variant: 'mask', title: ko('[아이들이 웃으며 자라는 곳]'), body: ko('[처음 오신 가정께 드리는 두 문장]'), button: { label: ko('방문 상담'), href: '/p/admission' } }),
        quicklinks([['우리 반', '/p/classes'], ['하루와 건강', '/p/daily'], ['입학 안내', '/p/admission'], ['알림', '/news']], '유치원'),
        section({ template: 'cards', variant: 'stages', eyebrow: ko('우리 반'), title: ko('나이에 맞춘 반'), items: [
          { title: ko('[반 이름 · 나이 1]'), body: ko('[반 한 줄 소개]'), href: '/p/classes' }, { title: ko('[반 이름 · 나이 2]'), body: ko('[반 한 줄 소개]'), href: '/p/classes' }, { title: ko('[반 이름 · 나이 3]'), body: ko('[반 한 줄 소개]'), href: '/p/classes' }] }),
        section({ template: 'steps', variant: 'timeline', eyebrow: ko('하루 일과'), title: ko('[아이들의 하루]'), items: [
          { title: ko('[시간 1]'), body: ko('[활동 1]') }, { title: ko('[시간 2]'), body: ko('[활동 2]') }, { title: ko('[시간 3]'), body: ko('[활동 3]') }, { title: ko('[시간 4]'), body: ko('[활동 4]') }] }),
        events('유치원', '이번 달 행사'),
        news(ko('알림'), 3),
        voices('유치원', '학부모 이야기'),
        section({ template: 'facts', variant: 'faq', title: ko('학부모가 자주 묻는 질문'), items: [{ title: ko('[질문 1]'), body: ko('[답 1]') }, { title: ko('[질문 2]'), body: ko('[답 2]') }] }),
        section({ template: 'cta', title: ko('직접 와서 보세요'), body: ko('[방문 상담 요일·연락처]'), button: { label: ko('상담 안내'), href: '/p/admission' } }),
      ], { site: contact({ label: '입학 상담', href: '/p/admission' }) }),
      // 126차(ADR 0046): 원 소개 상위 메뉴(원장 인사·교육 철학·시설)
      page('about', 1, ko('원 소개'), [
        section({ anchor: 'greeting', template: 'media-left', title: ko('원장 인사'), body: ko('[유치원 원장 인사]') }),
        section({ anchor: 'philosophy', template: 'cards', title: ko('교육 철학'), items: [1, 2, 3].map((i) => ({ title: ko(`[유치원 철학 ${i}]`), body: ko(`[유치원 철학 ${i} 설명]`) })) }),
        section({ anchor: 'facilities', template: 'facts', title: ko('시설 둘러보기'), items: [1, 2, 3].map((i) => ({ title: ko(`[유치원 시설 ${i}]`), body: ko(`[유치원 시설 ${i} 설명]`) })) }),
      ]),
      page('classes', 1, ko('우리 반'), [
        section({ anchor: 'ages', template: 'cards', variant: 'rows', eyebrow: ko('아이의 속도에 맞추어'), title: ko('연령별 반'), items: [
          { title: ko('[반 이름 · 나이 1]'), body: ko('[하루 모습·담임·정원]') }, { title: ko('[반 이름 · 나이 2]'), body: ko('[하루 모습·담임·정원]') }, { title: ko('[반 이름 · 나이 3]'), body: ko('[하루 모습·담임·정원]') }] }),
        section({ anchor: 'play', template: 'media-left', variant: 'mask', title: ko('[놀이로 배워요]'), body: ko('[놀이 중심 배움의 방식]') }),
      ]),
      page('daily', 2, ko('하루와 건강'), [
        section({ anchor: 'day', template: 'steps', variant: 'daybook', eyebrow: ko('놀이와 쉼이 나란히'), title: ko('하루 일과'), items: [
          { title: ko('[시간 1]'), body: ko('[활동 1]') }, { title: ko('[시간 2]'), body: ko('[활동 2]') }, { title: ko('[시간 3]'), body: ko('[활동 3]') },
          { title: ko('[시간 4]'), body: ko('[활동 4]') }, { title: ko('[시간 5]'), body: ko('[활동 5]') }] }),
        section({ anchor: 'meals', template: 'media-right', variant: 'half', eyebrow: ko('건강하게 자라는 습관'), title: ko('급식과 건강'), body: ko('[급식·간식·알레르기·투약 안내]') }),
      ]),
      page('admission', 3, ko('입학 안내'), [
        section({ anchor: 'process', template: 'steps', variant: 'index', eyebrow: ko('처음 만나는 햇살숲'), title: ko('입학(입소) 절차'), items: [{ title: ko('상담'), body: ko('[상담 방법]') }, { title: ko('방문'), body: ko('[둘러보기 일정]') }, { title: ko('신청'), body: ko('[서류]') }, { title: ko('적응'), body: ko('[첫 주 적응 안내]') }] }),
        section({ anchor: 'fees', template: 'facts', variant: 'curriculum', title: ko('비용'), items: [{ title: ko('[교육비]'), body: ko('[금액·지원]') }, { title: ko('[기타 비용]'), body: ko('[급식·차량·특별활동]') }] }),
        // 91차: 방문·상담 신청 칸(학교가 설정에서 '신청 받기'를 켜야 보임)
        { type: 'inquiry', title: ko('방문·상담 신청'), body: ko('[신청 안내 한 줄]'), anchor: 'apply' },
        section({ template: 'cta', title: ko('방문 상담'), body: ko('[연락처·상담 가능 시간]') }),
        section({ template: 'media-left', title: ko('우리 아이의 첫 학교'), body: ko('[입학 적응 이야기]') }),
      ]),
    ],
    slots: [
      ...commonSlots(),
      slot('hero-photo', 'home', ['blocks', 0, 'asset'], 'image', '첫 화면 놀이 사진', '아이들이 노는 장면(얼굴은 보호자 허락이 있을 때만)', ['놀이', '교실', 'playground']),
      slot('classes', 'home', ['blocks', 2, 'items'], 'list', '우리 반', '반 이름·나이·한 줄 소개', ['반', '연령', '만 3세', '만 4세', '만 5세', 'class']),
      slot('day', 'daily', ['blocks', 0, 'items'], 'list', '하루 일과', '시간과 활동', ['일과', '하루', '시간표', 'daily', 'schedule']),
      slot('meals', 'daily', ['blocks', 1, 'body'], 'text', '급식과 건강', '급식·간식·건강 안내', ['급식', '간식', '식단', '건강', 'meal']),
      slot('process', 'admission', ['blocks', 0, 'items'], 'list', '입학 절차', '상담→방문→신청→적응', ['입학', '입소', '모집', '원서', 'admission']),
      slot('fees', 'admission', ['blocks', 1, 'items'], 'list', '비용', '금액은 자료 그대로', ['교육비', '원비', '비용', '지원', 'fee']),
    ],
  },
  {
    key: 'single', version: 4, name: '한 쪽 소개형', theme: 'seed', langs: ['ko'],
    nav: 'onepage', first: 'landing', contents: ['small'],
    summary: '막 시작한 작은 학교·모임이 한 쪽에 소개·연락·소식을 담습니다.',
    fits: ['막 시작한 작은 학교', '홈스쿨 연합·배움 모임'], firstScreen: '소개 · 하는 일 · 연락',
    mustHave: ['누구를 위한 모임인지', '연락 방법'],
    pages: [
      page('home', 0, ko('[학교·모임 이름]'), [
        // 126차(ADR 0046): 한 쪽 안 구역 차례 = '홈' 아래 하위 메뉴
        section({ anchor: 'about', template: 'text', title: ko('[우리는 누구인가요]'), body: ko('[두세 문장 소개]') }),
        section({ anchor: 'activities', template: 'cards', title: ko('하는 일'), items: [{ title: ko('[활동 1]'), body: ko('[설명]') }, { title: ko('[활동 2]'), body: ko('[설명]') }] }),
        { ...events('모임', '다가오는 모임'), anchor: 'gatherings' },
        { ...news(ko('소식'), 3, 'list'), anchor: 'news' },
        section({ anchor: 'contact', template: 'cta', title: ko('함께하고 싶으신가요?'), body: ko('[연락 방법]'), button: { label: ko('연락하기'), href: '/#contact' } }),
      ], { site: contact() }),
    ],
    slots: [
      ...commonSlots(),
      slot('intro', 'home', ['blocks', 0, 'body'], 'text', '소개', '두세 문장', ['소개', '설립', 'about', 'who we are']),
      slot('activities', 'home', ['blocks', 1, 'items'], 'list', '하는 일', '활동 2~4개', ['활동', '프로그램', 'activities', 'programs']),
    ],
  },
];

// 133차: 여러 쪽 템플릿은 메뉴 주소가 있는 구역을 하위 쪽으로 나눈다(site-template-split.ts). 한 쪽 구조(single)는 구역 차례를 그대로 쓴다
const ONE_PAGE = new Set(['single']);
// 134차(ADR 0050): 메뉴 구조가 위 메뉴(top)가 아니면 홈의 사이트 정보에 적어 둔다(학교가 설정에서 바꿀 수 있다)
const withLayout = (t: SiteTemplate): SiteTemplate => (t.nav === 'top' ? t : {
  ...t, pages: t.pages.map((p) => (p.key === 'home' ? { ...p, content: { ...p.content, site: { ...p.content.site, layout: t.nav as 'side' | 'onepage' } } } : p)) });
export const SITE_TEMPLATES: SiteTemplate[] = RAW_TEMPLATES.map(withLayout).map((t) => {
  if (ONE_PAGE.has(t.key)) return t;
  const { pages, moves } = splitSubmenuPages(t.pages);
  const slots = t.slots.map((sl) => { const [page, path] = movePath(moves, sl.page, sl.path); return { ...sl, page, path }; });
  return { ...t, pages, slots, source: t.pages };
});

export function templateByKey(key: string) {
  const t = SITE_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new NotFoundError('템플릿을 찾을 수 없습니다.');
  return t;
}

/** 빈 칸 경로가 가리키는 쪽 내용 위치(없으면 undefined, 채울 자리는 부모가 있으면 됨) */
export function slotTarget(t: SiteTemplate, s: Slot): { parent: unknown; field: string | number } | null {
  const pg = t.pages.find((p) => p.key === s.page);
  if (!pg) return null;
  let cur: unknown = pg.content;
  for (const step of s.path.slice(0, -1)) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string | number, unknown>)[step];
  }
  return cur != null && typeof cur === 'object' ? { parent: cur, field: s.path[s.path.length - 1] } : null;
}

/**
 * 112차(Codex 검토): 빈 칸 경로가 학교 쪽에서도 같은 구역을 가리키는지 확인한다.
 * 템플릿 판이 오르며 구역 순서가 바뀌면 예전 판으로 만든 쪽의 blocks[n]은 다른 구역일 수 있다 →
 * 그 칸을 가진 구역의 종류·모양(template·variant)이 지금 템플릿과 같을 때만 채운다(아니면 '그대로 둠').
 */
export function slotMatchesContent(t: SiteTemplate, s: Slot, content: Content): boolean {
  const i = s.path.indexOf('blocks');
  if (i < 0) return true; // 쪽 정보(site.*) 칸은 구역 순서와 관계없다
  const idx = s.path[i + 1];
  const want = t.pages.find((p) => p.key === s.page)?.content.blocks[idx as number];
  const have = content.blocks?.[idx as number];
  if (!want || !have || want.type !== have.type) return false;
  if (want.type === 'section' && have.type === 'section') return want.template === have.template && (want.variant ?? '') === (have.variant ?? '');
  return true;
}

/** 템플릿 적용: 쪽마다 시안(1판). 같은 주소의 쪽이 있으면(보관한 것 포함) 건너뛴다. 공개하지 않는다 */
/**
 * 템플릿 적용: 없는 쪽만 시안(1판)으로 만든다. 89차(ADR 0034): design이면 화면 모양(테마)도 템플릿 디자인으로 바꾼다.
 * 화면 모양은 홈페이지 설정이 있을 때만 바꾼다(설정이 없으면 주소부터 정해야 하므로 design: 'no-settings'로 알린다).
 * 홈페이지가 열려 있으면 바뀐 모양이 방문자에게 바로 보인다 — 화면이 미리 알리고 사람이 고른다.
 */
export async function applyTemplate(db: Db, schoolId: string, key: string, opts: { design?: boolean } = {}) {
  const t = templateByKey(key);
  const existing = new Set((await listEntries(db, schoolId)).filter((e) => e.kind === 'page').map((e) => e.key));
  const created: { key: string; id: string }[] = [];
  const skipped: string[] = [];
  for (const p of t.pages) {
    if (existing.has(p.key)) { skipped.push(p.key); continue; }
    const { id } = (await createEntry(db, schoolId, { kind: 'page', key: p.key, sort: p.sort, content: validateContent(p.content), note: `템플릿 ${t.name} v${t.version}` }))!;
    created.push({ key: p.key, id });
    // 66차: 어느 템플릿에서 왔는지 남긴다(자동 배치가 빈 칸 목록을 찾는 데 씀)
    await db.query(`update public.site_entries set meta = meta || $3 where id = $1 and school_id = $2`, [id, schoolId, JSON.stringify({ template: `${t.key}@${t.version}` })]);
  }
  let design: 'applied' | 'no-settings' | 'kept' = 'kept';
  if (opts.design) {
    const r = await db.query(`update public.site_settings set theme = $2, updated_at = now() where school_id = $1`, [schoolId, t.theme]);
    design = r.rowCount ? 'applied' : 'no-settings';
  }
  await db.query(`select app.log_access($1, 'site.template_apply', $2)`, [schoolId, JSON.stringify({ template: t.key, version: t.version, created: created.map((c) => c.key), skipped, design })]);
  return { template: t.key, version: t.version, theme: t.theme, created, skipped, design };
}

// ── 66차: 학교 자료로 빈 칸 채우기 ─────────────────────────
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
/** 올린 자료(PDF·DOCX·TXT)를 읽어 이 템플릿 빈 칸 제안을 만든다. 파일은 저장하지 않는다. 사진 칸은 학교 홈페이지 그림 중 최근 것부터 제안 */
export async function autofillPropose(db: Db, schoolId: string, key: string, files: { name: string; bytes: Buffer }[], schoolName: string) {
  const t = templateByKey(key);
  if (!files.length) throw new ValidationError('학교 자료 파일을 하나 이상 올려 주세요.');
  if (files.length > MAX_FILES) throw new ValidationError(`자료는 ${MAX_FILES}개까지 한 번에 읽습니다.`);
  const docs: { name: string; text: string }[] = [];
  const notes: { file: string; ok: boolean; note: string }[] = [];
  for (const f of files) {
    if (f.bytes.length > MAX_BYTES) { notes.push({ file: f.name, ok: false, note: '8MB보다 큰 파일은 읽지 않습니다.' }); continue; }
    const r = await readPlainText(f.name, f.bytes);
    notes.push({ file: f.name, ok: r.ok, note: r.note });
    if (r.ok) docs.push({ name: f.name, text: r.text });
  }
  const images = (await listAssets(db, schoolId)).filter((a) => a.mime.startsWith('image/')).map((a) => ({ id: a.id, name: a.name }));
  const proposals = proposeFills(t, docs, { schoolName, images });
  const pages = (await listEntries(db, schoolId)).filter((e) => e.kind === 'page' && !e.archived_at).map((e) => e.key);
  return { template: t.key, notes, proposals, missingPages: [...new Set(t.slots.map((s) => s.page))].filter((p) => !pages.includes(p)),
    unfilled: t.slots.filter((s) => !proposals.some((p) => p.slotId === s.id)).map((s) => ({ id: s.id, label: s.label, hint: s.hint })) };
}

/** 사람이 고른 제안을 넣는다: 쪽마다 새 시안 판 하나(안내 자리·빈 칸만 채움, 학교가 쓴 칸은 그대로). 공개하지 않는다 */
export async function autofillApply(db: Db, schoolId: string, key: string, fills: { slotId: string; value: Proposal['value'] }[]) {
  const t = templateByKey(key);
  if (!Array.isArray(fills) || !fills.length) throw new ValidationError('넣을 제안을 고르세요.');
  const entries = (await listEntries(db, schoolId)).filter((e) => e.kind === 'page' && !e.archived_at);
  const imageIds = new Set((await listAssets(db, schoolId)).filter((a) => a.mime.startsWith('image/')).map((a) => a.id));
  const byPage = new Map<string, { slotId: string; value: Proposal['value'] }[]>();
  for (const f of fills) {
    const slot = t.slots.find((s) => s.id === f.slotId);
    if (!slot) throw new ValidationError('템플릿에 없는 칸입니다.');
    const okValue = typeof f.value === 'string' ? f.value.trim().length > 0 && f.value.length <= 3000
      : Array.isArray(f.value) && f.value.length > 0 && f.value.length <= 12 && f.value.every((i) => i && typeof i.title === 'string' && typeof i.body === 'string' && i.title.length <= 200 && i.body.length <= 3000);
    if (!okValue) throw new ValidationError(`${slot.label}: 넣을 값 형식이 올바르지 않습니다.`);
    if (slot.kind === 'image' && !imageIds.has(String(f.value))) throw new ValidationError(`${slot.label}: 이 학교 홈페이지 그림이 아닙니다.`);
    byPage.set(slot.page, [...(byPage.get(slot.page) ?? []), f]);
  }
  const result: { page: string; version: number | null; filled: string[]; kept: string[] }[] = [];
  for (const [pageKey, list] of byPage) {
    const entry = entries.find((e) => e.key === pageKey);
    if (!entry) { result.push({ page: pageKey, version: null, filled: [], kept: list.map((x) => x.slotId) }); continue; }
    const { versions } = await getEntry(db, schoolId, entry.id);
    const content = structuredClone(versions[0].content) as Content;
    const filled: string[] = []; const kept: string[] = [];
    for (const f of list) {
      const slot = t.slots.find((s) => s.id === f.slotId)!;
      (slotMatchesContent(t, slot, content) && putProposal(content, slot, f.value) ? filled : kept).push(f.slotId);
    }
    if (!filled.length) { result.push({ page: pageKey, version: null, filled, kept }); continue; }
    const v = await saveVersion(db, schoolId, entry.id, { content: validateContent(content), base_version: versions[0].version, note: `자료로 빈 칸 채움: ${filled.join(', ')}` });
    result.push({ page: pageKey, version: v!.version, filled, kept });
  }
  await db.query(`select app.log_access($1, 'site.template_autofill', $2)`, [schoolId, JSON.stringify({ template: t.key, pages: result.map((r) => ({ page: r.page, version: r.version, filled: r.filled.length })) })]);
  return { template: t.key, result };
}

// ── 67차: 기존 사이트에서 옮기기 ──────────────────────────
// 87차(사용자 지시 2026-11-27): 주소만 넣어도 옛 사이트 내용에 맞는 템플릿을 추천하고, 고른 템플릿의 새 디자인으로 옮긴다.
// 규칙 기반(무료, ADR 0032): 템플릿마다 알아보는 낱말이 몇 쪽에 나오는지 + 채울 수 있는 칸 수. 사람이 다른 템플릿을 고를 수 있다.
const SIGNALS: Record<string, string[]> = {
  notice: ['가정통신문', '급식', '식단', '공지', '알림', '학사일정', '방과후', '돌봄', 'newsletter', 'lunch menu'],
  story: ['교육철학', '철학', '하루', '이야기', '대안', '공동체', 'philosophy', 'our story'],
  admissions: ['입학', '모집', '전형', '학비', '원서', '견학', 'admission', 'tuition', 'apply', 'enrol'],
  project: ['프로젝트', 'pbl', '발표회', '탐구', '전시', '작품', 'project', 'exhibition'],
  mission: ['후원', '선교', '기도', '사명', '봉사', '기부', 'donate', 'mission', 'prayer', 'sponsor'],
  international: ['international', 'ib ', 'curriculum', 'boarding', '국제', 'โรงเรียน', 'นานาชาติ'],
  kinder: ['유치원', '어린이집', '원아', '만 3세', '만 4세', '만 5세', '놀이', '등원', 'kindergarten', 'preschool', 'nursery'],
  single: [],
};
export type TemplateFit = { key: string; name: string; score: number; filled: number; reasons: string[] };
export function recommendTemplates(docs: { name: string; text: string }[], filledByKey: Record<string, number>): TemplateFit[] {
  const lower = docs.map((d) => d.text.toLowerCase());
  const total = lower.reduce((a, t) => a + t.length, 0);
  const fits = SITE_TEMPLATES.map((t) => {
    const reasons: string[] = [];
    let score = 0;
    for (const w of SIGNALS[t.key] ?? []) {
      const pages = lower.filter((x) => x.includes(w.toLowerCase())).length;
      if (pages) { reasons.push(w.trim()); score += Math.min(pages, 3); }
    }
    if (t.key === 'single' && docs.length <= 2 && total < 3000) { score += 4; reasons.push('쪽이 적고 짧음'); }
    const filled = filledByKey[t.key] ?? 0;
    return { key: t.key, name: t.name, score: score + filled * 0.5, filled, reasons: reasons.slice(0, 5) };
  });
  return fits.sort((a, b) => b.score - a.score);
}

/**
 * 주소를 받아 같은 사이트 쪽 몇 개를 읽고(공개 주소만·robots.txt 따름) 빈 칸 제안을 만든다. 읽은 글은 저장하지 않는다.
 * key가 없으면(87차) 템플릿마다 제안을 만들어 맞는 순서(fits)와 함께 돌려준다 — 한 번 읽고 화면에서 템플릿을 바꿔 볼 수 있게.
 */
export async function migratePropose(db: Db, schoolId: string, key: string, url: string, schoolName: string, crawler: typeof crawlSite = crawlSite) {
  if (key) templateByKey(key); // 없는 템플릿이면 읽기 전에 거부
  if (typeof url !== 'string' || !url.trim()) throw new ValidationError('옮겨 올 홈페이지 주소를 적어 주세요.');
  const crawl = await crawler(url.trim(), { maxPages: 8, timeoutMs: 6000, budgetMs: 35000 });
  if (!crawl.pages.length) throw new ValidationError(`쪽을 읽지 못했습니다${crawl.skipped[0] ? `: ${crawl.skipped[0].why}` : ''}.`);
  const docs = crawl.pages.map((p) => ({ name: new URL(p.url).pathname || '/', text: `${p.title}\n${p.text}` }));
  const images = (await listAssets(db, schoolId)).filter((a) => a.mime.startsWith('image/')).map((a) => ({ id: a.id, name: a.name }));
  const forTemplate = (t: SiteTemplate) => {
    const proposals = proposeFills(t, docs, { schoolName, images });
    return { proposals, unfilled: t.slots.filter((s) => !proposals.some((p) => p.slotId === s.id)).map((s) => ({ id: s.id, label: s.label, hint: s.hint })),
      imageSlots: t.slots.filter((s) => s.kind === 'image').map((s) => ({ slotId: s.id, page: s.page, label: s.label })) };
  };
  const byTemplate = Object.fromEntries((key ? [templateByKey(key)] : SITE_TEMPLATES).map((t) => [t.key, forTemplate(t)]));
  const fits = key ? [] : recommendTemplates(docs, Object.fromEntries(Object.entries(byTemplate).map(([k, v]) => [k, v.proposals.length])));
  const chosen = key || fits[0].key;
  const seen = new Set<string>();
  const found = crawl.pages.flatMap((p) => p.images).filter((i) => !seen.has(i.src) && seen.add(i.src)).slice(0, 40);
  return { template: chosen, ...byTemplate[chosen], start: crawl.start, pages: crawl.pages.map((p) => ({ url: p.url, title: p.title })), skipped: crawl.skipped, images: found,
    fits, byTemplate: key ? undefined : byTemplate };
}

/** 옛 사이트 그림 가져오기(고른 것만, 10장까지): 같은 안전 검사로 받아 형식을 확인한 뒤 학교 홈페이지 그림으로 올린다 */
export async function migrateImages(db: Db, schoolId: string, urls: string[], fetcher: typeof fetchImage = fetchImage) {
  if (!Array.isArray(urls) || !urls.length) throw new ValidationError('가져올 그림을 고르세요.');
  if (urls.length > 10) throw new ValidationError('그림은 한 번에 10장까지 가져옵니다.');
  const done: { url: string; id: string; name: string }[] = []; const failed: { url: string; why: string }[] = [];
  for (const u of urls) {
    try {
      const img = await fetcher(String(u));
      const type = checkUpload({ type: img.type === 'image/jpg' ? 'image/jpeg' : img.type, bytes: img.bytes }, ['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
      const a = await uploadAsset(db, schoolId, { name: img.name, type, bytes: img.bytes });
      done.push({ url: u, id: (a as { id: string }).id, name: img.name });
    } catch (e) { failed.push({ url: u, why: (e as Error).message || '가져오지 못함' }); }
  }
  await db.query(`select app.log_access($1, 'site.migrate_images', $2)`, [schoolId, JSON.stringify({ imported: done.length, failed: failed.length })]);
  return { imported: done, failed };
}
