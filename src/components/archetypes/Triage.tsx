'use client';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import { useEffect, useState } from 'react';
import { Archive, Check, CircleHelp, Clock, FileSpreadsheet, FileText, Inbox, MessageCircleQuestion, Pause, Search, Undo2 } from 'lucide-react';
import { QUESTIONS, SCHOOL, SOURCES, type Question } from './data';
import s from './triage.module.css';

const FOLDERS = [
  { key: '대기', label: '확인 대기', icon: Inbox },
  { key: '답변함', label: '답변함', icon: Check },
  { key: '전체', label: '전체 질문', icon: Archive },
] as const;

const KIND_ICON = { '충돌': CircleHelp, '근거 부족': MessageCircleQuestion, '새 항목': FileText } as const;

/** 원형 8. 3단 작업함형 — 함 → 목록 → 상세. 근거를 옆에 두고 바로 결정한다. */
export default function Triage() {
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]['key']>('대기');
  const list = QUESTIONS.filter((q) => folder === '전체' || q.status === folder);
  const [selected, setSelected] = useState<string>(list[0]?.id ?? '');
  const current = QUESTIONS.find((q) => q.id === selected) ?? list[0];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      const i = list.findIndex((q) => q.id === current?.id);
      if (e.key === 'j' && i < list.length - 1) setSelected(list[i + 1].id);
      if (e.key === 'k' && i > 0) setSelected(list[i - 1].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, current]);

  return (
    <div className={s.root}>
      <aside className={s.folders} aria-label="질문 함">
        <div className={s.school}>
          <span className={s.mark} aria-hidden="true">드</span>
          <span><b>{SCHOOL.name}</b><small>{SCHOOL.term}</small></span>
        </div>
        <nav>
          {FOLDERS.map((f) => {
            const count = QUESTIONS.filter((q) => f.key === '전체' || q.status === f.key).length;
            return (
              <button key={f.key} type="button" className={s.folder} aria-current={folder === f.key ? 'page' : undefined}
                onClick={() => { setFolder(f.key); setSelected(QUESTIONS.find((q) => f.key === '전체' || q.status === f.key)?.id ?? ''); }}>
                <f.icon size={16} aria-hidden="true" /><span>{f.label}</span><span className={s.count}>{count}</span>
              </button>
            );
          })}
        </nav>
        <div className={s.label}>자료로 거르기</div>
        <ul className={s.sources}>
          {SOURCES.slice(0, 4).map((src) => (
            <li key={src.id}>{src.reader === 'XLSX' || src.reader === 'CSV' ? <FileSpreadsheet size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}<span>{src.name}</span></li>
          ))}
        </ul>
        <div className={s.hint}><kbd>J</kbd><kbd>K</kbd> 위·아래 이동</div>
      </aside>

      <section className={s.list} aria-label={`${folder} 목록`}>
        <header className={s.listHead}>
          <h1>{FOLDERS.find((f) => f.key === folder)?.label}</h1>
          <label className={s.search}><Search size={14} aria-hidden="true" /><input placeholder="질문·자료 검색" aria-label="질문 검색" /></label>
        </header>
        <ul>
          {list.map((q) => {
            const Icon = KIND_ICON[q.kind];
            return (
              <li key={q.id}>
                <button type="button" className={s.item} aria-current={q.id === current?.id ? 'true' : undefined} onClick={() => setSelected(q.id)}>
                  <span className={s.itemTop}>
                    <span className={s.kind} data-tone={q.tone}><Icon size={12} aria-hidden="true" />{q.kind}</span>
                    <span className={s.id}>{q.id}</span>
                    <span className={s.age}><Clock size={12} aria-hidden="true" />{q.age}</span>
                  </span>
                  <span className={s.itemTitle}>{q.title}</span>
                  <span className={s.itemSrc}>{q.source} · {q.location}</span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className={s.empty}>이 함에는 질문이 없습니다.</li>}
        </ul>
      </section>

      {current ? <Detail q={current} /> : <section className={s.detail} />}
    </div>
  );
}

function Detail({ q }: { q: Question }) {
  return (
    <section className={s.detail} aria-label="질문 상세">
      <header className={s.detailHead}>
        <div className={s.crumb}>{q.id} · {q.opened} 열림 · 담당 {q.assignee}</div>
        <h2>{q.title}</h2>
        <div className={s.tags}>
          <span className={s.kind} data-tone={q.tone}>{q.kind}</span>
          <span className={s.status}>{q.status === '대기' ? '확인 대기' : '답변함'}</span>
        </div>
      </header>

      <div className={s.detailBody}>
        <h3>근거</h3>
        <figure className={s.evidence}>
          <figcaption><FileText size={14} aria-hidden="true" />{q.source}<span>{q.location}</span></figcaption>
          <blockquote>{q.evidence}</blockquote>
        </figure>

        <div className={s.compare}>
          <div>
            <h3>지금 확정된 규칙</h3>
            <p>{q.current ?? '없음 (새 항목)'}</p>
          </div>
          <div className={s.proposed}>
            <h3>자료가 말하는 값</h3>
            <p>{q.proposed}</p>
          </div>
        </div>

        <h3>결정</h3>
        <p className={s.fine}>확정하면 새 판의 규칙이 추가되고 이전 판은 그대로 남습니다. 이미 발행된 문서는 바뀌지 않습니다.</p>
        <label className={s.note}>
          <span>결정 메모 (선택)</span>
          <textarea rows={3} placeholder="예: 2학기부터 적용, 1학기 기록은 유지" />
        </label>
      </div>

      <footer className={s.actions}>
        <button type="button" className={s.primary}><Check size={16} aria-hidden="true" />자료 값으로 확정</button>
        <button type="button" className={s.secondary}><Undo2 size={16} aria-hidden="true" />기존 규칙 유지</button>
        <button type="button" className={s.ghost}><Pause size={16} aria-hidden="true" />보류</button>
        <span className={s.kbd}><kbd>E</kbd> 확정 · <kbd>H</kbd> 보류</span>
      </footer>
    </section>
  );
}
