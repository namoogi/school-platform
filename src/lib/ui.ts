import type { Db } from './db';
import { ValidationError } from './services';

/**
 * 26차: 사용자별 UI 선택 (ADR 0007).
 * UI는 화면을 그리는 층만 바꾼다. 데이터 조회·권한(RLS)·기록은 어떤 UI에서도 같은 경로를 쓴다.
 */
import { UI_DEFAULTS, UI_KINDS, UI_MODES, type UiChoice, type UiKind, type UiMode, type UiPrefs } from './ui-shared';
export * from './ui-shared';

export async function getUiPrefs(db: Db): Promise<UiPrefs> {
  const { rows: [r] } = await db.query(
    'select platform_ui, platform_mode, school_ui, school_mode from public.user_preferences where user_id = app.uid()');
  if (!r) return UI_DEFAULTS;
  return { platform: { ui: r.platform_ui, mode: r.platform_mode }, school: { ui: r.school_ui, mode: r.school_mode } };
}

export async function setUiPref(db: Db, input: { scope?: unknown; ui?: unknown; mode?: unknown }) {
  const scope = input.scope;
  if (scope !== 'platform' && scope !== 'school') throw new ValidationError('err.ui.scope');
  const ui = input.ui ?? undefined;
  const mode = input.mode ?? undefined;
  if (ui !== undefined && !UI_KINDS.includes(ui as UiKind)) throw new ValidationError('err.ui.format');
  if (mode !== undefined && !UI_MODES.includes(mode as UiMode)) throw new ValidationError('err.ui.theme');
  if (ui === undefined && mode === undefined) throw new ValidationError('err.nothingToChange');
  const cur = (await getUiPrefs(db))[scope];
  const next: UiChoice = { ui: (ui as UiKind) ?? cur.ui, mode: (mode as UiMode) ?? cur.mode };
  // 열 이름은 위에서 검증한 scope로만 고른다(사용자 입력을 SQL에 넣지 않음)
  const col = scope === 'platform' ? ['platform_ui', 'platform_mode'] : ['school_ui', 'school_mode'];
  await db.query(
    `insert into public.user_preferences (user_id, ${col[0]}, ${col[1]}) values (app.uid(), $1, $2)
     on conflict (user_id) do update set ${col[0]} = excluded.${col[0]}, ${col[1]} = excluded.${col[1]}, updated_at = now()`,
    [next.ui, next.mode]);
  return next;
}
