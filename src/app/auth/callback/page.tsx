import { I18nProvider } from '@/components/I18nProvider';
import { getI18n, providerValue } from '@/lib/i18n/server';
import { AuthCallback } from './AuthCallback';

/** Supabase(Google) 로그인 후 돌아오는 화면. 셸 밖이라 언어 공급자를 직접 둔다(113차) */
export default async function AuthCallbackPage() {
  const i18n = await getI18n();
  return <I18nProvider value={providerValue(i18n)}><AuthCallback /></I18nProvider>;
}
