import { BASE_LANG, CATALOG, type MsgKey } from './catalog';
import { formatMessage, type Vars } from './format';

/**
 * ADR 0037: 화면 밖 공용 함수(파일 검사 등)가 문구를 만들 때 받는 번역 함수 꼴.
 * 화면은 자기 t()(서버 getI18n, 브라우저 useI18n)를 넘기고, 넘기지 않으면 기준 문구(한국어)로 만든다.
 */
export type Translate = (key: MsgKey, vars?: Vars) => string;
export const baseT: Translate = (key, vars) => formatMessage(CATALOG[key], vars, BASE_LANG);
