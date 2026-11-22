'use client';
import '@fontsource/noto-serif-kr/500.css';
import '@fontsource/noto-serif-kr/700.css';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  BookOpen, CalendarDays, ChevronRight, CircleDot, Ellipsis, FileStack, FileText, Info, Lightbulb,
  PanelLeft, Paperclip, Search, Share2, SquareKanban, Table2, User, X, type LucideIcon,
} from 'lucide-react';
import { ACTIVITY, COURSES, DOCUMENTS, EVENTS, MEMBERS, QUESTIONS, SCHOOL, SOURCES, type Course } from './data';
import s from './workspace.module.css';

type Page = { id: string; title: string };
type Section = { key: string; title: string; icon: LucideIcon; pages: Page[] };

const CURRENT = 'p-courses';

/** 페이지 트리: 학교 > 규칙 / 양식 / 발행본 / 수업. 내용은 합성 자료에서 만든다. */
const TREE: Section[] = [
  { key: 'rules', title: '규칙', icon: BookOpen, pages: DOCUMENTS.filter((d) => d.template.startsWith('규정')).map((d) => ({ id: `r-${d.id}`, title: d.title })) },
  { key: 'templates', title: '양식', icon: FileStack, pages: [...new Set(DOCUMENTS.map((d) => d.template))].map((t) => ({ id: `t-${t}`, title: t })) },
  { key: 'published', title: '발행본', icon: FileText, pages: DOCUMENTS.map((d) => ({ id: `d-${d.id}`, title: `${d.title} · ${d.version}` })) },
  { key: 'courses', title: '수업', icon: Table2, pages: [{ id: CURRENT, title: `${SCHOOL.term.replace('2026학년도 ', '')} 수업 운영` }, ...COURSES.slice(0, 3).map((c) => ({ id: `c-${c.id}`, title: c.display }))] },
];

const STATUSES: Course['status'][] = ['수강신청 중', '진행 중', '마감 판 확정'];
const VIEWS = [
  { key: 'table', label: '표', icon: Table2 },
  { key: 'board', label: '보드', icon: SquareKanban },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const waiting = QUESTIONS.filter((q) => q.status === '대기');
const teachers = [...new Set(COURSES.map((c) => c.teacher))];
const pageTitle = TREE[3].pages[0].title;
const termEnd = EVENTS.find((e) => e.title.includes('학기말'));

/** 원형 5. 문서 워크스페이스형 — 페이지 트리 + 빵부스러기 + 읽기 폭 문서, 문서 속 표/보드 전환. */
export default function Workspace() {
  const [open, setOpen] = useState<Record<string, boolean>>({ rules: true, templates: false, published: false, courses: true });
  const [view, setView] = useState<ViewKey>('table');
  const [treeOpen, setTreeOpen] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
    setView(VIEWS[next].key);
    tabs.current[next]?.focus();
  }

  return (
    <div className={s.root} data-tree={treeOpen ? 'open' : undefined}>
      <aside className={s.sidebar} id="ws-tree" aria-label="페이지 목록">
        <div className={s.wsHead}>
          <span className={s.wsMark} aria-hidden="true">{SCHOOL.short.slice(0, 1)}</span>
          <span className={s.wsName}>{SCHOOL.name}</span>
          <button type="button" className={s.closeTree} onClick={() => setTreeOpen(false)} aria-label="페이지 목록 닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className={s.sideAction}><Search size={16} aria-hidden="true" />검색</button>

        <nav aria-label="페이지 트리" className={s.treeNav}>
          <p className={s.treeLabel}>학교</p>
          <ul className={s.tree}>
            {TREE.map((sec) => {
              const expanded = open[sec.key];
              return (
                <li key={sec.key}>
                  <button type="button" className={s.treeRow} aria-expanded={expanded} aria-controls={`ws-sec-${sec.key}`}
                    onClick={() => setOpen((o) => ({ ...o, [sec.key]: !o[sec.key] }))}>
                    <ChevronRight size={14} className={s.twisty} aria-hidden="true" />
                    <sec.icon size={16} aria-hidden="true" />
                    <span>{sec.title}</span>
                    <span className={s.treeCount}>{sec.pages.length}</span>
                  </button>
                  <ul id={`ws-sec-${sec.key}`} className={s.subtree} hidden={!expanded}>
                    {sec.pages.map((p) => (
                      <li key={p.id}>
                        <a href="#" className={s.pageRow} aria-current={p.id === CURRENT ? 'page' : undefined}>
                          <FileText size={14} aria-hidden="true" /><span>{p.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={s.sideFoot}>
          <span className={s.avatar} aria-hidden="true">{SCHOOL.user.initial}</span>
          <span>{SCHOOL.user.name}<small>{SCHOOL.user.role}</small></span>
        </div>
      </aside>

      <div className={s.scrim} aria-hidden="true" onClick={() => setTreeOpen(false)} />

      <div className={s.doc}>
        <header className={s.topbar}>
          <button type="button" className={s.treeToggle} aria-controls="ws-tree" aria-expanded={treeOpen} onClick={() => setTreeOpen((v) => !v)} aria-label="페이지 목록 열기">
            <PanelLeft size={18} aria-hidden="true" />
          </button>
          <nav aria-label="빵부스러기" className={s.crumbs}>
            <ol>
              <li><a href="#">{SCHOOL.name}</a></li>
              <li><a href="#">수업</a></li>
              <li><a href="#" aria-current="page">{pageTitle}</a></li>
            </ol>
          </nav>
          <span className={s.edited}>{ACTIVITY[0].when.replace(/ \d+:\d+$/, '')} 편집됨</span>
          <button type="button" className={s.topBtn}><Share2 size={16} aria-hidden="true" />공유</button>
          <button type="button" className={s.topIcon} aria-label="더 보기"><Ellipsis size={18} aria-hidden="true" /></button>
        </header>

        <main className={s.page}>
          <div className={s.pageIcon} aria-hidden="true"><Table2 size={36} strokeWidth={1.5} /></div>
          <h1 className={s.title}>{pageTitle}</h1>

          <dl className={s.props}>
            <div className={s.prop}>
              <dt><CircleDot size={16} aria-hidden="true" />상태</dt>
              <dd><span className={s.pill} data-status="진행 중">진행 중 · {SCHOOL.week}</span></dd>
            </div>
            <div className={s.prop}>
              <dt><User size={16} aria-hidden="true" />담당</dt>
              <dd className={s.people}>
                <span className={s.person}><span className={s.avatarSm} aria-hidden="true">{SCHOOL.user.initial}</span>{SCHOOL.user.name}</span>
                <span className={s.muted}>교사 {teachers.join(', ')}</span>
              </dd>
            </div>
            <div className={s.prop}>
              <dt><CalendarDays size={16} aria-hidden="true" />기간</dt>
              <dd>{SCHOOL.term}{termEnd && ` · ${termEnd.title} ${Number(termEnd.date.split('.')[0])}월 ${Number(termEnd.date.split('.')[1])}일`}</dd>
            </div>
            <div className={s.prop}>
              <dt><Paperclip size={16} aria-hidden="true" />관련 자료</dt>
              <dd className={s.chips}>
                {SOURCES.slice(0, 3).map((f) => <a key={f.id} href="#" className={s.chip}>{f.name}</a>)}
                <span className={s.muted}>외 {SOURCES.length - 3}개</span>
              </dd>
            </div>
          </dl>

          <aside className={s.callout} data-kind="info" aria-label="안내">
            <Info size={20} aria-hidden="true" />
            <div>
              <p><b>마감 판은 고치지 않습니다.</b> 확정한 수업의 성적·명단은 그대로 남고, 정정은 이전 판을 가리키는 새 판으로 추가합니다.</p>
            </div>
          </aside>

          <p>
            이번 학기에 열린 수업 {COURSES.length}개를 한곳에 모았습니다. 발행본에는 <b>발행용 표기명</b>이 쓰이고, 학적·성적은 <b>실제 과목명</b>과 수업 id로 연결됩니다.
            지금까지 {COURSES.filter((c) => c.status === '마감 판 확정').length}개 수업의 마감 판을 확정했습니다.
          </p>

          <aside className={s.callout} data-kind="warn" aria-label="확인 필요">
            <Lightbulb size={20} aria-hidden="true" />
            <div>
              <p><b>확인을 기다리는 질문 {waiting.length}건</b>이 이 페이지의 수업과 관련 있습니다.</p>
              <ul>
                {waiting.map((q) => <li key={q.id}><a href="#">{q.id}</a> {q.title}</li>)}
              </ul>
            </div>
          </aside>

          <section className={s.wide} aria-labelledby="ws-db-title">
            <div className={s.dbHead}>
              <h2 id="ws-db-title" className={s.h2}>수업</h2>
              <div role="tablist" aria-label="보기" className={s.tabs}>
                {VIEWS.map((v, i) => (
                  <button key={v.key} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`ws-tab-${v.key}`}
                    aria-selected={view === v.key} aria-controls="ws-db-panel" tabIndex={view === v.key ? 0 : -1}
                    className={s.tab} onClick={() => setView(v.key)} onKeyDown={(e) => onTabKey(e, i)}>
                    <v.icon size={15} aria-hidden="true" />{v.label}
                  </button>
                ))}
              </div>
              <span className={s.dbCount}>{COURSES.length}개 항목</span>
            </div>

            <div id="ws-db-panel" role="tabpanel" aria-labelledby={`ws-tab-${view}`} className={s.dbPanel}>
              {view === 'table' ? <TableView /> : <BoardView />}
            </div>
          </section>

          <h2 className={s.h2}>변경 기록</h2>
          <ul className={s.log}>
            {ACTIVITY.map((a) => (
              <li key={a.what}><b>{a.who}</b> {a.what} <span className={s.muted}>· {a.when}</span></li>
            ))}
          </ul>
          <p className={s.muted}>이 페이지를 볼 수 있는 사람: 구성원 {MEMBERS.length}명</p>
        </main>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Course['status'] }) {
  return <span className={s.pill} data-status={status}>{status}</span>;
}

function TableView() {
  return (
    <div className={s.tableWrap} tabIndex={0} aria-label="수업 표 (가로로 스크롤)">
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">실제 과목명</th>
            <th scope="col">발행용 표기명</th>
            <th scope="col">상태</th>
            <th scope="col">담당</th>
            <th scope="col">구분</th>
            <th scope="col">블록</th>
            <th scope="col" className={s.num}>수강</th>
            <th scope="col" className={s.num}>학점</th>
            <th scope="col">진도</th>
          </tr>
        </thead>
        <tbody>
          {COURSES.map((c) => (
            <tr key={c.id}>
              <th scope="row"><a href="#" className={s.rowLink}><FileText size={15} aria-hidden="true" />{c.name}</a></th>
              <td>{c.display}</td>
              <td><StatusPill status={c.status} /></td>
              <td>{c.teacher}</td>
              <td>{c.level === '고' ? '고등' : '중등'} · {c.type}</td>
              <td>{c.block}</td>
              <td className={s.num}>{c.students}/{c.capacity}</td>
              <td className={s.num}>{c.credits}</td>
              <td>
                <span className={s.bar}>
                  <span className={s.barTrack} aria-hidden="true"><span style={{ width: `${c.progress}%` }} /></span>
                  <span className={s.barNum}>{c.progress}%</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardView() {
  return (
    <div className={s.board}>
      {STATUSES.map((st) => {
        const items = COURSES.filter((c) => c.status === st);
        return (
          <section key={st} className={s.column} aria-label={`${st} ${items.length}개`}>
            <h3 className={s.colHead}><StatusPill status={st} /><span className={s.colCount}>{items.length}</span></h3>
            <ul>
              {items.map((c) => (
                <li key={c.id}>
                  <a href="#" className={s.card}>
                    <span className={s.cardTitle}>{c.display}</span>
                    <span className={s.cardSub}>{c.name}</span>
                    <span className={s.cardMeta}>{c.teacher} · {c.block} · {c.students}/{c.capacity}명</span>
                  </a>
                </li>
              ))}
              {items.length === 0 && <li className={s.muted}>항목 없음</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
