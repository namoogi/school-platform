'use client';
// 138차 후속(2026-11-28 사용자 지시): 템플릿 고르기와 기존 홈페이지 가져오기를 탭으로 나눈다(템플릿이 먼저).
// 두 패널을 모두 그려 두고 보이는 것만 바꾼다 — 탭을 오가도 가져오기 입력·결과가 남고 쪽을 다시 부르지 않는다.
// 주소(?tab=import)를 바꿔 두어 가져오기 탭으로 바로 링크할 수 있다.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';

export type PickerTab = 'templates' | 'import';

export function PickerTabs({ initial, templates, importPanel }: { initial: PickerTab; templates: ReactNode; importPanel: ReactNode }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<PickerTab>(initial);
  const refs = useRef<Record<PickerTab, HTMLButtonElement | null>>({ templates: null, import: null });
  const tabs: [PickerTab, string][] = [['templates', t('site.tpl.tab.templates')], ['import', t('site.tpl.tab.import')]];
  const go = (k: PickerTab, focus = false) => {
    setTab(k);
    const u = new URL(window.location.href);
    if (k === 'import') u.searchParams.set('tab', 'import'); else u.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', u.pathname + u.search);
    if (focus) refs.current[k]?.focus();
  };
  // 탭 목록 키보드: 왼쪽·오른쪽 화살표로 옮긴다(WAI-ARIA 탭 패턴)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    go(tab === 'templates' ? 'import' : 'templates', true);
  };
  return (
    <>
      <div className="tabs picker-tabs" role="tablist" aria-label={t('site.tpl.tab.label')} onKeyDown={onKey} data-testid="picker-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`picker-tab-${k}`} aria-controls={`picker-panel-${k}`} aria-selected={tab === k}
            tabIndex={tab === k ? 0 : -1} ref={(el) => { refs.current[k] = el; }} onClick={() => go(k)} data-testid={`picker-tab-${k}`}>{label}</button>
        ))}
      </div>
      {tabs.map(([k]) => (
        <div key={k} role="tabpanel" id={`picker-panel-${k}`} aria-labelledby={`picker-tab-${k}`} hidden={tab !== k} className="picker-panel">
          {k === 'templates' ? templates : importPanel}
        </div>
      ))}
    </>
  );
}
