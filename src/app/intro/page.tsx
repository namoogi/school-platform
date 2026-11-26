import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * 68차: 시스템 홍보 페이지(로그인 없이). 카피 원문·원칙은 docs/marketing/COPY.md — 있는 기능만, 숫자·후기는 지어내지 않는다.
 * 한국어 기본, ?lang=en 영어. DB를 읽지 않는다.
 */
export const metadata: Metadata = {
  title: 'AI와 함께 만드는 우리 학교 홈페이지와 학교 시스템',
  description: '학교 자료로 채우는 홈페이지 템플릿, 한국·미국 기준 학사 기록, 학교가 쓰는 AI와 함께 일하는 학교 운영 플랫폼.',
};

const COPY = {
  ko: {
    eyebrow: 'AI로 만드는 우리 학교 홈페이지 · 학교 시스템',
    title: 'AI와 함께 만드는 우리 학교만의 홈페이지와 학교 시스템',
    sub: '학교 소개서를 올리거나 지금 쓰는 홈페이지 주소를 적으면, 고른 템플릿에 맞춰 내용이 채워집니다. 출결·평가·학생부·성적증명서는 한국과 미국 기준으로 쌓입니다. 학교가 쓰는 AI가 함께 일하고, 공개와 확정은 언제나 사람이 합니다.',
    start: '로그인하고 시작하기', more: '무엇을 할 수 있나요',
    pillarsTitle: '세 가지를 한곳에서',
    pillars: [
      { title: '우리 학교 홈페이지', body: '알림·이야기·입학·프로젝트·사명·국제·한 쪽 소개, 일곱 가지 템플릿을 둘러보고 고릅니다. 학교 자료로 빈 칸을 채우고, 옛 홈페이지 내용도 옮겨 옵니다. 한국어·English·ไทย로 엽니다.' },
      { title: '학교 시스템(학사)', body: '출결, 평가와 수업 마감, 학년도 기록을 다룹니다. 자체 학생부·미국 성적증명서·학교 소개서, 태국 ปพ.1 사본과 영어권 학업 기록을 냅니다. 학교에 필요한 기록 유형은 학교가 직접 정의합니다.' },
      { title: '우리 학교의 AI', body: '학교가 쓰는 Claude Code·Codex를 범위가 정해진 작업 토큰으로 연결합니다. AI는 시안을 만들고, 한 일은 모두 기록에 남습니다. 비용은 학교가 쓰는 AI 구독 안에서 듭니다.' },
    ],
    stepsTitle: '이렇게 시작합니다',
    steps: [
      { title: '템플릿 고르기', body: '우리 학교와 닮은 형식을 미리 보고 고릅니다. 쪽은 시안으로 만들어집니다.' },
      { title: '자료로 채우기', body: '학교 소개서를 올리거나 지금 홈페이지 주소를 적습니다. 칸마다 제안을 보고 고칩니다.' },
      { title: '확인하고 공개', body: '사람이 내용을 확인한 뒤 공개합니다. 고칠 때마다 새 판으로 쌓입니다.' },
    ],
    trustTitle: '기록을 믿을 수 있게',
    trust: [
      '기록은 지우지 않고 판으로 쌓습니다. 정정은 이유와 함께 새 판으로 남깁니다.',
      '학교마다 데이터가 데이터베이스 수준에서 분리됩니다.',
      '학생·보호자는 자기 기록을 보고 수정을 요청할 수 있습니다(답 기한 기본 45일).',
      '발행한 문서는 그때 모습 그대로 보관됩니다.',
    ],
    forTitle: '이런 학교에',
    for: ['대안학교', '국제학교', '선교지 학교', '막 시작한 작은 학교', '여러 언어로 알려야 하는 학교'],
    endTitle: '우리 학교답게 시작하세요',
    endBody: '학교 관리자로 초대받았다면 로그인해 템플릿부터 둘러보세요.',
    lang: 'English',
  },
  en: {
    eyebrow: 'Your school website and school system, made with AI',
    title: "Your school's own website and school system, built with AI",
    sub: 'Upload your school brochure or enter your current website, and the template you choose fills in. Attendance, grades, records and transcripts follow Korean and US standards. Your own AI helps, and people always decide what is published and finalized.',
    start: 'Sign in to start', more: 'What you can do',
    pillarsTitle: 'Three things in one place',
    pillars: [
      { title: 'Your school website', body: 'Browse seven templates: notices, story, admissions, projects, mission, international and one-page. Fill them from your school materials or move content from your old site. Publish in Korean, English and Thai.' },
      { title: 'Your school system', body: 'Attendance, assessment and course closing, and year records. Issue a school record, a US transcript and school profile, a Thai ปพ.1 school copy and an academic record for English-speaking systems. Define your own record types.' },
      { title: 'Your own AI', body: 'Connect the Claude Code or Codex your school already uses with scoped work tokens. AI drafts; everything it does is logged. Costs stay within your own AI subscription.' },
    ],
    stepsTitle: 'How to start',
    steps: [
      { title: 'Pick a template', body: 'Preview formats that fit your school and pick one. Pages are created as drafts.' },
      { title: 'Fill from your materials', body: 'Upload a brochure or enter your current site. Review and edit each suggestion.' },
      { title: 'Review and publish', body: 'A person checks and publishes. Every edit is kept as a new version.' },
    ],
    trustTitle: 'Records you can trust',
    trust: [
      'Records are never deleted; they are versioned. Corrections are new versions with a reason.',
      "Each school's data is separated at the database level.",
      'Students and guardians can view their records and request amendments (45-day default).',
      'Issued documents are kept exactly as issued.',
    ],
    forTitle: 'Made for',
    for: ['Alternative schools', 'International schools', 'Mission schools', 'Small new schools', 'Schools that speak several languages'],
    endTitle: 'Start the way your school is',
    endBody: 'If you were invited as a school administrator, sign in and browse the templates.',
    lang: '한국어',
  },
} as const;

export default async function IntroPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang === 'en' ? 'en' : 'ko';
  const c = COPY[lang];
  return (
    <div className="intro" lang={lang}>
      <header className="intro-top">
        <span className="intro-brand"><span className="brand-mark" aria-hidden="true">學</span>학교 운영 플랫폼</span>
        <nav className="row-wrap" aria-label="페이지">
          <Link href={lang === 'en' ? '/intro' : '/intro?lang=en'} hrefLang={lang === 'en' ? 'ko' : 'en'}>{c.lang}</Link>
          <Link className="btn btn-sm" href="/login">{lang === 'en' ? 'Sign in' : '로그인'}</Link>
        </nav>
      </header>
      <main id="main">
        <section className="intro-hero">
          <p className="overline">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p className="intro-sub">{c.sub}</p>
          <div className="row-wrap">
            <Link className="btn btn-primary" href="/login?next=/site/templates" data-testid="intro-start">{c.start}</Link>
            <a className="btn" href="#pillars">{c.more}</a>
          </div>
        </section>
        <section className="intro-section" id="pillars" aria-labelledby="pillars-h">
          <h2 id="pillars-h">{c.pillarsTitle}</h2>
          <div className="intro-grid">{c.pillars.map((p) => <article key={p.title} className="card"><h3>{p.title}</h3><p>{p.body}</p></article>)}</div>
        </section>
        <section className="intro-section" aria-labelledby="steps-h">
          <h2 id="steps-h">{c.stepsTitle}</h2>
          <ol className="intro-steps">{c.steps.map((s) => <li key={s.title}><strong>{s.title}</strong><span>{s.body}</span></li>)}</ol>
        </section>
        <section className="intro-section intro-split" aria-labelledby="trust-h">
          <div><h2 id="trust-h">{c.trustTitle}</h2><ul className="intro-list">{c.trust.map((t) => <li key={t}>{t}</li>)}</ul></div>
          <div><h2>{c.forTitle}</h2><ul className="intro-tags">{c.for.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="fine intro-langs">한국어 · English · ไทย</p></div>
        </section>
        <section className="intro-end">
          <h2>{c.endTitle}</h2>
          <p>{c.endBody}</p>
          <Link className="btn btn-primary" href="/login?next=/site/templates">{c.start}</Link>
        </section>
      </main>
    </div>
  );
}
