import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { getI18n, userLang } from '@/lib/i18n/server';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';

// 기능 이름은 사전의 locked.module.<기능>
export default async function Locked({ searchParams }: { searchParams: Promise<{ module?: string; reason?: string }> }) {
  const { module, reason } = await searchParams;
  const { uiLang, school } = await loadForPage(async ({ db }) => ({ uiLang: await userLang(db) }));
  const { t } = await getI18n(uiLang, school.locale);
  const name = module && `locked.module.${module}` in CATALOG ? t(`locked.module.${module}` as MsgKey) : null;
  return (
    <section className="card content-narrow">
      {reason === 'admin'
        ? <><h1>{t('locked.adminTitle')}</h1><p className="muted">{t('locked.adminBody')}</p></>
        : <><h1>{name ? t('locked.moduleOff', { name }) : t('locked.noFeatures')}</h1>
            <p className="muted">{t('locked.body')}</p></>}
      <Link className="button secondary" href="/settings">{t('locked.toSettings')}</Link>
    </section>
  );
}
