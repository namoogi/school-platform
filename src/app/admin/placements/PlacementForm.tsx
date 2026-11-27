'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';

const TIERS = ['shared', 'extended', 'dedicated', 'independent'] as const;
const STATES = ['planned', 'moving', 'moved', 'active'] as const;
type Cur = { version: number; tier: string; state: string; target_url: string | null; monthly_cost_usd: string | null } | null;

/** 격리 등급 새 판: 보고 고친 판(base_version)을 함께 보내 그 사이 다른 판이 생기면 409 */
export function PlacementForm({ schoolId, current }: { schoolId: string; current: Cur }) {
  const { t } = useI18n();
  const router = useRouter();
  const [tier, setTier] = useState(current?.tier ?? 'shared');
  const [state, setState] = useState(current?.state ?? 'active');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/placements', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schoolId, tier, state: tier === 'shared' ? 'active' : state, target_url: f.get('target_url'), reason: f.get('reason'), monthly_cost_usd: f.get('monthly_cost_usd'), base_version: current?.version ?? 0 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ text: data.error ?? `HTTP ${res.status}`, error: true }); return; }
    setMsg({ text: t('placement.saved', { version: data.version }) });
    router.refresh();
  }
  return (
    <form className="action-form action-form-inline" onSubmit={submit} data-testid="placement-form">
      <label>{t('placement.tier')}
        <select value={tier} onChange={(e) => setTier(e.target.value)}>{TIERS.map((k) => <option key={k} value={k}>{t(`placement.tier.${k}` as MsgKey)}</option>)}</select>
      </label>
      <label>{t('placement.state')}
        <select value={tier === 'shared' ? 'active' : state} onChange={(e) => setState(e.target.value)} disabled={tier === 'shared'}>
          {STATES.map((k) => <option key={k} value={k}>{t(`placement.state.${k}` as MsgKey)}</option>)}
        </select>
      </label>
      <label>{t('placement.target')}<input name="target_url" type="url" placeholder="https://" defaultValue={current?.target_url ?? ''} required={state === 'moved' && tier !== 'shared'} /></label>
      <label>{t('placement.cost')}<input name="monthly_cost_usd" type="number" min="0" step="0.01" defaultValue={current?.monthly_cost_usd ?? ''} /></label>
      <label>{t('placement.reason')}<input name="reason" required maxLength={2000} /></label>
      <button type="submit" className="btn btn-primary">{t('placement.save')}</button>
      {msg && <p role="status" className={msg.error ? 'alert' : 'fine'}>{msg.text}</p>}
    </form>
  );
}
