import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listSchoolLevels } from '@/lib/people';
import { codes } from '@/lib/foundation';
import { attendanceSummary } from '@/lib/attendance';
import { calendarMonth, levelRegister, yearOfDay } from '@/lib/register';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { AttendanceRegister } from '@/components/AttendanceRegister';

const CAL: Record<string, string> = { instructional: '수업일', holiday: '휴일', non_instructional: '수업 없는 날', event: '행사' };
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const label = (l: Record<string, string>, code: string) => l.ko ?? l.en ?? code;

/** 74차: 출결 — 하루 출결부(학교급 × 날짜), 수업일 달력, 기간 요약(재적 수업일 분모·만성 결석·출석 2/3) */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ day?: string; level?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const day = isDay(sp.day) ? sp.day! : today;
  const data = await loadForPage(async ({ db, school }) => {
    const levels = await listSchoolLevels(db, school.id);
    const level = levels.find((l) => l.id === sp.level) ?? levels[0] ?? null;
    const year = await yearOfDay(db, school.id, day);
    const from = isDay(sp.from) ? sp.from! : year?.starts_on ?? day;
    const to = isDay(sp.to) ? sp.to! : day;
    const rows = level ? await levelRegister(db, school.id, level.id, day) : [];
    const month = await calendarMonth(db, school.id, day.slice(0, 7));
    const summaries = level && to > from
      ? await Promise.all(rows.map(async (r) => ({ ...r, s: await attendanceSummary(db, school.id, r.person_id, from, to) })))
      : [];
    return {
      levels, level, year, from, to, rows, month, summaries,
      kinds: (await codes(db, school.id, 'attendance_kind', day)).filter((c) => c.attrs?.period_level !== true),
      reasons: await codes(db, school.id, 'attendance_reason', day),
    };
  }, { module: 'records' });
  const { school, levels, level, year, from, to, rows, month, summaries, kinds, reasons } = data;
  const admin = school.isAdmin;
  const cal = month.find((m) => m.day === day);
  const closedDay = cal && cal.kind !== 'instructional' ? `${day}은(는) ${CAL[cal.kind]}${cal.label ? `(${cal.label})` : ''}이라 출결을 받지 않습니다.` : undefined;
  const kindOpts = [{ value: 'present', label: '출석' }, ...kinds.map((k) => ({ value: k.code, label: label(k.label, k.code) }))];
  const reasonOpts = reasons.map((r) => ({ value: r.code, label: label(r.label, r.code) }));
  const kindName = Object.fromEntries(kindOpts.map((k) => [k.value, k.label]));
  const q = (extra: Record<string, string>) => `/attendance?${new URLSearchParams({ day, ...(level ? { level: level.id } : {}), ...extra })}`;
  const marked = rows.filter((r) => r.kind_code).length;
  return (
    <>
      <PageHeader title="출결" crumbs={[{ label: '학사 운영' }, { label: '출결' }]}
        description="하루 출결은 사건으로 쌓이고, 고치면 앞 사건을 가리키는 새 사건이 됩니다. 출결 종류·사유는 학교 코드이고, 요약의 분모는 재적 중인 수업일입니다."
        meta={<><span>{day}</span>{level && <span>{level.name} {marked}/{rows.length} 입력</span>}{year && <span>{year.label} 학년도</span>}</>} />
      {!levels.length && <section className="card"><p className="muted">학교 구조에서 학교급을 먼저 만드세요. <Link href="/academics">학교 구조로</Link></p></section>}
      {level && (
        <section className="card stack" data-testid="attendance-day">
          <form className="row-wrap" action="/attendance">
            <label>날짜<input type="date" name="day" defaultValue={day} /></label>
            <label>학교급<select name="level" defaultValue={level.id}>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <button className="btn btn-sm" type="submit">보기</button>
          </form>
          <h2>{day} · {level.name} 출결부 {cal ? <StatusBadge tone={cal.kind === 'instructional' ? 'success' : 'neutral'}>{CAL[cal.kind]}{cal.half_day ? ' · 반일' : ''}</StatusBadge> : <StatusBadge tone="neutral">달력 미지정</StatusBadge>}</h2>
          {!cal && <p className="fine">이날은 수업일 달력에 없습니다. 출결은 받지만, 요약 분모(수업일 수)에는 달력에 수업일로 넣은 날만 셉니다.</p>}
          <AttendanceRegister key={`${day}:${level.id}`} day={day} rows={rows} kinds={kindOpts} reasons={reasonOpts} disabled={closedDay} />
        </section>
      )}
      {level && (
        <section className="card stack" data-testid="attendance-summary">
          <h2>기간 요약</h2>
          <form className="row-wrap" action="/attendance">
            <input type="hidden" name="day" value={day} /><input type="hidden" name="level" value={level.id} />
            <label>시작<input type="date" name="from" defaultValue={from} /></label>
            <label>끝(그날 제외)<input type="date" name="to" defaultValue={to} /></label>
            <button className="btn btn-sm" type="submit">요약</button>
          </form>
          {summaries.length === 0 ? <p className="muted">{to > from ? '이날 재학생이 없습니다.' : '끝 날짜가 시작보다 뒤여야 합니다.'}</p> : (
            <div className="table-wrap"><table className="grid-table">
              <thead><tr><th scope="col">학생</th><th scope="col">재적 수업일</th><th scope="col">결석 환산</th><th scope="col">출석률</th><th scope="col">종류별</th><th scope="col">판정</th></tr></thead>
              <tbody>{summaries.map(({ person_id, name, s }) => (
                <tr key={person_id}><th scope="row">{name}</th><td>{s.enrolled_days}</td><td>{s.absent_days}</td>
                  <td>{s.attendance_rate == null ? '-' : `${Math.round(s.attendance_rate * 1000) / 10}%`}</td>
                  <td>{Object.entries(s.counts).map(([k, n]) => `${kindName[k] ?? k} ${n}`).join(' · ') || '-'}</td>
                  <td>{s.chronic_absence ? <StatusBadge tone="danger">만성 결석</StatusBadge> : null}{!s.meets_min_attendance ? <StatusBadge tone="danger">출석 기준 미달</StatusBadge> : null}{!s.chronic_absence && s.meets_min_attendance ? <StatusBadge tone="success">기준 충족</StatusBadge> : null}</td>
                </tr>))}</tbody></table></div>)}
          {summaries[0] && <p className="fine">만성 결석: 결석 환산 ≥ 재적 수업일의 {Math.round(summaries[0].s.thresholds.chronic_ratio * 100)}% · 출석 기준: 출석 ≥ {Math.round(summaries[0].s.thresholds.min_attendance_ratio * 1000) / 10}% (성적 정책 판 policy.attendance)</p>}
        </section>
      )}
      <section className="card stack" data-testid="calendar">
        <h2>수업일 달력 <small className="muted">{day.slice(0, 7)}</small></h2>
        <p className="fine"><Link href={q({ day: shiftMonth(day, -1) })}>← 지난달</Link> · <Link href={q({ day: shiftMonth(day, 1) })}>다음달 →</Link></p>
        {month.length === 0 ? <p className="muted">이 달에 정한 날이 없습니다.</p> : (
          <ul className="issue-list" data-testid="calendar-days">{month.map((m) => (
            <li key={m.day}><span><Link href={q({ day: m.day })}>{m.day}</Link> {CAL[m.kind]}{m.half_day ? ' · 반일' : ''}{m.label ? ` · ${m.label}` : ''}</span></li>))}</ul>)}
        {admin && (year
          ? <ActionForm url="/api/attendance" action="calendar" inline submitLabel="달력에 넣기" successText="수업일 달력을 저장했습니다." testId="calendar-form"
              fields={[{ name: 'from', label: '시작', type: 'date', required: true, defaultValue: day }, { name: 'to', label: '끝(포함)', type: 'date', required: true, defaultValue: day },
                { name: 'kind', label: '종류', type: 'select', options: Object.entries(CAL).map(([value, l]) => ({ value, label: l })) },
                { name: 'skipWeekends', label: '주말 빼기', type: 'select', options: [{ value: 'yes', label: '예' }, { value: 'no', label: '아니오' }] },
                { name: 'halfDay', label: '반일', type: 'select', options: [{ value: 'no', label: '아니오' }, { value: 'yes', label: '예' }] },
                { name: 'label', label: '이름(선택)', placeholder: '개교기념일' }]} />
          : <p className="fine">이 날짜가 든 학년도가 없습니다. <Link href="/academics">학교 구조</Link>에서 학년도를 먼저 만드세요.</p>)}
      </section>
    </>
  );
}

function shiftMonth(day: string, by: number) {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}
