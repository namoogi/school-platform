/** 61차 ADR 0025 F5 — 정의 엔진: 학교 AI(작업 토큰 'package')가 명세 → 검사 → 미리보기, 관리자가 켜기 → 교직원 기록·흐름 → 끄기. 숨은 참조·마감 불변·학교 간 거부 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const agent = await import('@/lib/agent');
const pk = await import('@/lib/packages');
const pp = await import('@/lib/people');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let tokA: string; let tokSite: string; let teacherA: string; let stu: string;

const SERVICE = {
  title: { ko: '봉사 시간', en: 'Service hours' }, subject: 'person', flow: 'review_flow',
  fields: [
    { key: 'activity', type: 'text', label: { ko: '활동' }, privacy: 'internal', required: true, max_length: 80 },
    { key: 'hours', type: 'hours', label: { ko: '시간' }, privacy: 'internal', required: true },
    { key: 'area', type: 'choice', label: { ko: '영역' }, privacy: 'internal', options: [{ code: 'village', label: { ko: '마을' } }, { code: 'mission', label: { ko: '선교' } }] },
    { key: 'reflection', type: 'longtext', label: { ko: '소감' }, privacy: 'sensitive' },
  ],
};
const FLOW = {
  states: [{ key: 'draft', label: { ko: '초안' } }, { key: 'review', label: { ko: '검토' } }, { key: 'approved', label: { ko: '승인' } }],
  initial: 'draft', final: ['approved'],
  transitions: [{ from: 'draft', to: 'review', roles: ['author', 'teacher'] }, { from: 'review', to: 'approved', roles: ['admin'] }, { from: 'review', to: 'draft', roles: ['admin'] }],
};

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  tokA = await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { kinds: ['package'], perms: ['read', 'create', 'edit'], agent_kind: 'claude-code' })).then((r) => r.token);
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ('f5-teacher@school-a.test', 'f5') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [u.id, A.schoolId]);
  teacherA = u.id;
  stu = await asUser(A.userId, (db) => pp.addPerson(db, A.schoolId, { name: 'F5 학생' }));
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('검사기', () => {
  it('숨은 참조·개인정보 등급 누락·핵심 이름·나가는 끝 상태·닿지 않는 끝을 잡는다', async () => {
    const bad = await asUser(A.userId, (db) => pk.checkDefinition(db, 'record_type', 'attendance', {
      title: { ko: 'x' }, subject: 'person',
      fields: [{ key: 'student_name', type: 'text', label: { ko: '이름' }, privacy: 'internal' }, { key: 'mentor_id', type: 'text', label: { ko: '멘토' }, privacy: 'internal' },
               { key: 'note', type: 'text', label: { ko: '메모' } }, { key: 'note', type: 'blob', label: { ko: 'x' }, privacy: 'internal' }],
    }));
    const msgs = bad.map((i) => `${i.path} ${i.message}`).join('\n');
    expect(msgs).toContain('핵심 기록 이름');
    expect(msgs).toMatch(/fields\[0\]\.key .*정해진 열/);
    expect(msgs).toMatch(/fields\[1\]\.key .*정해진 열/);
    expect(msgs).toMatch(/fields\[2\]\.privacy/);
    expect(msgs).toMatch(/fields\[3\]\.key .*겹칩니다/);
    expect(msgs).toMatch(/fields\[3\]\.type/);
    const flow = await asUser(A.userId, (db) => pk.checkDefinition(db, 'flow', 'f', {
      ...FLOW, transitions: [...FLOW.transitions, { from: 'approved', to: 'draft', roles: ['admin'] }],
    }));
    expect(flow.some((i) => i.level === 'error' && i.message.includes('끝 상태에서 나가는'))).toBe(true);
    const dead = await asUser(A.userId, (db) => pk.checkDefinition(db, 'flow', 'f', { ...FLOW, transitions: [{ from: 'draft', to: 'review', roles: ['teacher'] }] }));
    expect(dead.some((i) => i.message.includes('가는 길이 없습니다'))).toBe(true);
    expect(await asUser(A.userId, (db) => pk.checkDefinition(db, 'record_type', 'service', SERVICE))).toEqual([]);
  });
});

describe('학교 AI: 명세 → 검사 → 미리보기', () => {
  it('토큰으로 정의 판·꾸러미 판을 쓰고, 오류 판은 남되 꾸러미에 못 넣는다. 409. 켜기 함수는 없다', async () => {
    const bad = await asAgent((db) => pk.agentSaveDefinition(db, tokA, { kind: 'record_type', code: 'service', spec: { ...SERVICE, fields: [...SERVICE.fields, { key: 'guardian_email', type: 'text', label: { ko: 'x' }, privacy: 'internal' }] }, base_version: 0 }));
    expect(bad).toMatchObject({ version: 1, valid: false });
    const p1 = await asAgent((db) => pk.agentSavePackage(db, tokA, { code: 'service_pack', title: { ko: '봉사 시간 기록' }, members: [{ kind: 'record_type', code: 'service' }], base_version: 0 }));
    expect(p1.valid).toBe(false);
    // 고친 판 · 흐름 · 양식 · 목록 · 출력
    expect(await asAgent((db) => pk.agentSaveDefinition(db, tokA, { kind: 'record_type', code: 'service', spec: SERVICE, why: '참조 칸 제거', base_version: 1 }))).toMatchObject({ version: 2, valid: true });
    await expect(asAgent((db) => pk.agentSaveDefinition(db, tokA, { kind: 'record_type', code: 'service', spec: SERVICE, base_version: 1 }))).rejects.toThrow('새 판');
    await asAgent(async (db) => {
      await pk.agentSaveDefinition(db, tokA, { kind: 'flow', code: 'review_flow', spec: FLOW, base_version: 0 });
      await pk.agentSaveDefinition(db, tokA, { kind: 'form', code: 'service_form', spec: { record_type: 'service', sections: [{ title: { ko: '활동' }, fields: ['activity', 'hours', 'area'] }, { fields: ['reflection'] }] }, base_version: 0 });
      await pk.agentSaveDefinition(db, tokA, { kind: 'view', code: 'service_list', spec: { record_type: 'service', columns: ['person', 'activity', 'hours', 'state'] }, base_version: 0 });
      await pk.agentSaveDefinition(db, tokA, { kind: 'output', code: 'service_sheet', spec: { record_type: 'service', blocks: [{ type: 'heading', text: { ko: '봉사 확인서' } }, { type: 'fields', keys: ['activity', 'hours', 'area'] }] }, base_version: 0 });
    });
    // 없는 칸을 가리키는 목록은 꾸러미 검사에서 잡힌다
    await asAgent((db) => pk.agentSaveDefinition(db, tokA, { kind: 'view', code: 'broken_list', spec: { record_type: 'service', columns: ['nope'] }, base_version: 0 }));
    const broken = await asAgent((db) => pk.agentSavePackage(db, tokA, { code: 'service_pack', title: { ko: '봉사 시간 기록' }, base_version: 1,
      members: [{ kind: 'record_type', code: 'service' }, { kind: 'flow', code: 'review_flow' }, { kind: 'view', code: 'broken_list' }] }));
    expect(broken.valid).toBe(false);
    expect(broken.issues.map((i) => i.message).join()).toContain('없는 칸 이름');
    const p3 = await asAgent((db) => pk.agentSavePackage(db, tokA, { code: 'service_pack', title: { ko: '봉사 시간 기록' }, why: '양식·목록·출력 포함', base_version: 2,
      members: ['record_type:service', 'flow:review_flow', 'form:service_form', 'view:service_list', 'output:service_sheet'].map((s) => ({ kind: s.split(':')[0], code: s.split(':')[1] })) }));
    expect(p3).toMatchObject({ version: 3, valid: true });
    expect(p3.members.find((m) => m.code === 'service')!.version).toBe(2);
    // 미리보기: 합성 자료만(실제 학생 이름 없음)
    const pv = await asAgent((db) => pk.agentPreview(db, tokA, 'service_pack'));
    const [s] = pv.preview;
    expect(s.title).toBe('봉사 시간');
    expect(s.form![0].fields.map((f) => f.key)).toEqual(['activity', 'hours', 'area']);
    expect(s.list!.columns).toEqual(['학생', '활동', '시간', '상태']);
    expect(s.list!.rows[0]).toEqual(['예시 학생 1', '활동 예시 1', '2', 'draft']);
    expect(s.output![1].rows![2]).toEqual(['영역', '마을']);
    expect(JSON.stringify(pv)).not.toContain('F5 학생');
    // 켜기·기록 쓰기는 토큰 함수가 없다
    await expect(asAgent((db) => db.query(`select agent.set_package_state($1, '{}')`, [tokA]))).rejects.toMatchObject({ code: '42883' });
    await expect(asAgent((db) => db.query(`select app.set_package_state($1, '{"code":"service_pack","state":"enabled"}')`, [A.schoolId]))).rejects.toThrow();
    // 작업 기록
    const { rows } = await su.query(`select action from public.agent_token_uses where school_id = $1 and action in ('definition.version', 'package.version')`, [A.schoolId]);
    expect(rows.length).toBeGreaterThanOrEqual(9);
  });

  it('홈페이지 종류만 받은 토큰·다른 학교·라이선스 밖은 꾸러미를 못 다룬다', async () => {
    await su.query(`insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
                    select school_id, version + 1, seats, modules || '{homepage}', monthly_estimate_krw, price_snapshot, 'f5', created_by from public.school_licenses
                     where school_id = $1 order by version desc limit 1`, [A.schoolId]);
    tokSite = await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { kinds: ['page'], perms: ['read', 'edit'] })).then((r) => r.token);
    await expect(asAgent((db) => pk.agentPackages(db, tokSite))).rejects.toMatchObject({ code: '42501' });
    await expect(asAgent((db) => pk.agentSaveDefinition(db, tokSite, { kind: 'flow', code: 'x_flow', spec: FLOW, base_version: 0 }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { kinds: ['package'], keys: ['home'], perms: ['read'] }))).rejects.toThrow('홈페이지 항목');
    // 읽기만 받은 토큰은 새 정의를 만들 수 없다
    const ro = await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { kinds: ['package'], perms: ['read'] })).then((r) => r.token);
    await expect(asAgent((db) => pk.agentSaveDefinition(db, ro, { kind: 'flow', code: 'ro_flow', spec: FLOW, base_version: 0 }))).rejects.toThrow('만들기');
    // B 학교는 A 꾸러미를 못 본다
    const tokB = await asUser(B.userId, (db) => agent.createAgentToken(db, B.schoolId, { kinds: ['package'], perms: ['read', 'create', 'edit'] })).then((r) => r.token);
    expect((await asAgent((db) => pk.agentPackages(db, tokB))).packages).toEqual([]);
    await expect(asAgent((db) => pk.agentPreview(db, tokB, 'service_pack'))).rejects.toThrow('찾을 수 없습니다');
    expect(await asUser(B.userId, (db) => pk.listPackages(db, B.schoolId))).toEqual([]);
    // 라이선스에 학사 문서실이 없는 학교는 발급도 거부
    await su.query(`insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
                    select school_id, version + 1, seats, '{intake}', monthly_estimate_krw, price_snapshot, 'f5', created_by from public.school_licenses
                     where school_id = $1 order by version desc limit 1`, [B.schoolId]);
    await expect(asUser(B.userId, (db) => agent.createAgentToken(db, B.schoolId, { kinds: ['package'], perms: ['read'] }))).rejects.toThrow('라이선스');
    await expect(asAgent((db) => pk.agentPackages(db, tokB))).rejects.toMatchObject({ code: '28000' });
  });
});

describe('관리자 켜기 → 교직원 기록·흐름 → 끄기', () => {
  it('켜기 전에는 기록 못 함, 오류 판은 못 켬, 교사만 켜기 거부', async () => {
    await expect(asUser(A.userId, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소', hours: 2 } }))).rejects.toThrow('켜진 꾸러미');
    await expect(asUser(A.userId, (db) => pk.setPackageState(db, A.schoolId, { code: 'service_pack', state: 'enabled', version: 2 }))).rejects.toThrow('검사 오류');
    await expect(asUser(teacherA, (db) => pk.setPackageState(db, A.schoolId, { code: 'service_pack', state: 'enabled' }))).rejects.toMatchObject({ code: '42501' });
    expect(await asUser(A.userId, (db) => pk.setPackageState(db, A.schoolId, { code: 'service_pack', state: 'enabled', reason: '미리보기 확인' }))).toMatchObject({ version: 3, state: 'enabled' });
    // 같은 기록 유형을 켜는 두 번째 꾸러미는 거부
    await asUser(A.userId, (db) => pk.savePackage(db, A.schoolId, { code: 'service_copy', title: { ko: '사본' }, members: [{ kind: 'record_type', code: 'service' }, { kind: 'flow', code: 'review_flow' }], base_version: 0 }));
    await expect(asUser(A.userId, (db) => pk.setPackageState(db, A.schoolId, { code: 'service_copy', state: 'enabled' }))).rejects.toThrow('이미 켜 두었습니다');
  });

  it('자료 칸 검사, 흐름 역할, 끝난 기록 정정은 관리자 사유, 정정은 새 기록', async () => {
    await expect(asUser(teacherA, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소' } }))).rejects.toThrow('필수 칸');
    await expect(asUser(teacherA, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: 'x', hours: 1, email: 'a@b' } }))).rejects.toThrow('없는 칸');
    await expect(asUser(teacherA, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: 'x', hours: 1, area: 'party' } }))).rejects.toThrow('보기에 없는');
    await expect(asUser(teacherA, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: 'x', hours: '2' } }))).rejects.toThrow('형식');
    const id = await asUser(teacherA, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소', hours: 2, area: 'village' } }));
    expect((await asUser(A.userId, (db) => pk.customRecords(db, A.schoolId, 'service')))[0]).toMatchObject({ id, state: 'draft' });
    await expect(asUser(teacherA, (db) => pk.moveCustomRecord(db, A.schoolId, { recordId: id, to: 'approved' }))).rejects.toThrow('흐름에 없는');
    expect(await asUser(teacherA, (db) => pk.moveCustomRecord(db, A.schoolId, { recordId: id, to: 'review' }))).toBe('review');
    await expect(asUser(teacherA, (db) => pk.moveCustomRecord(db, A.schoolId, { recordId: id, to: 'approved' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => pk.moveCustomRecord(db, A.schoolId, { recordId: id, to: 'approved', from: 'draft' }))).rejects.toThrow('상태가 바뀌었습니다');
    expect(await asUser(A.userId, (db) => pk.moveCustomRecord(db, A.schoolId, { recordId: id, to: 'approved' }))).toBe('approved');
    // 끝난 기록: 교사 정정 거부, 관리자는 사유와 함께 → 새 기록, 옛 기록은 그대로
    await expect(asUser(teacherA, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소', hours: 3 }, correctsId: id, reason: 'x' }))).rejects.toThrow('관리자가 사유');
    const fix = await asUser(A.userId, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소', hours: 3, area: 'village' }, correctsId: id, reason: '시간 확인서 대조' }));
    await expect(asUser(A.userId, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소', hours: 4 }, correctsId: id, reason: '또' }))).rejects.toThrow('이미 정정');
    const now = await asUser(A.userId, (db) => pk.customRecords(db, A.schoolId, 'service'));
    expect(now.map((r) => [r.id, r.data.hours, r.state])).toEqual([[fix, 3, 'draft']]);
    await expect(su.query(`update public.custom_records set data = '{}' where id = $1`, [id])).rejects.toThrow('바꿀 수 없는');
    // B 학교 사람은 A 기록을 못 본다
    expect((await asUser(B.userId, (db) => db.query('select 1 from public.custom_records'))).rows).toEqual([]);
    await expect(asUser(B.userId, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: 'x', hours: 1 } }))).rejects.toMatchObject({ code: '42501' });
  });

  it('끄면 새 기록·전환은 거부되고, 쌓인 기록은 그대로 읽힌다', async () => {
    await asUser(A.userId, (db) => pk.setPackageState(db, A.schoolId, { code: 'service_pack', state: 'disabled', reason: '학기 끝' }));
    await expect(asUser(A.userId, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: 'x', hours: 1 } }))).rejects.toThrow('켜진 꾸러미');
    const [r] = await asUser(A.userId, (db) => pk.customRecords(db, A.schoolId, 'service'));
    await expect(asUser(A.userId, (db) => pk.moveCustomRecord(db, A.schoolId, { recordId: r.id, to: 'review' }))).rejects.toThrow('꺼진 꾸러미');
    expect((await asUser(A.userId, (db) => pk.listPackages(db, A.schoolId))).find((p) => p.code === 'service_pack')!.state).toEqual({ state: 'disabled', version: 3 });
  });
});
