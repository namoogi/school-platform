'use client';
import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';

/** 고른 방향을 개발·연구소 보드에 '계획' 항목으로 남긴다(관제 세션·자동 실행이 읽어 적용). 항목 제목·본문은 세션이 읽는 기록이라 한국어로 둔다 */
export function ChooseDirection({ name }: { name: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  async function choose() {
    setState('busy');
    const res = await fetch('/api/admin/items', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'plan', title: `디자인 방향 선택: ${name}`, status: 'planned', priority: 'high', tags: '디자인',
        body: '전체 관리 → 디자인 방향에서 고름. 의미 토큰을 이 방향으로 바꿔 전 화면에 적용하고, 결정 기록(ADR)으로 남긴다.' }),
    });
    setState(res.ok ? 'done' : 'error');
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={choose} disabled={state === 'busy' || state === 'done'}>
      {t(state === 'done' ? 'design.chosen' : state === 'error' ? 'design.retry' : 'design.choose')}
    </button>
  );
}
