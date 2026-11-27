import type { Db } from './db';
import { createSchool } from './admin';
import { latestPeriodRule } from './academics';
import * as at from './attendance';
import * as cs from './courses';
import * as f from './foundation';
import * as g from './grading';
import { gradeLabel, presetLevels, type LevelKey } from './grade-schemes';
import { applyTemplate } from './academic-templates';
import * as pp from './people';
import * as rec from './records';

/**
 * 109차 ADR 0043 — 시연용 가상 학교(합성 자료만).
 * 초1~고3 학생을 '가상 ○○' 가명으로 넣고, 학년도·학기·수업·평가·출결·서술·수업 마감·학년도 기록 마감·발행본까지 채운다.
 * 모든 쓰기는 화면·API와 같은 명령 함수(app.*)를 거친다(표에 직접 쓰지 않음). 전체 관리자만 부른다(handlePlatform).
 * 되돌리기: 기록은 지우지 않는 설계라(지침 4·8) 시연 학교는 '정지'(suspended)로 내려 감춘다.
 * 다시 불러도 같은 학교를 두 번 만들지 않는다(주소 demo-academy 가 있으면 그대로 돌려준다).
 */

export const DEMO_SLUG = 'demo-academy';
export const DEMO_NAME = '온누리 시연학교 (가상)';
export const PER_GRADE = 4;

// 누가 봐도 가짜인 이름: 성은 모두 '가상', 이름은 자연 낱말. 실제 사람과 겹치지 않게 사람 이름으로 흔한 조합을 피했다.
const GIVEN = ['하늘', '바다', '구름', '노을', '새벽', '이슬', '들꽃', '솔잎', '나래', '가람', '보라', '마루',
  '한결', '다온', '라온', '시내', '여울', '별빛', '소담', '해솔', '미르', '누리', '아라', '초롱',
  '단비', '은솔', '가온', '다솜', '로아', '하람', '슬기', '온새', '윤슬', '늘봄', '새롬', '푸름',
  '산들', '아름', '꽃님', '바람', '햇살', '달빛', '모래', '돌담', '나무', '열매', '씨앗', '풀잎'];

// 학교급별 수업(과목 코드·이름·학점·평가 항목). 초등은 P/F + 서술, 중·고는 점수 → 성취도.
const SUBJECTS: Record<LevelKey, { code: string; name: string; credits: number; pf: boolean; items: { code: string; title: string; weight: number }[] }[]> = {
  elementary: [
    { code: 'E-KOR', name: '국어', credits: 0, pf: true, items: [{ code: 'read', title: '읽기 활동', weight: 100 }] },
    { code: 'E-MATH', name: '수학', credits: 0, pf: true, items: [{ code: 'calc', title: '수 활동', weight: 100 }] },
    { code: 'E-PRJ', name: '마을 탐구 프로젝트', credits: 0, pf: true, items: [{ code: 'show', title: '발표', weight: 100 }] },
  ],
  middle: [
    { code: 'M-KOR', name: '국어', credits: 4, pf: false, items: [{ code: 'task', title: '수행평가', weight: 40 }, { code: 'exam', title: '지필평가', weight: 60 }] },
    { code: 'M-MATH', name: '수학', credits: 4, pf: false, items: [{ code: 'task', title: '수행평가', weight: 40 }, { code: 'exam', title: '지필평가', weight: 60 }] },
    { code: 'M-SCI', name: '과학', credits: 3, pf: false, items: [{ code: 'lab', title: '실험 보고서', weight: 50 }, { code: 'exam', title: '지필평가', weight: 50 }] },
  ],
  high: [
    { code: 'H-KOR', name: '국어', credits: 4, pf: false, items: [{ code: 'task', title: '수행평가', weight: 40 }, { code: 'exam', title: '지필평가', weight: 60 }] },
    { code: 'H-MATH', name: '수학', credits: 4, pf: false, items: [{ code: 'task', title: '수행평가', weight: 40 }, { code: 'exam', title: '지필평가', weight: 60 }] },
    { code: 'H-ENG', name: '영어', credits: 3, pf: false, items: [{ code: 'task', title: '말하기', weight: 50 }, { code: 'exam', title: '지필평가', weight: 50 }] },
  ],
};

// 수업일: 2026년 3월 2일(월)~3월 13일(금) 평일 10일. 1학기 기간은 3월~7월.
const DAYS = ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13'].map((d) => `2026-03-${d}`);

/** 같은 입력이면 같은 점수가 나오는 작은 난수(시연 자료가 실행마다 바뀌지 않게) */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export type DemoResult = { schoolId: string; created: boolean; students: number; offerings: number; documents: number };

export async function findDemoSchool(db: Db) {
  const { rows } = await db.query<{ id: string; status: string }>('select id, status from public.schools where slug = $1', [DEMO_SLUG]);
  return rows[0] ?? null;
}

export async function buildDemoSchool(db: Db): Promise<DemoResult> {
  const existing = await findDemoSchool(db);
  if (existing) return { schoolId: existing.id, created: false, students: 0, offerings: 0, documents: 0 };
  const { id: schoolId } = await createSchool(db, {
    slug: DEMO_SLUG, name: DEMO_NAME, locale: 'ko', adminEmail: 'demo-admin@example.test', seats: 5, modules: ['intake', 'records'],
  });
  const rnd = seeded(20261127);

  // 1) 학교 관할 + 학교급·학년(한국식)
  await f.setSchoolProfile(db, schoolId, { country: 'KR', sector: 'alternative', why: '시연용 가상 학교(합성 자료)', base_version: 0 });
  // 111차: 학사 관리 템플릿 '한국 일반 초·중·고'로 시작한다(학교급·학년·학기 구조·척도)
  await applyTemplate(db, schoolId, { key: 'kr_general', base_version: 1 });
  const levels = await pp.listSchoolLevels(db, schoolId);
  const grades = await f.listGradeLevels(db, schoolId);
  const levelId = (k: LevelKey) => levels.find((l) => l.code === k)!.id;

  // 2) 학년도·학기 구조(1·2학기)·학기 날짜·수업일
  const year = await pp.addAcademicYear(db, schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
  const rule = (await latestPeriodRule(db, schoolId))!;
  await pp.createTermsFromRule(db, schoolId, year, rule.id);
  const terms = await pp.listTerms(db, schoolId, year);
  await pp.setTermDates(db, schoolId, terms[0].id, '2026-03-02', '2026-07-24');
  await pp.setTermDates(db, schoolId, terms[1].id, '2026-08-17', '2027-02-12');
  const term = terms[0].id;
  await f.setCalendarDays(db, schoolId, year, DAYS.map((day) => ({ day, kind: 'instructional' })) as f.CalendarDayInput[]);

  // 3) 척도: 중·고는 한국 성취도(복제된 kr_achievement), 초등은 P/F 를 새로 둔다
  await g.saveScalePreset(db, schoolId, 'pass_fail');
  const { rows: scales } = await db.query<{ code: string; id: string }>(
    `select code, id from public.scales where school_id = $1`, [schoolId]);
  const scaleOf = (k: LevelKey) => scales.find((s) => s.code === (k === 'elementary' ? 'pass_fail' : 'kr_achievement'))!.id;

  // 4) 학생: 학년마다 PER_GRADE명, 학교급 학적 + 학년 반 배정
  const students: { id: string; level: LevelKey; gradeId: string; label: string }[] = [];
  let n = 0;
  for (const pl of presetLevels('kr')) {
    for (const pg of pl.grades) {
      const gl = grades.find((x) => x.code === pg.code)!;
      const label = gradeLabel(gl, 'kr', 'ko');
      const homeroom = await pp.addGradeHomeroom(db, schoolId, { yearId: year, gradeLevelId: gl.id, name: `${label} 1반` });
      for (let i = 0; i < PER_GRADE; i++) {
        const given = GIVEN[n % GIVEN.length];
        n++;
        const person = await pp.addPerson(db, schoolId, { name: `가상 ${given}`, nameLatin: `Demo Student ${String(n).padStart(2, '0')}` });
        await pp.enroll(db, schoolId, { personId: person, levelId: levelId(pl.key), startsOn: '2026-03-02', note: '시연용 가상 학생' });
        await pp.assignHomeroom(db, schoolId, { personId: person, homeroomId: homeroom, startsOn: '2026-03-02' });
        students.push({ id: person, level: pl.key, gradeId: gl.id, label });
      }
    }
  }

  // 5) 수업: 학년마다 과목별 개설(학년 칸 = 그 학년, 분반 = 학년 표기) → 학기 시작에 그 학년 학생만 자동 수강(110차)
  const type = await cs.addCourseType(db, schoolId, { code: 'grade_core', name: '학년 공통' });
  await cs.setCourseTypeRule(db, schoolId, type, { trigger: 'term_start', publishable: false, passFailAllowed: true, note: '시연 학교: 학년별 공통 수업' });
  const subjectIds = new Map<string, string>();
  for (const k of Object.keys(SUBJECTS) as LevelKey[]) {
    for (const s of SUBJECTS[k]) subjectIds.set(s.code, await cs.addSubject(db, schoolId, { code: s.code, name: s.name, levelId: levelId(k) }));
  }
  const planned: { off: string; key: LevelKey; s: (typeof SUBJECTS)[LevelKey][number]; roster: typeof students }[] = [];
  for (const pl of presetLevels('kr')) {
    for (const pg of pl.grades) {
      const gl = grades.find((x) => x.code === pg.code)!;
      const roster = students.filter((s) => s.gradeId === gl.id);
      for (const s of SUBJECTS[pl.key]) {
        const off = await cs.createOffering(db, schoolId, {
          termId: term, subjectId: subjectIds.get(s.code), typeId: type, levelId: levelId(pl.key), gradeLevelId: gl.id,
          credits: s.credits, passFail: s.pf, section: roster[0].label,
        });
        planned.push({ off, key: pl.key, s, roster });
      }
    }
  }
  await cs.startTerm(db, schoolId, term);
  const offerings = planned.length;
  for (const { off, key, s, roster } of planned) {
    // 평가 항목과 결과
    for (const it of s.items) {
      const a = await g.addAssessment(db, schoolId, off, { code: it.code, title: { ko: it.title }, weight: it.weight, maxScore: 100 });
      for (const st of roster) {
        const score = Math.round(55 + rnd() * 45);
        await g.recordResult(db, schoolId, a, st.id, s.pf ? { score, comment: score >= 70 ? '활동에 꾸준히 참여함' : '도움을 받아 활동을 마침' } : { score });
      }
    }
    // 서술(과목 세부능력·특기사항 꼴): 첫 학생 한 명에게만 예시로
    await g.recordNarrative(db, schoolId, {
      personId: roster[0].id, offeringId: off, academicYearId: year, kind: 'subject_detail', authorRole: 'subject_teacher',
      body: `${s.name} 시간에 질문을 스스로 만들고 친구들과 답을 찾아 발표함(시연용 예시 문장).`,
    });
    await g.closeOffering(db, schoolId, off, { base_version: 0, requestKey: `demo-close-${off}`, scaleId: scaleOf(key) });
  }

  // 6) 출결: 수업일 10일 중 몇 건만 결석·지각(출석은 기본값이라 사건을 남기지 않는다)
  const kinds = [{ kind: 'absent', reason: 'illness' }, { kind: 'tardy', reason: 'other' }, { kind: 'absent', reason: 'recognized' }];
  for (const [i, st] of students.entries()) {
    if (i % 3 !== 0) continue;
    const k = kinds[i % kinds.length];
    await at.recordAttendance(db, schoolId, { personId: st.id, day: DAYS[1 + (i % (DAYS.length - 1))], kind: k.kind, reason: k.reason });
  }

  // 7) 행동특성·증거물(프로젝트 결과물)·학년도 기록 마감·발행본: 고3 학생
  let documents = 0;
  const seniors = students.filter((s) => s.label === '고3');
  for (const [i, st] of seniors.entries()) {
    await g.recordNarrative(db, schoolId, {
      personId: st.id, academicYearId: year, kind: 'behavior', authorRole: 'homeroom', body: '맡은 일을 끝까지 해내고 친구를 잘 돕는다(시연용 예시 문장).',
    });
    await at.addEvidence(db, schoolId, { personId: st.id, title: `마을 지도 프로젝트 ${i + 1}`, body: '마을의 오래된 길을 조사해 지도로 만들고 주민에게 발표함(시연용)' });
    await rec.closeRecordYear(db, schoolId, st.id, year, { base_version: 0, requestKey: `demo-record-${st.id}` });
    if (i === 0) {
      await rec.publishRecordDocument(db, schoolId, { format: 'kr_alt_record', personId: st.id });
      documents++;
    }
  }
  return { schoolId, created: true, students: students.length, offerings, documents };
}
