'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useI18n } from './I18nProvider';

/** ADR 0037: 화면 언어 고르기. 목록은 DB의 켜진 언어(languages)라 언어를 더하면 저절로 나타난다 */
export function LanguageSwitcher() {
  const { lang, languages, t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (languages.length < 2) return null;
  async function change(next: string) {
    setError(null);
    const res = await fetch('/api/preferences/lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: next }) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? t('lang.saveError')); return; }
    router.refresh();
  }
  return (
    <label className="lang-switch">
      <Languages size={18} aria-hidden="true" />
      <span className="sr-only">{t('lang.label')}</span>
      <select value={lang} onChange={(e) => change(e.target.value)} data-testid="lang-switch">
        {languages.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.native_name}</option>)}
      </select>
      {error && <span className="ui-error" role="alert">{error}</span>}
    </label>
  );
}
