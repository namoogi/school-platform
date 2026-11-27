'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './I18nProvider';

/**
 * 74차: 하루 출결부(학교급 × 날짜). 바뀐 줄만 모아 한 번에 보낸다(서버가 한 트랜잭션에서 사건으로 추가, 정정은 앞 사건을 가리키는 새 사건).
 * 출결 종류·사유는 학교 코드 사본(E1)이고, 수업일 여부·학적은 DB가 판정한다.
 */
type Row = { person_id: string; name: string; kind_code: string | null; reason_code: string | null; note: string | null };
type Opt = { value: string; label: string };
export function AttendanceRegister({ day, rows, kinds, reasons, disabled }: { day: string; rows: Row[]; kinds: Opt[]; reasons: Opt[]; disabled?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const init = Object.fromEntries(rows.map((r) => [r.person_id, { kind: r.kind_code ?? '', reason: r.reason_code ?? '', note: r.note ?? '' }]));
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const changed = rows.filter((r) => v[r.person_id].kind && JSON.stringify(v[r.person_id]) !== JSON.stringify(init[r.person_id]));
  const set = (id: string, k: 'kind' | 'reason' | 'note', x: string) => setV({ ...v, [id]: { ...v[id], [k]: x, ...(k === 'kind' && x === 'present' ? { reason: '' } : {}) } });
  function allPresent() {
    const next = { ...v };
    for (const r of rows) if (!next[r.person_id].kind) next[r.person_id] = { kind: 'present', reason: '', note: '' };
    setV(next);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed.length) return setMsg({ text: t('register.noChanges') });
    setBusy(true); setMsg(null);
    const entries = changed.map((r) => ({ personId: r.person_id, ...v[r.person_id] }));
    const res = await fetch('/api/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'mark', day, entries }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: data.error ?? t('common.saveFailed'), error: true });
    setMsg({ text: t('register.saved', { n: data.saved }) });
    router.refresh();
  }
  if (!rows.length) return <p className="muted">{t('register.noStudents')}</p>;
  if (disabled) return <p className="muted">{disabled}</p>;
  return (
    <form onSubmit={save} className="stack" data-testid="register">
      <div className="row-wrap"><button type="button" className="btn btn-sm" onClick={allPresent}>{t('register.allPresent')}</button></div>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th scope="col">{t('common.student')}</th><th scope="col">{t('register.col.attendance')}</th><th scope="col">{t('register.col.reason')}</th><th scope="col">{t('register.col.note')}</th></tr></thead>
        <tbody>{rows.map((r) => {
          const x = v[r.person_id];
          const dirty = JSON.stringify(x) !== JSON.stringify(init[r.person_id]);
          return (
            <tr key={r.person_id}>
              <th scope="row">{r.name}{dirty ? <small className="muted">{t('register.changed')}</small> : null}</th>
              <td><select aria-label={t('register.aria.kind', { name: r.name })} value={x.kind} onChange={(e) => set(r.person_id, 'kind', e.target.value)}>
                <option value="">{t('register.unmarked')}</option>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></td>
              <td><select aria-label={t('register.aria.reason', { name: r.name })} value={x.reason} disabled={!x.kind || x.kind === 'present'} onChange={(e) => set(r.person_id, 'reason', e.target.value)}>
                <option value="">—</option>{reasons.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></td>
              <td><input aria-label={t('register.aria.note', { name: r.name })} value={x.note} maxLength={500} onChange={(e) => set(r.person_id, 'note', e.target.value)} /></td>
            </tr>);
        })}</tbody>
      </table></div>
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{t('register.saveChanged')}{changed.length ? ` (${changed.length})` : ''}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
