import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 61차 ADR 0025 F5 — 정의 엔진(E3 기록 유형 · E4 양식·목록·출력 · E5 흐름) + 검사기 + 기능 꾸러미 + 학교 정의 기록.
 * 검사는 DB(private.check_definition · check_package)가 한다. 이 파일은 그 함수를 부르고, 미리보기(합성 자료)를 만든다.
 * 미리보기는 학교 자료를 읽지 않는다: 명세만 받아 '예시' 값으로 양식·목록·출력을 그린다.
 */
export type DefKind = 'record_type' | 'form' | 'view' | 'output' | 'flow';
export const DEF_KINDS: DefKind[] = ['record_type', 'form', 'view', 'output', 'flow'];
export type Issue = { level: 'error' | 'warn'; path: string; message: string };
type LText = Record<string, string>;
export type Field = {
  key: string; type: 'text' | 'longtext' | 'number' | 'integer' | 'date' | 'boolean' | 'choice' | 'multi_choice' | 'hours' | 'url';
  label: LText; privacy: 'directory' | 'internal' | 'sensitive' | 'restricted'; required?: boolean; max_length?: number; options?: { code: string; label: LText }[];
};
export type RecordTypeSpec = { title: LText; subject: 'person' | 'offering' | 'person_offering'; fields: Field[]; flow?: string };
export type FormSpec = { record_type: string; sections: { title?: LText; fields: string[] }[] };
export type ViewSpec = { record_type: string; columns: string[] };
export type OutputSpec = { record_type: string; blocks: ({ type: 'heading' | 'text'; text: LText } | { type: 'field'; key: string } | { type: 'fields' | 'table'; keys: string[] })[] };
export type FlowSpec = { states: { key: string; label: LText }[]; initial: string; final: string[]; transitions: { from: string; to: string; roles: ('admin' | 'teacher' | 'author')[] }[] };
export type Member = { kind: DefKind; code: string; version?: number };
export type Saved = { code: string; version: number; valid: boolean; issues: Issue[] };

const one = async <T>(db: Db, sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0]?.v as T;
const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError('err.whatNotFound', { what });
  return v;
};
const kindOf = (v: unknown): DefKind => {
  if (!DEF_KINDS.includes(v as DefKind)) throw new ValidationError('err.pkg.defKind');
  return v as DefKind;
};

// ── 사람(학교 관리자) ─────────────────────────────────────
export const checkDefinition = (db: Db, kind: DefKind, code: string, spec: unknown) =>
  one<Issue[]>(db, 'select app.check_definition($1, $2, $3) as v', [kindOf(kind), code, JSON.stringify(spec ?? {})]);
export const saveDefinition = (db: Db, schoolId: string, i: { kind: DefKind; code: string; spec: unknown; why?: string; base_version: number }) =>
  one<Saved & { kind: DefKind }>(db, 'select app.save_definition($1, $2) as v', [schoolId, JSON.stringify({ ...i, kind: kindOf(i.kind) })]);
export const savePackage = (db: Db, schoolId: string, i: { code: string; title: LText; members: Member[]; why?: string; base_version: number }) =>
  one<Saved & { members: Required<Member>[] }>(db, 'select app.save_package($1, $2) as v', [schoolId, JSON.stringify(i)]);
export const setPackageState = (db: Db, schoolId: string, i: { code: string; state: 'enabled' | 'disabled'; version?: number; reason?: string }) =>
  one<{ code: string; version: number; state: string }>(db, 'select app.set_package_state($1, $2) as v', [schoolId, JSON.stringify(i)]);

export type PackageRow = { code: string; version: number; title: LText; members: Required<Member>[]; valid: boolean; issues: Issue[]; why: string | null;
  author_kind: 'human' | 'agent'; state: { state: 'enabled' | 'disabled'; version: number } | null };
export async function listPackages(db: Db, schoolId: string): Promise<PackageRow[]> {
  return (await db.query<PackageRow>(
    `select fp.code, v.version, v.title, v.members, v.valid, v.issues, v.why, v.author_kind,
            (select jsonb_build_object('state', s.state, 'version', s.version) from public.package_states s where s.package_id = fp.id order by s.decided_at desc, s.id desc limit 1) as state
       from public.feature_packages fp join lateral (select * from public.package_versions x where x.package_id = fp.id order by x.version desc limit 1) v on true
      where fp.school_id = $1 order by fp.code`, [schoolId])).rows;
}
export type DefinitionRow = { kind: DefKind; code: string; version: number; spec: Record<string, unknown>; valid: boolean; issues: Issue[]; author_kind: string };
export async function listDefinitions(db: Db, schoolId: string): Promise<DefinitionRow[]> {
  return (await db.query<DefinitionRow>(
    `select d.kind, d.code, v.version, v.spec, v.valid, v.issues, v.author_kind
       from public.definitions d join lateral (select * from public.definition_versions x where x.definition_id = d.id order by x.version desc limit 1) v on true
      where d.school_id = $1 order by d.kind, d.code`, [schoolId])).rows;
}
/** 꾸러미 판이 가리키는 정의 판 명세들 */
export async function packageSpecs(db: Db, schoolId: string, code: string, version?: number) {
  const { rows } = await db.query<{ kind: DefKind; code: string; version: number; spec: Record<string, unknown> }>(
    `with pv as (select v.members from public.feature_packages fp join public.package_versions v on v.package_id = fp.id
                  where fp.school_id = $1 and fp.code = $2 and ($3::int is null or v.version = $3) order by v.version desc limit 1)
     select m ->> 'kind' as kind, m ->> 'code' as code, (m ->> 'version')::int as version, dv.spec
       from pv cross join jsonb_array_elements(pv.members) m
       join public.definitions d on d.school_id = $1 and d.kind = m ->> 'kind' and d.code = m ->> 'code'
       join public.definition_versions dv on dv.definition_id = d.id and dv.version = (m ->> 'version')::int`, [schoolId, code, version ?? null]);
  if (!rows.length) throw new NotFoundError('err.pkg.notFound');
  return rows;
}

// ── 학교 정의 기록 ───────────────────────────────────────
export const addCustomRecord = (db: Db, schoolId: string, i: { recordType: string; personId?: string; offeringId?: string; data: Record<string, unknown>; correctsId?: string; reason?: string }) =>
  one<string>(db, 'select app.add_custom_record($1, $2) as v', [schoolId, JSON.stringify({
    record_type: i.recordType, person_id: i.personId ?? null, offering_id: i.offeringId ?? null, data: i.data, corrects_id: i.correctsId ?? null, reason: i.reason ?? null,
  })]);
export const moveCustomRecord = (db: Db, schoolId: string, i: { recordId: string; to: string; from?: string; note?: string }) =>
  one<string>(db, 'select app.move_custom_record($1, $2) as v', [schoolId, JSON.stringify({ record_id: uuid(i.recordId, '기록'), to_state: i.to, from_state: i.from ?? null, note: i.note ?? null })]);
export type CustomRecord = { id: string; person_id: string | null; offering_id: string | null; data: Record<string, unknown>; state: string | null; corrects_id: string | null; recorded_at: string };
/** 지금 기록(정정된 것은 빼고) + 지금 상태 */
export async function customRecords(db: Db, schoolId: string, recordType: string): Promise<CustomRecord[]> {
  return (await db.query<CustomRecord>(
    `select r.id, r.person_id, r.offering_id, r.data, r.corrects_id, r.recorded_at,
            (select t.to_state from public.custom_record_transitions t where t.record_id = r.id order by t.moved_at desc, t.id desc limit 1) as state
       from public.custom_records r join public.definitions d on d.id = r.definition_id
      where r.school_id = $1 and d.code = $2 and d.kind = 'record_type'
        and not exists (select 1 from public.custom_records z where z.corrects_id = r.id)
      order by r.recorded_at, r.id`, [schoolId, recordType])).rows;
}

// ── 미리보기 (합성 자료만) ───────────────────────────────
const SAMPLE_PEOPLE = ['예시 학생 1', '예시 학생 2', '예시 학생 3'];
function sampleValue(f: Field, n: number): unknown {
  switch (f.type) {
    case 'text': return `${f.label.ko ?? f.label.en ?? f.key} 예시 ${n + 1}`;
    case 'longtext': return `${f.label.ko ?? f.label.en ?? f.key}에 대한 예시 서술 ${n + 1}.`;
    case 'number': return 10 + n * 2.5;
    case 'integer': return 3 + n;
    case 'hours': return 2 + n;
    case 'date': return `2026-0${3 + n}-1${n}`;
    case 'boolean': return n % 2 === 0;
    case 'choice': return f.options?.[n % (f.options?.length || 1)]?.code ?? null;
    case 'multi_choice': return (f.options ?? []).slice(0, 1 + (n % 2)).map((o) => o.code);
    case 'url': return `https://example.org/sample-${n + 1}`;
  }
}
const lbl = (t: LText | undefined, lang: string) => (t ? t[lang] ?? t.ko ?? t.en ?? '' : '');
export type Preview = {
  record_type: string; title: string; flow: { states: string[]; initial: string } | null;
  form: { title: string; fields: { key: string; label: string; type: string; required: boolean; privacy: string; options?: string[] }[] }[] | null;
  list: { columns: string[]; rows: string[][] } | null;
  output: { type: string; text?: string; rows?: string[][] }[] | null;
  samples: { person: string; data: Record<string, unknown>; state: string | null }[];
};
/** 꾸러미 명세(정의 판 묶음)로 합성 미리보기를 만든다. 학교 자료는 읽지 않는다 */
export function previewPackage(specs: { kind: DefKind; code: string; spec: Record<string, unknown> }[], lang = 'ko'): Preview[] {
  const by = (k: DefKind) => specs.filter((s) => s.kind === k);
  return by('record_type').map(({ code, spec }) => {
    const rt = spec as unknown as RecordTypeSpec;
    const fields = rt.fields ?? [];
    const fieldOf = (k: string) => fields.find((f) => f.key === k);
    const flow = rt.flow ? (by('flow').find((f) => f.code === rt.flow)?.spec as unknown as FlowSpec | undefined) : undefined;
    const samples = SAMPLE_PEOPLE.map((person, n) => ({
      person, data: Object.fromEntries(fields.map((f) => [f.key, sampleValue(f, n)])), state: flow ? flow.initial : null,
    }));
    const show = (k: string, s: (typeof samples)[number]) => {
      if (k === 'person') return s.person;
      if (k === 'state') return s.state ?? '';
      if (k === 'recorded_at') return '2026-03-02';
      const f = fieldOf(k); const v = s.data[k];
      if (!f) return '';
      if (f.type === 'choice') return lbl(f.options?.find((o) => o.code === v)?.label, lang);
      if (f.type === 'multi_choice') return (v as string[]).map((c) => lbl(f.options?.find((o) => o.code === c)?.label, lang)).join(', ');
      if (f.type === 'boolean') return v ? '예' : '아니오';
      return String(v ?? '');
    };
    const head = (k: string) => (k === 'person' ? '학생' : k === 'state' ? '상태' : k === 'recorded_at' ? '기록일' : lbl(fieldOf(k)?.label, lang));
    const form = by('form').map((x) => x.spec as unknown as FormSpec).find((x) => x.record_type === code);
    const view = by('view').map((x) => x.spec as unknown as ViewSpec).find((x) => x.record_type === code);
    const out = by('output').map((x) => x.spec as unknown as OutputSpec).find((x) => x.record_type === code);
    return {
      record_type: code, title: lbl(rt.title, lang), flow: flow ? { states: flow.states.map((s) => s.key), initial: flow.initial } : null,
      form: form ? form.sections.map((sec) => ({
        title: lbl(sec.title, lang),
        fields: sec.fields.map((k) => fieldOf(k)).filter((f): f is Field => !!f).map((f) => ({
          key: f.key, label: lbl(f.label, lang), type: f.type, required: !!f.required, privacy: f.privacy, options: f.options?.map((o) => lbl(o.label, lang)),
        })),
      })) : null,
      list: view ? { columns: view.columns.map(head), rows: samples.map((s) => view.columns.map((k) => show(k, s))) } : null,
      output: out ? out.blocks.map((b) => {
        if (b.type === 'heading' || b.type === 'text') return { type: b.type, text: lbl(b.text, lang) };
        if (b.type === 'field') return { type: 'field', text: `${head(b.key)}: ${show(b.key, samples[0])}` };
        if (b.type === 'fields') return { type: 'fields', rows: b.keys.map((k) => [head(k), show(k, samples[0])]) };
        const keys = (b as { keys: string[] }).keys;
        return { type: 'table', rows: [keys.map(head), ...samples.map((s) => keys.map((k) => show(k, s)))] };
      }) : null,
      samples,
    };
  });
}

// ── 에이전트(작업 토큰 'package') ─────────────────────────
export const agentPackages = (db: Db, token: string) =>
  one<{ definitions: DefinitionRow[]; packages: PackageRow[] }>(db, 'select agent.packages($1) as v', [token]);
export function agentSaveDefinition(db: Db, token: string, input: Record<string, unknown>) {
  const n = Number(input.base_version);
  return one<Saved & { kind: DefKind }>(db, 'select agent.save_definition($1, $2) as v', [token, JSON.stringify({
    kind: kindOf(input.kind), code: String(input.code ?? ''), spec: input.spec ?? null, why: typeof input.why === 'string' ? input.why.slice(0, 500) : null,
    base_version: Number.isInteger(n) && n >= 0 ? n : null,
  })]);
}
export function agentSavePackage(db: Db, token: string, input: Record<string, unknown>) {
  const n = Number(input.base_version);
  return one<Saved & { members: Required<Member>[] }>(db, 'select agent.save_package($1, $2) as v', [token, JSON.stringify({
    code: String(input.code ?? ''), title: input.title ?? null, members: Array.isArray(input.members) ? input.members : [],
    why: typeof input.why === 'string' ? input.why.slice(0, 500) : null, base_version: Number.isInteger(n) && n >= 0 ? n : null,
  })]);
}
/** 에이전트 미리보기: 토큰으로 읽을 수 있는 꾸러미의 최신 판 명세만 쓴다 */
export async function agentPreview(db: Db, token: string, code: string, lang = 'ko') {
  const all = await agentPackages(db, token);
  const pkg = all.packages.find((p) => p.code === code);
  if (!pkg) throw new NotFoundError('err.pkg.notFound');
  const specs = pkg.members.map((m) => {
    const d = all.definitions.find((x) => x.kind === m.kind && x.code === m.code);
    return d && d.version === m.version ? { kind: m.kind, code: m.code, spec: d.spec } : null;
  });
  if (specs.some((s) => !s)) throw new ValidationError('err.pkg.stale');
  return { package: { code: pkg.code, version: pkg.version, valid: pkg.valid, issues: pkg.issues, state: pkg.state }, preview: previewPackage(specs as never, lang) };
}
