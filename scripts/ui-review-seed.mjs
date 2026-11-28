// UI 점검용 채운 상태 합성 시드 (DIRECTION 1-1, #165 Codex P2)
// `npm run db:reset` 뒤 `npm run ui:seed` → 예시학교 A에 학년도·학기·과목·수업·담당·수강생·수업일·출결·평가를 넣는다.
// 수업·성적·출결·기록 화면의 본 기능을 `npm run ui:review`로 찍기 위한 것이다.
// - 로컬 DB(localhost)에서만 돈다. 이름은 모두 합성('점검 학생 1' 등)이고 실제 사람이 아니다.
// - 앱과 같은 DB 명령 함수(app.*)를 학교 관리자 권한(authenticated + JWT)으로 부른다. 표에 직접 넣지 않는다
//   (학기를 만들 근거가 되는 확정 규칙 1판만 시드처럼 직접 넣는다: 화면에서는 자료 → 확인 흐름으로 생기는 값).
// - 이미 넣었으면(학년도 '2026 점검') 아무것도 하지 않는다.
import pg from 'pg';
import { pgOptions } from './pg-options.mjs';
import { connectOrExplain } from './db-errors.mjs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error('ui:seed 는 로컬 DB에서만 돕니다.');
  process.exit(1);
}

const YEAR_LABEL = '2026 점검';
const client = new pg.Client(pgOptions(url));
await connectOrExplain(client);
try {
  const { rows: [a] } = await client.query(
    `select s.id as school_id, u.id as user_id from public.schools s
       join public.memberships m on m.school_id = s.id and m.role = 'admin'
       join private.app_users u on u.id = m.user_id
      where s.slug = 'school-a' limit 1`);
  if (!a) throw new Error('예시학교 A가 없습니다. 먼저 npm run db:reset');
  const { rowCount: done } = await client.query('select 1 from public.academic_years where school_id = $1 and label = $2', [a.school_id, YEAR_LABEL]);
  if (done) { console.log('ui:seed: 이미 넣었습니다(건너뜀).'); process.exit(0); }

  await client.query('begin');
  // 학기 구조 확정 규칙(자료 → 확인 흐름의 결과를 시드로 대신)
  const { rows: [{ v: ruleVersion }] } = await client.query(
    `select coalesce(max(version), 0) + 1 as v from public.school_rules where school_id = $1 and topic = 'period_structure'`, [a.school_id]);
  const { rows: [rule] } = await client.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', $2, $3, 'accepted', '[]', $4) returning id`,
    [a.school_id, ruleVersion, JSON.stringify({ periods: [{ id: 's1', label: '1학기', assessments: [] }, { id: 's2', label: '2학기', assessments: [] }] }), a.user_id]);

  // 여기부터는 학교 관리자로(앱의 asUser와 같다)
  await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: a.user_id, role: 'authenticated' })]);
  const v = async (sql, params) => (await client.query(sql, params)).rows[0]?.v;
  const S = a.school_id;

  const level = await v('select app.add_school_level($1, $2, $3, $4) as v', [S, 'ms_ui', '중학교(점검)', 0]);
  const year = await v('select app.add_academic_year($1, $2, $3, $4) as v', [S, YEAR_LABEL, '2026-03-01', '2027-02-28']);
  await v('select app.create_terms_from_rule($1, $2, $3) as v', [S, year, rule.id]);
  const { rows: terms } = await client.query('select id from public.terms where school_id = $1 and academic_year_id = $2 order by sequence', [S, year]);
  const term = terms[0].id;

  const type = await v('select app.add_course_type($1, $2, $3) as v', [S, 'required_ui', '필수']);
  await v('select app.set_course_type_rule($1, $2, $3, $4, $5, $6) as v', [S, type, 'term_start', true, false, null]);
  const subjects = [];
  for (const [code, name] of [['KOR', '국어'], ['MATH', '수학'], ['SCI', '과학']]) {
    subjects.push(await v('select app.add_subject($1, $2, $3, $4) as v', [S, `${code}_UI`, name, level]));
  }

  const teacher = await v('select app.add_person($1, $2, $3) as v', [S, '점검 교사', 'Check Teacher']);
  const students = [];
  for (let i = 1; i <= 8; i++) {
    const p = await v('select app.add_person($1, $2, $3) as v', [S, `점검 학생 ${i}`, `Check Student ${i}`]);
    await v('select app.enroll_person($1, $2, $3, $4, $5, $6) as v', [S, p, level, null, '2026-03-02', null]);
    students.push(p);
  }

  const offerings = [];
  for (const subj of subjects) {
    const o = await v('select app.create_offering($1, $2, $3, $4, $5, $6, $7, $8, $9) as v', [S, term, subj, type, level, 4, false, 'A', 30]);
    await client.query('select app.assign_offering_staff($1, $2, $3, $4)', [S, o, teacher, 'lead']);
    offerings.push(o);
  }
  // 학기 시작: 학기 시작 계기 수업을 열고 학교급 재학생을 자동 수강
  await v('select app.start_term($1, $2) as v', [S, term]);

  // 3월 둘째·셋째 주 수업일(하루 휴일, 하루 반일)
  const days = [];
  for (const d of ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13']) {
    days.push({ day: `2026-03-${d}`, kind: d === '06' ? 'holiday' : 'instructional', half_day: d === '13', label: d === '06' ? '개교기념일' : null });
  }
  await v('select app.set_calendar_days($1, $2, $3) as v', [S, year, JSON.stringify(days)]);
  const att = [
    [0, '2026-03-03', 'absent', 'illness'], [0, '2026-03-04', 'tardy', null], [2, '2026-03-05', 'absent', 'unexcused'],
    [3, '2026-03-09', 'absent', 'recognized'], [5, '2026-03-10', 'early_leave', null],
  ];
  for (const [i, day, kind, reason] of att) {
    await client.query('select app.record_attendance($1, $2)', [S, JSON.stringify({
      person_id: students[i], day, scope: 'day', session_code: null, period: null, offering_id: null, kind_code: kind,
      reason_code: reason, minutes: kind === 'tardy' ? 10 : null, note: null, reason: null })]);
  }

  // 수업마다 평가 두 개와 점수(마지막 학생은 미입력: 빈 칸 상태도 보이게). 점검 도구는 목록 첫 수업을 연다
  let scored = 0;
  for (const offering of offerings) {
    const items = [];
    for (const [code, title, en, weight, kind] of [['mid', '중간 과제', 'Midterm task', 40, 'assignment'], ['final', '기말 프로젝트', 'Final project', 60, 'project']]) {
      items.push(await v('select app.add_assessment($1, $2, $3) as v', [S, offering, JSON.stringify({
        code, title: { ko: title, en }, kind, axis: 'course',
        weight, max_score: 100, grading_period_id: null, competency_item_id: null, scale_id: null })]));
    }
    for (const [n, p] of students.entries()) {
      if (n === students.length - 1) continue;
      for (const [k, item] of items.entries()) {
        await v('select app.record_result($1, $2, $3, $4) as v', [S, item, p, JSON.stringify({ score: 60 + ((n * 7 + k * 11) % 40), level_code: null, comment: null, reason: null })]);
        scored++;
      }
    }
  }
  await client.query('commit');
  console.log(`ui:seed: 학년도 1·학기 ${terms.length}·과목 3·수업 3·학생 ${students.length}·출결 ${att.length}·평가 ${offerings.length * 2}·점수 ${scored}을 넣었습니다(합성).`);
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('ui:seed 실패:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
