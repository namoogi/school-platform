'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';

type Scheme = 'kr' | 'us' | 'custom';
type Level = 'elementary' | 'middle' | 'high';
export type PresetRow = { level: Level; grades: { code: string; label: string }[] };

/** 109차 ADR 0043: 학년 체계 고르기 + 학교급 만들기. 이미 있는 학교급·학년은 그대로 두고 빠진 것만 더한다. */
export function GradeSchemeForm({ current, baseVersion, presets }: { current: Scheme | null; baseVersion: number; presets: Record<Scheme, PresetRow[]> }) {
  const router = useRouter();
  const { t } = useI18n();
  const [scheme, setScheme] = useState<Scheme>(current ?? 'kr');
  const [levels, setLevels] = useState<Level[]>(['elementary', 'middle', 'high']);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (l: Level) => setLevels((v) => (v.includes(l) ? v.filter((x) => x !== l) : [...v, l]));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'grade-scheme', scheme, levels, labels: scheme === 'custom' ? labels : {}, base_version: baseVersion }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: data.error ?? t('academics.saveFailed'), error: true });
    setMsg({ text: t('scheme.saved', { levels: data.levels, grades: data.grades }) });
    router.refresh();
  }
  return (
    <form className="action-form" onSubmit={save} data-testid="scheme-form">
      <fieldset>
        <legend>{t('scheme.choose')}</legend>
        {(['kr', 'us', 'custom'] as Scheme[]).map((s) => (
          <label key={s} className="check"><input type="radio" name="scheme" value={s} checked={scheme === s} onChange={() => setScheme(s)} />
            <span><strong>{t(`scheme.${s}` as MsgKey)}</strong> <small className="muted">{t(`scheme.${s}Hint` as MsgKey)}</small></span></label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{t('scheme.levels')}</legend>
        {presets[scheme].map((row) => (
          <div key={row.level} className="stack">
            <label className="check"><input type="checkbox" checked={levels.includes(row.level)} onChange={() => toggle(row.level)} data-testid={`scheme-level-${row.level}`} />
              <span><strong>{t(`scheme.level.${row.level}` as MsgKey)}</strong> <small className="muted">{row.grades.map((g) => g.label).join(' · ')}</small></span></label>
            {scheme === 'custom' && levels.includes(row.level) && (
              <div className="scheme-grades">
                {row.grades.map((g) => (
                  <label key={g.code}>{g.label}<input value={labels[g.code] ?? ''} placeholder={g.label} maxLength={40}
                    onChange={(e) => setLabels((v) => ({ ...v, [g.code]: e.target.value }))} /></label>
                ))}
              </div>
            )}
          </div>
        ))}
      </fieldset>
      <p className="fine">{t('scheme.note')}</p>
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy || !levels.length}>{t('scheme.apply')}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
