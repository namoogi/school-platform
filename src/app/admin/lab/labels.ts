import { KINDS, PRIORITIES, type Kind } from '@/lib/lab';
import type { Translate } from '@/lib/i18n/base';
import type { MsgKey } from '@/lib/i18n/catalog';

/**
 * ADR 0037: 연구소 종류·상태·우선순위 이름을 화면 언어로. 값(키)은 lib/lab 의 KINDS·PRIORITIES 그대로 쓰고
 * 이름만 사전(lab.kind.* · lab.status.<종류>.<상태> · lab.priority.*)에서 가져온다. 보드·상세가 같은 함수를 쓴다.
 */
export function labLabels(t: Translate) {
  const kinds = Object.fromEntries((Object.keys(KINDS) as Kind[]).map((k) => [k, {
    label: t(`lab.kind.${k}` as MsgKey),
    statuses: Object.fromEntries(Object.keys(KINDS[k].statuses).map((s) => [s, t(`lab.status.${k}.${s}` as MsgKey)])),
  }])) as Record<Kind, { label: string; statuses: Record<string, string> }>;
  const priorities = Object.fromEntries(Object.keys(PRIORITIES).map((p) => [p, t(`lab.priority.${p}` as MsgKey)])) as Record<string, string>;
  return { kinds, priorities };
}
