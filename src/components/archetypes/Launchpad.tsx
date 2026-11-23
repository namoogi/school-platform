'use client';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, Circle, CircleCheck, ClipboardList, FileCheck, FileText,
  GraduationCap, Inbox, Info, LayoutGrid, LogOut, Minus, Repeat, Search, Settings, ShieldCheck, Stamp,
  TriangleExclamationPoint, Upload, UserRound, Users,
} from 'lucide-react';
import { COURSES, DOCUMENTS, EVENTS, KPI, MEMBERS, QUESTIONS, SCHOOL, SOURCES, TASKS, TREND, toneLabel, type Tone } from './data';
import s from './launchpad.module.css';

type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;

const GROUPS = [
  { id: 'lp-today', label: '오늘 할 일', desc: '오늘 처리할 질문과 일정' },
  { id: 'lp-sources', label: '자료·규칙', desc: '자료 등록과 확정 규칙' },
  { id: 'lp-docs', label: '학사 문서', desc: '양식과 발행본' },
  { id: 'lp-grades', label: '성적·마감', desc: '수업 마감 판과 성적 입력' },
  { id: 'lp-admin', label: '학교 관리', desc: '좌석·구성원·모듈' },
] as const;

const TONE_ICON: Record<Tone, IconType> = {
  neutral: Minus, info: Info, success: CircleCheck, warning: TriangleExclamationPoint, danger: TriangleExclamationPoint,
};

const kpi = (key: string) => KPI.find((k) => k.key === key)!;

/** 원형 3. 런치패드 타일형 — 사이드바 없이 셸 막대 + 역할별 타일 묶음. 타일 하나에 핵심 숫자 하나, 앱 단위로 들어간다. */
export default function Launchpad() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(GROUPS[0].id);
  const [menu, setMenu] = useState<'bell' | 'user' | null>(null);
  const [notice, setNotice] = useState('');

  // 스크롤 위치에 따라 묶음 탭의 현재 위치를 맞춘다(스크롤 컨테이너는 .root).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { root, rootMargin: '-120px 0px -55% 0px' });
    GROUPS.forEach((g) => { const el = document.getElementById(g.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenu(null); }
    function onDown(e: MouseEvent) { if (!(e.target as Element).closest('[data-popover]')) setMenu(null); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [menu]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  const open = (app: string) => setNotice(`‘${app}’ 앱을 엽니다. 시안이라 화면은 이동하지 않습니다.`);

  const waiting = QUESTIONS.filter((q) => q.status === '대기');
  const answered = QUESTIONS.filter((q) => q.status === '답변함');
  const reviewSources = SOURCES.filter((f) => f.review);
  const openTasks = TASKS.filter((t) => !t.done);
  const readers = Array.from(new Set(SOURCES.map((f) => f.reader)));
  const templates = new Set(DOCUMENTS.map((d) => d.template)).size;
  const running = COURSES.filter((c) => c.status === '진행 중');
  const avgProgress = Math.round(running.reduce((n, c) => n + c.progress, 0) / Math.max(running.length, 1));
  const enrolling = COURSES.filter((c) => c.status === '수강신청 중');
  const gradeDue = EVENTS.find((e) => e.title.includes('성적'));
  const enrollDue = EVENTS.find((e) => e.title.includes('수강신청'));
  const teachers = MEMBERS.filter((m) => m.role === '교사').length;
  const notifications = [
    ...waiting.map((q) => ({ id: q.id, text: q.title, meta: `${q.kind} · ${q.age} 전` })),
    ...reviewSources.map((f) => ({ id: f.id, text: `${f.name} 표 읽기 검토 필요`, meta: f.at })),
  ];
  const kq = kpi('questions'); const kr = kpi('rows'); const kc = kpi('courses'); const ks = kpi('seats');

  return (
    <div className={s.root} ref={rootRef}>
      <header className={s.shell}>
        <div className={s.shellInner}>
          <span className={s.brand}>
            <span className={s.mark} aria-hidden="true">{SCHOOL.short.slice(0, 1)}</span>
            <b>{SCHOOL.name}</b>
          </span>
          <form role="search" className={s.search} onSubmit={(e) => e.preventDefault()}>
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="앱·자료·질문 검색" placeholder="앱, 자료, 질문 검색" />
          </form>
          <div className={s.shellActions}>
            <div className={s.popWrap} data-popover>
              <button type="button" className={s.iconBtn} aria-expanded={menu === 'bell'}
                aria-controls="lp-bell" onClick={() => setMenu(menu === 'bell' ? null : 'bell')}>
                <Bell size={18} aria-hidden="true" />
                <span className="sr-only">알림 </span>
                <span className={s.badge}>{notifications.length}<span className="sr-only">건</span></span>
              </button>
              {menu === 'bell' && (
                <div id="lp-bell" className={s.popover} role="region" aria-label="알림">
                  <p className={s.popTitle}>알림 {notifications.length}건</p>
                  <ul className={s.notiList}>
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => { setMenu(null); open(n.id.startsWith('Q') ? '질문 작업함' : '자료함'); }}>
                          <span className={s.notiId}>{n.id}</span>
                          <span className={s.notiText}>{n.text}</span>
                          <span className={s.notiMeta}>{n.meta}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className={s.popWrap} data-popover>
              <button type="button" className={s.userBtn} aria-expanded={menu === 'user'} aria-controls="lp-user"
                onClick={() => setMenu(menu === 'user' ? null : 'user')}>
                <span className={s.avatar} aria-hidden="true">{SCHOOL.user.initial}</span>
                <span className={s.userName}>{SCHOOL.user.name}<small>{SCHOOL.user.role}</small></span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {menu === 'user' && (
                <div id="lp-user" className={s.popover} role="region" aria-label="사용자 메뉴">
                  <ul className={s.menuList}>
                    <li><button type="button" onClick={() => { setMenu(null); open('내 정보'); }}><UserRound size={16} aria-hidden="true" />내 정보</button></li>
                    {SCHOOL.otherSchools.map((o) => (
                      <li key={o}><button type="button" onClick={() => { setMenu(null); open(`${o}로 전환`); }}><Repeat size={16} aria-hidden="true" />{o}로 전환</button></li>
                    ))}
                    <li className={s.menuSep}><button type="button" onClick={() => setMenu(null)}><LogOut size={16} aria-hidden="true" />로그아웃</button></li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className={s.page}>
        <div className={s.greet}>
          <div>
            <h1>{SCHOOL.user.name}님, 좋은 아침입니다</h1>
            <p>{SCHOOL.term} · {SCHOOL.week} · {SCHOOL.today}</p>
          </div>
          <p className={s.greetSum}>
            확인 대기 질문 <b>{waiting.length}건</b>, 오늘 마감 할 일 <b>{openTasks.filter((t) => t.due === '오늘').length}건</b>이 있습니다.
          </p>
        </div>

        <nav className={s.anchors} aria-label="타일 묶음">
          <ul>
            {GROUPS.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`} aria-current={active === g.id ? 'location' : undefined} onClick={() => setActive(g.id)}>{g.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <Group id="lp-today">
          <KpiTile title={kq.label} sub={kq.hint} value={kq.value} unit={kq.unit} tone={kq.tone}
            status={`${kq.delta} 지난주 대비`} onOpen={() => open('질문 작업함')} />
          <li className={s.wide}>
            <div className={s.tile} data-kind="list">
              <div className={s.listHead}>
                <h3>할 일</h3>
                <button type="button" className={s.textBtn} onClick={() => open('할 일')}>전체 {openTasks.length}건<ChevronRight size={14} aria-hidden="true" /></button>
              </div>
              <ul className={s.taskList}>
                {openTasks.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => open(t.link)}>
                      <Circle size={14} aria-hidden="true" />
                      <span className={s.taskTitle}>{t.title}</span>
                      <span className={s.due} data-today={t.due === '오늘' ? 'true' : undefined}>{t.due}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <LaunchTile icon={Inbox} title="질문 작업함" sub={`대기 ${waiting.length}건 · 답변함 ${answered.length}건`} onOpen={() => open('질문 작업함')} />
          <LaunchTile icon={CalendarDays} title="학사 일정" sub={`${EVENTS[0].date} ${EVENTS[0].title}`} onOpen={() => open('학사 일정')} />
        </Group>

        <Group id="lp-sources">
          <KpiTile title={kr.label} sub={kr.hint} value={kr.value} unit={kr.unit} tone={kr.tone}
            status={`${kr.delta} 지난주 대비`} onOpen={() => open('자료함')} />
          <li className={s.wide}>
            <button type="button" className={s.tile} data-kind="chart" onClick={() => open('자료 추이')}>
              <span className={s.tileTitle}>주별 등록 행<small>최근 {TREND.weeks.length}주</small></span>
              <RowsChart />
            </button>
          </li>
          <KpiTile title="검토 필요 자료" sub={reviewSources.map((f) => f.name).join(', ') || '없음'} value={String(reviewSources.length)} unit="개"
            tone={reviewSources.length ? 'warning' : 'success'} status="표 읽기 확인" onOpen={() => open('자료함')} />
          <LaunchTile icon={Upload} title="자료 올리기" sub={readers.join(' · ')} onOpen={() => open('자료 올리기')} />
          <LaunchTile icon={ShieldCheck} title="확정 규칙" sub="새 판으로만 바뀝니다" onOpen={() => open('확정 규칙')} />
        </Group>

        <Group id="lp-docs">
          <KpiTile title="발행본" sub={`최근 발행 ${DOCUMENTS[0].at}`} value={String(DOCUMENTS.length)} unit="건" tone="neutral"
            status="스냅샷 보존" onOpen={() => open('발행본')} />
          <li className={s.wide}>
            <button type="button" className={s.tile} data-kind="feature" onClick={() => open(DOCUMENTS[0].title)}>
              <span className={s.tileTitle}>최근 발행본<small>{DOCUMENTS[0].id}</small></span>
              <span className={s.feature}>
                <FileCheck size={28} aria-hidden="true" />
                <span>
                  <b>{DOCUMENTS[0].title}</b>
                  <span className={s.featureMeta}>{DOCUMENTS[0].version} · {DOCUMENTS[0].template} · {DOCUMENTS[0].by}</span>
                  <span className={s.hash}>지문 {DOCUMENTS[0].hash}</span>
                </span>
              </span>
            </button>
          </li>
          <LaunchTile icon={FileText} title="양식" sub={`양식 ${templates}종 · 판 단위 보존`} onOpen={() => open('양식')} />
          <LaunchTile icon={Stamp} title="문서 발행" sub="확정 규칙으로 새 판 발행" onOpen={() => open('문서 발행')} />
        </Group>

        <Group id="lp-grades">
          <KpiTile title={kc.label} sub={kc.hint} value={kc.value} unit={kc.unit} tone={kc.tone}
            status={`${kc.delta} 확정`} onOpen={() => open('마감 판')} />
          <KpiTile title="진행 중 수업" sub={`평균 진행률 ${avgProgress}%`} value={String(running.length)} unit={`/ ${COURSES.length}`} tone="info"
            status="이번 학기" onOpen={() => open('수업')} />
          <LaunchTile icon={ClipboardList} title="성적 입력" sub={gradeDue ? `${gradeDue.date} 1차 마감` : '일정 없음'} onOpen={() => open('성적 입력')} />
          <LaunchTile icon={GraduationCap} title="수강신청" sub={`${enrolling.length}개 수업${enrollDue ? ` · ${enrollDue.date} 마감` : ''}`} onOpen={() => open('수강신청')} />
        </Group>

        <Group id="lp-admin">
          <KpiTile title={ks.label} sub={ks.hint} value={ks.value} unit={ks.unit} tone={ks.tone}
            status={`${ks.delta} 사용`} meter={SCHOOL.seats.used / SCHOOL.seats.total} onOpen={() => open('좌석')} />
          <LaunchTile icon={Users} title="구성원" sub={`${MEMBERS.length}명 · 교사 ${teachers}명`} onOpen={() => open('구성원')} />
          <LaunchTile icon={LayoutGrid} title="모듈" sub={SCHOOL.modules.join(' · ')} onOpen={() => open('모듈')} />
          <LaunchTile icon={Settings} title="학교 설정" sub="학교 정보 · 접근 정책" onOpen={() => open('학교 설정')} />
        </Group>
      </div>

      <p className={s.toast} role="status" aria-live="polite" data-show={notice ? 'true' : undefined}>{notice}</p>
    </div>
  );
}

function Group({ id, children }: { id: (typeof GROUPS)[number]['id']; children: ReactNode }) {
  const g = GROUPS.find((x) => x.id === id)!;
  return (
    <section id={id} className={s.group} aria-labelledby={`${id}-h`}>
      <div className={s.groupHead}>
        <h2 id={`${id}-h`}>{g.label}</h2>
        <span>{g.desc}</span>
      </div>
      <ul className={s.tiles}>{children}</ul>
    </section>
  );
}

function KpiTile({ title, sub, value, unit, tone, status, meter, onOpen }: {
  title: string; sub: string; value: string; unit: string; tone: Tone; status: string; meter?: number; onOpen: () => void;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <li>
      <button type="button" className={s.tile} data-kind="kpi" onClick={onOpen}>
        <span className={s.tileTitle}>{title}<small>{sub}</small></span>
        <span className={s.figure}><span className={s.value}>{value}</span><span className={s.unit}>{unit}</span></span>
        {meter !== undefined && (
          <span className={s.meter} aria-hidden="true"><span style={{ width: `${Math.round(meter * 100)}%` }} /></span>
        )}
        <span className={s.status} data-tone={tone}><Icon size={14} aria-hidden="true" />{toneLabel[tone]} · {status}</span>
      </button>
    </li>
  );
}

function LaunchTile({ icon: Icon, title, sub, onOpen }: { icon: IconType; title: string; sub: string; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={s.tile} data-kind="launch" onClick={onOpen}>
        <span className={s.launchIcon}><Icon size={24} aria-hidden="true" /></span>
        <span className={s.tileTitle}>{title}<small>{sub}</small></span>
      </button>
    </li>
  );
}

/** 타일 안의 작은 막대 차트. 마지막 주(이번 주)만 강조색. */
function RowsChart() {
  const W = 336; const H = 96; const base = 76;
  const max = Math.max(...TREND.rows);
  const slot = W / TREND.rows.length;
  const bw = Math.min(26, slot - 10);
  const last = TREND.rows.length - 1;
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="lp-chart-t lp-chart-d">
      <title id="lp-chart-t">주별 등록 행 막대 차트</title>
      <desc id="lp-chart-d">{TREND.weeks.map((w, i) => `${w} ${TREND.rows[i]}행`).join(', ')}</desc>
      <line x1="0" x2={W} y1={base} y2={base} className={s.chartBase} />
      {TREND.rows.map((v, i) => {
        const h = Math.max(2, (v / max) * (base - 16));
        const x = i * slot + (slot - bw) / 2;
        return (
          <g key={TREND.weeks[i]}>
            <rect x={x} y={base - h} width={bw} height={h} rx="2" className={i === last ? s.barNow : s.bar} />
            {i === last && <text x={x + bw / 2} y={base - h - 4} textAnchor="middle" className={s.chartValue}>{v}</text>}
            <text x={x + bw / 2} y={H - 4} textAnchor="middle" className={i === last ? s.chartLabelNow : s.chartLabel}>{TREND.weeks[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
