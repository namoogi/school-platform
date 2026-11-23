'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Copy, KeyRound } from 'lucide-react';
import { StatusBadge } from '@/components/ui';

/**
 * 34차: 외부 작업 토큰 (ADR 0012). 학교 관리자가 Codex 같은 외부 에이전트에게 '성품 동화 시안만' 맡길 때 발급한다.
 * 원문은 발급 직후 한 번만 보인다. 토큰으로는 그림·PDF 올리기와 동화 새 판(시안) 저장만 되고, 공개는 사람이 한다.
 */
export type TokenRow = {
  id: string; label: string; entry_key: string | null; agent_kind: string; created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; uses: number;
  recent: { action: string; created_at: string; detail: Record<string, unknown> }[];
};
const KIND: Record<string, string> = { codex: 'Codex', 'claude-code': 'Claude Code', other: '기타' };
const did = (r: TokenRow['recent'][number]) => r.action === 'story.version' ? `${String(r.detail.key ?? '')} ${String(r.detail.version ?? '')}판 시안` : `파일 올림(${r.detail.mime === 'application/pdf' ? 'PDF' : '그림'})`;

async function send(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}
const day = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function AgentTokenPanel({ tokens, stories }: { tokens: TokenRow[]; stories: { key: string; title: string }[] }) {
  const router = useRouter();
  const [label, setLabel] = useState('Codex 동화 작업');
  const [days, setDays] = useState(30);
  const [key, setKey] = useState('');
  const [kind, setKind] = useState('codex');
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setIssued(null); setCopied(false);
    try { setIssued((await send('/api/site/agent-tokens', { label, days, entry_key: key || null, agent_kind: kind })).token); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setErr(null);
    try { await send(`/api/site/agent-tokens/${id}/revoke`, {}); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }
  const now = Date.now();
  const state = (t: TokenRow) => t.revoked_at ? { label: '폐기', tone: 'neutral' as const }
    : new Date(t.expires_at).getTime() < now ? { label: '기한 지남', tone: 'neutral' as const } : { label: '사용 가능', tone: 'success' as const };

  return (
    <section className="card site-form" data-testid="agent-tokens">
      <h2><Bot size={20} aria-hidden="true" /> 외부 작업 토큰 (성품 동화)</h2>
      <p className="fine">
        Codex 같은 외부 에이전트가 이 학교 <b>성품 동화</b>에 캐릭터 그림·PDF를 올리고 <b>새 판(시안)</b>을 저장할 수 있게 합니다.
        공개·설정·쪽·소식·다른 학교는 토큰으로 할 수 없습니다. 시안을 확인한 뒤 성품 동화 함에서 직접 공개하세요.
        안내: 저장소의 <code>docs/agents/story-agent.md</code>
      </p>
      <form onSubmit={issue} className="site-form-fields">
        <label>이름<input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} required /></label>
        <label>에이전트
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>기한
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7일</option><option value={30}>30일</option><option value={90}>90일</option>
          </select>
        </label>
        <label>맡길 동화
          <select value={key} onChange={(e) => setKey(e.target.value)} data-testid="agent-token-story">
            <option value="">이 학교 성품 동화 모두</option>
            {stories.map((s) => <option key={s.key} value={s.key}>{s.title} (/{s.key})</option>)}
          </select>
        </label>
        <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy} data-testid="agent-token-issue"><KeyRound size={16} aria-hidden="true" />토큰 발급</button></div>
      </form>
      {issued && (
        <div className="banner" data-tone="warning" role="status">
          <p><b>지금 한 번만 보입니다.</b> 복사해서 Codex 쪽 환경 변수 <code>SCHOOL_AGENT_TOKEN</code>에 넣으세요. 채팅·문서·저장소에 붙여 넣지 마세요.</p>
          <p><code data-testid="agent-token-value" style={{ wordBreak: 'break-all' }}>{issued}</code></p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(issued).then(() => setCopied(true))}>
              <Copy size={14} aria-hidden="true" />{copied ? '복사했습니다' : '복사'}
            </button>
          </div>
        </div>
      )}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {tokens.length > 0 && (
        <div className="table-wrap"><table className="grid-table" data-testid="agent-token-list">
          <thead><tr><th scope="col">이름</th><th scope="col">범위</th><th scope="col">상태</th><th scope="col">기한</th><th scope="col">에이전트</th><th scope="col">마지막 사용</th><th scope="col">한 일</th><th scope="col"><span className="sr-only">폐기</span></th></tr></thead>
          <tbody>
            {tokens.map((t) => {
              const st = state(t);
              return (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>{t.entry_key ? `/${t.entry_key}` : '동화 모두'}</td>
                  <td><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                  <td>{day(t.expires_at)}</td>
                  <td>{KIND[t.agent_kind] ?? t.agent_kind}</td>
                  <td>{day(t.last_used_at)}</td>
                  <td>{t.uses}건{t.recent.length > 0 && <ul className="fine">{t.recent.map((r, k) => <li key={k}>{did(r)} · {day(r.created_at)}</li>)}</ul>}</td>
                  <td>{!t.revoked_at && <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(t.id)} aria-label={`${t.label} 폐기`}>폐기</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
