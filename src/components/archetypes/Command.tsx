'use client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ArrowRight, BookOpen, Bookmark, Check, ChevronsUpDown, Circle, CircleCheck, CircleDot, CornerDownLeft, FileText, FileUp,
  Inbox, ListFilter, MessageCircleQuestion, Rows3, Search, Send, SlidersHorizontal, Stamp, UserRound, X,
  type LucideIcon,
} from 'lucide-react';
import { ACTIVITY, COURSES, DOCUMENTS, QUESTIONS, SCHOOL, SOURCES, TASKS } from './data';
import s from './command.module.css';

/* ── 자료 → 하나의 작업 목록으로 펼치기 (data.ts만 읽는다) ─────────────────────────── */

type Kind = '질문' | '자료' | '수업' | '발행본';
type Status = 'todo' | 'doing' | 'done';
type Activity = { who: string; what: string; when: string };
type Item = {
  id: string; kind: Kind; title: string; status: Status; statusText: string;
  assignee: string; age: string; days: number; tag: string;
  props: [string, string][]; related: string[]; activity: Activity[];
};

const STATUS_ORDER: Status[] = ['todo', 'doing', 'done'];
const STATUS: Record<Status, { label: string; icon: LucideIcon }> = {
  todo: { label: '확인 대기', icon: Circle },
  doing: { label: '진행 중', icon: CircleDot },
  done: { label: '완료', icon: CircleCheck },
};
const KIND_ICON: Record<Kind, LucideIcon> = { '질문': MessageCircleQuestion, '자료': FileText, '수업': BookOpen, '발행본': Stamp };

const YEAR = Number(/\d{4}/.exec(SCHOOL.term)?.[0] ?? '2026');
function toDate(text?: string) {
  const m = text ? /(\d+)월\s*(\d+)일/.exec(text) : null;
  return m ? new Date(YEAR, Number(m[1]) - 1, Number(m[2])) : null;
}
const TODAY = toDate(SCHOOL.today) ?? new Date(YEAR, 10, 23);
/** 오늘(SCHOOL.today) 기준 상대 경과. 날짜가 없으면 '—'. */
function since(text?: string) {
  const d = toDate(text);
  if (!d) return { age: '—', days: -1 };
  const days = Math.round((TODAY.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return { age: '오늘', days: 0 };
  if (days < 14) return { age: `${days}일`, days };
  if (days < 60) return { age: `${Math.floor(days / 7)}주`, days };
  return { age: `${Math.floor(days / 30)}개월`, days };
}
/** 받침 없음·ㄹ받침이면 '로', 그 밖에는 '으로'. */
function ro(word: string) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  const jong = c >= 0 && c < 11172 ? c % 28 : 0;
  return jong === 0 || jong === 8 ? '로' : '으로';
}
const mentions = (text: string) => ACTIVITY.filter((a) => a.what.includes(text));
const isId = (x: string | undefined): x is string => Boolean(x);
const sourceByName = new Map(SOURCES.map((f) => [f.name, f]));

const ITEMS: Item[] = [
  ...QUESTIONS.map((q): Item => {
    const src = sourceByName.get(q.source);
    return {
      id: q.id, kind: '질문', title: q.title,
      status: q.status === '대기' ? 'todo' : 'done', statusText: q.status === '대기' ? '확인 대기' : '답변함',
      assignee: q.assignee, ...since(q.opened), tag: q.kind,
      props: [['유형', q.kind], ['담당', q.assignee], ['근거 자료', q.source], ['위치', q.location], ['열린 날', q.opened],
        ['확정된 규칙', q.current ?? '없음 (새 항목)'], ['자료가 말하는 값', q.proposed]],
      related: [src?.id, ...COURSES.filter((c) => q.title.includes(c.name) || q.evidence.includes(c.name)).map((c) => c.id)].filter(isId),
      activity: [...mentions(q.source), { who: '자동 판독', what: `${q.source} ${q.location}에서 질문 열림`, when: q.opened }],
    };
  }),
  ...SOURCES.map((f): Item => ({
    id: f.id, kind: '자료', title: f.name,
    status: f.review ? 'todo' : 'done', statusText: f.review ? '검토 필요' : '판독 완료',
    assignee: f.by, ...since(f.at), tag: f.reader,
    props: [['형식', f.reader], ['행 수', `${f.rows}행`], ['크기', f.size], ['올린 사람', f.by], ['올린 때', f.at]],
    related: QUESTIONS.filter((q) => q.source === f.name).map((q) => q.id),
    activity: [...mentions(f.name).filter((a) => a.who !== f.by), { who: f.by, what: `등록 · ${f.rows}행`, when: f.at }],
  })),
  ...COURSES.map((c): Item => {
    const tasks = TASKS.filter((t) => t.link === c.id);
    const closedTask = tasks.find((t) => t.done);
    return {
      id: c.id, kind: '수업', title: c.name,
      status: c.status === '마감 판 확정' ? 'done' : 'doing', statusText: c.status,
      assignee: c.teacher, ...since(closedTask?.due), tag: `${c.level} · ${c.type}`,
      props: [['발행용 표기명', c.display], ['유형', `${c.type} · ${c.level === '고' ? '고등' : '중등'}`], ['담당 교사', c.teacher],
        ['학생', `${c.students} / ${c.capacity}명`], ['학점', `${c.credits}학점`], ['블록', c.block], ['진도', `${c.progress}%`]],
      related: QUESTIONS.filter((q) => q.title.includes(c.name) || q.evidence.includes(c.name)).map((q) => q.id),
      activity: tasks.map((t) => ({ who: '할 일', what: t.done ? `${t.title} · 완료` : t.title, when: t.due })),
    };
  }),
  ...DOCUMENTS.map((d): Item => ({
    id: d.id, kind: '발행본', title: d.title, status: 'done', statusText: '발행됨',
    assignee: d.by, ...since(d.at), tag: d.version,
    props: [['양식', d.template], ['판', d.version], ['발행일', d.at], ['발행자', d.by], ['스냅샷 지문', d.hash]],
    related: [],
    activity: [...mentions(d.title).filter((a) => !a.what.includes(d.version)), { who: d.by, what: `${d.version} 발행 · 스냅샷 고정`, when: d.at }],
  })),
];
const itemById = (id: string) => ITEMS.find((i) => i.id === id);

/* ── 보기 ───────────────────────────────────────────────────────────────── */

type View = { key: string; label: string; icon: LucideIcon; filter: (i: Item) => boolean };
const PRIMARY: View[] = [
  { key: 'mine', label: '내 작업', icon: UserRound, filter: (i) => i.assignee === SCHOOL.user.name },
  { key: 'all', label: '전체 작업', icon: Inbox, filter: () => true },
];
const KIND_VIEWS: View[] = (['질문', '자료', '수업', '발행본'] as Kind[]).map((k) => ({
  key: k, label: k, icon: KIND_ICON[k], filter: (i) => i.kind === k,
}));
const SAVED: View[] = [
  { key: 'conflict', label: '충돌 질문', icon: Bookmark, filter: (i) => i.kind === '질문' && i.tag === '충돌' },
  { key: 'review', label: '검토 필요 자료', icon: Bookmark, filter: (i) => i.kind === '자료' && i.status === 'todo' },
  { key: 'full', label: '정원 90% 이상 수업', icon: Bookmark, filter: (i) => COURSES.some((c) => c.id === i.id && c.students / c.capacity >= 0.9) },
  { key: 'park', label: '박교사 담당', icon: Bookmark, filter: (i) => i.assignee === '박교사' },
];
const VIEWS = [...PRIMARY, ...KIND_VIEWS, ...SAVED];
type Order = 'default' | 'oldest' | 'newest';

/* ── 명령 팔레트 검색: 부분 문자열 > 순서대로 흩어진 글자 > 한글 초성 ─────────────── */

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const initials = (t: string) => Array.from(t, (ch) => {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
}).join('');
function score(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  const t = text.toLowerCase().replace(/\s+/g, '');
  const at = t.indexOf(q);
  if (at >= 0) return at;
  const ci = initials(t).indexOf(q);
  if (ci >= 0) return 50 + ci;
  let pos = -1; let gaps = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, pos + 1);
    if (i < 0) return null;
    if (pos >= 0) gaps += i - pos - 1;
    pos = i;
  }
  return 100 + gaps;
}

type CmdGroup = '이동' | '작업' | '항목 열기';
type Cmd = { id: string; group: CmdGroup; label: string; hint?: string; keywords?: string; icon: LucideIcon; run: () => void };
const CMD_GROUPS: CmdGroup[] = ['이동', '작업', '항목 열기'];

/** 원형 2. 명령·목록형 고밀도 — 좁은 사이드바 + 상태로 묶인 목록 + 속성 패널 + 명령 팔레트. */
export default function Command() {
  const uid = useId();
  const [view, setView] = useState('all');
  const [hidden, setHidden] = useState<Status[]>([]);
  const [grouped, setGrouped] = useState(true);
  const [order, setOrder] = useState<Order>('default');
  const [selectedId, setSelectedId] = useState(ITEMS[0].id);
  const [panelOpen, setPanelOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [toast, setToast] = useState('');

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const keyMove = useRef(false);
  const displayRef = useRef<HTMLDivElement>(null);

  const current = VIEWS.find((v) => v.key === view) ?? PRIMARY[1];
  const inView = ITEMS.filter(current.filter);
  const visible = inView.filter((i) => !hidden.includes(i.status));
  const sorted = order === 'default' ? visible : [...visible].sort((a, b) => (order === 'oldest' ? b.days - a.days : a.days - b.days));
  const flat = grouped ? STATUS_ORDER.flatMap((st) => sorted.filter((i) => i.status === st)) : sorted;
  const selected = itemById(selectedId);

  function chooseView(key: string) {
    const v = VIEWS.find((x) => x.key === key) ?? PRIMARY[1];
    setView(v.key);
    const first = ITEMS.filter(v.filter).find((i) => !hidden.includes(i.status));
    if (first) setSelectedId(first.id);
  }
  function openItem(id: string) {
    if (!flat.some((i) => i.id === id)) { setView('all'); setHidden([]); }
    setSelectedId(id);
    setPanelOpen(true);
  }
  function move(delta: number) {
    if (flat.length === 0) return;
    const i = flat.findIndex((x) => x.id === selectedId);
    const next = i < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, i + delta));
    keyMove.current = true;
    setSelectedId(flat[next].id);
  }
  function say(text: string) { setToast(text); }
  function openPalette() {
    lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDisplayOpen(false); setSchoolOpen(false);
    setPaletteOpen(true);
  }
  function closePalette(run?: () => void) {
    setPaletteOpen(false);
    run?.();
    requestAnimationFrame(() => {
      const back = lastFocus.current;
      if (back && back.isConnected) back.focus();
      else listRef.current?.focus();
    });
  }

  // 키보드: Ctrl/⌘K 팔레트, ↑↓·J/K 이동, Enter 패널 열기, Esc 닫기. 한글 자판에서도 되도록 e.code를 본다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (paletteOpen) closePalette(); else openPalette();
        return;
      }
      if (paletteOpen || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Escape' && (displayOpen || schoolOpen)) {
        // 닫히는 팝오버 안에 초점이 있었다면 여는 단추로 돌려준다.
        const owner = displayOpen ? displayRef.current : document.querySelector<HTMLElement>(`[aria-controls="${uid}-schools"]`)?.parentElement;
        if (owner?.contains(document.activeElement)) owner.querySelector('button')?.focus();
        setDisplayOpen(false); setSchoolOpen(false);
        return;
      }
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowDown' || e.code === 'KeyJ') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp' || e.code === 'KeyK') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && t?.tagName !== 'BUTTON') setPanelOpen(true);
      else if (e.key === 'Escape' && panelOpen) setPanelOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 키보드로 옮긴 행은 보이게 스크롤하고, 초점이 목록(또는 아무 데도 없음)에 있으면 행으로 초점을 옮긴다.
  useEffect(() => {
    if (!keyMove.current) return;
    keyMove.current = false;
    const el = rowRefs.current.get(selectedId);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    const active = document.activeElement;
    if (!active || active === document.body || listRef.current?.contains(active)) el.focus();
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!displayOpen) return;
    function onDown(e: MouseEvent) { if (!displayRef.current?.contains(e.target as Node)) setDisplayOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [displayOpen]);

  const commands: Cmd[] = [
    ...VIEWS.map((v): Cmd => ({
      id: `go-${v.key}`, group: '이동', icon: v.icon,
      label: SAVED.includes(v) ? `저장된 보기: ${v.label}` : `${v.label}${ro(v.label)} 이동`,
      keywords: 'go view 보기',
      run: () => chooseView(v.key),
    })),
    { id: 'upload', group: '작업', icon: FileUp, label: '자료 올리기', hint: 'XLSX · DOCX · PDF · CSV', keywords: 'upload file 파일',
      run: () => say('시안 화면이라 자료 올리기 창은 열지 않습니다. 올린 자료는 판독 뒤 ‘확인 대기’에 나타납니다.') },
    { id: 'publish', group: '작업', icon: Send, label: '문서 발행', hint: '확정 규칙으로 새 판 발행', keywords: 'publish document 발행본',
      run: () => say('시안 화면이라 발행하지 않습니다. 발행하면 그 시점 스냅샷이 새 판으로 고정됩니다.') },
    { id: 'group', group: '작업', icon: Rows3, label: grouped ? '상태 묶기 끄기' : '상태로 묶기', keywords: 'group 묶음', run: () => setGrouped((g) => !g) },
    { id: 'done', group: '작업', icon: CircleCheck, label: hidden.includes('done') ? '완료 항목 보이기' : '완료 항목 숨기기', keywords: 'hide done',
      run: () => setHidden((h) => (h.includes('done') ? h.filter((x) => x !== 'done') : [...h, 'done'])) },
    { id: 'panel', group: '작업', icon: SlidersHorizontal, label: panelOpen ? '속성 패널 닫기' : '속성 패널 열기', keywords: 'panel properties', run: () => setPanelOpen((p) => !p) },
    ...ITEMS.map((i): Cmd => ({
      id: `open-${i.id}`, group: '항목 열기', icon: KIND_ICON[i.kind], label: `${i.id} 열기`, hint: i.title,
      keywords: `${i.kind} ${i.assignee} ${i.statusText}`, run: () => openItem(i.id),
    })),
  ];

  const counts = (v: View) => ITEMS.filter(v.filter).filter((i) => i.status !== 'done').length;

  function renderRow(i: Item) {
    const St = STATUS[i.status].icon;
    const Kd = KIND_ICON[i.kind];
    const isSel = i.id === selectedId;
    return (
      <li key={i.id}>
        <button type="button" className={s.row} aria-current={isSel ? 'true' : undefined}
          ref={(el) => { if (el) rowRefs.current.set(i.id, el); else rowRefs.current.delete(i.id); }}
          onClick={() => { setSelectedId(i.id); setPanelOpen(true); }}>
          <span className={s.stIcon} data-status={i.status}><St size={14} strokeWidth={2} aria-hidden="true" /></span>
          <span className={s.rid}>{i.id}</span>
          <span className={s.rtitle}><Kd size={13} aria-hidden="true" /><span className={s.srOnly}>{i.kind}: </span><span className={s.ellipsis}>{i.title}</span></span>
          <span className={s.rtag}>{i.tag}</span>
          <span className={s.rstatus}>{i.statusText}</span>
          <span className={s.avatar} aria-hidden="true">{i.assignee.slice(0, 1)}</span>
          <span className={s.srOnly}>담당 {i.assignee}</span>
          <span className={s.rage}>{i.age === '—' ? <><span aria-hidden="true">—</span><span className={s.srOnly}>날짜 없음</span></> : i.age}</span>
        </button>
      </li>
    );
  }

  return (
    <div className={s.root}>
      <div className={s.shell} data-panel={panelOpen && selected ? 'open' : 'closed'} inert={paletteOpen}>
        {/* 사이드바 220px */}
        <aside className={s.side} aria-label="작업 공간">
          <div className={s.switcher}>
            <button type="button" className={s.school} aria-expanded={schoolOpen} aria-controls={`${uid}-schools`} onClick={() => setSchoolOpen((o) => !o)}>
              <span className={s.mark} aria-hidden="true">{SCHOOL.short.slice(0, 1)}</span>
              <span className={s.schoolName}><b>{SCHOOL.name}</b><small>{SCHOOL.term} · {SCHOOL.week}</small></span>
              <ChevronsUpDown size={14} aria-hidden="true" />
            </button>
            {schoolOpen && (
              <ul id={`${uid}-schools`} className={s.schools} aria-label="학교 전환">
                {[SCHOOL.name, ...SCHOOL.otherSchools].map((name) => (
                  <li key={name}>
                    <button type="button" aria-current={name === SCHOOL.name ? 'true' : undefined}
                      onClick={() => { setSchoolOpen(false); if (name !== SCHOOL.name) say(`시안 화면이라 ‘${name}’으로 전환하지 않습니다. 전환하면 그 학교 소속으로 다시 불러옵니다.`); }}>
                      <span>{name}</span>{name === SCHOOL.name && <Check size={14} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav className={s.nav} aria-label="보기">
            <ul>
              {PRIMARY.map((v) => <NavItem key={v.key} v={v} active={view === v.key} count={counts(v)} onPick={chooseView} />)}
            </ul>
            <h2 className={s.navLabel} id={`${uid}-views`}>보기</h2>
            <ul aria-labelledby={`${uid}-views`}>
              {KIND_VIEWS.map((v) => <NavItem key={v.key} v={v} active={view === v.key} count={counts(v)} onPick={chooseView} />)}
            </ul>
            <h2 className={s.navLabel} id={`${uid}-saved`}>저장된 보기</h2>
            <ul aria-labelledby={`${uid}-saved`}>
              {SAVED.map((v) => <NavItem key={v.key} v={v} active={view === v.key} count={counts(v)} onPick={chooseView} />)}
            </ul>
          </nav>

          <div className={s.me}>
            <span className={s.avatar} aria-hidden="true">{SCHOOL.user.initial}</span>
            <span><b>{SCHOOL.user.name}</b><small>{SCHOOL.user.role}</small></span>
          </div>
        </aside>

        {/* 목록 */}
        <main className={s.main}>
          <header className={s.top}>
            <div className={s.topRow}>
              <current.icon size={15} aria-hidden="true" className={s.viewIcon} />
              <h1>{current.label}</h1>
              <span className={s.total}>{visible.length}<span className={s.srOnly}>건</span></span>
              <label className={s.mobileView}>
                <span className={s.srOnly}>보기 고르기</span>
                <select value={view} onChange={(e) => chooseView(e.target.value)}>
                  {VIEWS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </label>
              <button type="button" className={s.trigger} onClick={openPalette} aria-keyshortcuts="Control+K Meta+K" aria-haspopup="dialog">
                <Search size={14} aria-hidden="true" /><span className={s.triggerText}>명령 실행·이동</span><kbd>Ctrl</kbd><kbd>K</kbd>
              </button>
            </div>
            <div className={s.filterRow}>
              <span className={s.filterLabel}><ListFilter size={13} aria-hidden="true" />상태</span>
              <div role="group" aria-label="상태 필터" className={s.chips}>
                {STATUS_ORDER.map((st) => {
                  const Icon = STATUS[st].icon;
                  const n = inView.filter((i) => i.status === st).length;
                  const on = !hidden.includes(st);
                  return (
                    <button key={st} type="button" className={s.chip} aria-pressed={on}
                      onClick={() => setHidden((h) => (on ? [...h, st] : h.filter((x) => x !== st)))}>
                      <Icon size={12} aria-hidden="true" data-status={st} className={s.chipIcon} />{STATUS[st].label}<span className={s.chipCount}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className={s.displayWrap} ref={displayRef}>
                <button type="button" className={s.tool} aria-expanded={displayOpen} aria-controls={`${uid}-display`} onClick={() => setDisplayOpen((o) => !o)}>
                  <SlidersHorizontal size={13} aria-hidden="true" />표시
                </button>
                {displayOpen && (
                  <div id={`${uid}-display`} className={s.popover} role="group" aria-label="표시 옵션">
                    <label className={s.optRow}>
                      <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />상태로 묶기
                    </label>
                    <fieldset className={s.optSet}>
                      <legend>정렬</legend>
                      {([['default', '기본 순서'], ['oldest', '오래된 것부터'], ['newest', '최근 것부터']] as [Order, string][]).map(([k, label]) => (
                        <label key={k} className={s.optRow}>
                          <input type="radio" name={`${uid}-order`} checked={order === k} onChange={() => setOrder(k)} />{label}
                        </label>
                      ))}
                    </fieldset>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className={s.list} ref={listRef} tabIndex={-1} aria-label={`${current.label} 목록`} role="region">
            {grouped
              ? STATUS_ORDER.map((st) => {
                  const rows = sorted.filter((i) => i.status === st);
                  if (rows.length === 0) return null;
                  const Icon = STATUS[st].icon;
                  return (
                    <section key={st} aria-labelledby={`${uid}-g-${st}`}>
                      <h2 className={s.groupHead} id={`${uid}-g-${st}`}>
                        <Icon size={13} aria-hidden="true" data-status={st} className={s.chipIcon} />{STATUS[st].label}<span className={s.groupCount}>{rows.length}</span>
                      </h2>
                      <ul className={s.rows}>{rows.map(renderRow)}</ul>
                    </section>
                  );
                })
              : <ul className={s.rows}>{flat.map(renderRow)}</ul>}
            {flat.length === 0 && (
              <p className={s.empty}>이 보기에 맞는 항목이 없습니다. 상태 필터를 다시 켜거나 다른 보기를 고르세요.</p>
            )}
            <p className={s.keys} aria-hidden="true">
              <kbd>↑</kbd><kbd>↓</kbd> 또는 <kbd>J</kbd><kbd>K</kbd> 이동 · <kbd>Enter</kbd> 속성 · <kbd>Esc</kbd> 닫기 · <kbd>Ctrl</kbd><kbd>K</kbd> 명령
            </p>
          </div>
        </main>

        {/* 속성 패널 340px */}
        {panelOpen && selected && <Panel item={selected} onClose={() => setPanelOpen(false)} onOpen={openItem} />}
      </div>

      <div className={s.toast} role="status" aria-live="polite">{toast && <span>{toast}</span>}</div>

      {paletteOpen && <Palette commands={commands} onClose={closePalette} />}
    </div>
  );
}

function NavItem({ v, active, count, onPick }: { v: View; active: boolean; count: number; onPick: (key: string) => void }) {
  return (
    <li>
      <button type="button" className={s.navItem} aria-current={active ? 'page' : undefined} onClick={() => onPick(v.key)}>
        <v.icon size={14} aria-hidden="true" /><span className={s.ellipsis}>{v.label}</span>
        {count > 0 && <span className={s.navCount}>{count}<span className={s.srOnly}>건 열림</span></span>}
      </button>
    </li>
  );
}

function Panel({ item, onClose, onOpen }: { item: Item; onClose: () => void; onOpen: (id: string) => void }) {
  const St = STATUS[item.status].icon;
  const Kd = KIND_ICON[item.kind];
  const titleId = useId();
  return (
    <aside className={s.panel} aria-labelledby={titleId}>
      <header className={s.panelHead}>
        <Kd size={13} aria-hidden="true" /><span>{item.kind}</span><span className={s.rid}>{item.id}</span>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="속성 패널 닫기" title="닫기 (Esc)"><X size={14} aria-hidden="true" /></button>
      </header>
      <div className={s.panelBody}>
        <h2 id={titleId} className={s.panelTitle}>{item.title}</h2>
        <dl className={s.props}>
          <div><dt>상태</dt><dd><span className={s.statusLine}><St size={13} aria-hidden="true" data-status={item.status} className={s.chipIcon} />{item.statusText}</span></dd></div>
          {item.props.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd className={k === '스냅샷 지문' ? s.mono : undefined}>{v}</dd></div>
          ))}
          <div><dt>경과</dt><dd>{item.age === '—' ? '기록 없음' : item.age}</dd></div>
        </dl>

        {item.related.length > 0 && (
          <section className={s.panelSec}>
            <h3>관련 항목</h3>
            <ul className={s.related}>
              {item.related.map((id) => {
                const r = itemById(id);
                if (!r) return null;
                const RIcon = KIND_ICON[r.kind];
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onOpen(id)}>
                      <RIcon size={13} aria-hidden="true" /><span className={s.rid}>{id}</span><span className={s.ellipsis}>{r.title}</span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={s.panelSec}>
          <h3>활동</h3>
          {item.activity.length === 0
            ? <p className={s.muted}>기록된 활동이 없습니다.</p>
            : (
              <ol className={s.timeline}>
                {item.activity.map((a, n) => (
                  <li key={n}>
                    <span className={s.dot} aria-hidden="true" />
                    <span><b>{a.who}</b> {a.what}</span>
                    <time>{a.when}</time>
                  </li>
                ))}
              </ol>
            )}
        </section>
      </div>
    </aside>
  );
}

function Palette({ commands, onClose }: { commands: Cmd[]; onClose: (run?: () => void) => void }) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const optRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, sc: score(query, `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`) }))
      .filter((x): x is { c: Cmd; sc: number } => x.sc !== null);
    if (query.trim()) scored.sort((a, b) => a.sc - b.sc);
    return scored.map((x) => x.c);
  }, [commands, query]);

  // 검색어가 없으면 묶음 순서, 있으면 점수 순서를 그대로 쓴다.
  const sections = query.trim()
    ? [{ group: '결과' as const, items: results }]
    : CMD_GROUPS.map((g) => ({ group: g, items: results.filter((c) => c.group === g) })).filter((x) => x.items.length > 0);
  const ordered = sections.flatMap((x) => x.items);
  const idx = Math.min(active, Math.max(0, ordered.length - 1));
  const activeCmd = ordered[idx];
  const optId = (c: Cmd) => `${uid}-opt-${c.id}`;

  useEffect(() => {
    if (activeCmd) optRefs.current.get(activeCmd.id)?.scrollIntoView({ block: 'nearest' });
  }, [activeCmd]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const n = ordered.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) setActive((idx + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) setActive((idx - 1 + n) % n); }
    else if (e.key === 'Home' && n) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && n) { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeCmd) onClose(activeCmd.run); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'Tab') e.preventDefault(); // 팔레트 안에서 초점이 갈 곳은 입력칸 하나뿐
  }

  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.palette} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`} className={s.srOnly}>명령 팔레트</h2>
        <div className={s.paletteInput}>
          <Search size={15} aria-hidden="true" />
          <input ref={inputRef} type="text" role="combobox" aria-expanded="true" aria-autocomplete="list"
            aria-controls={`${uid}-list`} aria-activedescendant={activeCmd ? optId(activeCmd) : undefined}
            aria-label="명령 또는 항목 검색" placeholder="명령이나 항목 번호를 입력하세요 (예: 질문, Q-118, ㅈㄹ)"
            value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} spellCheck={false} autoComplete="off" />
          <kbd>Esc</kbd>
        </div>
        <ul id={`${uid}-list`} role="listbox" aria-label="명령" className={s.paletteList}>
          {sections.map((sec) => (
            <li key={sec.group} role="presentation">
              <div className={s.paletteGroup} id={`${uid}-grp-${sec.group}`} role="presentation">{sec.group}</div>
              <ul role="group" aria-labelledby={`${uid}-grp-${sec.group}`}>
                {sec.items.map((c) => {
                  const on = c === activeCmd;
                  return (
                    <li key={c.id} id={optId(c)} role="option" aria-selected={on} className={s.option}
                      ref={(el) => { if (el) optRefs.current.set(c.id, el); else optRefs.current.delete(c.id); }}
                      onMouseMove={() => { if (!on) setActive(ordered.indexOf(c)); }}
                      onClick={() => onClose(c.run)}>
                      <c.icon size={14} aria-hidden="true" />
                      <span className={s.optLabel}>{c.label}</span>
                      {c.hint && <span className={s.optHint}>{c.hint}</span>}
                      {on && <CornerDownLeft size={13} aria-hidden="true" className={s.optEnter} />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {ordered.length === 0 && <p className={s.paletteEmpty}>‘{query}’에 맞는 명령이 없습니다.</p>}
        <footer className={s.paletteFoot}>
          <span><kbd>↑</kbd><kbd>↓</kbd> 고르기</span><span><kbd>Enter</kbd> 실행</span><span><kbd>Esc</kbd> 닫기</span>
          <span className={s.srOnly} role="status">{ordered.length}개 명령</span>
        </footer>
      </div>
    </div>
  );
}
