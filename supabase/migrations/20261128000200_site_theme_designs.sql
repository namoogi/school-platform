-- 89차(ADR 0034): 홈페이지 화면 모양(테마)을 8종으로 넓힌다.
-- 템플릿 완성 디자인 6종(clear·bold·studio·lamp·horizon·seed)을 더한다. 기존 값(campus·dawn)과 행은 그대로.
-- 되돌리기: 새 값을 쓰는 학교를 campus로 바꾼 뒤 제약을 원래 두 값으로 다시 건다.
alter table public.site_settings drop constraint if exists site_settings_theme_check;
alter table public.site_settings add constraint site_settings_theme_check
  check (theme in ('campus', 'dawn', 'clear', 'bold', 'studio', 'lamp', 'horizon', 'seed'));
