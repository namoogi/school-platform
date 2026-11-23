'use client';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ArrowDownWideNarrow, BookOpen, CalendarDays, ChevronDown, ChevronRight, CircleChevronDown, FileSpreadsheet, Gauge, Group, Hash,
  KeyRound, ListFilter, Lock, Maximize2, MessageCircleQuestion, PanelLeftClose, PanelLeftOpen, Pencil, Rows3, Search, Table2,
  Type, UserRound, Users, X, type LucideIcon,
} from 'lucide-react';
import { COURSES, MEMBERS, QUESTIONS, SCHOOL, SOURCES } from './data';
import s from './grid.module.css';

/* ── 표 정의: data.ts를 칸 형식이 있는 기록으로 바꾼다 ───────────────────────── */

type FieldType = 'text' | 'id' | 'select' | 'number' | 'person' | 'progress' | 'date';
type Hue = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal' | 'gray';
type Cell = string | number;
type Field = { key: string; label: string; type: FieldType; width: number; options?: Record<string, Hue>; sum?: boolean; suffix?: string };
type Rec = { id: string; values: Record<string, Cell> };
type View = { key: string; label: string; rule: string; filter: (r: Rec) => boolean };
type Sort = { label: string; key: string | null; dir: 1 | -1 };
type Table = {
  key: string; label: string; noun: string; icon: LucideIcon; fields: Field[]; rows: Rec[]; views: View[];
  groupBy: string; sorts: Sort[]; lock: (r: Rec) => string | null;
  /** 칸 편집으로 고를 수 없는 값(별도 확정 절차가 필요한 상태) */
  guarded?: { field: string; value: string };
  footNote?: string;
};

const TYPE_ICON: Record<FieldType, LucideIcon> = { text: Type, id: KeyRound, select: CircleChevronDown, number: Hash, person: UserRound, progress: Gauge, date: CalendarDays };
const TYPE_LABEL: Record<FieldType, string> = { text: '글자', id: '고유 번호', select: '단일 선택', number: '숫자', person: '사람', progress: '진행률', date: '날짜' };
const me = SCHOOL.user.name;
const all = (): boolean => true;

const TABLES: Table[] = [
  {
    key: 'courses', label: '수업', noun: '수업', icon: BookOpen, groupBy: 'status',
    fields: [
      { key: 'name', label: '실제 과목명', type: 'text', width: 200 },
      { key: 'id', label: 'ID', type: 'id', width: 76 },
      { key: 'display', label: '발행용 표기명', type: 'text', width: 148 },
      { key: 'type', label: '유형', type: 'select', width: 84, options: { '선택': 'blue', '창의': 'purple', '필수': 'teal' } },
      { key: 'level', label: '학교급', type: 'select', width: 80, options: { '중': 'amber', '고': 'gray' } },
      { key: 'status', label: '상태', type: 'select', width: 128, options: { '수강신청 중': 'gray', '진행 중': 'blue', '마감 판 확정': 'green' } },
      { key: 'teacher', label: '담당 교사', type: 'person', width: 112 },
      { key: 'students', label: '학생', type: 'number', width: 72, sum: true, suffix: '명' },
      { key: 'capacity', label: '정원', type: 'number', width: 72, sum: true, suffix: '명' },
      { key: 'credits', label: '학점', type: 'number', width: 64 },
      { key: 'block', label: '블록', type: 'text', width: 80 },
      { key: 'progress', label: '진도', type: 'progress', width: 148 },
    ],
    rows: COURSES.map((c) => ({ id: c.id, values: { name: c.name, id: c.id, display: c.display, type: c.type, level: c.level, status: c.status, teacher: c.teacher, students: c.students, capacity: c.capacity, credits: c.credits, block: c.block, progress: c.progress } })),
    views: [
      { key: 'all', label: '모든 수업', rule: '조건 없음', filter: all },
      { key: 'hs', label: '고등 선택과목', rule: '학교급 = 고 · 유형 = 선택', filter: (r) => r.values.level === '고' && r.values.type === '선택' },
      { key: 'closed', label: '마감 판 확정', rule: '상태 = 마감 판 확정', filter: (r) => r.values.status === '마감 판 확정' },
      { key: 'mine', label: '내가 담당', rule: `담당 교사 = ${me}`, filter: (r) => r.values.teacher === me },
    ],
    sorts: [
      { label: '기본 순서', key: null, dir: 1 },
      { label: '학생 많은 순', key: 'students', dir: -1 },
      { label: '진도 낮은 순', key: 'progress', dir: 1 },
      { label: '과목명 가나다순', key: 'name', dir: 1 },
    ],
    lock: (r) => (r.values.status === '마감 판 확정'
      ? '마감 판이 확정된 수업입니다. 확정 판과 그 명단·성적은 고치거나 지울 수 없고, 정정은 이 판을 가리키는 새 판으로 만듭니다.'
      : null),
    guarded: { field: 'status', value: '마감 판 확정' },
  },
  {
    key: 'sources', label: '자료', noun: '자료', icon: FileSpreadsheet, groupBy: 'review',
    fields: [
      { key: 'name', label: '파일명', type: 'text', width: 220 },
      { key: 'id', label: 'ID', type: 'id', width: 64 },
      { key: 'reader', label: '형식', type: 'select', width: 80, options: { 'XLSX': 'green', 'DOCX': 'blue', 'PDF': 'red', 'CSV': 'teal' } },
      { key: 'review', label: '판독', type: 'select', width: 108, options: { '검토 필요': 'amber', '판독 완료': 'gray' } },
      { key: 'rows', label: '행 수', type: 'number', width: 76, sum: true, suffix: '행' },
      { key: 'size', label: '크기', type: 'text', width: 76 },
      { key: 'by', label: '올린 사람', type: 'person', width: 112 },
      { key: 'at', label: '올린 때', type: 'date', width: 136 },
    ],
    rows: SOURCES.map((f) => ({ id: f.id, values: { name: f.name, id: f.id, reader: f.reader, review: f.review ? '검토 필요' : '판독 완료', rows: f.rows, size: f.size, by: f.by, at: f.at } })),
    views: [
      { key: 'all', label: '모든 자료', rule: '조건 없음', filter: all },
      { key: 'review', label: '검토 필요', rule: '판독 = 검토 필요', filter: (r) => r.values.review === '검토 필요' },
      { key: 'mine', label: '내가 올린 자료', rule: `올린 사람 = ${me}`, filter: (r) => r.values.by === me },
    ],
    sorts: [
      { label: '기본 순서', key: null, dir: 1 },
      { label: '행 많은 순', key: 'rows', dir: -1 },
      { label: '파일명 가나다순', key: 'name', dir: 1 },
    ],
    lock: () => '원본 자료와 그 행은 올린 그대로 보존합니다. 고칠 내용이 있으면 새 버전을 올리세요.',
  },
  {
    key: 'questions', label: '질문', noun: '질문', icon: MessageCircleQuestion, groupBy: 'status',
    fields: [
      { key: 'title', label: '질문', type: 'text', width: 300 },
      { key: 'id', label: 'ID', type: 'id', width: 72 },
      { key: 'kind', label: '유형', type: 'select', width: 96, options: { '충돌': 'red', '근거 부족': 'amber', '새 항목': 'blue' } },
      { key: 'status', label: '상태', type: 'select', width: 88, options: { '대기': 'amber', '답변함': 'green' } },
      { key: 'source', label: '근거 자료', type: 'text', width: 196 },
      { key: 'location', label: '위치', type: 'text', width: 112 },
      { key: 'assignee', label: '담당', type: 'person', width: 104 },
      { key: 'opened', label: '열린 날', type: 'date', width: 96 },
      { key: 'age', label: '경과', type: 'text', width: 64 },
    ],
    rows: QUESTIONS.map((q) => ({ id: q.id, values: { title: q.title, id: q.id, kind: q.kind, status: q.status, source: q.source, location: q.location, assignee: q.assignee, opened: q.opened, age: q.age } })),
    views: [
      { key: 'all', label: '모든 질문', rule: '조건 없음', filter: all },
      { key: 'waiting', label: '확인 대기', rule: '상태 = 대기', filter: (r) => r.values.status === '대기' },
      { key: 'mine', label: '내가 담당', rule: `담당 = ${me}`, filter: (r) => r.values.assignee === me },
    ],
    sorts: [
      { label: '기본 순서', key: null, dir: 1 },
      { label: '번호 순', key: 'id', dir: 1 },
    ],
    lock: (r) => (r.values.status === '답변함' ? '답변한 질문은 결정 기록으로 남아 읽기 전용입니다. 다시 다루려면 새 질문을 여세요.' : null),
    guarded: { field: 'status', value: '답변함' },
  },
  {
    key: 'members', label: '구성원', noun: '구성원', icon: Users, groupBy: 'role',
    fields: [
      { key: 'name', label: '이름', type: 'person', width: 160 },
      { key: 'role', label: '역할', type: 'select', width: 120, options: { '학교 관리자': 'purple', '교사': 'blue' } },
      { key: 'last', label: '최근 접속', type: 'text', width: 112 },
    ],
    rows: MEMBERS.map((m, i) => ({ id: `member-${i}`, values: { name: m.name, role: m.role, last: m.last } })),
    views: [
      { key: 'all', label: '모든 구성원', rule: '조건 없음', filter: all },
      { key: 'teachers', label: '교사', rule: '역할 = 교사', filter: (r) => r.values.role === '교사' },
    ],
    sorts: [
      { label: '기본 순서', key: null, dir: 1 },
      { label: '이름 가나다순', key: 'name', dir: 1 },
    ],
    lock: () => null,
    footNote: `좌석 ${SCHOOL.seats.used} / ${SCHOOL.seats.total} 사용`,
  },
];

/** 행 번호·선택 칸 폭(px). CSS의 고정 열 left 값과 같아야 한다. */
const NUM_COL = 84;
const ROW_HEIGHTS = [{ key: 'short', label: '낮게' }, { key: 'medium', label: '보통' }] as const;
type RowHeight = (typeof ROW_HEIGHTS)[number]['key'];

/** 원형 7. 데이터 그리드형 — 표 탭 + 보기 목록 + 도구 막대 + 첫 열 고정 격자 + 행 펼침. */
export default function Grid() {
  const uid = useId();
  const [tableKey, setTableKey] = useState(TABLES[0].key);
  const [viewKey, setViewKey] = useState(TABLES[0].views[0].key);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [sortIdx, setSortIdx] = useState(0);
  const [rowHeight, setRowHeight] = useState<RowHeight>('short');
  const [query, setQuery] = useState('');
  const [hiddenOpts, setHiddenOpts] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, Cell>>>({});
  const [scrolled, setScrolled] = useState(false);
  const [toast, setToast] = useState('');

  const trigger = useRef<HTMLElement | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const table = TABLES.find((t) => t.key === tableKey) ?? TABLES[0];
  const view = table.views.find((v) => v.key === viewKey) ?? table.views[0];
  const groupField = table.fields.find((f) => f.key === table.groupBy) ?? table.fields[0];
  const primary = table.fields[0];
  const sort = table.sorts[sortIdx] ?? table.sorts[0];
  const withEdits = (t: Table) => t.rows.map((r) => ({ ...r, values: { ...r.values, ...edits[`${t.key}:${r.id}`] } }));
  const records = withEdits(table);
  const q = query.trim().toLowerCase();

  const filtered = records
    .filter(view.filter)
    .filter((r) => !hiddenOpts.includes(String(r.values[table.groupBy])))
    .filter((r) => !q || Object.values(r.values).some((v) => String(v).toLowerCase().includes(q)));
  const rows = sort.key
    ? [...filtered].sort((a, b) => {
        const x = a.values[sort.key as string]; const y = b.values[sort.key as string];
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')) * sort.dir;
      })
    : filtered;
  const groups = Object.keys(groupField.options ?? {})
    .map((opt) => ({ opt, rows: rows.filter((r) => r.values[table.groupBy] === opt) }))
    .filter((g) => g.rows.length > 0);
  const ordered = grouped ? groups.flatMap((g) => g.rows) : rows;
  const sumFields = table.fields.filter((f) => f.sum);
  const sumOf = (list: Rec[], key: string) => list.reduce((n, r) => n + (Number(r.values[key]) || 0), 0);
  const visibleIds = ordered.map((r) => r.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => checked.includes(id));
  const someChecked = visibleIds.some((id) => checked.includes(id));
  const filterCount = (view.key === table.views[0].key ? 0 : 1) + (hiddenOpts.length > 0 ? 1 : 0);
  const colCount = table.fields.length + 2;
  const openRec = expanded ? records.find((r) => r.id === expanded) : undefined;

  function switchTable(key: string) {
    const t = TABLES.find((x) => x.key === key) ?? TABLES[0];
    setTableKey(t.key); setViewKey(t.views[0].key); setSortIdx(0); setHiddenOpts([]);
    setChecked([]); setCollapsed([]); setQuery(''); setFilterOpen(false);
  }
  function onTabKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const i = TABLES.findIndex((t) => t.key === tableKey);
    const to = e.key === 'ArrowRight' ? (i + 1) % TABLES.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABLES.length) % TABLES.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? TABLES.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    switchTable(TABLES[to].key);
    tabRefs.current.get(TABLES[to].key)?.focus();
  }
  function openRecord(id: string, from: HTMLElement) { trigger.current = from; setFilterOpen(false); setExpanded(id); }
  function closeRecord() {
    setExpanded(null);
    requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); });
  }
  function save(rec: Rec, values: Record<string, Cell>) {
    setEdits((e) => ({ ...e, [`${table.key}:${rec.id}`]: { ...e[`${table.key}:${rec.id}`], ...values } }));
    setToast(`‘${values[primary.key] ?? rec.values[primary.key]}’ 기록을 고쳤습니다. 시안이라 이 화면에서만 반영됩니다.`);
    closeRecord();
  }
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent) { if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false); }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setFilterOpen(false);
      filterRef.current?.querySelector('button')?.focus();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [filterOpen]);

  function renderRow(r: Rec, n: number) {
    const locked = table.lock(r) !== null;
    const isChecked = checked.includes(r.id);
    const name = String(r.values[primary.key]);
    return (
      <tr key={r.id} className={s.row} data-checked={isChecked || undefined}
        onDoubleClick={(e) => openRecord(r.id, e.currentTarget.querySelector('button') ?? e.currentTarget)}>
        <td className={s.numCell}>
          <span className={s.numInner}>
            <input type="checkbox" className={s.check} checked={isChecked} aria-label={`${name} 선택`}
              onChange={() => setChecked((c) => toggle(c, r.id))} />
            <span className={s.rowNo} aria-hidden="true">{n}</span>
            <button type="button" className={s.expand} aria-label={`${name} 펼치기`} aria-haspopup="dialog" title="기록 펼치기"
              onClick={(e) => openRecord(r.id, e.currentTarget)}>
              <Maximize2 size={12} aria-hidden="true" />
            </button>
          </span>
        </td>
        {table.fields.map((f, i) => {
          const cls = [s.cell, i === 0 && s.frozen, (f.type === 'number') && s.num].filter(Boolean).join(' ');
          const content = (
            <>
              <CellView f={f} v={r.values[f.key]} />
              {i === 0 && locked && <span className={s.lockMark} title="읽기 전용"><Lock size={11} aria-hidden="true" /><span className={s.srOnly}>, 읽기 전용</span></span>}
            </>
          );
          return i === 0
            ? <th key={f.key} scope="row" className={cls}><span className={s.primaryCell}>{content}</span></th>
            : <td key={f.key} className={cls}>{content}</td>;
        })}
        <td className={s.fill} aria-hidden="true" />
      </tr>
    );
  }

  let rowNo = 0;
  return (
    <div className={s.root}>
      <div className={s.shell} inert={Boolean(openRec)}>
        {/* 상단 띠: 기반 이름 + 표 탭 */}
        <header className={s.band}>
          <div className={s.bandTop}>
            <span className={s.mark} aria-hidden="true"><Table2 size={15} /></span>
            <h1 className={s.base}>2학기 학사 운영<small>{SCHOOL.name} · {SCHOOL.term} {SCHOOL.week}</small></h1>
            <span className={s.bandUser}>
              <span className={s.avatar} aria-hidden="true">{SCHOOL.user.initial}</span>
              <span className={s.bandUserText}>{SCHOOL.user.name} · {SCHOOL.user.role}</span>
            </span>
          </div>
          <div className={s.tabs} role="tablist" aria-label="표">
            {TABLES.map((t) => (
              <button key={t.key} type="button" role="tab" id={`${uid}-tab-${t.key}`} aria-controls={`${uid}-panel`}
                aria-selected={t.key === tableKey} tabIndex={t.key === tableKey ? 0 : -1} className={s.tab}
                ref={(el) => { if (el) tabRefs.current.set(t.key, el); else tabRefs.current.delete(t.key); }}
                onClick={() => switchTable(t.key)} onKeyDown={onTabKey}>
                <t.icon size={14} aria-hidden="true" />{t.label}<span className={s.tabCount}>{t.rows.length}</span>
              </button>
            ))}
          </div>
        </header>

        <div className={s.body} id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${table.key}`} data-sidebar={sidebarOpen ? 'open' : 'closed'}>
          {sidebarOpen && (
            <aside className={s.views} id={`${uid}-views`} aria-label={`${table.label} 보기 목록`}>
              <h2 className={s.viewsHead}>보기</h2>
              <ul>
                {table.views.map((v) => {
                  const n = withEdits(table).filter(v.filter).length;
                  return (
                    <li key={v.key}>
                      <button type="button" className={s.viewItem} aria-current={v.key === view.key ? 'page' : undefined}
                        onClick={() => { setViewKey(v.key); setChecked([]); }}>
                        <Table2 size={14} aria-hidden="true" /><span>{v.label}</span><span className={s.viewCount}>{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className={s.viewRule}>
                <h3>보기 조건</h3>
                <p>{view.rule}</p>
              </div>
            </aside>
          )}

          <section className={s.main} aria-label={`${table.label} · ${view.label}`}>
            {/* 도구 막대 */}
            <div className={s.toolbar}>
              <button type="button" className={`${s.tool} ${s.sideToggle}`} aria-expanded={sidebarOpen} aria-controls={`${uid}-views`}
                aria-label={sidebarOpen ? '보기 목록 접기' : '보기 목록 펼치기'} onClick={() => setSidebarOpen((o) => !o)}>
                {sidebarOpen ? <PanelLeftClose size={15} aria-hidden="true" /> : <PanelLeftOpen size={15} aria-hidden="true" />}
              </button>
              <h2 className={s.viewName}><Table2 size={14} aria-hidden="true" />{view.label}</h2>
              <span className={s.sep} aria-hidden="true" />

              <div className={s.popWrap} ref={filterRef}>
                <button type="button" className={s.tool} aria-expanded={filterOpen} aria-controls={`${uid}-filter`}
                  data-active={filterCount > 0 || undefined} onClick={() => setFilterOpen((o) => !o)}>
                  <ListFilter size={14} aria-hidden="true" />필터{filterCount > 0 && <span className={s.toolBadge}>{filterCount}</span>}
                </button>
                {filterOpen && (
                  <div className={s.popover} id={`${uid}-filter`} role="group" aria-label="필터">
                    <p className={s.popRule}><b>보기 조건</b>{view.rule}</p>
                    <fieldset className={s.popSet}>
                      <legend>{groupField.label}</legend>
                      {Object.keys(groupField.options ?? {}).map((opt) => (
                        <label key={opt} className={s.popRow}>
                          <input type="checkbox" checked={!hiddenOpts.includes(opt)} onChange={() => setHiddenOpts((h) => toggle(h, opt))} />
                          <span className={s.pill} data-hue={groupField.options?.[opt]}>{opt}</span>
                          <span className={s.popCount}>{records.filter((r) => r.values[table.groupBy] === opt).length}</span>
                        </label>
                      ))}
                    </fieldset>
                    {hiddenOpts.length > 0 && <button type="button" className={s.linkBtn} onClick={() => setHiddenOpts([])}>필터 지우기</button>}
                  </div>
                )}
              </div>

              <button type="button" className={s.tool} data-active={sort.key ? true : undefined}
                onClick={() => setSortIdx((i) => (i + 1) % table.sorts.length)} title="누를 때마다 다음 정렬로 바뀝니다">
                <ArrowDownWideNarrow size={14} aria-hidden="true" />{sort.key ? `정렬: ${sort.label}` : '정렬'}
              </button>
              <button type="button" className={s.tool} aria-pressed={grouped} onClick={() => setGrouped((g) => !g)}>
                <Group size={14} aria-hidden="true" />묶기{grouped && `: ${groupField.label}`}
              </button>
              <button type="button" className={s.tool} onClick={() => setRowHeight((h) => (h === 'short' ? 'medium' : 'short'))}>
                <Rows3 size={14} aria-hidden="true" />행 높이<span className={s.srOnly}>: </span><span className={s.toolValue}>{ROW_HEIGHTS.find((h) => h.key === rowHeight)?.label}</span><span className={s.srOnly}>. 바꾸기</span>
              </button>

              {checked.length > 0 && (
                <span className={s.selection}>
                  {checked.length}개 선택
                  <button type="button" className={s.linkBtn} onClick={() => setChecked([])}>해제</button>
                </span>
              )}

              <label className={s.search}>
                <Search size={14} aria-hidden="true" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${table.noun} 검색`} aria-label={`${table.noun} 검색`} />
              </label>
            </div>

            {/* 격자 */}
            <div className={s.scroller} data-scrolled={scrolled || undefined}
              onScroll={(e) => { const x = e.currentTarget.scrollLeft > 0; if (x !== scrolled) setScrolled(x); }}>
              <table className={s.table} data-height={rowHeight} aria-label={`${table.label} 표, ${view.label} 보기`}
                style={{ width: NUM_COL + table.fields.reduce((n, f) => n + f.width, 0) }}>
                <colgroup>
                  <col className={s.numCol} />
                  {table.fields.map((f) => <col key={f.key} style={{ width: f.width }} />)}
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={s.numCell}>
                      <span className={s.numInner}>
                        <input type="checkbox" className={s.check} checked={allChecked} aria-label="보이는 기록 모두 선택"
                          ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                          onChange={() => setChecked(allChecked ? checked.filter((id) => !visibleIds.includes(id)) : [...new Set([...checked, ...visibleIds])])} />
                      </span>
                    </th>
                    {table.fields.map((f, i) => {
                      const Icon = TYPE_ICON[f.type];
                      return (
                        <th key={f.key} scope="col" className={[s.head, i === 0 && s.frozen, f.type === 'number' && s.num].filter(Boolean).join(' ')}
                          aria-sort={sort.key === f.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                          <span className={s.headInner}>
                            <Icon size={13} aria-hidden="true" className={s.typeIcon} />
                            <span className={s.headLabel}>{f.label}</span>
                            <span className={s.srOnly}>, {TYPE_LABEL[f.type]} 칸</span>
                            {sort.key === f.key && <ArrowDownWideNarrow size={12} aria-hidden="true" className={s.sortMark} data-dir={sort.dir} />}
                          </span>
                        </th>
                      );
                    })}
                    <td className={s.fill} aria-hidden="true" />
                  </tr>
                </thead>

                {ordered.length === 0 && (
                  <tbody>
                    <tr><td colSpan={colCount} className={s.empty}>
                      이 보기에 맞는 기록이 없습니다. <span className={s.emptyRule}>조건: {view.rule}{hiddenOpts.length > 0 && ` · ${groupField.label} 일부 숨김`}{q && ` · 검색 ‘${query}’`}</span>
                    </td></tr>
                  </tbody>
                )}

                {grouped
                  ? groups.map((g) => {
                      const isCollapsed = collapsed.includes(g.opt);
                      const start = rowNo; rowNo += g.rows.length;
                      return (
                        <tbody key={g.opt}>
                          <tr className={s.groupRow}>
                            <th scope="rowgroup" colSpan={colCount}>
                              <span className={s.groupInner}>
                                <button type="button" className={s.groupBtn} aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => toggle(c, g.opt))}>
                                  {isCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                                  <span className={s.groupField}>{groupField.label}</span>
                                  <span className={s.pill} data-hue={groupField.options?.[g.opt]}>{g.opt}</span>
                                  <span className={s.groupMeta}>{g.rows.length}개{sumFields[0] && ` · ${sumFields[0].label} ${sumOf(g.rows, sumFields[0].key)}${sumFields[0].suffix ?? ''}`}</span>
                                </button>
                              </span>
                            </th>
                          </tr>
                          {!isCollapsed && g.rows.map((r, i) => renderRow(r, start + i + 1))}
                        </tbody>
                      );
                    })
                  : <tbody>{rows.map((r, i) => renderRow(r, i + 1))}</tbody>}

                <tfoot>
                  <tr className={s.footRow}>
                    <td className={s.numCell} />
                    {table.fields.map((f, i) => (i === 0
                      ? <th key={f.key} scope="row" className={`${s.cell} ${s.frozen}`}>{ordered.length}개 기록{table.footNote && <span className={s.footNote}> · {table.footNote}</span>}</th>
                      : <td key={f.key} className={`${s.cell} ${f.type === 'number' ? s.num : ''}`}>
                          {f.sum && <><span className={s.footLabel}>합계</span> {sumOf(ordered, f.key)}{f.suffix}</>}
                        </td>))}
                    <td className={s.fill} aria-hidden="true" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div className={s.toast} role="status" aria-live="polite">{toast && <span>{toast}</span>}</div>

      {openRec && <RecordSheet table={table} rec={openRec} onClose={closeRecord} onSave={save} onNote={setToast} />}
    </div>
  );
}

function CellView({ f, v }: { f: Field; v: Cell | undefined }) {
  if (v === undefined || v === '') return <><span aria-hidden="true" className={s.blank}>—</span><span className={s.srOnly}>비어 있음</span></>;
  switch (f.type) {
    case 'select':
      return <span className={s.pill} data-hue={f.options?.[String(v)] ?? 'gray'}>{v}</span>;
    case 'number':
      return <span>{v}<span className={s.unit}>{f.suffix}</span></span>;
    case 'person':
      return <span className={s.person}><span className={s.avatar} aria-hidden="true">{String(v).slice(0, 1)}</span><span className={s.ellipsis}>{v}</span></span>;
    case 'progress': {
      const pct = Math.max(0, Math.min(100, Number(v)));
      return (
        <span className={s.progress}>
          <span className={s.track} aria-hidden="true"><span className={s.bar} data-full={pct >= 100 || undefined} style={{ width: `${pct}%` }} /></span>
          <span className={s.pct}>{pct}%</span>
        </span>
      );
    }
    case 'id':
      return <span className={s.mono}>{v}</span>;
    default:
      return <span className={s.ellipsis}>{v}</span>;
  }
}

function RecordSheet({ table, rec, onClose, onSave, onNote }: {
  table: Table; rec: Rec; onClose: () => void; onSave: (rec: Rec, values: Record<string, Cell>) => void; onNote: (text: string) => void;
}) {
  const uid = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lock = table.lock(rec);
  const primary = table.fields[0];
  const recId = rec.values.id;

  useEffect(() => { closeRef.current?.focus(); }, []);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const values: Record<string, Cell> = {};
    for (const f of table.fields) {
      if (f.type === 'id') continue;
      const raw = data.get(f.key);
      if (raw === null) continue;
      if (f.type === 'number' || f.type === 'progress') {
        const n = Number(raw);
        values[f.key] = Number.isFinite(n) && raw !== '' ? n : rec.values[f.key];
      } else values[f.key] = String(raw).trim() || rec.values[f.key];
    }
    onSave(rec, values);
  }

  return (
    <>
      <div className={s.scrim} onMouseDown={onClose} aria-hidden="true" />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} ref={sheetRef} onKeyDown={onKeyDown}>
        <header className={s.sheetHead}>
          <span className={s.sheetCrumb}><table.icon size={13} aria-hidden="true" />{table.label}{recId !== undefined && <span className={s.mono}>{recId}</span>}</span>
          <button type="button" ref={closeRef} className={s.iconBtn} onClick={onClose} aria-label="기록 닫기" title="닫기 (Esc)"><X size={15} aria-hidden="true" /></button>
        </header>
        <div className={s.sheetBody}>
          <h2 id={`${uid}-title`} className={s.sheetTitle}>{String(rec.values[primary.key])}</h2>

          {lock ? (
            <div className={s.lockNote} role="note">
              <Lock size={16} aria-hidden="true" />
              <div><b>읽기 전용 기록</b><p>{lock}</p></div>
            </div>
          ) : (
            <div className={s.editNote} role="note">
              <Pencil size={14} aria-hidden="true" />
              <p>칸을 고칠 수 있는 기록입니다. 시안이라 저장한 값은 이 화면에서만 반영됩니다.
                {table.guarded && ` ‘${table.guarded.value}’은 칸 편집이 아니라 별도 확정 절차로만 바꿉니다.`}</p>
            </div>
          )}

          {lock ? (
            <dl className={s.fields}>
              {table.fields.map((f) => {
                const Icon = TYPE_ICON[f.type];
                return (
                  <div key={f.key} className={s.fieldRow}>
                    <dt><Icon size={13} aria-hidden="true" />{f.label}</dt>
                    <dd><CellView f={f} v={rec.values[f.key]} /></dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <form id={`${uid}-form`} className={s.fields} onSubmit={submit}>
              {table.fields.map((f) => {
                const Icon = TYPE_ICON[f.type];
                const id = `${uid}-f-${f.key}`;
                const v = rec.values[f.key];
                return (
                  <div key={f.key} className={s.fieldRow}>
                    <label htmlFor={id}><Icon size={13} aria-hidden="true" />{f.label}</label>
                    {f.type === 'select' ? (
                      <select id={id} name={f.key} defaultValue={String(v)} className={s.input}>
                        {Object.keys(f.options ?? {}).map((opt) => {
                          const guarded = table.guarded?.field === f.key && table.guarded.value === opt && opt !== v;
                          return <option key={opt} value={opt} disabled={guarded}>{guarded ? `${opt} (별도 확정 절차)` : opt}</option>;
                        })}
                      </select>
                    ) : f.type === 'id' ? (
                      <input id={id} className={s.input} value={String(v)} readOnly aria-describedby={`${id}-hint`} />
                    ) : (
                      <input id={id} name={f.key} className={s.input} defaultValue={String(v ?? '')}
                        type={f.type === 'number' || f.type === 'progress' ? 'number' : 'text'}
                        min={f.type === 'number' || f.type === 'progress' ? 0 : undefined} max={f.type === 'progress' ? 100 : undefined}
                        inputMode={f.type === 'number' || f.type === 'progress' ? 'numeric' : undefined} />
                    )}
                    {f.type === 'id' && <small id={`${id}-hint`} className={s.hint}>고유 번호는 바꿀 수 없습니다.</small>}
                  </div>
                );
              })}
            </form>
          )}
        </div>
        <footer className={s.sheetFoot}>
          {lock ? (
            <>
              {table.key === 'courses' && (
                <button type="button" className={s.secondary}
                  onClick={() => onNote('시안이라 정정 판을 만들지 않습니다. 정정 판은 이 확정 판을 가리키는 새 판으로 추가됩니다.')}>
                  정정 판 만들기
                </button>
              )}
              <button type="button" className={s.ghost} onClick={onClose}>닫기</button>
            </>
          ) : (
            <>
              <button type="submit" form={`${uid}-form`} className={s.primary}>저장</button>
              <button type="button" className={s.ghost} onClick={onClose}>취소</button>
            </>
          )}
        </footer>
      </div>
    </>
  );
}
