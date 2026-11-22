/**
 * 14차 완료 기준(ROUND-14.md ‘검증할 예’)을 실제 Postgres + RLS 위에서 확인한다.
 * 실행: npm test  (로컬 Postgres 필요, README 참고)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csv, fixture, lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;

const { asUser, getPool } = await import('@/lib/db');
const svc = await import('@/lib/services');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
const as = <T,>(who: { userId: string }, fn: Parameters<typeof asUser<T>>[1]) => asUser(who.userId, fn);
const school = (who: { userId: string }) => as(who, (db) => svc.currentSchool(db));

beforeAll(async () => {
  await resetTestDb();
  ({ A, B } = await lookupIds());
});
afterAll(async () => {
  await getPool().end();
});

describe('예시 A: 일정 CSV 후 평가 CSV 추가', () => {
  it('첫 자료로 기간만 묻고, 평가 자료를 더하면 기존 일정을 유지한 채 두 학기·네 평가 기간을 근거와 함께 묻는다', async () => {
    const first = await as(A, (db) => svc.addFiles(db, A.schoolId, [fixture('school-a-calendar.csv')]));
    expect(first.added[0].status).toBe('parsed');
    expect(first.analysis.state).toBe('question_opened');
    const q1 = await as(A, (db) => svc.openQuestion(db, A.schoolId));
    expect(q1!.proposal.periods.map((p) => p.label)).toEqual(['1학기', '2학기']);
    expect(q1!.issues.map((i) => i.kind)).toContain('missing_assessments');

    const second = await as(A, (db) => svc.addFiles(db, A.schoolId, [fixture('school-a-assessments.csv')]));
    expect(second.analysis.state).toBe('question_opened');

    const sources = await as(A, (db) => svc.listSources(db, A.schoolId));
    expect(sources.map((s) => s.name)).toEqual(['school-a-calendar.csv', 'school-a-assessments.csv']);
    expect(sources.map((s) => s.row_count)).toEqual([2, 4]);

    const q2 = await as(A, (db) => svc.openQuestion(db, A.schoolId));
    expect(q2!.id).not.toBe(q1!.id);
    expect(q2!.proposal).toEqual({
      periods: [
        { id: 'S1', label: '1학기', assessments: ['봄 평가', '여름 평가'] },
        { id: 'S2', label: '2학기', assessments: ['가을 평가', '겨울 평가'] },
      ],
    });
    expect(q2!.prompt).toContain('기간 2개');
    expect(q2!.prompt).toContain('평가 기간 4개');
    // 근거: 어느 파일 몇 행에서 읽었는지
    const refs = q2!.evidence.map((e) => `${e.file_name}:${e.row_number}`);
    expect(refs).toEqual(expect.arrayContaining([
      'school-a-calendar.csv:2', 'school-a-calendar.csv:3',
      'school-a-assessments.csv:2', 'school-a-assessments.csv:3', 'school-a-assessments.csv:4', 'school-a-assessments.csv:5',
    ]));
    // 앞선 질문은 지우지 않고 ‘대체됨’으로 남긴다
    const statuses = await as(A, async (db) => (await db.query('select status from public.rule_questions order by created_at')).rows.map((r) => r.status));
    expect(statuses).toEqual(['superseded', 'open']);
  });

  it('같은 파일 묶음을 다시 분석해도 질문을 새로 만들지 않는다', async () => {
    const r = await as(A, (db) => svc.reanalyze(db, A.schoolId));
    expect(r.state).toBe('unchanged');
  });

  it('PDF는 읽기 대기, 시트 주소는 주소만 등록 상태로 구분하고 분석에 쓰지 않는다', async () => {
    const res = await as(A, (db) => svc.addFiles(db, A.schoolId, [{ name: '학칙.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 synthetic') }]));
    expect(res.added[0].status).toBe('pending_reader');
    expect(res.analysis.state).toBe('unchanged');
    const sheets = await as(A, (db) => svc.addSheetUrls(db, A.schoolId, [
      'https://docs.google.com/spreadsheets/d/AAA111/edit', 'https://docs.google.com/spreadsheets/d/BBB222/edit',
    ]));
    expect(sheets.added).toHaveLength(2);
    await expect(as(A, (db) => svc.addSheetUrls(db, A.schoolId, ['https://example.com/x']))).rejects.toThrow('Google Sheets');
    const sources = await as(A, (db) => svc.listSources(db, A.schoolId));
    expect(sources.filter((s) => s.status === 'registered')).toHaveLength(2);
    expect(sources.filter((s) => s.status === 'pending_reader')).toHaveLength(1);
  });

  it('관리자가 분석 결과를 확인하면 1판 규칙이 근거와 함께 저장된다', async () => {
    const q = await as(A, (db) => svc.openQuestion(db, A.schoolId));
    const rule = await as(A, (db) => svc.answerQuestion(db, A.schoolId, q!.id, { decision: 'accepted' }));
    expect(rule.version).toBe(1);
    const saved = await as(A, (db) => svc.latestRule(db, A.schoolId));
    expect(saved!.evidence.length).toBe(6);
    expect(await as(A, (db) => svc.openQuestion(db, A.schoolId))).toBeNull();
    await expect(as(A, (db) => svc.answerQuestion(db, A.schoolId, q!.id, { decision: 'accepted' }))).rejects.toThrow('이미 처리');
  });

  it('고칠 때는 근거 메모가 필요하다', async () => {
    await as(A, (db) => svc.addFiles(db, A.schoolId, [csv('a-extra.csv', 'assessment_label,parent_period\n방학 집중 평가,S2\n')]));
    const q = await as(A, (db) => svc.openQuestion(db, A.schoolId));
    await expect(as(A, (db) => svc.answerQuestion(db, A.schoolId, q!.id, { decision: 'edited', value: q!.proposal, rationale: '  ' })))
      .rejects.toThrow('근거');
  });

  it('추가 자료가 확정 규칙을 조용히 덮어쓰지 않는다: 규칙은 1판 그대로, 다른 결과는 새 질문으로 연다', async () => {
    const rule = await as(A, (db) => svc.latestRule(db, A.schoolId));
    expect(rule!.version).toBe(1);
    expect(rule!.value.periods[1].assessments).toEqual(['가을 평가', '겨울 평가']);
    const q = await as(A, (db) => svc.openQuestion(db, A.schoolId));
    expect(q!.differs_from_rule_id).toBe(rule!.id);
    expect(q!.prompt).toContain('확정한 규칙 1판');
    expect(q!.proposal.periods[1].assessments).toContain('방학 집중 평가');
    // 추가 자료를 빼면 확정 규칙과 같아지므로 열린 질문이 사라진다
    const extra = (await as(A, (db) => svc.listSources(db, A.schoolId))).find((s) => s.name === 'a-extra.csv')!;
    const r = await as(A, (db) => svc.archiveSource(db, A.schoolId, extra.id));
    expect(r.state).toBe('matches_confirmed_rule');
    expect(await as(A, (db) => svc.openQuestion(db, A.schoolId))).toBeNull();
  });
});

describe('예시 B: 세 텀', () => {
  it('B 문서는 A와 다른 세 텀 표기를 쓴다', async () => {
    await as(B, (db) => svc.addFiles(db, B.schoolId, [fixture('school-b-calendar.csv'), fixture('school-b-assessments.csv')]));
    const q = await as(B, (db) => svc.openQuestion(db, B.schoolId));
    expect(q!.proposal.periods.map((p) => p.label)).toEqual(['Term One', 'Term Two', 'Term Three']);
    await as(B, (db) => svc.answerQuestion(db, B.schoolId, q!.id, { decision: 'accepted' }));
    const doc = await as(B, async (db) => svc.publishDocument(db, await svc.currentSchool(db)));
    const saved = await as(B, (db) => svc.getDocument(db, B.schoolId, doc.id));
    expect(saved.snapshot.rule.value.periods.map((p) => p.label)).toEqual(['Term One', 'Term Two', 'Term Three']);
    expect(saved.snapshot.template.period_heading).toBe('Term');
    expect(saved.snapshot.school.name).toBe('Rungarun Example School');
    expect(svc.verifySnapshot(saved)).toBe(true);
  });
});

describe('발행본 보존: A 규칙 수정 후 두 번째 문서', () => {
  let firstId: string;
  let secondId: string;

  it('첫 발행본을 만든다', async () => {
    firstId = (await as(A, async (db) => svc.publishDocument(db, await svc.currentSchool(db)))).id;
    const d = await as(A, (db) => svc.getDocument(db, A.schoolId, firstId));
    expect(d.snapshot.rule.version).toBe(1);
    expect(d.snapshot.template.version).toBe(1);
    expect(d.snapshot.rule.value.periods.map((p) => p.label)).toEqual(['1학기', '2학기']);
    expect(d.snapshot.sources.map((s) => s.name)).toEqual(['school-a-calendar.csv', 'school-a-assessments.csv']);
  });

  it('규칙·양식·원본을 바꾸고 수정본을 발행하면 새 표기가 나오고, 첫 발행본은 그대로 열린다', async () => {
    // 규칙 수정(2판): 학기 이름 변경 + 근거
    await as(A, (db) => svc.addFiles(db, A.schoolId, [csv('a-rename.csv', 'period_id,period_label\nS1,봄학기\nS2,가을학기\n')]));
    const q = await as(A, (db) => svc.openQuestion(db, A.schoolId));
    expect(q!.issues.some((i) => i.kind === 'conflicting_label')).toBe(true);
    const edited = {
      periods: [
        { id: 'S1', label: '봄학기', assessments: ['봄 평가', '여름 평가'] },
        { id: 'S2', label: '가을학기', assessments: ['가을 평가', '겨울 평가'] },
      ],
    };
    const rule2 = await as(A, (db) => svc.answerQuestion(db, A.schoolId, q!.id, { decision: 'edited', value: edited, rationale: '2026 학칙 개정 표기' }));
    expect(rule2.version).toBe(2);
    // 양식 수정(2판)
    await as(A, (db) => svc.createTemplateVersion(db, A.schoolId, {
      title: '학기 학습 보고서(개정)', period_heading: '학기명', assessment_heading: '평가 기간', footer_note: '합성 예시 자료 · 검토용',
    }));
    // 원본 자료 목록 변경
    const cal = (await as(A, (db) => svc.listSources(db, A.schoolId))).find((s) => s.name === 'school-a-calendar.csv')!;
    await as(A, (db) => svc.archiveSource(db, A.schoolId, cal.id));

    secondId = (await as(A, async (db) => svc.publishDocument(db, await svc.currentSchool(db), { revisionOf: firstId }))).id;
    const second = await as(A, (db) => svc.getDocument(db, A.schoolId, secondId));
    expect(second.snapshot.rule.value.periods.map((p) => p.label)).toEqual(['봄학기', '가을학기']);
    expect(second.snapshot.template).toMatchObject({ version: 2, title: '학기 학습 보고서(개정)', period_heading: '학기명' });
    expect(second.revision_of).toBe(firstId);
    expect(second.revision_number).toBe(2);
    expect(second.snapshot.rule.rationale).toBe('2026 학칙 개정 표기');
    expect(second.snapshot.sources.map((x) => x.name)).toContain('a-rename.csv');

    const first = await as(A, (db) => svc.getDocument(db, A.schoolId, firstId));
    expect(first.snapshot.rule.version).toBe(1);
    expect(first.snapshot.rule.value.periods.map((p) => p.label)).toEqual(['1학기', '2학기']);
    expect(first.snapshot.template).toMatchObject({ version: 1, title: '학기 학습 보고서', period_heading: '학기' });
    expect(first.superseded_by).toBe(secondId);
    expect(svc.verifySnapshot(first)).toBe(true);
    // 규칙 1판 자체도 남아 있다
    const rules = await as(A, (db) => svc.listRules(db, A.schoolId));
    expect(rules.map((r) => r.version)).toEqual([2, 1]);
    // 보관 처리한 원본도 내용이 남아 있다
    const archived = await as(A, (db) => svc.getSource(db, A.schoolId, cal.id));
    expect(archived.archived_at).not.toBeNull();
    expect(archived.rows).toHaveLength(2);
  });

  it('같은 발행본에서 수정본을 두 갈래로 만들 수 없다', async () => {
    await expect(as(A, async (db) => svc.publishDocument(db, await svc.currentSchool(db), { revisionOf: firstId })))
      .rejects.toThrow('이미 수정본');
  });

  it('발행본·확정 규칙·양식은 DB에서도 수정·삭제가 막힌다', async () => {
    for (const sql of [
      `update public.published_documents set snapshot = '{}' where id = '${firstId}'`,
      `delete from public.published_documents where id = '${firstId}'`,
      `update public.school_rules set value = '{}' where school_id = '${A.schoolId}'`,
      `update public.document_templates set title = 'x' where school_id = '${A.schoolId}'`,
      `update public.source_files set content = 'x' where school_id = '${A.schoolId}'`,
    ]) {
      await expect(as(A, (db) => db.query(sql)), sql).rejects.toMatchObject({ code: expect.stringMatching(/^(P0001|42501)$/) });
    }
    await expect(as(A, (db) => db.query('truncate public.published_documents'))).rejects.toMatchObject({ code: '42501' });
    // 소유자(마이그레이션 계정)로도 발행본은 바뀌지 않는다
    const c = await getPool().connect();
    try {
      await expect(c.query(`update public.published_documents set snapshot = '{}' where id = $1`, [firstId])).rejects.toMatchObject({ code: 'P0001' });
    } finally { c.release(); }
  });

  it('새 연결(재로그인)에서 자료·확정 규칙·발행본이 DB에서 복원된다', async () => {
    await getPool().end();
    // 풀을 닫고 새로 만든다
    (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
    const docs = await as(A, (db) => svc.listDocuments(db, A.schoolId));
    expect(docs.map((d) => d.id)).toEqual([secondId, firstId]);
    expect((await as(A, (db) => svc.latestRule(db, A.schoolId)))!.version).toBe(2);
    expect((await as(A, (db) => svc.listSources(db, A.schoolId))).length).toBeGreaterThan(0);
  });
});

describe('학교 간 접근 분리 (양방향)', () => {
  type Who = { schoolId: string; userId: string };
  const pairs: [string, () => Who, () => Who][] = [
    ['A→B', () => A, () => B],
    ['B→A', () => B, () => A],
  ];

  for (const [label, me, other] of pairs) {
    describe(label, () => {
      it('자기 학교 기록은 정상으로 읽는다', async () => {
        expect((await school(me())).id).toBe(me().schoolId);
        expect((await as(me(), (db) => svc.listSources(db, me().schoolId))).length).toBeGreaterThan(0);
        expect((await as(me(), (db) => svc.listDocuments(db, me().schoolId))).length).toBeGreaterThan(0);
      });

      it('상대 학교의 자료·첨부·규칙·질문·문서·양식이 보이지 않는다', async () => {
        const counts = await as(me(), async (db) => {
          const out: Record<string, number> = {};
          for (const t of ['source_files', 'source_rows', 'rule_questions', 'school_rules', 'document_templates', 'published_documents', 'schools', 'memberships']) {
            const col = t === 'schools' ? 'id' : 'school_id';
            out[t] = (await db.query(`select count(*)::int as n from public.${t} where ${col} = $1`, [other().schoolId])).rows[0].n;
          }
          return out;
        });
        expect(Object.values(counts).every((n) => n === 0), JSON.stringify(counts)).toBe(true);
        // 로그인 정보 표는 아예 접근 불가
        await expect(as(me(), (db) => db.query('select * from private.app_users'))).rejects.toMatchObject({ code: '42501' });
      });

      it('상대 학교 ID를 알아도 서비스 경로로 열거나 바꿀 수 없다', async () => {
        const ids = await otherIds(other());
        // 서비스 함수에 상대 학교 ID를 직접 넣어도 RLS가 막는다
        expect(await as(me(), (db) => svc.listSources(db, other().schoolId))).toEqual([]);
        expect(await as(me(), (db) => svc.listDocuments(db, other().schoolId))).toEqual([]);
        await expect(as(me(), (db) => svc.getSource(db, other().schoolId, ids.source))).rejects.toThrow('찾을 수 없습니다');
        await expect(as(me(), (db) => svc.getDocument(db, other().schoolId, ids.doc))).rejects.toThrow('찾을 수 없습니다');
        await expect(as(me(), (db) => svc.archiveSource(db, other().schoolId, ids.source))).rejects.toThrow('찾을 수 없습니다');
        // 자기 학교 맥락으로 상대 기록 ID를 넣어도 마찬가지
        await expect(as(me(), (db) => svc.getDocument(db, me().schoolId, ids.doc))).rejects.toThrow('찾을 수 없습니다');
        await expect(as(me(), async (db) => svc.publishDocument(db, await svc.currentSchool(db), { revisionOf: ids.doc }))).rejects.toThrow('찾을 수 없습니다');
      });

      it('상대 학교로 쓰기를 시도하면 DB가 거부한다', async () => {
        const ids = await otherIds(other());
        await expect(as(me(), (db) => svc.addFiles(db, other().schoolId, [csv('x.csv', 'a,b\n1,2\n')]))).rejects.toMatchObject({ code: '42501' });
        await expect(as(me(), (db) => svc.addSheetUrls(db, other().schoolId, ['https://docs.google.com/spreadsheets/d/x/edit']))).rejects.toMatchObject({ code: '42501' });
        await expect(as(me(), (db) => svc.createTemplateVersion(db, other().schoolId, { title: 't', period_heading: 'p', assessment_heading: 'a', footer_note: 'f' }))).rejects.toMatchObject({ code: '42501' });
        await expect(as(me(), (db) => db.query(
          `insert into public.school_rules(school_id, topic, version, value, decision, evidence) values ($1,'period_structure',99,'{}','accepted','[]')`, [other().schoolId])))
          .rejects.toMatchObject({ code: '42501' });
        await expect(as(me(), (db) => db.query(
          `insert into public.published_documents(school_id, rule_id, template_id, snapshot, snapshot_sha256) values ($1,$2,$3,'{}','x')`,
          [other().schoolId, ids.rule, ids.template]))).rejects.toMatchObject({ code: '42501' });
        // 내 학교로 넣으면서 상대 학교 규칙을 참조하는 것도 막힌다 (복합 외래키)
        await expect(as(me(), (db) => db.query(
          `insert into public.published_documents(school_id, rule_id, template_id, snapshot, snapshot_sha256) values ($1,$2,$3,'{}','x')`,
          [me().schoolId, ids.rule, ids.template]))).rejects.toMatchObject({ code: expect.stringMatching(/^(23503|42501)$/) });
        // 보이지 않는 행의 갱신은 0건
        const updated = await as(me(), (db) => db.query('update public.source_files set archived_at = now() where id = $1', [ids.source]));
        expect(updated.rowCount).toBe(0);
        // 상대 학교 기록은 그대로
        const still = await as(other(), (db) => svc.getSource(db, other().schoolId, ids.source));
        expect(still.archived_at).toBeNull();
      });
    });
  }
});

async function otherIds(who: { schoolId: string; userId: string }) {
  return as(who, async (db) => {
    const one = async (sql: string) => (await db.query(sql, [who.schoolId])).rows[0].id as string;
    return {
      source: await one('select id from public.source_files where school_id = $1 and archived_at is null and status = \'parsed\' order by created_at desc limit 1'),
      doc: await one('select id from public.published_documents where school_id = $1 limit 1'),
      rule: await one('select id from public.school_rules where school_id = $1 limit 1'),
      template: await one('select id from public.document_templates where school_id = $1 limit 1'),
    };
  });
}
