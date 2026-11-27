import { loadForPlatform } from '@/lib/page';
import { listLanguages } from '@/lib/languages';
import { getI18n } from '@/lib/i18n/server';
import { PageHeader, StatusBadge } from '@/components/ui';
import { LanguageForm, MessagesImport } from './LanguagesClient';

/** ADR 0037: 언어·번역 관리. 언어 한 줄을 더하면 코드 변경 없이 그 언어로 쓸 수 있다 */
export default async function LanguagesPage() {
  const { list, uiLang } = await loadForPlatform(async ({ db }) => ({
    list: await listLanguages(db),
    uiLang: (await db.query('select ui_lang from public.user_preferences where user_id = app.uid()')).rows[0]?.ui_lang as string | null,
  }));
  const { t } = await getI18n(uiLang);
  return (
    <>
      <PageHeader title={t('langAdmin.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('langAdmin.title') }]}
        description={t('langAdmin.lead')} />
      <section className="card">
        <div className="table-wrap">
          <table className="grid-table" data-testid="languages-table">
            <thead><tr>
              <th scope="col">{t('langAdmin.code')}</th><th scope="col">{t('langAdmin.name')}</th><th scope="col">{t('langAdmin.direction')}</th>
              <th scope="col">{t('langAdmin.fallback')}</th><th scope="col">{t('langAdmin.active')}</th><th scope="col" className="num">{t('langAdmin.coverage')}</th>
            </tr></thead>
            <tbody>
              {list.rows.map((l) => {
                const done = l.code === 'ko' ? list.total : l.translated;
                return (
                  <tr key={l.code}>
                    <td><code>{l.code}</code></td>
                    <td lang={l.code} dir={l.direction}>{l.native_name}</td>
                    <td>{l.direction === 'rtl' ? t('langAdmin.rtl') : t('langAdmin.ltr')}</td>
                    <td>{l.fallback ?? t('langAdmin.none')}</td>
                    <td>{l.active ? <StatusBadge tone="success" dot>{t('langAdmin.active')}</StatusBadge> : <StatusBadge tone="neutral">—</StatusBadge>}</td>
                    <td className="num">{l.code === 'ko' ? t('langAdmin.base') : `${done} / ${list.total}`}
                      {l.code !== 'ko' && done < list.total && <div className="fine">{t('langAdmin.missing', { n: list.total - done })}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid-2">
        <section className="card"><LanguageForm languages={list.rows.map((l) => ({ code: l.code, native_name: l.native_name }))} /></section>
        <section className="card"><MessagesImport languages={list.rows.filter((l) => l.code !== 'ko').map((l) => ({ code: l.code, native_name: l.native_name }))} /></section>
      </div>
    </>
  );
}
