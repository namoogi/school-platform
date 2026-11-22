import '@sun-typeface/suit/fonts/static/woff2/SUIT.css';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { COURSES, DOCUMENTS, EVENTS, QUESTIONS, SCHOOL, SOURCES } from './data';
import s from './public.module.css';

type Status = '완료' | '진행 중' | '시작 전';
type TaskItem = { id: string; title: string; hint: string; status: Status };

const NAV = ['홈', '할 일', '자료', '질문', '발행본', '도움말'];

const waiting = QUESTIONS.filter((q) => q.status === '대기');
const pendingSource = SOURCES.filter((f) => f.review);

/** 이번 학기 학사 업무를 자료 → 질문 → 수업 마감 순서의 할 일 목록으로 만든다. */
const SECTIONS: { title: string; items: TaskItem[] }[] = [
  {
    title: '자료 등록과 검토',
    items: [
      { id: 'src-all', title: `학기 자료 ${SOURCES.length}개 등록`, hint: `마지막 등록 ${SOURCES[0].at}`, status: '완료' },
      ...pendingSource.map((f) => ({ id: f.id, title: `${f.name} 표 읽기 검토`, hint: `${f.by} 등록 · ${f.rows}행`, status: '진행 중' as Status })),
    ],
  },
  {
    title: '질문에 답하기',
    items: QUESTIONS.map((q) => ({
      id: q.id, title: q.title, hint: `${q.id} · ${q.kind} · 담당 ${q.assignee}`,
      status: q.status === '답변함' ? '완료' : '시작 전',
    })),
  },
  {
    title: '수업별 마감 판 확정',
    items: COURSES.map((c) => ({
      id: c.id, title: `${c.display} (${c.name})`, hint: `${c.teacher} · 수강 ${c.students}/${c.capacity}명 · 진도 ${c.progress}%`,
      status: c.status === '마감 판 확정' ? '완료' : c.status === '진행 중' ? '진행 중' : '시작 전',
    })),
  },
];
const allItems = SECTIONS.flatMap((sec) => sec.items);
const doneCount = allItems.filter((i) => i.status === '완료').length;

const deadlines = EVENTS.filter((e) => e.kind === '마감');
const fmt = (d: string) => `${Number(d.split('.')[0])}월 ${Number(d.split('.')[1])}일`;
const closedCourses = COURSES.filter((c) => c.status === '마감 판 확정').length;

const STEPS = [
  {
    title: '확인을 기다리는 질문에 모두 답하기',
    when: '지금',
    body: `자료와 확정 규칙이 다른 곳에서 질문이 열립니다. 남은 질문은 ${waiting.length}건입니다. 답하면 새 판의 규칙이 추가되고 이전 판은 그대로 남습니다.`,
    links: waiting.map((q) => `${q.id} ${q.title}`),
  },
  {
    title: deadlines[0].title,
    when: `${fmt(deadlines[0].date)} (${deadlines[0].day})까지`,
    body: '담당 교사가 수업별 성적을 1차로 입력합니다. 입력이 끝난 수업만 다음 단계로 넘어갑니다.',
    links: [],
  },
  {
    title: deadlines[1].title,
    when: `${fmt(deadlines[1].date)} (${deadlines[1].day})까지`,
    body: `수강신청 중인 수업은 이날 명단이 정해집니다. 지금 수강신청 중인 수업은 ${COURSES.filter((c) => c.status === '수강신청 중').length}개입니다.`,
    links: COURSES.filter((c) => c.status === '수강신청 중').map((c) => `${c.display} · ${c.students}/${c.capacity}명`),
  },
  {
    title: deadlines[2].title,
    when: `${fmt(deadlines[2].date)} (${deadlines[2].day})까지`,
    body: `수업마다 마감 판을 확정합니다. 확정한 판은 고칠 수 없고, 정정은 이전 판을 가리키는 새 판으로 남깁니다. 지금 ${COURSES.length}개 중 ${closedCourses}개를 확정했습니다.`,
    links: [],
  },
];

/** 원형 6. 공공 서비스 단일 열형 — 머리말 + 한 줄 탐색, 한 화면 한 가지 일, 할 일 목록과 단계별 안내. */
export default function PublicService() {
  return (
    <div className={s.root}>
      <a href="#public-main" className={s.skip}>본문 바로가기</a>

      <header className={s.header}>
        <div className={s.wrap}>
          <div className={s.brand}>
            <span className={s.schoolName}>{SCHOOL.name}</span>
            <span className={s.service}>학사 운영 서비스</span>
          </div>
          <div className={s.account}>
            <span>{SCHOOL.user.name} ({SCHOOL.user.role})</span>
            <a href="#">로그아웃</a>
          </div>
        </div>
      </header>
      <nav className={s.nav} aria-label="주 메뉴">
        <ul className={s.wrap}>
          {NAV.map((n, i) => (
            <li key={n}><a href="#" aria-current={i === 0 ? 'page' : undefined}>{n}</a></li>
          ))}
        </ul>
      </nav>

      <div className={s.wrap}>
        <p className={s.phase}><strong className={s.phaseTag}>시안</strong> 새 화면입니다. <a href="#">의견 보내기</a></p>

        <main id="public-main" className={s.main} tabIndex={-1}>
          <section className={s.banner} role="region" aria-labelledby="public-banner-title">
            <h2 id="public-banner-title" className={s.bannerTitle}>중요</h2>
            <div className={s.bannerBody}>
              <p className={s.bannerHeading}>확인을 기다리는 질문이 {waiting.length}건 있습니다.</p>
              <p>가장 오래된 질문은 {waiting[waiting.length - 1].opened}에 열렸습니다. 답하기 전까지 관련 발행본을 새로 만들 수 없습니다.</p>
              <a href="#" className={s.bannerLink}>질문 {waiting.length}건 확인하기</a>
            </div>
          </section>

          <span className={s.caption}>{SCHOOL.term} · {SCHOOL.week}</span>
          <h1 className={s.h1}>이번 학기 학사 업무</h1>

          <div className={s.grid}>
            <div className={s.primary}>
              <p className={s.lead}>
                학기말 마감 판 확정까지 해야 할 일입니다. 위에서부터 차례로 하면 됩니다.
              </p>
              <p className={s.summary}>
                업무 {allItems.length}개 중 <strong>{doneCount}개</strong>를 마쳤습니다.
              </p>

              <ol className={s.taskList}>
                {SECTIONS.map((sec, i) => (
                  <li key={sec.title}>
                    <h2 className={s.h2}><span className={s.secNo}>{i + 1}.</span> {sec.title}</h2>
                    <ul className={s.items}>
                      {sec.items.map((it) => (
                        <li key={it.id} className={s.item}>
                          <span className={s.itemText}>
                            <a href="#" className={s.itemLink} aria-describedby={`public-st-${it.id}`}>{it.title}</a>
                            <span className={s.itemHint}>{it.hint}</span>
                          </span>
                          <strong id={`public-st-${it.id}`} className={s.tag} data-status={it.status}>{it.status}</strong>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>

              <a href="#" className={s.button} role="button" draggable={false}>
                질문 확인 시작하기 <ArrowRight size={22} aria-hidden="true" />
              </a>

              <section className={s.steps} aria-labelledby="public-steps">
                <h2 id="public-steps" className={s.h2}>학기말 마감 판 확정까지</h2>
                <p className={s.stepsLead}>단계를 눌러 자세한 내용을 봅니다.</p>
                <ol className={s.stepList}>
                  {STEPS.map((st, i) => (
                    <li key={st.title} className={s.step}>
                      <span className={s.stepNo} aria-hidden="true">{i + 1}</span>
                      <details className={s.stepDetails} open={i === 0}>
                        <summary>
                          <span className={s.visuallyHidden}>{i + 1}단계: </span>
                          <span className={s.stepTitle}>{st.title}</span>
                          <span className={s.stepWhen}>{st.when}</span>
                          <ChevronDown size={22} className={s.chev} aria-hidden="true" />
                        </summary>
                        <div className={s.stepBody}>
                          <p>{st.body}</p>
                          {st.links.length > 0 && (
                            <ul>{st.links.map((l) => <li key={l}><a href="#">{l}</a></li>)}</ul>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className={s.related} aria-labelledby="public-related">
              <h2 id="public-related" className={s.h3}>관련 내용</h2>
              <ul className={s.relList}>
                {DOCUMENTS.map((d) => (
                  <li key={d.id}><a href="#">{d.title}</a><span>발행본 {d.version} · {d.at}</span></li>
                ))}
              </ul>

              <h2 className={s.h3}>다가오는 날짜</h2>
              <ul className={s.dates}>
                {EVENTS.map((e) => (
                  <li key={e.date + e.title}>
                    <strong>{fmt(e.date)} ({e.day})</strong>
                    <span>{e.title}{e.kind === '마감' ? ' · 마감' : ''}</span>
                  </li>
                ))}
              </ul>

              <div className={s.inset}>
                좌석 {SCHOOL.seats.total}개 중 {SCHOOL.seats.used}개를 쓰고 있습니다. <a href="#">좌석 관리</a>
              </div>
            </aside>
          </div>
        </main>
      </div>

      <footer className={s.footer}>
        <div className={s.wrap}>
          <ul>
            <li><a href="#">도움말</a></li>
            <li><a href="#">접근성</a></li>
            <li><a href="#">개인정보 처리방침</a></li>
            <li><a href="#">이용 약관</a></li>
          </ul>
          <p>{SCHOOL.name} · 합성 예시 자료</p>
        </div>
      </footer>
    </div>
  );
}
