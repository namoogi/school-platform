/** DataTable 정렬 규칙. 화면 밖에서도 시험할 수 있게 컴포넌트와 분리한다. */

export type SortValue = string | number | null | undefined;
export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir } | null;

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** 두 값 비교. 빈 값(null·undefined·'')은 방향과 관계없이 항상 맨 뒤 */
export function compareValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const ea = a === null || a === undefined || a === '';
  const eb = b === null || b === undefined || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  const base = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
  return dir === 'asc' ? base : -base;
}

/** 안정 정렬: 값이 같으면 원래 순서를 지킨다 */
export function sortRows<T extends { sort?: Record<string, SortValue> }>(rows: readonly T[], state: SortState): T[] {
  if (!state) return [...rows];
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => compareValues(x.row.sort?.[state.key], y.row.sort?.[state.key], state.dir) || x.i - y.i)
    .map((x) => x.row);
}

/** 열 머리를 누를 때 다음 상태: 다른 열 → 오름차순, 같은 열 → 오름 ↔ 내림 */
export function nextSort(state: SortState, key: string): SortState {
  if (!state || state.key !== key) return { key, dir: 'asc' };
  return { key, dir: state.dir === 'asc' ? 'desc' : 'asc' };
}
