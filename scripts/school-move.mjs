// 학교 한 곳 꺼내기·넣기·확인 (ADR 0035: 공용 기본 + 언제든 전용·독립으로 옮길 수 있게)
// 사용
//   SOURCE_DATABASE_URL=... node scripts/school-move.mjs export <학교 주소 이름|id> <묶음 파일>
//   TARGET_DATABASE_URL=... node scripts/school-move.mjs import <묶음 파일>
//   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/school-move.mjs verify <묶음 파일>
// - 묶음 파일에는 그 학교의 모든 기록(학생·교직원 개인정보 포함)이 들어 있다. 저장소에 커밋하지 않고(.school-move/ 는 무시됨),
//   옮긴 뒤 지운다. 운영 DB 주소·비밀번호는 환경 변수로만 받고 출력하지 않는다.
// - 넣기는 '그 학교가 아직 없는' 대상 DB에만 한다(같은 마이그레이션을 적용한 빈 프로젝트 또는 셀).
//   트리거·외래키 검사를 잠시 끄고(session_replication_role = replica, pg_dump 와 같은 방식) 넣은 뒤,
//   같은 트랜잭션에서 외래키 고아 행을 직접 검사해 하나라도 있으면 모두 되돌린다.
// - 파일(R2)은 학교별 접두어 `schools/<학교 id>/`를 그대로 복사한다(이 도구 밖, docs/SCHOOL-MOVE.md).
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
  const { rows: [school] } = await db.query(
    `select * from public.schools where id::text = $1 or slug = $1`, [key]);
  if (!school) throw new Error(`학교를 찾을 수 없습니다: ${key}`);
  const id = school.id;
  const tables = {};
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
  return {
    format: 'school-move/1',
    exported_at: new Date().toISOString(),
    school_id: id,
    migrations: (await db.query('select name from _migrations.applied order by name')).rows.map((r) => r.name),
    school: JSON.parse(JSON.stringify(school)),
    users: exported,
    baselines,
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

export async function importSchool(db, bundle) {
  if (bundle.format !== 'school-move/1') throw new Error('묶음 형식이 다릅니다.');
  const { rows: applied } = await db.query('select name from _migrations.applied order by name');
  const missing = bundle.migrations.filter((m) => !applied.some((a) => a.name === m));
  if (missing.length) throw new Error(`대상 DB에 마이그레이션 ${missing.length}개가 빠져 있습니다. 같은 판까지 올린 뒤 넣으세요.`);
  const { rowCount: exists } = await db.query('select 1 from public.schools where id = $1', [bundle.school_id]);
  if (exists) throw new Error('대상 DB에 이미 그 학교가 있습니다. 넣기는 빈 자리에만 합니다.');
  await db.query('begin');
  try {
    await db.query('set local session_replication_role = replica');
    await insertRows(db, 'public', 'baselines', bundle.baselines, { onConflictNothing: true });
    await insertRows(db, 'private', 'app_users', bundle.users, { onConflictNothing: true });
    await insertRows(db, 'public', 'schools', [bundle.school]);
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
    const c = new pg.Client(pgOptions(url));
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
      const counts = await importSchool(db, JSON.parse(fs.readFileSync(a1, 'utf8')));
      console.log(`넣음: 표 ${Object.keys(counts).length}개, 행 ${Object.values(counts).reduce((n, v) => n + v, 0)}개`);
      await db.end();
    } else if (cmd === 'verify' && a1) {
      const bundle = JSON.parse(fs.readFileSync(a1, 'utf8'));
      const [s, d] = [await connect('SOURCE_DATABASE_URL'), await connect('TARGET_DATABASE_URL')];
      const diffs = await compareSchool(s, d, bundle.school_id, bundle.normalized ?? {});
      const orphans = await orphanForeignKeys(d);
      console.log(diffs.length || orphans.length ? [...diffs, ...orphans].join('\n') : '같음: 모든 표의 행 수·내용 지문이 일치하고 고아 연결이 없습니다.');
      await s.end(); await d.end();
      if (diffs.length || orphans.length) process.exit(1);
    } else {
      console.error('사용: export <학교> <파일> | import <파일> | verify <묶음 파일> (docs/SCHOOL-MOVE.md)');
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
