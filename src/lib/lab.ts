import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/** 전체 관리 · 개발·연구소 보드. 권한은 RLS(전체 관리자만)가 강제한다. */

export const KINDS = {
  plan: { label: '개발 기획', statuses: { idea: '아이디어', planned: '계획', in_progress: '진행', done: '완료', dropped: '보류' } },
  tool: { label: '도구', statuses: { candidate: '후보', trial: '시범 적용', adopted: '채택', rejected: '제외' } },
  method: { label: '방법론', statuses: { candidate: '후보', trial: '시범 적용', adopted: '채택', rejected: '제외' } },
  lab: { label: '연구소', statuses: { idea: '아이디어', running: '실험 중', concluded: '결론', dropped: '보류' } },
  todo: { label: '할 일', statuses: { todo: '할 일', doing: '하는 중', done: '끝남' } },
} as const;
export type Kind = keyof typeof KINDS;
export const PRIORITIES = { high: '높음', normal: '보통', low: '낮음' } as const;

export type Item = {
  id: string; kind: Kind; title: string; body: string; status: string; priority: keyof typeof PRIORITIES;
  due_date: string | null; tags: string[]; link: string | null; parent_id: string | null; sort: number;
  created_at: string; updated_at: string; archived_at: string | null; history_count: number;
};

export async function listItems(db: Db, includeArchived = false): Promise<Item[]> {
  const { rows } = await db.query<Item>(
    `select i.id, i.kind, i.title, i.body, i.status, i.priority, to_char(i.due_date, 'YYYY-MM-DD') as due_date, i.tags, i.link,
            i.parent_id, i.sort, i.created_at, i.updated_at, i.archived_at,
            (select count(*)::int from public.platform_item_history h where h.item_id = i.id) as history_count
     from public.platform_items i
     where $1 or i.archived_at is null
     order by case i.priority when 'high' then 0 when 'normal' then 1 else 2 end, i.sort, i.created_at`, [includeArchived]);
  return rows;
}

function clean(input: Record<string, unknown>, kind: Kind, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || input.title !== undefined) {
    const t = String(input.title ?? '').trim();
    if (!t) throw new ValidationError('제목을 입력해 주세요.');
    if (t.length > 200) throw new ValidationError('제목은 200자 이내로 적어 주세요.');
    out.title = t;
  }
  if (input.body !== undefined) {
    const b = String(input.body ?? '');
    if (b.length > 20000) throw new ValidationError('내용이 너무 깁니다.');
    out.body = b;
  }
  if (!partial || input.status !== undefined) {
    const statuses = KINDS[kind].statuses as Record<string, string>;
    const s = String(input.status ?? Object.keys(statuses)[0]);
    if (!(s in statuses)) throw new ValidationError('상태 값이 올바르지 않습니다.');
    out.status = s;
  }
  if (input.priority !== undefined) {
    const p = String(input.priority);
    if (!(p in PRIORITIES)) throw new ValidationError('우선순위 값이 올바르지 않습니다.');
    out.priority = p;
  }
  if (input.due_date !== undefined) {
    const d = input.due_date ? String(input.due_date) : null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ValidationError('기한은 날짜로 입력해 주세요.');
    out.due_date = d;
  }
  if (input.tags !== undefined) {
    const raw = Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(',');
    out.tags = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))].slice(0, 12).map((x) => x.slice(0, 30));
  }
  if (input.link !== undefined) {
    const l = input.link ? String(input.link).trim() : null;
    if (l && !/^https?:\/\//.test(l)) throw new ValidationError('링크는 http(s)로 시작해야 합니다.');
    out.link = l;
  }
  if (input.parent_id !== undefined) {
    const p = input.parent_id ? String(input.parent_id) : null;
    if (p && !isUuid(p)) throw new ValidationError('연결할 항목이 올바르지 않습니다.');
    out.parent_id = p;
  }
  return out;
}

export async function createItem(db: Db, input: Record<string, unknown>) {
  const kind = String(input.kind ?? '') as Kind;
  if (!(kind in KINDS)) throw new ValidationError('종류를 골라 주세요.');
  const v = clean(input, kind, false);
  const cols = ['kind', ...Object.keys(v)];
  const vals = [kind, ...Object.values(v)];
  const { rows: [r] } = await db.query(
    `insert into public.platform_items(${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, vals);
  return { id: r.id as string };
}

export async function updateItem(db: Db, id: string, input: Record<string, unknown>) {
  if (!isUuid(id)) throw new NotFoundError('항목을 찾을 수 없습니다.');
  const { rows: [cur] } = await db.query('select kind from public.platform_items where id = $1', [id]);
  if (!cur) throw new NotFoundError('항목을 찾을 수 없습니다.');
  const v = clean(input, cur.kind as Kind, true);
  if (input.archived !== undefined) v.archived_at = input.archived ? new Date().toISOString() : null;
  if (v.parent_id === id) throw new ValidationError('자기 자신에 연결할 수 없습니다.');
  const keys = Object.keys(v);
  if (!keys.length) return { id };
  await db.query(
    `update public.platform_items set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
    [id, ...Object.values(v)]);
  return { id };
}

export async function itemHistory(db: Db, id: string) {
  if (!isUuid(id)) throw new NotFoundError('항목을 찾을 수 없습니다.');
  const { rows } = await db.query(
    'select changed_at, before from public.platform_item_history where item_id = $1 order by id desc limit 50', [id]);
  return rows as { changed_at: string; before: Partial<Item> }[];
}
