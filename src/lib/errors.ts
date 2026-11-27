import { CATALOG, type MsgKey } from './i18n/catalog';
import { formatMessage, type Vars } from './i18n/format';

/**
 * ADR 0039: 서버 오류는 문장이 아니라 이름표(+값)로 던진다. 응답을 만들 때 요청한 사람의 화면 언어로 바꾼다(src/lib/api.ts errorResponse).
 *
 *   throw new NotFoundError('err.whatNotFound', { what: '학생' })
 *
 * - message 에는 기준 문구(한국어)를 채운다: 기록·시험·이전 코드가 그대로 읽는다.
 * - 이름표가 아닌 문장을 넘기면 지금처럼 그 문장을 그대로 돌려준다(아직 옮기지 않은 곳).
 * - 값(vars)에 비밀·입력 원문을 넣지 않는다. 오류 응답에 그대로 실린다.
 */
export class AppError extends Error {
  readonly key?: MsgKey;
  readonly vars?: Vars;
  constructor(keyOrText: MsgKey | (string & {}), vars?: Vars) {
    const isKey = Object.prototype.hasOwnProperty.call(CATALOG, keyOrText);
    super(isKey ? formatMessage(CATALOG[keyOrText as MsgKey], localVars(vars)) : keyOrText);
    if (isKey) { this.key = keyOrText as MsgKey; this.vars = vars; }
  }
}

/**
 * 값 안의 낱말도 그 언어로: 값이 이름표면 그 문구로, 한국어 명사가 'noun.' 이름표의 기준 문구와 같으면 그 번역으로 바꾼다.
 *   new NotFoundError('err.whatNotFound', { what: '학생' })  → en: "Student not found."
 * dict 가 없으면 기준 문구(한국어).
 */
let nouns: Map<string, MsgKey> | null = null;
export function localVars(vars?: Vars, dict?: Record<string, string>): Vars | undefined {
  if (!vars) return vars;
  nouns ??= new Map((Object.keys(CATALOG) as MsgKey[]).filter((k) => k.startsWith('noun.')).map((k) => [CATALOG[k] as string, k]));
  const out: Vars = {};
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v !== 'string') { out[k] = v; continue; }
    const key = Object.prototype.hasOwnProperty.call(CATALOG, v) ? (v as MsgKey) : nouns.get(v);
    out[k] = key ? (dict?.[key] ?? (CATALOG[key] as string)) : v;
  }
  return out;
}

/** 400: 입력이 규칙에 맞지 않음 */
export class ValidationError extends AppError {}
/** 404: 없거나 볼 수 없음 */
export class NotFoundError extends AppError {}
/** 403: 권한 밖 */
export class ForbiddenError extends AppError {}
/** 409: 소속 학교가 없음 */
export class NoSchoolError extends AppError {}
/** 파일 저장소(R2) 오류 */
export class StorageError extends AppError {}
