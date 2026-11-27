'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

type L = { code: string; native_name: string };

async function post(body: unknown) {
  const res = await fetch('/api/admin/languages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** 언어 더하기·고치기: 코드·그 언어로 쓴 이름·글 방향·대체 언어 */
export function LanguageForm({ languages }: { languages: L[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await post({ action: 'language', code: f.get('code'), native_name: f.get('native_name'), direction: f.get('direction'), fallback: f.get('fallback') || null, active: f.get('active') === 'on' });
      setMsg({ text: t('langAdmin.saved') }); router.refresh();
    } catch (err) { setMsg({ text: (err as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={submit} data-testid="language-form">
      <h2>{t('langAdmin.add')}</h2>
      <label>{t('langAdmin.code')}<input name="code" required placeholder="vi, zh-Hant, ar" pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})*" /></label>
      <label>{t('langAdmin.name')}<input name="native_name" required maxLength={60} placeholder="Tiếng Việt" /></label>
      <label>{t('langAdmin.direction')}
        <select name="direction" defaultValue="ltr"><option value="ltr">{t('langAdmin.ltr')}</option><option value="rtl">{t('langAdmin.rtl')}</option></select>
      </label>
      <label>{t('langAdmin.fallback')}
        <select name="fallback" defaultValue="en"><option value="">{t('langAdmin.none')}</option>{languages.map((l) => <option key={l.code} value={l.code}>{l.native_name} ({l.code})</option>)}</select>
      </label>
      <label className="check"><input type="checkbox" name="active" defaultChecked /> {t('langAdmin.active')}</label>
      <button type="submit" className="btn btn-primary">{t('langAdmin.add')}</button>
      {msg && <p role="status" className={msg.error ? 'alert' : 'fine'}>{msg.text}</p>}
    </form>
  );
}

/** 번역 묶음 내보내기·넣기(JSON). 학교 AI·관제 세션이 빈 칸을 채워 넣는다 */
export function MessagesImport({ languages }: { languages: L[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [lang, setLang] = useState(languages[0]?.code ?? '');
  const [text, setText] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const parsed = JSON.parse(text);
      const r = await post({ action: 'messages', lang, messages: parsed.messages ?? parsed, overwrite });
      setMsg({ text: t('langAdmin.imported', { n: r.saved }) }); router.refresh();
    } catch (err) { setMsg({ text: (err as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={submit} data-testid="messages-import">
      <h2>{t('langAdmin.import')}</h2>
      <label>{t('langAdmin.lang')}
        <select value={lang} onChange={(e) => setLang(e.target.value)}>{languages.map((l) => <option key={l.code} value={l.code}>{l.native_name} ({l.code})</option>)}</select>
      </label>
      <p className="fine"><a href={`/api/admin/languages?export=${encodeURIComponent(lang)}`} download={`messages-${lang}.json`}>{t('langAdmin.export')}</a></p>
      <label>JSON<textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} required aria-describedby="import-hint" /></label>
      <p className="fine" id="import-hint">{t('langAdmin.importHint')}</p>
      <label className="check"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> {t('langAdmin.overwrite')}</label>
      <button type="submit" className="btn btn-secondary">{t('langAdmin.import')}</button>
      {msg && <p role="status" className={msg.error ? 'alert' : 'fine'}>{msg.text}</p>}
    </form>
  );
}
