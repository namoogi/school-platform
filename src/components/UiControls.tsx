'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutTemplate, Moon, Sun } from 'lucide-react';
import { UI_KINDS, type UiChoice, type UiKind, type UiMode, type UiScope } from '@/lib/ui-shared';
import { useI18n } from './I18nProvider';

/**
 * 상단 막대의 화면 선택: 명암 반전 버튼 하나 + 화면 형식 메뉴.
 * 누르는 즉시 화면을 바꾸고(낙관적 갱신), 선택은 DB(user_preferences)에 저장해 다른 기기에서도 같게 열린다.
 */
export function UiControls({ scope, initial }: { scope: UiScope; initial: UiChoice }) {
  const router = useRouter();
  const { t } = useI18n();
  const kindLabel = (k: UiKind) => t(k === 'campus' ? 'ui.kind.campus' : 'ui.kind.analytics');
  const [choice, setChoice] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: Partial<UiChoice>) {
    const merged = { ...choice, ...next };
    setChoice(merged);
    const app = document.querySelector<HTMLElement>('.app');
    if (app) { app.dataset.ui = merged.ui; app.dataset.mode = merged.mode; }
    setError(null);
    const res = await fetch('/api/preferences/ui', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope, ...next }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? t('ui.saveError')); return; }
    router.refresh();
  }

  const dark = choice.mode === 'dark';
  return (
    <div className="ui-controls">
      <button type="button" className="ui-mode" onClick={() => apply({ mode: dark ? 'light' : ('dark' as UiMode) })}
        aria-pressed={!dark} data-testid="ui-mode" title={dark ? t('ui.toLight') : t('ui.toDark')}>
        {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <span>{dark ? t('ui.light') : t('ui.dark')}</span>
      </button>
      <details className="ui-menu">
        <summary aria-label={t('ui.kindMenu', { kind: kindLabel(choice.ui) })} data-testid="ui-menu"><LayoutTemplate size={18} aria-hidden="true" /><span className="ui-menu-label">{kindLabel(choice.ui)}</span></summary>
        <div className="ui-menu-panel" role="group" aria-label={t('ui.kindGroup')}>
          <p className="menu-label">{t('ui.kindHint')}</p>
          {UI_KINDS.map((k: UiKind) => (
            <button key={k} type="button" aria-pressed={choice.ui === k} data-ui-option={k}
              onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; apply({ ui: k }); }}>
              <b>{kindLabel(k)}</b><small>{t(k === 'campus' ? 'ui.kind.campus.desc' : 'ui.kind.analytics.desc')}</small>
            </button>
          ))}
        </div>
      </details>
      {error && <span className="ui-error" role="alert">{error}</span>}
    </div>
  );
}
