import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listSchoolLevels } from '@/lib/people';
import { codes } from '@/lib/foundation';
import { attendanceSummary } from '@/lib/attendance';
import { calendarMonth, levelRegister, yearOfDay } from '@/lib/register';
import { PageHeader, StatusBadge, withLink } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { AttendanceRegister } from '@/components/AttendanceRegister';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 날 종류 이름은 사전의 cal.kind.*
const CAL_KINDS = ['instructional', 'holiday', 'non_instructional', 'event'];
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

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
      levels, level, year, from, to, rows, month, summaries, uiLang: await userLang(db),
      kinds: (await codes(db, school.id, 'attendance_kind', day)).filter((c) => c.attrs?.period_level !== true),
      reasons: await codes(db, school.id, 'attendance_reason', day),
    };
  }, { module: 'records' });
  const { school, levels, level, year, from, to, rows, month, summaries, kinds, reasons, uiLang } = data;
  const admin = school.isAdmin;
  const { t, lang } = await getI18n(uiLang);
  const CAL = Object.fromEntries(CAL_KINDS.map((k) => [k, t(`cal.kind.${k}` as MsgKey)]));
  // 학교 코드 이름은 데이터의 언어 칸: 화면 언어 → 한국어 → 영어 → 코드
  const label = (l: Record<string, string>, code: string) => l[lang] ?? l.ko ?? l.en ?? code;
  const yesNo = [{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }];
  const cal = month.find((m) => m.day === day);
  const closedDay = cal && cal.kind !== 'instructional' ? t('attendance.closedDay', { day, kind: CAL[cal.kind], label: cal.label ? `(${cal.label})` : '' }) : undefined;
  const kindOpts = [{ value: 'present', label: t('attendance.present') }, ...kinds.map((k) => ({ value: k.code, label: label(k.label, k.code) }))];
  const reasonOpts = reasons.map((r) => ({ value: r.code, label: label(r.label, r.code) }));
  const kindName = Object.fromEntries(kindOpts.map((k) => [k.value, k.label]));
  const q = (extra: Record<string, string>) => `/attendance?${new URLSearchParams({ day, ...(level ? { level: level.id } : {}), ...extra })}`;
  const marked = rows.filter((r) => r.kind_code).length;
  return (
    <>
      <PageHeader title={t('nav.attendance.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.attendance.title') }]}
        description={t('attendance.lead')}
        meta={<><span>{day}</span>{level && <span>{t('attendance.metaMarked', { level: level.name, marked, total: rows.length })}</span>}{year && <span>{t('attendance.metaYear', { year: year.label })}</span>}</>} />
      {!levels.length && <section className="card"><p className="muted">{t('courses.needLevels')} <Link href="/academics">{t('courses.toAcademics')}</Link></p></section>}
      {level && (
        <section className="card stack" data-testid="attendance-day">
          <form className="row-wrap" action="/attendance">
            <label>{t('attendance.date')}<input type="date" name="day" defaultValue={day} /></label>
            <label>{t('people.level')}<select name="level" defaultValue={level.id}>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <button className="btn btn-sm" type="submit">{t('common.view')}</button>
          </form>
          <h2>{t('attendance.registerTitle', { day, level: level.name })} {cal ? <StatusBadge tone={cal.kind === 'instructional' ? 'success' : 'neutral'}>{CAL[cal.kind]}{cal.half_day ? t('attendance.halfDay') : ''}</StatusBadge> : <StatusBadge tone="neutral">{t('attendance.noCalendar')}</StatusBadge>}</h2>
          {!cal && <p className="fine">{t('attendance.notOnCalendar')}</p>}
          <AttendanceRegister key={`${day}:${level.id}`} day={day} rows={rows} kinds={kindOpts} reasons={reasonOpts} disabled={closedDay} />
        </section>
      )}
      {level && (
        <section className="card stack" data-testid="attendance-summary">
          <h2>{t('attendance.summary')}</h2>
          <form className="row-wrap" action="/attendance">
            <input type="hidden" name="day" value={day} /><input type="hidden" name="level" value={level.id} />
            <label>{t('common.start')}<input type="date" name="from" defaultValue={from} /></label>
            <label>{t('attendance.endExclusive')}<input type="date" name="to" defaultValue={to} /></label>
            <button className="btn btn-sm" type="submit">{t('attendance.summarize')}</button>
          </form>
          {summaries.length === 0 ? <p className="muted">{t(to > from ? 'attendance.noStudents' : 'attendance.endAfterStart')}</p> : (
            <div className="table-wrap"><table className="grid-table">
              <thead><tr><th scope="col">{t('common.student')}</th><th scope="col">{t('attendance.col.enrolledDays')}</th><th scope="col">{t('attendance.col.absentDays')}</th><th scope="col">{t('attendance.col.rate')}</th><th scope="col">{t('attendance.col.byKind')}</th><th scope="col">{t('attendance.col.result')}</th></tr></thead>
              <tbody>{summaries.map(({ person_id, name, s }) => (
                <tr key={person_id}><th scope="row">{name}</th><td>{s.enrolled_days}</td><td>{s.absent_days}</td>
                  <td>{s.attendance_rate == null ? '-' : `${Math.round(s.attendance_rate * 1000) / 10}%`}</td>
                  <td>{Object.entries(s.counts).map(([k, n]) => `${kindName[k] ?? k} ${n}`).join(' · ') || '-'}</td>
                  <td>{s.chronic_absence ? <StatusBadge tone="danger">{t('attendance.chronic')}</StatusBadge> : null}{!s.meets_min_attendance ? <StatusBadge tone="danger">{t('attendance.belowMin')}</StatusBadge> : null}{!s.chronic_absence && s.meets_min_attendance ? <StatusBadge tone="success">{t('attendance.meets')}</StatusBadge> : null}</td>
                </tr>))}</tbody></table></div>)}
          {summaries[0] && <p className="fine">{t('attendance.thresholds', { chronic: Math.round(summaries[0].s.thresholds.chronic_ratio * 100), min: Math.round(summaries[0].s.thresholds.min_attendance_ratio * 1000) / 10 })}</p>}
        </section>
      )}
      <section className="card stack" data-testid="calendar">
        <h2>{t('attendance.calendar')} <small className="muted">{day.slice(0, 7)}</small></h2>
        <p className="fine"><Link href={q({ day: shiftMonth(day, -1) })}>{t('attendance.prevMonth')}</Link> · <Link href={q({ day: shiftMonth(day, 1) })}>{t('attendance.nextMonth')}</Link></p>
        {month.length === 0 ? <p className="muted">{t('attendance.noDays')}</p> : (
          <ul className="issue-list" data-testid="calendar-days">{month.map((m) => (
            <li key={m.day}><span><Link href={q({ day: m.day })}>{m.day}</Link> {CAL[m.kind]}{m.half_day ? t('attendance.halfDay') : ''}{m.label ? ` · ${m.label}` : ''}</span></li>))}</ul>)}
        {admin && (year
          ? <ActionForm url="/api/attendance" action="calendar" inline submitLabel={t('attendance.addToCalendar')} successText={t('attendance.calendarSaved')} testId="calendar-form"
              fields={[{ name: 'from', label: t('common.start'), type: 'date', required: true, defaultValue: day }, { name: 'to', label: t('attendance.endInclusive'), type: 'date', required: true, defaultValue: day },
                { name: 'kind', label: t('grades.kind'), type: 'select', options: Object.entries(CAL).map(([value, l]) => ({ value, label: l })) },
                { name: 'skipWeekends', label: t('attendance.skipWeekends'), type: 'select', options: yesNo },
                { name: 'halfDay', label: t('attendance.halfDayField'), type: 'select', options: [...yesNo].reverse() },
                { name: 'label', label: t('attendance.labelOptional'), placeholder: t('attendance.labelPlaceholder') }]} />
          : <p className="fine">{withLink(t('attendance.noYear'), <Link href="/academics">{t('nav.academics.title')}</Link>)}</p>)}
      </section>
    </>
  );
}

function shiftMonth(day: string, by: number) {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}
