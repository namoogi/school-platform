'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 71차: 학기 구조 직접 정하기 — 한 줄에 '열쇠 이름'(예: s1 1학기). 근거 필수, 새 판으로 쌓인다 */
export function RuleForm({ baseVersion, current }: { baseVersion: number; current: { id: string; label: string }[] }) {
  const router = useRouter();
  const [lines, setLines] = useState(current.map((p) => `${p.id} ${p.label}`).join('\n') || 's1 1학기\ns2 2학기');
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const periods = lines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [id, ...rest] = l.split(/\s+/);
      return { id, label: rest.join(' ') || id, assessments: [] };
    });
    const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rule', periods, rationale: why, base_version: baseVersion }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ text: data.error ?? '저장하지 못했습니다.', error: true });
    setMsg({ text: `학기 구조 ${data.version}판을 저장했습니다.` }); setWhy(''); router.refresh();
  }
  return (
    <form className="action-form" onSubmit={save} data-testid="rule-form">
      <label>학기(한 줄에 하나: 열쇠 이름)<textarea rows={4} value={lines} onChange={(e) => setLines(e.target.value)} required /></label>
      <label>근거<input value={why} onChange={(e) => setWhy(e.target.value)} required placeholder="예: 학교 학사 규정 제3조(2학기제)" /></label>
      <div className="form-actions"><button type="submit" className="btn btn-primary">{baseVersion ? '새 판으로 저장' : '학기 구조 정하기'}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
