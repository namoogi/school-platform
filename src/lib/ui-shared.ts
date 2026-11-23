/** 26차: UI 선택 상수·타입 (서버·브라우저 공용, DB 의존 없음). ADR 0007 */
export const UI_KINDS = ['campus', 'analytics'] as const;
export const UI_MODES = ['light', 'dark'] as const;
export type UiKind = (typeof UI_KINDS)[number];
export type UiMode = (typeof UI_MODES)[number];
export type UiScope = 'platform' | 'school';
export type UiChoice = { ui: UiKind; mode: UiMode };
export type UiPrefs = Record<UiScope, UiChoice>;

export const UI_LABEL: Record<UiKind, string> = { campus: '학사 업무형', analytics: '분석 대시보드형' };
/** 기본값: 전체 관리 = 분석 대시보드형(어두운 화면), 학교 = 학사 업무형(밝은 화면) */
export const UI_DEFAULTS: UiPrefs = { platform: { ui: 'analytics', mode: 'dark' }, school: { ui: 'campus', mode: 'light' } };

