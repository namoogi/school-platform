'use client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { useId, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, Database, Ellipsis, FileText, GraduationCap, Inbox, Info,
  LayoutGrid, Minus, RefreshCw, Settings, TrendingUp, TriangleExclamationPoint, Users,
} from 'lucide-react';
import { ACTIVITY, COURSES, EVENTS, KPI, SCHOOL, SOURCES, TREND, toneLabel, type Course, type Tone } from './data';
import s from './analytics.module.css';

type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
type RangeKey = '4w' | '8w' | 'term';
type Level = '전체' | '중' | '고';
type Series = (number | null)[];
type Slice = { weeks: string[]; rows: Series; opened: Series; closed: Series };

const RANGES: { key: RangeKey; label: string; long: string }[] = [
  { key: '4w', label: '4주', long: '최근 4주' },
  { key: '8w', label: '8주', long: '최근 8주' },
  { key: 'term', label: '학기', long: '학기 전체' },
];
const LEVELS: Level[] = ['전체', '중', '고'];

const NAV: { label: string; icon: IconType; current?: boolean }[] = [
  { label: '운영 현황', icon: LayoutGrid, current: true },
  { label: '질문', icon: Inbox },
  { label: '자료', icon: Database },
  { label: '수업·성적', icon: GraduationCap },
  { label: '발행 문서', icon: FileText },
  { label: '구성원', icon: Users },
];

const TONE_ICON: Record<Tone, IconType> = {
  neutral: Minus, info: Info, success: CircleCheck, warning: TriangleExclamationPoint, danger: TriangleExclamationPoint,
};

/** TREND를 기간에 맞게 자른다. 학기는 1주부터 그리되, 집계가 없는 앞 주는 null(빈 칸)로 둔다. */
function sliceTrend(range: RangeKey): Slice {
  if (range === '4w') return { weeks: TREND.weeks.slice(-4), rows: TREND.rows.slice(-4), opened: TREND.opened.slice(-4), closed: TREND.closed.slice(-4) };
  if (range === '8w') return { weeks: [...TREND.weeks], rows: [...TREND.rows], opened: [...TREND.opened], closed: [...TREND.closed] };
  const first = parseInt(TREND.weeks[0], 10);
  const pad = Array.from({ length: Math.max(first - 1, 0) }, (_, i) => `${i + 1}주`);
  const nulls = pad.map(() => null);
  return { weeks: [...pad, ...TREND.weeks], rows: [...nulls, ...TREND.rows], opened: [...nulls, ...TREND.opened], closed: [...nulls, ...TREND.closed] };
}

const known = (v: Series) => v.filter((x): x is number => x !== null);
const sum = (v: Series) => known(v).reduce((n, x) => n + x, 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const two = (n: number) => String(n).padStart(2, '0');

function niceScale(maxVal: number, steps = 4) {
  const raw = Math.max(maxVal, 1) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag);
  const max = step * Math.ceil(Math.max(maxVal, 1) / step);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

/** 원형 4. 분석 대시보드형 — 상단 전역 필터 하나로 모든 패널이 같은 기간을 다시 자른다. */
export default function Analytics() {
  const [range, setRange] = useState<RangeKey>('8w');
  const [level, setLevel] = useState<Level>('전체');
  const [updated, setUpdated] = useState(`${SCHOOL.today} 기준`);
  const [refreshing, setRefreshing] = useState(false);
  const data = useMemo(() => sliceTrend(range), [range]);
  const r = RANGES.find((x) => x.key === range)!;
  const courses = COURSES.filter((c) => level === '전체' || c.level === level);

  function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => {
      const d = new Date();
      setUpdated(`방금 갱신 · ${two(d.getHours())}:${two(d.getMinutes())}`);
      setRefreshing(false);
    }, 600);
  }

  const kq = KPI.find((k) => k.key === 'questions')!;
  const kr = KPI.find((k) => k.key === 'rows')!;
  const kc = KPI.find((k) => k.key === 'courses')!;
  const ks = KPI.find((k) => k.key === 'seats')!;
  const closedCourses = courses.filter((c) => c.status === '마감 판 확정').length;
  const levelNote = level === '전체' ? undefined : '학교급 구분이 없는 자료입니다';

  return (
    <div className={s.root}>
      <nav className={s.rail} aria-label="전역 메뉴">
        <span className={s.mark} aria-hidden="true">{SCHOOL.short.slice(0, 1)}</span>
        <ul>
          {NAV.map((n) => (
            <li key={n.label}>
              <button type="button" className={s.railBtn} aria-label={n.label} aria-current={n.current ? 'page' : undefined}>
                <n.icon size={20} aria-hidden="true" />
                <span className={s.tip} aria-hidden="true">{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={`${s.railBtn} ${s.railEnd}`} aria-label="설정">
          <Settings size={20} aria-hidden="true" />
          <span className={s.tip} aria-hidden="true">설정</span>
        </button>
        <span className={s.avatar} title={`${SCHOOL.user.name} · ${SCHOOL.user.role}`}>
          <span aria-hidden="true">{SCHOOL.user.initial}</span>
          <span className={s.srOnly}>{SCHOOL.user.name} · {SCHOOL.user.role}</span>
        </span>
      </nav>

      <div className={s.main}>
        <header className={s.filters}>
          <div className={s.titleBlock}>
            <h1>학교 운영 현황</h1>
            <p>{SCHOOL.name} · {SCHOOL.term} · {SCHOOL.week}</p>
          </div>
          <div className={s.controls}>
            <div className={s.segment} role="group" aria-label="기간">
              {RANGES.map((x) => (
                <button key={x.key} type="button" aria-pressed={range === x.key} onClick={() => setRange(x.key)}>{x.label}</button>
              ))}
            </div>
            <label className={s.select}>
              <span>학교급</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                {LEVELS.map((l) => <option key={l} value={l}>{l === '전체' ? '전체' : `${l}학교`}</option>)}
              </select>
            </label>
            <button type="button" className={s.refresh} onClick={refresh} aria-busy={refreshing} data-spinning={refreshing ? 'true' : undefined}>
              <RefreshCw size={15} aria-hidden="true" />새로 고침
            </button>
            <span className={s.updated} role="status">{refreshing ? '갱신 중…' : updated}</span>
          </div>
        </header>

        <div className={s.grid}>
          <KpiPanel id="k-q" label={kq.label} value={kq.value} unit={kq.unit} tone={kq.tone} delta={kq.delta} deltaNote="지난주 대비"
            spark={data.opened} sparkLabel={`${r.long} 주별 열린 질문`} weeks={data.weeks}
            foot={`${kq.hint} · ${r.label} 열림 ${sum(data.opened)} / 닫힘 ${sum(data.closed)}`} />
          <KpiPanel id="k-r" label={kr.label} value={kr.value} unit={kr.unit} tone={kr.tone} delta={kr.delta} deltaNote="지난주 대비"
            spark={data.rows} sparkLabel={`${r.long} 주별 등록 행`} weeks={data.weeks}
            foot={`${kr.hint} · ${r.label} 합계 ${sum(data.rows)}행`} />
          <KpiPanel id="k-c" label={kc.label} value={String(closedCourses)} unit={`/ ${courses.length}`} tone={kc.tone}
            delta={`${pct(closedCourses, courses.length)}%`} deltaNote={level === '전체' ? '확정 비율' : `${level}학교 확정 비율`}
            meter={courses.length ? closedCourses / courses.length : 0} foot={kc.hint} />
          <KpiPanel id="k-s" label={ks.label} value={ks.value} unit={ks.unit} tone={ks.tone} delta={ks.delta} deltaNote="사용률"
            meter={SCHOOL.seats.used / SCHOOL.seats.total} foot={`${ks.hint} · 학교 전체`} />

          <Panel id="p-rows" area="line" title="주별 등록 행" sub={`${r.long} · 합계 ${sum(data.rows)}행`} note={levelNote}>
            <LineChart data={data} rangeLabel={r.long} />
          </Panel>
          <Panel id="p-q" area="bars" title="열린 질문 · 닫힌 질문" sub={`${r.long} · 열림 ${sum(data.opened)} · 닫힘 ${sum(data.closed)}`} note={levelNote}>
            <BarChart data={data} rangeLabel={r.long} />
          </Panel>

          <Panel id="p-courses" area="table" title="수업별 수강 현황" sub={level === '전체' ? `수업 ${courses.length}개` : `${level}학교 · 수업 ${courses.length}개`}>
            <CourseTable courses={courses} />
          </Panel>
          <Panel id="p-src" area="sources" title="등록 행 많은 자료" sub={`상위 ${Math.min(5, SOURCES.length)}개`} note={levelNote}>
            <TopSources />
          </Panel>
          <Panel id="p-act" area="activity" title="주석 · 활동" sub="최근 기록과 예정 마감">
            <Annotations />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ id, area, title, sub, note, children }: { id: string; area: string; title: string; sub?: string; note?: string; children: ReactNode }) {
  return (
    <section className={s.panel} data-area={area} aria-labelledby={`${id}-t`}>
      <header className={s.panelHead}>
        <h2 id={`${id}-t`}>{title}</h2>
        {sub && <span className={s.panelSub}>{sub}</span>}
        <button type="button" className={s.menuBtn} aria-label={`${title} 패널 메뉴`}><Ellipsis size={16} aria-hidden="true" /></button>
      </header>
      {note && <p className={s.note}><Info size={12} aria-hidden="true" />{note}</p>}
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}

function KpiPanel({ id, label, value, unit, tone, delta, deltaNote, spark, sparkLabel, weeks, meter, foot }: {
  id: string; label: string; value: string; unit: string; tone: Tone; delta: string; deltaNote: string;
  spark?: Series; sparkLabel?: string; weeks?: string[]; meter?: number; foot: string;
}) {
  const ToneIcon = TONE_ICON[tone];
  const up = delta.startsWith('+');
  return (
    <Panel id={id} area="kpi" title={label}>
      <div className={s.kpiTop}>
        <span className={s.kpiValue}><b className={s.num}>{value}</b><span className={s.kpiUnit}>{unit}</span></span>
        <span className={s.delta}>
          {up && <TrendingUp size={13} aria-hidden="true" />}
          <span className={s.num}>{delta}</span><span className={s.deltaNote}>{deltaNote}</span>
        </span>
      </div>
      {spark && (
        <>
          <Sparkline values={spark} />
          <span className={s.srOnly}>{sparkLabel}: {weeks?.map((w, i) => `${w} ${spark[i] ?? '집계 없음'}`).join(', ')}</span>
        </>
      )}
      {meter !== undefined && (
        <span className={s.meter} aria-hidden="true"><span style={{ width: `${Math.round(meter * 100)}%` }} /></span>
      )}
      <span className={s.kpiFoot}>
        <span className={s.tone} data-tone={tone}><ToneIcon size={12} aria-hidden="true" />{toneLabel[tone]}</span>
        <span className={s.kpiHint}>{foot}</span>
      </span>
    </Panel>
  );
}

function Sparkline({ values }: { values: Series }) {
  const pts = known(values);
  const W = 160; const H = 30;
  if (pts.length < 2) return <svg className={s.spark} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const min = Math.min(...pts); const max = Math.max(...pts);
  const x = (i: number) => (i / (pts.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg className={s.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line}L${x(pts.length - 1)},${H}L${x(0)},${H}Z`} className={s.sparkArea} />
      <path d={line} className={s.sparkLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 빗금 무늬: 색에 기대지 않고 계열을 구분한다. */
function Hatch({ id, kind }: { id: string; kind: 'closed' | 'empty' }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" className={kind === 'closed' ? s.hatchBg : s.emptyBg} />
      <line x1="0" y1="0" x2="0" y2="6" className={kind === 'closed' ? s.hatchLine : s.emptyLine} />
    </pattern>
  );
}

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

const M = { l: 40, r: 16, t: 18, b: 30 };

function LineChart({ data, rangeLabel }: { data: Slice; rangeLabel: string }) {
  const uid = useSvgId();
  const W = 640; const H = 270; const pw = W - M.l - M.r; const ph = H - M.t - M.b;
  const vals = known(data.rows);
  const { max, ticks } = niceScale(Math.max(...vals));
  const n = data.weeks.length;
  const step = n > 1 ? pw / (n - 1) : pw;
  const x = (i: number) => M.l + (n > 1 ? i * step : pw / 2);
  const y = (v: number) => M.t + ph - (v / max) * ph;
  const pts = data.rows.map((v, i) => (v === null ? null : { i, v }));
  const valid = pts.filter((p): p is { i: number; v: number } => p !== null);
  const line = valid.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = valid.length ? `${line}L${x(valid[valid.length - 1].i)},${y(0)}L${x(valid[0].i)},${y(0)}Z` : '';
  const lead = data.rows.findIndex((v) => v !== null);
  const avg = Math.round(sum(data.rows) / Math.max(valid.length, 1));
  const peak = valid.reduce((a, b) => (b.v > a.v ? b : a), valid[0]);
  const last = valid[valid.length - 1];

  return (
    <div className={s.chartWrap}>
      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>{`주별 등록 행 추이 (${rangeLabel})`}</title>
        <desc id={`${uid}-d`}>
          {`${peak === last ? `최근 주가 최고 ${last.v}행(${data.weeks[last.i]})` : `최고 ${peak.v}행(${data.weeks[peak.i]}), 최근 ${last.v}행(${data.weeks[last.i]})`}, 주 평균 ${avg}행.${lead > 0 ? ` ${data.weeks[0]}~${data.weeks[lead - 1]}는 집계 없음.` : ''}`}
        </desc>
        <defs><Hatch id={`${uid}-e`} kind="empty" /></defs>
        {lead > 0 && (
          <g>
            <rect x={M.l} y={M.t} width={x(lead - 1) + step / 2 - M.l} height={ph} fill={`url(#${uid}-e)`} className={s.emptyRect} />
            <text x={(M.l + x(lead - 1) + step / 2) / 2} y={M.t + ph / 2} textAnchor="middle" className={s.emptyText}>집계 없음</text>
          </g>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? s.axis : s.gridLine} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className={s.tick}>{t}</text>
          </g>
        ))}
        {data.weeks.map((w, i) => (
          <text key={w} x={x(i)} y={H - 10} textAnchor="middle" className={s.tick}>{w}</text>
        ))}
        <path d={area} className={s.area} />
        <line x1={x(valid[0].i)} x2={W - M.r} y1={y(avg)} y2={y(avg)} className={s.avgLine} />
        <text x={W - M.r} y={y(avg) - 6} textAnchor="end" className={s.avgText}>평균 {avg}</text>
        <path d={line} className={s.line} />
        {valid.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 4.5 : 3} className={p === last ? s.dotNow : s.dot} />
        ))}
        <text x={x(last.i) - 8} y={y(last.v) - 10} textAnchor="end" className={s.valueLabel}>{last.v}</text>
        {peak !== last && <text x={x(peak.i)} y={y(peak.v) - 10} textAnchor="middle" className={s.valueLabel}>{peak.v}</text>}
      </svg>
      <table className={s.srOnly}>
        <caption>주별 등록 행 ({rangeLabel})</caption>
        <thead><tr><th scope="col">주</th><th scope="col">등록 행</th></tr></thead>
        <tbody>{data.weeks.map((w, i) => <tr key={w}><th scope="row">{w}</th><td>{data.rows[i] ?? '집계 없음'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function BarChart({ data, rangeLabel }: { data: Slice; rangeLabel: string }) {
  const uid = useSvgId();
  const W = 520; const H = 254; const pw = W - M.l - M.r; const ph = H - M.t - M.b;
  const { max, ticks } = niceScale(Math.max(...known(data.opened), ...known(data.closed)));
  const n = data.weeks.length;
  const slot = pw / n;
  const bw = Math.min(16, (slot - 8) / 2);
  const y = (v: number) => M.t + ph - (v / max) * ph;
  const showValues = slot >= 30;

  return (
    <div className={s.chartWrap}>
      <ul className={s.legend} aria-label="범례">
        <li>
          <svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" className={s.barOpened} /></svg>
          열린 질문 <span className={s.legendHint}>(채움 · 왼쪽)</span>
        </li>
        <li>
          <svg width="14" height="14" aria-hidden="true">
            <defs><Hatch id={`${uid}-hl`} kind="closed" /></defs>
            <rect x="0.5" y="0.5" width="13" height="13" rx="2" fill={`url(#${uid}-hl)`} className={s.barClosed} />
          </svg>
          닫힌 질문 <span className={s.legendHint}>(빗금 · 오른쪽)</span>
        </li>
      </ul>
      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>{`주별 열린 질문과 닫힌 질문 (${rangeLabel})`}</title>
        <desc id={`${uid}-d`}>{`열린 질문 합계 ${sum(data.opened)}건, 닫힌 질문 합계 ${sum(data.closed)}건.`}</desc>
        <defs><Hatch id={`${uid}-h`} kind="closed" /></defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? s.axis : s.gridLine} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className={s.tick}>{t}</text>
          </g>
        ))}
        {data.weeks.map((w, i) => {
          const cx = M.l + slot * i + slot / 2;
          const o = data.opened[i]; const c = data.closed[i];
          return (
            <g key={w}>
              {o === null || c === null ? (
                <text x={cx} y={y(0) - 6} textAnchor="middle" className={s.emptyText}>–</text>
              ) : (
                <>
                  <rect x={cx - bw - 1} y={y(o)} width={bw} height={Math.max(y(0) - y(o), 0)} rx="1.5" className={s.barOpened} />
                  <rect x={cx + 1} y={y(c)} width={bw} height={Math.max(y(0) - y(c), 0)} rx="1.5" fill={`url(#${uid}-h)`} className={s.barClosed} />
                  {showValues && <text x={cx - bw / 2 - 1} y={y(o) - 5} textAnchor="middle" className={s.barValue}>{o}</text>}
                  {showValues && <text x={cx + bw / 2 + 1} y={y(c) - 5} textAnchor="middle" className={s.barValue}>{c}</text>}
                </>
              )}
              <text x={cx} y={H - 10} textAnchor="middle" className={s.tick}>{w}</text>
            </g>
          );
        })}
      </svg>
      <table className={s.srOnly}>
        <caption>주별 열린 질문·닫힌 질문 ({rangeLabel})</caption>
        <thead><tr><th scope="col">주</th><th scope="col">열린 질문</th><th scope="col">닫힌 질문</th></tr></thead>
        <tbody>{data.weeks.map((w, i) => <tr key={w}><th scope="row">{w}</th><td>{data.opened[i] ?? '집계 없음'}</td><td>{data.closed[i] ?? '집계 없음'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const STATUS_TONE: Record<Course['status'], Tone> = { '수강신청 중': 'neutral', '진행 중': 'info', '마감 판 확정': 'success' };

function CourseTable({ courses }: { courses: Course[] }) {
  const [sort, setSort] = useState<'none' | 'desc' | 'asc'>('none');
  const rate = (c: Course) => c.students / c.capacity;
  const rows = sort === 'none' ? courses : [...courses].sort((a, b) => (sort === 'desc' ? rate(b) - rate(a) : rate(a) - rate(b)));
  const next = { none: 'desc', desc: 'asc', asc: 'none' } as const;
  const SortIcon = sort === 'desc' ? ArrowDown : sort === 'asc' ? ArrowUp : ArrowUpDown;
  if (courses.length === 0) return <p className={s.empty}>이 학교급에는 수업이 없습니다.</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">수업</th>
            <th scope="col">급</th>
            <th scope="col">담당</th>
            <th scope="col">상태</th>
            <th scope="col" aria-sort={sort === 'none' ? 'none' : sort === 'desc' ? 'descending' : 'ascending'} className={s.rateCol}>
              <button type="button" className={s.sortBtn} onClick={() => setSort(next[sort])}>
                수강률<SortIcon size={12} aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const p = pct(c.students, c.capacity);
            const tone = STATUS_TONE[c.status];
            const Icon = TONE_ICON[tone];
            return (
              <tr key={c.id}>
                <td>
                  <span className={s.courseName}>{c.name}</span>
                  <span className={s.courseSub}><span className={s.num}>{c.id}</span> · {c.display}</span>
                </td>
                <td>{c.level}</td>
                <td>{c.teacher}</td>
                <td><span className={s.tone} data-tone={tone}><Icon size={12} aria-hidden="true" />{c.status}</span></td>
                <td className={s.rateCol}>
                  <span className={s.rate}>
                    <span className={s.rateBar} aria-hidden="true"><span style={{ width: `${p}%` }} data-full={p >= 100 ? 'true' : undefined} /></span>
                    <span className={s.num}>{c.students}/{c.capacity}</span>
                    <span className={`${s.num} ${s.ratePct}`}>{p}%</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopSources() {
  const top = [...SOURCES].sort((a, b) => b.rows - a.rows).slice(0, 5);
  const max = Math.max(...top.map((f) => f.rows));
  return (
    <ol className={s.sources}>
      {top.map((f, i) => (
        <li key={f.id}>
          <span className={`${s.rank} ${s.num}`}>{i + 1}</span>
          <span className={s.srcMain}>
            <span className={s.srcName}>{f.name}</span>
            <span className={s.srcMeta}>
              <span className={s.reader}>{f.reader}</span>{f.by} · {f.at}
              {f.review && <span className={s.tone} data-tone="warning"><TriangleExclamationPoint size={11} aria-hidden="true" />검토 필요</span>}
            </span>
            <span className={s.srcBar} aria-hidden="true"><span style={{ width: `${pct(f.rows, max)}%` }} /></span>
          </span>
          <span className={s.srcRows}><b className={s.num}>{f.rows}</b>행</span>
        </li>
      ))}
    </ol>
  );
}

function Annotations() {
  return (
    <div className={s.annot}>
      <h3>최근 기록</h3>
      <ol className={s.timeline}>
        {ACTIVITY.map((a) => (
          <li key={a.what}>
            <span className={s.tlDot} aria-hidden="true" />
            <span className={s.tlText}><b>{a.who}</b> {a.what}</span>
            <span className={s.tlWhen}>{a.when}</span>
          </li>
        ))}
      </ol>
      <h3>예정 주석</h3>
      <ol className={s.events}>
        {EVENTS.map((e) => (
          <li key={e.date + e.title}>
            <span className={`${s.evDate} ${s.num}`}>{e.date}<small>{e.day}</small></span>
            <span className={s.evTitle}>{e.title}</span>
            <span className={s.evKind} data-kind={e.kind === '마감' ? 'deadline' : 'event'}>{e.kind}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
