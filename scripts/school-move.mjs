// 학교 한 곳 꺼내기·넣기·확인 (ADR 0035: 공용 기본 + 언제든 전용·독립으로 옮길 수 있게)
// 사용
//   SOURCE_DATABASE_URL=... node scripts/school-move.mjs export <학교 주소 이름|id> <묶음 파일>
//   TARGET_DATABASE_URL=... node scripts/school-move.mjs import <묶음 파일> [--status active|trial] [--auth reset|keep]
//   node scripts/school-move.mjs keys <묶음 파일>   (버킷을 바꿀 때 복사할 R2 객체 키 목록)
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/school-move.mjs verify <묶음 파일>
// - 묶음 파일에는 그 학교의 모든 기록(학생·교직원 개인정보 포함)이 들어 있다. 저장소에 커밋하지 않고(.school-move/ 는 무시됨),
//   옮긴 뒤 지운다. 운영 DB 주소·비밀번호는 환경 변수로만 받고 출력하지 않는다.
// - 넣기는 '그 학교가 아직 없는' 대상 DB에만 한다(같은 마이그레이션을 적용한 빈 프로젝트 또는 셀).
//   트리거·외래키 검사를 잠시 끄고(session_replication_role = replica, pg_dump 와 같은 방식) 넣은 뒤,
//   같은 트랜잭션에서 외래키 고아 행을 직접 검사해 하나라도 있으면 모두 되돌린다.
// - 파일(R2): 버킷을 바꿀 때는 `keys` 가 내놓는 객체 키를 그대로 복사한다(이 도구 밖, docs/SCHOOL-MOVE.md).
import fs from 'node:fs';
import pg from 'pg';

const q = (name) => `"${name.replace(/"/g, '""')}"`;

/** public 에서 school_id 칸이 있는 표 목록 */
export async function schoolTables(db) {
  const { rows } = await db.query(
    `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped)
      order by 1`);
  return rows.map((r) => r.t);
}

/** 넣을 수 있는 칸(생성 칸 제외)과 '항상 생성' 식별 칸이 있는지 */
async function columnsOf(db, schema, table) {
  const { rows } = await db.query(
    `select a.attname as name, a.attidentity as ident, a.attgenerated as gen, format_type(a.atttypid, a.atttypmod) as type
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped order by a.attnum`, [schema, table]);
  return { cols: rows.filter((r) => !r.gen).map((r) => r.name), always: rows.some((r) => r.ident === 'a'), all: rows };
}

/** 한 칸짜리 외래키 목록(학교 표 → 어떤 표) */
async function singleForeignKeys(db) {
  const { rows } = await db.query(
    `select c.relname as t, a.attname as col, rn.nspname as rs, r.relname as rt, ra.attname as rcol, not a.attnotnull as nullable
       from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_class r on r.oid = k.confrelid join pg_namespace rn on rn.oid = r.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
       join pg_attribute ra on ra.attrelid = r.oid and ra.attnum = k.confkey[1]
      where k.contype = 'f' and n.nspname = 'public' and array_length(k.conkey, 1) = 1`);
  return rows;
}

/** 옮기는 쪽에서 그대로 들고 가는 플랫폼 표(그 밖의 플랫폼 표를 가리키는 칸은 연결만 끊는다) */
const CARRIED = new Set(['schools', 'app_users', 'baselines']);

export async function exportSchool(db, key) {
  // 모든 표·계정·기본판·마이그레이션을 한 시점(스냅샷)에서 읽는다. 꺼내는 도중 관제 쪽 기록이 생겨도 부모 없는 자식이 섞이지 않게
  await db.query('begin isolation level repeatable read read only');
  try {
    return await exportSnapshot(db, key);
  } finally {
    await db.query('rollback');
  }
}

async function exportSnapshot(db, key) {
  const { rows: [school] } = await db.query(
    `select * from public.schools where id::text = $1 or slug = $1`, [key]);
  if (!school) throw new Error('그 학교를 찾을 수 없습니다(학교 주소 이름 또는 id를 확인하세요).'); // 입력값은 오류에 되풀이하지 않는다(리뷰 규칙 3)
  const id = school.id;
  const tables = /** @type {Record<string, any[]>} */ ({});
  const userIds = new Set();
  const { rows: appUsers } = await db.query('select id::text from private.app_users');
  const known = new Set(appUsers.map((r) => r.id));
  const schoolSet = new Set(await schoolTables(db));
  for (const t of schoolSet) {
    const { rows: [{ data }] } = await db.query(
      `select coalesce(json_agg(x order by row_to_json(x)::text), '[]'::json) as data from public.${q(t)} x where school_id = $1`, [id]);
    if (data.length) tables[t] = data;
  }
  // 연결 정리: 이 학교 묶음 밖(다른 학교·학교 없는 관제 세션·연구소 항목 등)을 가리키는 칸은 비운다(외래키가 비움을 허락할 때만).
  // 비운 칸은 normalized 에 적어, 확인(verify) 때 같은 칸을 빼고 비교한다.
  const normalized = /** @type {Record<string, Record<string, number>>} */ ({});
  const ids = (t, col) => new Set((tables[t] ?? []).map((r) => String(r[col])));
  for (const f of await singleForeignKeys(db)) {
    if (!tables[f.t] || CARRIED.has(f.rt)) continue;
    const inside = schoolSet.has(f.rt) ? ids(f.rt, f.rcol) : new Set();
    for (const r of tables[f.t]) {
      if (r[f.col] == null || inside.has(String(r[f.col]))) continue;
      if (!f.nullable) throw new Error(`${f.t}.${f.col} 이 학교 밖(${f.rt})을 가리키는데 비울 수 없습니다. 꺼내기 규칙을 더해야 합니다.`);
      r[f.col] = null;
      ((normalized[f.t] ??= {})[f.col] = (normalized[f.t]?.[f.col] ?? 0) + 1);
    }
  }
  // 사람 계정: uuid 칸 값 가운데 계정 표에 있는 것(외래키가 없는 created_by 같은 칸 포함)
  for (const [t, rows] of Object.entries(tables)) {
    const { all } = await columnsOf(db, 'public', t);
    for (const c of all.filter((x) => x.type === 'uuid' && x.name !== 'id' && x.name !== 'school_id')) {
      for (const r of rows) if (r[c.name] && known.has(r[c.name])) userIds.add(r[c.name]);
    }
  }
  // 이 학교 구성원·열람 계정만 로그인 정보를 들고 간다. 전체 관리자(관제)와 그 밖의 사람은 이름표만 남긴다:
  // 비밀번호·외부 로그인 연결·전체 관리자 권한을 빼고 메일을 가린다(옮긴 DB에서 관제가 관리자로 되살아나지 않게)
  const holders = new Set([...(tables.memberships ?? []), ...(tables.portal_accounts ?? [])].map((r) => r.user_id).filter(Boolean));
  const { rows: [{ data: users }] } = await db.query(
    `select coalesce(json_agg(u order by u.id), '[]'::json) as data from private.app_users u where u.id = any($1::uuid[])`, [[...userIds]]);
  const exported = users.map((u) => (holders.has(u.id) && !u.is_platform_admin)
    ? { ...u, is_platform_admin: false }
    : { ...u, email: `moved-${u.id}@invalid.example`, password_hash: null, auth_subject: null, is_platform_admin: false });
  const baselineIds = new Set([...(tables.school_baselines ?? []).map((r) => r.version), ...(tables.baseline_offers ?? []).map((r) => r.to_version)]);
  const { rows: [{ data: baselines }] } = await db.query(
    `select coalesce(json_agg(b), '[]'::json) as data from public.baselines b where b.version = any($1::int[])`, [[...baselineIds].filter((v) => v != null)]);
  // 123차: 학교 관할 판이 가리키는 학사 관리 템플릿 판(관제 표). 운영 중에 낸 판이 대상 DB에 없을 수 있어 함께 옮긴다
  const tplPairs = [...new Set((tables.school_profiles ?? []).filter((r) => r.template_key && r.template_version != null)
    .map((r) => `${r.template_key}:${r.template_version}`))].map((x) => { const [k, v] = x.split(':'); return { k, v: Number(v) }; });
  const { rows: [{ data: academicTemplates }] } = await db.query(
    `select coalesce(json_agg(t order by t.key, t.version), '[]'::json) as data from public.academic_templates t
      join json_to_recordset($1::json) as p(k text, v int) on p.k = t.key and p.v = t.version`, [JSON.stringify(tplPairs)]);
  return {
    format: 'school-move/1',
    exported_at: new Date().toISOString(),
    school_id: id,
    migrations: (await db.query('select name from _migrations.applied order by name')).rows.map((r) => r.name),
    school: JSON.parse(JSON.stringify(school)),
    users: exported,
    baselines,
    academic_templates: academicTemplates,
    normalized,
    tables,
  };
}

async function insertRows(db, schema, table, rows, { onConflictNothing = false } = {}) {
  if (!rows.length) return 0;
  const { cols, always } = await columnsOf(db, schema, table);
  const list = cols.map(q).join(', ');
  const { rowCount } = await db.query(
    `insert into ${q(schema)}.${q(table)} (${list}) ${always ? 'overriding system value' : ''}
     select ${list} from json_populate_recordset(null::${q(schema)}.${q(table)}, $1::json)
     ${onConflictNothing ? 'on conflict do nothing' : ''}`, [JSON.stringify(rows)]);
  return rowCount;
}

/** 대상 DB 전체에서 외래키가 가리키는 행이 없는 경우를 찾는다 */
export async function orphanForeignKeys(db) {
  const { rows: fks } = await db.query(
    `select k.conname, cn.nspname as cs, c.relname as ct, rn.nspname as rs, r.relname as rt,
            array(select a.attname from unnest(k.conkey) with ordinality u(n, i) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.i)::text[] as cols,
            array(select a.attname from unnest(k.confkey) with ordinality u(n, i) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n order by u.i)::text[] as rcols
       from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
       join pg_class r on r.oid = k.confrelid join pg_namespace rn on rn.oid = r.relnamespace
      where k.contype = 'f' and cn.nspname in ('public', 'private', 'agent', 'control', 'app')`);
  const bad = [];
  for (const f of fks) {
    const notNull = f.cols.map((c) => `x.${q(c)} is not null`).join(' and ');
    const join = f.cols.map((c, i) => `y.${q(f.rcols[i])} = x.${q(c)}`).join(' and ');
    const { rows: [{ n }] } = await db.query(
      `select count(*)::int as n from ${q(f.cs)}.${q(f.ct)} x where ${notNull}
         and not exists (select 1 from ${q(f.rs)}.${q(f.rt)} y where ${join})`);
    if (n) bad.push(`${f.ct}.${f.conname}: ${n}행`);
  }
  return bad;
}

/** 원본·대상의 마이그레이션 목록이 양쪽으로 똑같아야 넣는다(대상에만 있는 마이그레이션이 새 학교 표를 더했을 수 있다) */
export async function sameMigrations(db, bundle) {
  const { rows } = await db.query('select name from _migrations.applied order by name');
  const target = rows.map((r) => r.name);
  const onlySource = bundle.migrations.filter((m) => !target.includes(m));
  const onlyTarget = target.filter((m) => !bundle.migrations.includes(m));
  return { onlySource, onlyTarget, same: !onlySource.length && !onlyTarget.length };
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** 순번 번호 칸(식별 칸·nextval 기본값, 기본 키든 아니든)에서 대상에 이미 같은 번호가 있는지. 다른 학교가 사는 셀로 넣을 때 겹칠 수 있다 */
async function identityCollisions(db, bundle) {
  const hits = [];
  for (const [t, rows] of Object.entries(bundle.tables)) {
    const { rows: cols } = await db.query(
      `select a.attname as col from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where n.nspname = 'public' and c.relname = $1 and a.attnum > 0 and not a.attisdropped
          and (a.attidentity <> '' or pg_get_expr(d.adbin, d.adrelid) like 'nextval(%')`, [t]);
    for (const { col } of cols) {
      const vals = rows.map((r) => r[col]).filter((v) => v != null).map(String);
      if (!vals.length) continue;
      const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.${q(t)} where ${q(col)}::text = any($1::text[])`, [vals]);
      if (n) hits.push(`${t}.${col} ${n}행`);
    }
  }
  return hits;
}

/**
 * status: 넣은 뒤 학교 상태. 옮기는 동안 원본을 '이용 중지'로 두므로, 대상에서 열 상태를 넣을 때 정한다
 * auth: 'reset'(기본) 이면 외부 로그인 연결(auth_subject)을 비운다. 대상이 다른 로그인 서버(독립형의 학교 Supabase 등)를 쓰면
 *   옛 연결이 새 로그인과 맞지 않아 거부되므로, 비워 두고 첫 로그인 때 확인된 메일로 다시 잇는다(초대와 같은 길, src/lib/google.ts).
 *   'keep' 은 같은 로그인 서버를 계속 쓸 때(전용형 + 공용 로그인)만.
 */
// 123차 학사 관리 템플릿: 같은 키·판인데 내용 칸(내용·제목·설명·바뀐 이유·순서)이 하나라도 다르면 넣지 않는다.
// 넣기 트랜잭션 안에서 새 판 내기(app.publish_academic_template)와 같은 키 잠금을 잡고 본다(그 사이 공개된 판을 놓치지 않게, Codex 199번 PR 검토)
async function checkTemplates(db, templates) {
  const snap = (x) => JSON.stringify(sortKeys({ manifest: x.manifest, title: x.title, summary: x.summary, why: x.why ?? null, sort_order: x.sort_order }));
  // 키 잠금은 정렬·중복 제거한 순서로 먼저 모두 잡는다(동시에 두 학교를 옮겨도 서로 기다리다 멈추지 않게, Codex 199번 PR 검토)
  for (const key of [...new Set(templates.map((t) => t.key))].sort()) {
    await db.query(`select pg_advisory_xact_lock(hashtext('school-platform:academic_templates'), hashtext($1))`, [key]);
  }
  for (const t of templates) {
    const { rows: [d] } = await db.query('select manifest, title, summary, why, sort_order from public.academic_templates where key = $1 and version = $2', [t.key, t.version]);
    if (d && snap(d) !== snap(t)) throw new Error(`대상의 학사 관리 템플릿 ${t.key} ${t.version}판이 원본과 내용이 다릅니다. 템플릿을 맞춘 뒤 넣으세요.`);
  }
}

export async function importSchool(db, bundle, { status, auth = 'reset' } = {}) {
  if (!['reset', 'keep'].includes(auth)) throw new Error('로그인 연결은 reset·keep 중 하나입니다.');
  if (bundle.format !== 'school-move/1') throw new Error('묶음 형식이 다릅니다.');
  const m = await sameMigrations(db, bundle);
  if (m.onlySource.length) throw new Error(`대상 DB에 마이그레이션 ${m.onlySource.length}개가 빠져 있습니다. 같은 판까지 올린 뒤 넣으세요.`);
  if (m.onlyTarget.length) throw new Error(`대상 DB에만 있는 마이그레이션 ${m.onlyTarget.length}개가 있습니다. 원본을 같은 판까지 올린 뒤 다시 꺼내세요.`);
  const school = { ...bundle.school };
  if (status) {
    if (!['trial', 'active', 'suspended'].includes(status)) throw new Error('상태는 trial·active·suspended 중 하나입니다.');
    school.status = status;
  } else if (school.status === 'suspended') {
    throw new Error("묶음의 학교가 '이용 중지' 상태입니다. 대상에서 열 상태를 --status active(또는 trial)로 정해 주세요.");
  }
  const { rowCount: exists } = await db.query('select 1 from public.schools where id = $1', [bundle.school_id]);
  if (exists) throw new Error('대상 DB에 이미 그 학교가 있습니다. 넣기는 빈 자리에만 합니다.');
  // 다른 학교가 사는 셀로 넣을 때: 순번 번호가 겹치면 넣지 않는다(번호 다시 매기기는 셀 합치기 단계에서, ADR 0035 남은 일)
  // 기본판: 같은 판 번호인데 내용이 다르면 넣지 않는다(학교가 엉뚱한 기본판에 묶이지 않게)
  for (const b of bundle.baselines) {
    const { rows: [t] } = await db.query('select manifest from public.baselines where version = $1', [b.version]);
    if (t && JSON.stringify(t.manifest) !== JSON.stringify(b.manifest) && JSON.stringify(sortKeys(t.manifest)) !== JSON.stringify(sortKeys(b.manifest))) {
      throw new Error(`대상의 기본판 ${b.version}판이 원본과 내용이 다릅니다. 기본판을 맞춘 뒤 넣으세요.`);
    }
  }
  // 계정: 같은 메일인데 다른 id 인 계정이 대상에 있으면 넣지 않는다(연결이 끊긴 채 되돌려지기 전에 이유를 알린다)
  const { rows: [{ n: emailClash }] } = await db.query(
    `select count(*)::int as n from private.app_users t join json_populate_recordset(null::private.app_users, $1::json) u
        on lower(t.email) = lower(u.email) and t.id <> u.id`, [JSON.stringify(bundle.users)]);
  if (emailClash) throw new Error(`대상에 같은 메일·다른 id 인 계정이 ${emailClash}개 있습니다. 계정을 합치는 기능은 아직 없어 넣지 않습니다.`);
  const collisions = await identityCollisions(db, bundle);
  if (collisions.length) throw new Error(`대상에 같은 순번 번호가 이미 있습니다(${collisions.join(', ')}). 지금은 빈 대상 또는 번호가 겹치지 않는 셀에만 넣습니다.`);
  await db.query('begin');
  try {
    await db.query('set local session_replication_role = replica');
    await insertRows(db, 'public', 'baselines', bundle.baselines, { onConflictNothing: true });
    await checkTemplates(db, bundle.academic_templates ?? []);
    await insertRows(db, 'public', 'academic_templates', bundle.academic_templates ?? [], { onConflictNothing: true });
    await insertRows(db, 'private', 'app_users', auth === 'reset' ? bundle.users.map((u) => ({ ...u, auth_subject: null })) : bundle.users, { onConflictNothing: true });
    await insertRows(db, 'public', 'schools', [school]);
    const counts = {};
    for (const [t, rows] of Object.entries(bundle.tables)) counts[t] = await insertRows(db, 'public', t, rows);
    await db.query('set local session_replication_role = origin');
    // 순번 칸(식별 칸) 다음 값을 넣은 최댓값 뒤로 맞춘다
    const { rows: seqs } = await db.query(
      `select n.nspname as s, c.relname as t, a.attname as col, pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) as seq
         from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and a.attidentity <> '' and a.attnum > 0`);
    for (const s of seqs) if (s.seq && bundle.tables[s.t]) {
      await db.query(`select setval($1, greatest((select coalesce(max(${q(s.col)}), 0) from ${q(s.s)}.${q(s.t)}), 1))`, [s.seq]);
    }
    const orphans = await orphanForeignKeys(db);
    if (orphans.length) throw new Error(`가리키는 행이 없는 연결이 있어 되돌렸습니다: ${orphans.slice(0, 10).join(', ')}`);
    await db.query('commit');
    return counts;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

/** 묶음 행에 적힌 R2 객체 키(중복 제거) */
export function objectKeys(bundle) {
  const keys = new Set();
  for (const rows of Object.values(bundle.tables)) for (const r of rows) if (typeof r.object_key === 'string' && r.object_key) keys.add(r.object_key);
  return [...keys].sort();
}

/** 두 DB에서 그 학교의 표마다 행 수와 내용 지문(md5)을 비교한다 */
export async function compareSchool(src, dst, schoolId, normalized = {}) {
  const diffs = [];
  for (const t of await schoolTables(src)) {
    // 꺼낼 때 비운 칸(학교 밖 연결)은 양쪽 모두에서 빼고 비교한다
    const drop = Object.keys(normalized[t] ?? {}).map((c) => ` - '${c.replace(/'/g, "''")}'`).join('');
    const sum = async (db) => (await db.query(
      `select count(*)::int as n, md5(coalesce(string_agg((to_jsonb(x)${drop})::text, '|' order by (to_jsonb(x)${drop})::text), '')) as h
         from public.${q(t)} x where school_id = $1`, [schoolId])).rows[0];
    const [a, b] = [await sum(src), await sum(dst)];
    if (a.n !== b.n || a.h !== b.h) diffs.push(`${t}: 원본 ${a.n}행 / 대상 ${b.n}행${a.n === b.n ? ' (내용 다름)' : ''}`);
  }
  return diffs;
}

// ── 명령줄 ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a1, a2] = process.argv.slice(2);
  const connect = async (name) => {
    const url = process.env[name];
    if (!url) throw new Error(`${name} 이 필요합니다.`);
    const { pgOptions } = await import('./pg-options.mjs');
    // 원본·대상 비밀번호는 따로 받는다(SOURCE_DATABASE_PASSWORD · TARGET_DATABASE_PASSWORD, 78차 규약의 나눠 받기).
    // pg-options 는 DATABASE_PASSWORD 하나만 읽으므로 연결마다 잠시 바꿔 넣는다
    const saved = process.env.DATABASE_PASSWORD;
    const own = process.env[name.replace('_URL', '_PASSWORD')];
    if (own) process.env.DATABASE_PASSWORD = own; else delete process.env.DATABASE_PASSWORD;
    let opts;
    try { opts = pgOptions(url); } finally { if (saved === undefined) delete process.env.DATABASE_PASSWORD; else process.env.DATABASE_PASSWORD = saved; }
    const c = new pg.Client(opts);
    await c.connect();
    return c;
  };
  try {
    if (cmd === 'export' && a1 && a2) {
      const db = await connect('SOURCE_DATABASE_URL');
      const b = await exportSchool(db, a1);
      // 이미 있는 파일에 덮어쓸 때도 권한을 다시 좁힌다(mode 옵션은 새로 만들 때만 적용된다)
      if (fs.existsSync(a2)) fs.chmodSync(a2, 0o600);
      fs.writeFileSync(a2, JSON.stringify(b), { mode: 0o600 });
      fs.chmodSync(a2, 0o600);
      console.log(`꺼냄: 표 ${Object.keys(b.tables).length}개, 행 ${Object.values(b.tables).reduce((n, r) => n + r.length, 0)}개, 계정 ${b.users.length}명 → ${a2}`);
      console.log('주의: 이 파일에는 개인정보가 들어 있습니다. 커밋하지 말고, 옮긴 뒤 지우세요.');
      await db.end();
    } else if (cmd === 'import' && a1) {
      const db = await connect('TARGET_DATABASE_URL');
      const opt = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
      const counts = await importSchool(db, JSON.parse(fs.readFileSync(a1, 'utf8')), { status: opt('--status'), auth: opt('--auth') ?? 'reset' });
      console.log(`넣음: 표 ${Object.keys(counts).length}개, 행 ${Object.values(counts).reduce((n, v) => n + v, 0)}개`);
      await db.end();
    } else if (cmd === 'keys' && a1) {
      // 버킷을 바꿀 때 복사할 R2 객체 키(묶음 행에 적힌 그대로. 's/<학교 id>/…'와 예전 'sha256/…'이 섞여 있을 수 있다)
      const b = JSON.parse(fs.readFileSync(a1, 'utf8'));
      for (const k of objectKeys(b)) console.log(k);
    } else if (cmd === 'verify' && a1) {
      const bundle = JSON.parse(fs.readFileSync(a1, 'utf8'));
      const [s, d] = [await connect('SOURCE_DATABASE_URL'), await connect('TARGET_DATABASE_URL')];
      const diffs = await compareSchool(s, d, bundle.school_id, bundle.normalized ?? {});
      const orphans = await orphanForeignKeys(d);
      console.log(diffs.length || orphans.length ? [...diffs, ...orphans].join('\n') : '같음: 모든 표의 행 수·내용 지문이 일치하고 고아 연결이 없습니다.');
      await s.end(); await d.end();
      if (diffs.length || orphans.length) process.exit(1);
    } else {
      console.error('사용: export <학교> <파일> | import <파일> [--status active] | keys <파일> | verify <묶음 파일> (docs/SCHOOL-MOVE.md)');
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
