/** DataTable 정렬 규칙 (DB 없이) */
import { describe, expect, it } from 'vitest';
import { compareValues, nextSort, sortRows } from '@/lib/table-sort';

const rows = [
  { id: 'a', sort: { name: '룽아룬', seats: 5, month: '2026-11' } },
  { id: 'b', sort: { name: '드리미 10', seats: null, month: '2026-09' } },
  { id: 'c', sort: { name: '드리미 9', seats: 2, month: '2026-10' } },
  { id: 'd', sort: { name: 'Rungarun', seats: 2, month: '' } },
];
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe('DataTable 정렬', () => {
  it('정렬 상태가 없으면 원래 순서', () => {
    expect(ids(sortRows(rows, null))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('한국어 순서(한글 가나다 → 로마자), 숫자가 섞인 이름은 자연 정렬(9 < 10)', () => {
    expect(ids(sortRows(rows, { key: 'name', dir: 'asc' }))).toEqual(['c', 'b', 'a', 'd']);
  });

  it('숫자는 크기순이고, 같은 값은 원래 순서를 지킨다(안정 정렬)', () => {
    expect(ids(sortRows(rows, { key: 'seats', dir: 'asc' }))).toEqual(['c', 'd', 'a', 'b']);
    expect(ids(sortRows(rows, { key: 'seats', dir: 'desc' }))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('빈 값은 오름·내림 모두 맨 뒤', () => {
    expect(ids(sortRows(rows, { key: 'month', dir: 'asc' }))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(sortRows(rows, { key: 'month', dir: 'desc' }))).toEqual(['a', 'c', 'b', 'd']);
    expect(compareValues(null, undefined, 'asc')).toBe(0);
  });

  it('원래 배열을 바꾸지 않는다', () => {
    const before = ids(rows);
    sortRows(rows, { key: 'name', dir: 'desc' });
    expect(ids(rows)).toEqual(before);
  });

  it('같은 열을 다시 누르면 방향이 바뀌고, 다른 열은 오름차순부터', () => {
    expect(nextSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextSort({ key: 'name', dir: 'desc' }, 'seats')).toEqual({ key: 'seats', dir: 'asc' });
  });
});
