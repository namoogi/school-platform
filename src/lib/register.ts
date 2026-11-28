import type { Db } from './db';
import { isUuid } from './services';

/** 74차: 출결 화면이 읽는 것(그날 학교급 재학생 + 하루 출결 최신 사건, 수업일 달력). 모두 asUser + RLS */
export type RegisterRow = { person_id: string; name: string; kind_code: string | null; reason_code: string | null; note: string | null; recorded_at: string | null };
export async function levelRegister(db: Db, schoolId: string, levelId: string, day: string): Promise<RegisterRow[]> {
  if (!isUuid(levelId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return (await db.query<RegisterRow>(
    `select p.id as person_id, n.name, a.kind_code, a.reason_code, a.note, a.recorded_at::text
       from (select distinct e.person_id from public.enrollments_school e
              where e.school_id = $1 and e.school_level_id = $2 and daterange(e.starts_on, e.ends_on, '[)') @> $3::date) s
       join public.people p on p.id = s.person_id
       join public.person_current_names n on n.person_id = p.id and n.school_id = p.school_id
       left join public.current_attendance a on a.school_id = $1 and a.person_id = p.id and a.day = $3::date and a.scope = 'day' and a.offering_id is null
      order by n.name`, [schoolId, levelId, day])).rows;
}
export type CalendarRow = { day: string; kind: string; half_day: boolean; label: string | null };
export async function calendarMonth(db: Db, schoolId: string, month: string): Promise<CalendarRow[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  return (await db.query<CalendarRow>(
    `select day::text, kind, half_day, label from public.calendar_days
      where school_id = $1 and day >= ($2 || '-01')::date and day < ($2 || '-01')::date + interval '1 month' order by day`, [schoolId, month])).rows;
}
/** 그날이 든 학년도(달력 저장에 필요) */
export async function yearOfDay(db: Db, schoolId: string, day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const { rows: [r] } = await db.query<{ id: string; label: string; starts_on: string; ends_on: string }>(
    `select id, label, starts_on::text, ends_on::text from public.academic_years where school_id = $1 and starts_on <= $2::date and ends_on > $2::date
      order by starts_on desc limit 1`, [schoolId, day]);
  return r ?? null;
}
