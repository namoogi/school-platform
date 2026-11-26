import type { Db } from './db';
import { createEntry, getEntry, listAssets, listEntries, saveVersion, validateContent, type Block, type Content, type LText } from './site';
import { NotFoundError, ValidationError } from './services';
import { proposeFills, putProposal, type Proposal } from './site-autofill';
import { readPlainText } from './readers';

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
export type SiteTemplate = {
  key: string; version: number; name: string; summary: string; fits: string[]; firstScreen: string;
  theme: 'campus' | 'dawn'; langs: ('ko' | 'en' | 'th')[]; pages: TemplatePage[]; slots: Slot[]; mustHave: string[];
};

// ── 블록 짓기 도우미 (안내 문구는 '[ … ]'로 감싼다: 자동 배치·사람이 바꿀 자리) ──
const ko = (s: string): LText => ({ ko: s });
const kb = (k: string, e: string): LText => ({ ko: k, en: e });
const section = (b: Omit<Extract<Block, { type: 'section' }>, 'type'>): Block => ({ type: 'section', ...b });
const news = (title: LText, count = 3, style: 'cards' | 'list' = 'cards'): Block => ({ type: 'news_list', title, count, style });
const contact = (): Content['site'] => ({
  tagline: ko('[학교를 한 줄로 소개하는 말]'), address: ko('[학교 주소]'), footer: ko('[학교 이름] · [대표 전화] · [이메일]'),
});
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

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    key: 'notice', version: 1, name: '알림 중심형', theme: 'campus', langs: ['ko'],
    summary: '재학생 가정이 매일 찾는 알림·소식·학사일정·급식을 첫 화면에 둡니다.',
    fits: ['공립·지역 학교', '재학생 가정이 주 방문자', '공지가 많은 학교'], firstScreen: '알림 · 최근 소식 · 학사일정 · 급식',
    mustHave: ['학교 소개(인사말·연혁·교육목표)', '학사일정', '오시는 길', '입학·전학 안내'],
    pages: [
      page('home', 0, ko('[학교 이름]'), [
        { type: 'notice', text: ko('[이번 주 가장 중요한 알림 한 줄 — 예: 다음 주 월요일 재량 휴업일]') },
        news(ko('알림·가정통신문'), 6, 'list'),
        section({ template: 'cards', title: ko('바로 가기'), items: [
          { title: ko('학사일정'), body: ko('[이번 달 주요 일정]'), href: '/p/school-life' },
          { title: ko('급식 안내'), body: ko('[이번 달 식단표는 학교 생활 쪽에]'), href: '/p/school-life' },
          { title: ko('오시는 길'), body: ko('[대중교통·주차 안내]'), href: '/p/about' },
        ] }),
      ], { site: contact() }),
      page('about', 1, ko('학교 소개'), [
        section({ template: 'text', title: ko('인사말'), body: ko('[교장 인사말 3~5문장]') }),
        section({ template: 'facts', title: ko('교육 목표'), items: [{ title: ko('[교육 목표 1]'), body: ko('[설명]') }, { title: ko('[교육 목표 2]'), body: ko('[설명]') }] }),
        section({ template: 'steps', title: ko('연혁'), items: [{ title: ko('[연도]'), body: ko('[개교·주요 일]') }, { title: ko('[연도]'), body: ko('[주요 일]') }] }),
        section({ template: 'text', title: ko('오시는 길'), body: ko('[주소·대중교통·주차]') }),
      ]),
      page('school-life', 2, ko('학교 생활'), [
        section({ template: 'facts', title: ko('학사일정'), items: [{ title: ko('[월]'), body: ko('[주요 일정]') }] }),
        section({ template: 'text', title: ko('급식'), body: ko('[급식 운영 안내 · 이번 달 식단표는 PDF로 올려 주세요]') }),
        section({ template: 'text', title: ko('방과후·돌봄'), body: ko('[운영 시간·신청 방법]') }),
      ]),
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
    key: 'story', version: 1, name: '이야기형', theme: 'dawn', langs: ['ko'],
    summary: '교육철학과 학교의 하루를 사진과 이야기로 보여 줍니다.',
    fits: ['사립·대안학교', '교육철학으로 알려지는 학교'], firstScreen: '큰 사진 · 교육철학 · 하루 이야기',
    mustHave: ['교육철학', '배움(교육과정)', '입학 문의 방법'],
    pages: [
      page('home', 0, ko('[학교 이름]'), [
        section({ template: 'banner', title: ko('[학교가 믿는 것을 한 문장으로]'), body: ko('[학교를 처음 만나는 분께 드리는 두 문장]'), button: { label: ko('교육철학 보기'), href: '/p/philosophy' } }),
        section({ template: 'media-right', eyebrow: ko('학교의 하루'), title: ko('[아침부터 저녁까지, 우리 학교의 하루]'), body: ko('[하루 흐름을 이야기처럼]') }),
        news(ko('이야기'), 3),
      ], { site: contact(), head: { layout: 'opening' } }),
      page('philosophy', 1, ko('교육철학'), [
        section({ template: 'quote', body: ko('[학교를 세운 마음을 담은 한마디]') }),
        section({ template: 'cards', title: ko('우리가 소중히 여기는 것'), items: [{ title: ko('[가치 1]'), body: ko('[설명]') }, { title: ko('[가치 2]'), body: ko('[설명]') }, { title: ko('[가치 3]'), body: ko('[설명]') }] }),
      ]),
      page('learning', 2, ko('배움'), [
        section({ template: 'media-left', title: ko('[배움의 방식]'), body: ko('[수업이 어떻게 이루어지는지]') }),
        section({ template: 'facts', title: ko('학년별 배움'), items: [{ title: ko('[학년·과정]'), body: ko('[주요 배움]') }] }),
      ]),
      page('community', 3, ko('공동체'), [
        section({ template: 'text', title: ko('함께 만드는 학교'), body: ko('[학부모·교사·학생이 함께하는 방식]') }),
        section({ template: 'cta', title: ko('학교가 궁금하신가요?'), body: ko('[견학·상담 안내]'), button: { label: ko('문의하기'), href: '/p/community' } }),
      ]),
    ],
    slots: [
      ...commonSlots(),
      slot('belief', 'home', ['blocks', 0, 'title'], 'text', '학교가 믿는 것', '한 문장', ['교육철학', '설립 이념', '믿음', 'philosophy', 'belief']),
      slot('hero-photo', 'home', ['blocks', 0, 'asset'], 'image', '첫 화면 큰 사진', '학교 전경이나 수업 장면(가로 사진)', ['전경', '캠퍼스', 'campus']),
      slot('day', 'home', ['blocks', 1, 'body'], 'text', '학교의 하루', '하루 흐름', ['하루', '일과', '시간표', 'daily', 'schedule']),
      slot('values', 'philosophy', ['blocks', 1, 'items'], 'list', '소중히 여기는 것', '가치 3개', ['가치', '핵심', '인재상', 'values']),
      slot('method', 'learning', ['blocks', 0, 'body'], 'text', '배움의 방식', '수업 방식', ['수업', '교육과정', '배움', 'curriculum', 'learning']),
    ],
  },
  {
    key: 'admissions', version: 1, name: '입학 모집형', theme: 'campus', langs: ['ko', 'en'],
    summary: '예비 학부모가 차별점을 보고 문의·견학·지원으로 이어지게 합니다.',
    fits: ['신입생을 모집하는 사립·국제학교'], firstScreen: '차별점 3가지 · 입학 단추',
    mustHave: ['입학 절차', '학비·추가 비용', '자주 묻는 질문', '문의처'],
    pages: [
      page('home', 0, kb('[학교 이름]', '[School name]'), [
        section({ template: 'banner', title: kb('[우리 학교를 고르는 이유 한 문장]', '[Why families choose us]'), button: { label: kb('입학 안내', 'Admissions'), href: '/p/admissions' } }),
        section({ template: 'cards', title: kb('무엇이 다른가요', 'What makes us different'), items: [
          { title: ko('[차별점 1]'), body: ko('[근거가 되는 사실 한 줄]') }, { title: ko('[차별점 2]'), body: ko('[근거]') }, { title: ko('[차별점 3]'), body: ko('[근거]') }] }),
        news(kb('소식', 'News'), 3),
      ], { site: contact() }),
      page('why', 1, kb('왜 우리 학교인가', 'Why us'), [
        section({ template: 'media-left', title: ko('[졸업생·학부모 이야기]'), body: ko('[실제 이야기 — 이름은 허락받은 경우만]') }),
        section({ template: 'facts', title: ko('숫자로 보는 학교'), items: [{ title: ko('[학생 수]'), body: ko('[설명]') }, { title: ko('[교사 1인당 학생]'), body: ko('[설명]') }] }),
      ]),
      page('curriculum', 2, kb('교육과정', 'Curriculum'), [
        section({ template: 'steps', title: ko('학년별 과정'), items: [{ title: ko('[과정 1]'), body: ko('[설명]') }, { title: ko('[과정 2]'), body: ko('[설명]') }] }),
      ]),
      page('admissions', 3, kb('입학 안내', 'Admissions'), [
        section({ template: 'steps', title: kb('입학 절차', 'How to apply'), items: [{ title: ko('문의'), body: ko('[문의 방법]') }, { title: ko('견학·상담'), body: ko('[일정]') }, { title: ko('지원'), body: ko('[서류·전형]') }, { title: ko('결과'), body: ko('[발표·등록]') }] }),
        section({ template: 'facts', title: kb('학비와 비용', 'Tuition & fees'), items: [{ title: ko('[수업료]'), body: ko('[금액·납부]') }, { title: ko('[기타 비용]'), body: ko('[기숙사·급식·체험 등]') }] }),
        section({ template: 'facts', variant: 'faq', title: kb('자주 묻는 질문', 'FAQ'), items: [{ title: ko('[질문]'), body: ko('[답]') }] }),
        section({ template: 'cta', title: kb('견학 신청', 'Visit us'), body: ko('[연락처·견학 가능 요일]'), button: { label: kb('문의하기', 'Contact'), href: '/p/admissions' } }),
      ]),
    ],
    slots: [
      ...commonSlots(),
      slot('differences', 'home', ['blocks', 1, 'items'], 'list', '차별점 3가지', '차별점과 근거 사실', ['특징', '장점', '차별', 'why', 'unique']),
      slot('process', 'admissions', ['blocks', 0, 'items'], 'list', '입학 절차', '문의→견학→지원→결과', ['입학', '전형', '모집', '원서', 'admission', 'apply']),
      slot('fees', 'admissions', ['blocks', 1, 'items'], 'list', '학비와 비용', '금액은 자료 그대로', ['학비', '수업료', '등록금', '비용', 'tuition', 'fee']),
      slot('faq', 'admissions', ['blocks', 2, 'items'], 'list', '자주 묻는 질문', '질문과 답', ['질문', 'FAQ', '문의']),
    ],
  },
  {
    key: 'project', version: 1, name: '프로젝트형', theme: 'dawn', langs: ['ko'],
    summary: '학생 프로젝트와 작품을 사진 묶음으로 보여 주는 PBL 학교용입니다.',
    fits: ['PBL·프로젝트 중심 대안학교', '발표회·전시가 많은 학교'], firstScreen: '프로젝트 소개 · 발표회 소식',
    mustHave: ['배움의 방식(PBL 흐름)', '프로젝트 목록', '학생 작품 공개 허가'],
    pages: [
      page('home', 0, ko('[학교 이름]'), [
        section({ template: 'banner', title: ko('[문제를 찾고, 탐구하고, 만들어 나눕니다]'), button: { label: ko('프로젝트 보기'), href: '/p/projects' } }),
        section({ template: 'steps', title: ko('배움의 흐름'), items: [{ title: ko('문제 정의'), body: ko('[학생이 질문을 찾는 방법]') }, { title: ko('탐구'), body: ko('[자료·현장·전문가]') }, { title: ko('산출'), body: ko('[만드는 것]') }, { title: ko('나눔·피드백'), body: ko('[발표·전시]') }] }),
        news(ko('발표회·전시 소식'), 3),
      ], { site: contact() }),
      page('how-we-learn', 1, ko('배움의 방식'), [
        section({ template: 'text', title: ko('왜 프로젝트로 배우나요'), body: ko('[학교의 설명]') }),
        section({ template: 'facts', title: ko('한 학기 흐름'), items: [{ title: ko('[주차]'), body: ko('[활동]') }] }),
      ]),
      page('projects', 2, ko('프로젝트'), [
        section({ template: 'cards', title: ko('이번 학기 프로젝트'), items: [{ title: ko('[프로젝트 이름]'), body: ko('[질문 · 결과물 · 참여 학년]') }, { title: ko('[프로젝트 이름]'), body: ko('[설명]') }] }),
      ]),
      page('works', 3, ko('학생 작품'), [
        section({ template: 'photos', title: ko('작품'), body: ko('[학생·보호자 공개 허가를 받은 작품만 올립니다]') }),
      ]),
    ],
    slots: [
      ...commonSlots(),
      slot('flow', 'home', ['blocks', 1, 'items'], 'list', '배움의 흐름', '문제 정의→탐구→산출→피드백', ['PBL', '프로젝트', '탐구', '수업 흐름']),
      slot('why-pbl', 'how-we-learn', ['blocks', 0, 'body'], 'text', '왜 프로젝트로 배우나', '학교의 설명', ['교육철학', '프로젝트 수업', 'PBL']),
      slot('project-list', 'projects', ['blocks', 0, 'items'], 'list', '프로젝트 목록', '이름·질문·결과물', ['프로젝트', '주제', '발표회', 'project']),
      slot('works-photos', 'works', ['blocks', 0, 'items'], 'image', '학생 작품 사진', '공개 허가 받은 사진', ['작품', '전시', 'portfolio']),
    ],
  },
  {
    key: 'mission', version: 1, name: '사명·후원형', theme: 'campus', langs: ['ko', 'en'],
    summary: '학교의 사명과 함께하는 방법(후원·봉사·기도)을 분명히 알립니다.',
    fits: ['기독교·선교 학교', '후원으로 운영되는 비영리 학교'], firstScreen: '사명 · 후원 단추 · 소식',
    mustHave: ['사명·신앙 고백', '후원 방법과 쓰임', '재정 보고(있으면)'],
    pages: [
      page('home', 0, kb('[학교 이름]', '[School name]'), [
        section({ template: 'banner', title: kb('[학교의 사명 한 문장]', '[Our mission]'), button: { label: kb('함께하기', 'Get involved'), href: '/p/partner' } }),
        section({ template: 'media-right', title: ko('[이 학교가 섬기는 아이들과 마을]'), body: ko('[누구를, 어디에서, 왜]') }),
        news(kb('소식·기도 제목', 'News & prayer'), 3),
      ], { site: contact() }),
      page('mission', 1, kb('사명과 신앙', 'Mission & faith'), [
        section({ template: 'quote', body: ko('[사명 선언문]') }),
        section({ template: 'facts', title: ko('우리가 믿는 것'), items: [{ title: ko('[고백 1]'), body: ko('[설명]') }] }),
      ]),
      page('partner', 2, kb('함께하기', 'Partner with us'), [
        section({ template: 'cards', title: ko('함께하는 방법'), items: [{ title: ko('정기 후원'), body: ko('[계좌·방법]') }, { title: ko('봉사'), body: ko('[필요한 봉사]') }, { title: ko('기도'), body: ko('[기도 제목 받는 방법]') }] }),
        section({ template: 'facts', title: ko('후원금은 이렇게 쓰입니다'), items: [{ title: ko('[쓰임 1]'), body: ko('[비율·설명]') }] }),
        section({ template: 'cta', title: ko('후원 문의'), body: ko('[담당자 연락처]'), button: { label: ko('문의하기'), href: '/p/partner' } }),
      ]),
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
    key: 'international', version: 1, name: '국제·다국어형', theme: 'campus', langs: ['en', 'ko', 'th'],
    summary: '여러 언어로 교육과정 경로와 입학 여정을 안내합니다.',
    fits: ['국제학교', '외국 가정·현지 가정을 함께 받는 학교'], firstScreen: '다국어 소개 · 문의 단추',
    mustHave: ['교육과정 경로(학년·인가)', '입학 여정', '학생 생활(기숙·통학)', '언어별 연락처'],
    pages: [
      page('home', 0, { en: '[School name]', ko: '[학교 이름]', th: '[ชื่อโรงเรียน]' }, [
        section({ template: 'banner', title: { en: '[One sentence about the school]', ko: '[학교 소개 한 문장]', th: '[แนะนำโรงเรียนหนึ่งประโยค]' },
          button: { label: { en: 'Enquire', ko: '문의하기', th: 'ติดต่อสอบถาม' }, href: '/p/admissions' } }),
        section({ template: 'cards', title: { en: 'Pathways', ko: '교육과정 경로', th: 'หลักสูตร' }, items: [
          { title: { en: '[Early years]', ko: '[유아]' }, body: { en: '[Ages · programme]' } }, { title: { en: '[Primary]', ko: '[초등]' }, body: { en: '[Ages · programme]' } }, { title: { en: '[Secondary]', ko: '[중등]' }, body: { en: '[Ages · programme]' } }] }),
        news({ en: 'News', ko: '소식', th: 'ข่าว' }, 3),
      ], { site: { tagline: { en: '[One line about the school]' }, address: { en: '[Address]' }, footer: { en: '[School name] · [Phone] · [Email]' } } }),
      page('curriculum', 1, { en: 'Curriculum', ko: '교육과정', th: 'หลักสูตร' }, [
        section({ template: 'steps', title: { en: 'Pathway', ko: '경로' }, items: [{ title: { en: '[Stage]' }, body: { en: '[Programme · accreditation]' } }] }),
      ]),
      page('admissions', 2, { en: 'Admissions', ko: '입학', th: 'การรับสมัคร' }, [
        section({ template: 'steps', title: { en: 'Admissions journey', ko: '입학 여정' }, items: [{ title: { en: 'Enquire' }, body: { en: '[How]' } }, { title: { en: 'Visit' }, body: { en: '[Tour days]' } }, { title: { en: 'Apply' }, body: { en: '[Documents · assessment]' } }, { title: { en: 'Join' }, body: { en: '[Enrolment]' } }] }),
        section({ template: 'facts', title: { en: 'Fees', ko: '학비' }, items: [{ title: { en: '[Fee]' }, body: { en: '[Amount · terms]' } }] }),
      ]),
      page('student-life', 3, { en: 'Student life', ko: '학생 생활', th: 'ชีวิตนักเรียน' }, [
        section({ template: 'media-left', title: { en: '[Boarding / day students]' }, body: { en: '[Daily life, activities, care]' } }),
      ]),
    ],
    slots: [
      slot('tagline', 'home', ['site', 'tagline'], 'text', 'One line (tagline)', 'One sentence', ['tagline', 'motto', '슬로건']),
      slot('address', 'home', ['site', 'address'], 'contact', 'Address', 'Address', ['address', '주소', 'ที่อยู่']),
      slot('footer', 'home', ['site', 'footer'], 'contact', 'Footer contact', 'Name · phone · email', ['phone', 'email', 'contact', '연락처']),
      slot('pathways', 'home', ['blocks', 1, 'items'], 'list', 'Pathways', 'Stages with ages and programme', ['IB', 'curriculum', 'programme', 'grade', '교육과정']),
      slot('journey', 'admissions', ['blocks', 0, 'items'], 'list', 'Admissions journey', 'Enquire → visit → apply → join', ['admission', 'apply', 'enrol', '입학']),
      slot('fees', 'admissions', ['blocks', 1, 'items'], 'list', 'Fees', 'As stated in source', ['fee', 'tuition', '학비']),
    ],
  },
  {
    key: 'single', version: 1, name: '한 쪽 소개형', theme: 'campus', langs: ['ko'],
    summary: '막 시작한 작은 학교·모임이 한 쪽에 소개·연락·소식을 담습니다.',
    fits: ['막 시작한 작은 학교', '홈스쿨 연합·배움 모임'], firstScreen: '소개 · 하는 일 · 연락',
    mustHave: ['누구를 위한 모임인지', '연락 방법'],
    pages: [
      page('home', 0, ko('[학교·모임 이름]'), [
        section({ template: 'text', title: ko('[우리는 누구인가요]'), body: ko('[두세 문장 소개]') }),
        section({ template: 'cards', title: ko('하는 일'), items: [{ title: ko('[활동 1]'), body: ko('[설명]') }, { title: ko('[활동 2]'), body: ko('[설명]') }] }),
        news(ko('소식'), 3, 'list'),
        section({ template: 'cta', title: ko('함께하고 싶으신가요?'), body: ko('[연락 방법]'), button: { label: ko('연락하기'), href: '/' } }),
      ], { site: contact() }),
    ],
    slots: [
      ...commonSlots(),
      slot('intro', 'home', ['blocks', 0, 'body'], 'text', '소개', '두세 문장', ['소개', '설립', 'about', 'who we are']),
      slot('activities', 'home', ['blocks', 1, 'items'], 'list', '하는 일', '활동 2~4개', ['활동', '프로그램', 'activities', 'programs']),
    ],
  },
];

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

/** 템플릿 적용: 쪽마다 시안(1판). 같은 주소의 쪽이 있으면(보관한 것 포함) 건너뛴다. 공개하지 않는다 */
export async function applyTemplate(db: Db, schoolId: string, key: string) {
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
  await db.query(`select app.log_access($1, 'site.template_apply', $2)`, [schoolId, JSON.stringify({ template: t.key, version: t.version, created: created.map((c) => c.key), skipped })]);
  return { template: t.key, version: t.version, theme: t.theme, created, skipped };
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
    for (const f of list) (putProposal(content, t.slots.find((s) => s.id === f.slotId)!, f.value) ? filled : kept).push(f.slotId);
    if (!filled.length) { result.push({ page: pageKey, version: null, filled, kept }); continue; }
    const v = await saveVersion(db, schoolId, entry.id, { content: validateContent(content), base_version: versions[0].version, note: `자료로 빈 칸 채움: ${filled.join(', ')}` });
    result.push({ page: pageKey, version: v!.version, filled, kept });
  }
  await db.query(`select app.log_access($1, 'site.template_autofill', $2)`, [schoolId, JSON.stringify({ template: t.key, pages: result.map((r) => ({ page: r.page, version: r.version, filled: r.filled.length })) })]);
  return { template: t.key, result };
}
