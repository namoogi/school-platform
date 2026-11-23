'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutTemplate, Moon, Sun } from 'lucide-react';
import { UI_KINDS, UI_LABEL, type UiChoice, type UiKind, type UiMode, type UiScope } from '@/lib/ui-shared';

/**
 * 상단 막대의 화면 선택: 명암 반전 버튼 하나 + 화면 형식 메뉴.
 * 누르는 즉시 화면을 바꾸고(낙관적 갱신), 선택은 DB(user_preferences)에 저장해 다른 기기에서도 같게 열린다.
 */
export function UiControls({ scope, initial }: { scope: UiScope; initial: UiChoice }) {
  const router = useRouter();
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
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? '화면 설정을 저장하지 못했습니다.'); return; }
    router.refresh();
  }

  const dark = choice.mode === 'dark';
  return (
    <div className="ui-controls">
      <button type="button" className="ui-mode" onClick={() => apply({ mode: dark ? 'light' : ('dark' as UiMode) })}
        aria-pressed={!dark} data-testid="ui-mode" title={dark ? '흰 화면으로 바꾸기' : '어두운 화면으로 바꾸기'}>
        {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <span>{dark ? '화이트' : '다크'}</span>
      </button>
      <details className="ui-menu">
        <summary aria-label={`화면 형식: ${UI_LABEL[choice.ui]}`} data-testid="ui-menu"><LayoutTemplate size={18} aria-hidden="true" /><span className="ui-menu-label">{UI_LABEL[choice.ui]}</span></summary>
        <div className="ui-menu-panel" role="group" aria-label="화면 형식">
          <p className="menu-label">화면 형식 · 자료는 그대로</p>
          {UI_KINDS.map((k: UiKind) => (
            <button key={k} type="button" aria-pressed={choice.ui === k} data-ui-option={k}
              onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; apply({ ui: k }); }}>
              <b>{UI_LABEL[k]}</b><small>{k === 'campus' ? '아이콘 메뉴 · 업무 카드 · 넉넉한 글자' : '얇은 메뉴 · 지표 패널 · 촘촘한 숫자'}</small>
            </button>
          ))}
        </div>
      </details>
      {error && <span className="ui-error" role="alert">{error}</span>}
    </div>
  );
}
