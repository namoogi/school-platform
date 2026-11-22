'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SourceFile } from '@/lib/services';

const STATUS: Record<SourceFile['status'], { label: string; tone: string }> = {
  parsed: { label: '내용을 읽음', tone: 'green' },
  registered: { label: '주소만 등록 · 내용 미열람', tone: 'amber' },
  pending_reader: { label: '파일 보관 · 판독기 미연결', tone: 'amber' },
};

export function IntakeClient({ sources }: { sources: SourceFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [urls, setUrls] = useState<string[]>(['']);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f));
    setBusy(true);
    const res = await fetch('/api/sources', { method: 'POST', body: fd });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setMessage({ text: body.error, error: true });
    const state = body.analysis?.state;
    const note =
      state === 'question_opened' ? ' 새 자료로 분석해 관리자 확인 질문을 만들었습니다.'
      : state === 'matches_confirmed_rule' ? ' 확정한 규칙과 같은 결과라 새 질문은 없습니다.'
      : '';
    setMessage({ text: `${list.length}개 파일을 추가했습니다.${note}` });
    if (input.current) input.current.value = '';
    router.refresh();
  }

  async function registerSheets() {
    setBusy(true);
    const res = await fetch('/api/sources/sheets', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setMessage({ text: body.error, error: true });
    setMessage({ text: `시트 주소 ${body.added.length}개를 등록했습니다. 내용은 아직 읽지 않았습니다.` });
    setUrls(['']);
    router.refresh();
  }

  async function archive(id: string, name: string) {
    if (!confirm(`‘${name}’을 목록에서 뺄까요? 원문은 발행본 근거로 보관됩니다.`)) return;
    const res = await fetch(`/api/sources/${id}/archive`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) return setMessage({ text: body.error, error: true });
    setMessage({ text: '목록에서 뺐습니다. 남은 자료로 다시 분석했습니다.' });
    router.refresh();
  }

  return (
    <div className="intake-grid">
      <section className="card">
        <h2>학교 자료 추가</h2>
        <p className="muted">학사력, 평가 일정, 성적표·학생부 빈 서식 등. 합성 또는 비식별 자료를 사용해 주세요.</p>
        <h3 className="section-title">파일 첨부</h3>
        <div
          className={`drop${dragging ? ' over' : ''}`}
          data-testid="dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        >
          <strong>여기에 파일을 끌어 놓으세요</strong>
          <span>여러 파일을 한꺼번에 또는 나눠 추가할 수 있습니다.</span>
          <button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>파일 찾아보기</button>
          <input ref={input} type="file" multiple hidden data-testid="file-input"
            accept=".csv,.tsv,.txt,.pdf,.xlsx,.docx" onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
        <p className="fine">파일별 최대 2MB. CSV·TSV·TXT는 바로 읽고, PDF·XLSX·DOCX는 파일 정보만 보관한 뒤 읽기 대기로 표시합니다.</p>

        <h3 className="section-title">시트 주소</h3>
        {urls.map((u, i) => (
          <label key={i}>Google Sheets 주소 {i + 1}
            <input type="url" value={u} placeholder="https://docs.google.com/spreadsheets/d/…"
              onChange={(e) => setUrls(urls.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
        <div className="row">
          <button type="button" className="secondary" onClick={() => setUrls([...urls, ''])} disabled={urls.length >= 10}>+ 주소 추가</button>
          <button type="button" className="primary" onClick={registerSheets} disabled={busy || !urls.some((u) => u.trim())}>시트 주소 등록</button>
        </div>
        <p className="fine">이 환경에는 시트 읽기 권한이 연결되지 않았습니다. 주소는 ‘주소만 등록’ 상태로 남고, 분석에는 첨부한 CSV를 씁니다.</p>
        {message && <p className={message.error ? 'alert' : 'notice'} role="status">{message.text}</p>}
      </section>

      <section className="card">
        <div className="between"><h2>등록 자료</h2><span className="tag">{sources.length}개</span></div>
        {sources.length === 0 && <p className="muted empty">아직 등록한 자료가 없습니다.</p>}
        <ul className="sources" data-testid="source-list">
          {sources.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className={`tag ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                <small className="muted">
                  {s.status === 'parsed' ? `${s.row_count}행` : s.status_note}
                  {s.sha256 && <> · <code title={s.sha256}>{s.sha256.slice(0, 8)}</code></>}
                </small>
              </div>
              <button type="button" className="link-button" onClick={() => archive(s.id, s.name)}>목록에서 빼기</button>
            </li>
          ))}
        </ul>
        <a className="button primary" href="/review">근거와 질문 보기</a>
        <p className="fine">자료를 더 등록하면 기존 목록에 붙습니다. 확정한 규칙은 새 자료가 와도 바뀌지 않고, 결과가 다르면 다시 질문합니다.</p>
      </section>
    </div>
  );
}
