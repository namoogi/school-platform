'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SourceFile } from '@/lib/services';
import { FileDrop, type FileDropContext } from '@/components/FileDrop';
import { uploadWithProgress } from '@/lib/file-check';

const STATUS: Record<SourceFile['status'], { label: string; tone: string }> = {
  parsed: { label: '내용을 읽음', tone: 'green' },
  registered: { label: '주소만 등록 · 내용 미열람', tone: 'amber' },
  pending_reader: { label: '보관 · 읽기 대기', tone: 'amber' },
};

export function IntakeClient({ sources }: { sources: SourceFile[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [urls, setUrls] = useState<string[]>(['']);

  async function upload(list: File[], { signal, progress }: FileDropContext) {
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f));
    setMessage(null);
    const res = await uploadWithProgress('/api/sources', fd, { signal, onProgress: progress });
    const body = res.body as { error?: string; analysis?: { state?: string } };
    if (!res.ok) throw new Error(body.error ?? '자료를 올리지 못했습니다.');
    const state = body.analysis?.state;
    const note =
      state === 'question_opened' ? ' 새 자료로 분석해 관리자 확인 질문을 만들었습니다.'
      : state === 'matches_confirmed_rule' ? ' 확정한 규칙과 같은 결과라 새 질문은 없습니다.'
      : '';
    router.refresh();
    return `${list.length}개 파일을 추가했습니다.${note}`;
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
        <FileDrop
          label="학교 자료 파일" multiple maxFiles={20} maxSize={2 * 1024 * 1024}
          accept={['.csv', '.tsv', '.txt', '.pdf', '.xlsx', '.docx']} typeLabel="CSV·TSV·TXT·XLSX·DOCX·PDF"
          hint="여러 파일을 한꺼번에 또는 나눠 추가할 수 있습니다."
          testId="dropzone" inputTestId="file-input" disabled={busy} onFiles={upload}
        />
        <p className="fine">CSV·TSV·TXT·XLSX(시트별)·DOCX(문서 속 표)를 읽습니다. PDF는 글자 위치로 표를 추정하므로 근거를 원본과 대조해 주세요. 스캔 이미지 PDF와 그 밖의 형식은 보관만 하고 읽기 대기로 둡니다.</p>

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
        <p className="fine">이 환경에는 시트 읽기 권한이 연결되지 않았습니다. 주소는 ‘주소만 등록’ 상태로 남고, 분석에는 첨부한 파일을 씁니다. 같은 시트를 XLSX나 CSV로 내려받아 첨부해 주세요.</p>
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
                <span className="tags">
                  <span className={`tag ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                  {s.needs_review && <span className="tag amber" title="글자 위치로 표를 추정했습니다. 근거 행을 원본과 대조해 주세요.">정확도 확인 필요</span>}
                </span>
                <small className="muted">
                  {s.status_note ?? (s.status === 'parsed' ? `${s.row_count}행` : '')}
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
