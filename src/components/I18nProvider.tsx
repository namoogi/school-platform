'use client';
import { createContext, useContext, useMemo } from 'react';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';
import { formatMessage, type Vars } from '@/lib/i18n/format';

/** ADR 0037: 브라우저 쪽 화면 문구. 서버가 고른 언어의 문구 묶음을 받아 t() 로 꺼낸다 */
type Ctx = { lang: string; dir: 'ltr' | 'rtl'; dict: Record<string, string>; languages: { code: string; native_name: string }[] };
const I18nContext = createContext<Ctx>({ lang: 'ko', dir: 'ltr', dict: {}, languages: [] });

export function I18nProvider({ value, children }: { value: Ctx; children: React.ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  return useMemo(() => ({
    ...ctx,
    t: (key: MsgKey, vars?: Vars) => formatMessage(ctx.dict[key] ?? CATALOG[key] ?? key, vars, ctx.lang),
  }), [ctx]);
}
