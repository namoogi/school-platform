'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { nextSort, sortRows, type SortState, type SortValue } from '@/lib/table-sort';
import { useI18n } from './I18nProvider';

/**
 * 공통 표 (DESIGN-SYSTEM.md). 서버 화면이 셀 내용(cells)과 정렬 값(sort)을 만들어 넘긴다.
 * 함수는 서버 → 클라이언트로 넘길 수 없으므로 셀은 이미 그린 React 노드로 받는다.
 * - 정렬: sortable 열의 머리 버튼. 현재 정렬 열에만 aria-sort. 같은 값은 원래 순서 유지
 * - 빈 상태: 행이 없으면 표 대신 안내 문장(empty)
 * - 밀도: density 기본값, densityControl 이면 촘촘히·기본·넉넉히 전환(행 36/48/52px 토큰)
 */
export type Column = { key: string; header: React.ReactNode; num?: boolean; sortable?: boolean; srOnly?: boolean };
export type Row = { id: string; cells: Record<string, React.ReactNode>; sort?: Record<string, SortValue> };
export type Density = 'compact' | 'default' | 'comfortable';

const DENSITIES: Density[] = ['compact', 'default', 'comfortable'];

export function DataTable({ columns, rows, caption, empty, initialSort = null,
  density: initialDensity = 'default', densityControl = false, testId }: {
  columns: Column[]; rows: Row[]; caption: string; empty?: React.ReactNode; initialSort?: SortState;
  density?: Density; densityControl?: boolean; testId?: string;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<SortState>(initialSort);
  const [density, setDensity] = useState<Density>(initialDensity);
  if (!rows.length) return <p className="muted data-table-empty" data-testid={testId}>{empty ?? t('table.empty')}</p>;
  const shown = sortRows(rows, sort);
  return (
    <div className="data-table" data-density={density === 'default' ? undefined : density}>
      {densityControl && (
        <div className="data-table-tools" role="group" aria-label={t('table.densityGroup', { caption })}>
          {DENSITIES.map((d) => (
            <button key={d} type="button" className="btn btn-ghost btn-sm" aria-pressed={density === d} onClick={() => setDensity(d)}>
              {t(`table.density.${d}`)}
            </button>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table className="grid-table" data-testid={testId}>
          <caption className="sr-only">{caption}{sort ? t(sort.dir === 'asc' ? 'table.sortedAsc' : 'table.sortedDesc', { column: headerText(columns, sort.key) }) : ''}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" className={c.num ? 'num' : undefined}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.srOnly ? <span className="sr-only">{c.header}</span>
                      : c.sortable ? (
                        <button type="button" className="th-sort" data-sort-key={c.key} onClick={() => setSort((s) => nextSort(s, c.key))}>
                          {c.header}
                          {active ? (sort!.dir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)
                            : <ChevronsUpDown size={14} aria-hidden="true" className="th-sort-idle" />}
                        </button>
                      ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => <td key={c.key} className={c.num ? 'num' : undefined}>{r.cells[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function headerText(columns: Column[], key: string) {
  const h = columns.find((c) => c.key === key)?.header;
  return typeof h === 'string' ? h : key;
}
