-- 90차: 홈페이지 화면 모양 2종 추가(아이보리 편집 ivory · 놀이터 play). 기존 행은 그대로.
-- 되돌리기: 새 값을 쓰는 학교를 campus로 바꾼 뒤 제약을 20261128000200의 8가지 값으로 다시 건다.
alter table public.site_settings drop constraint if exists site_settings_theme_check;
alter table public.site_settings add constraint site_settings_theme_check
  check (theme in ('campus', 'dawn', 'clear', 'bold', 'studio', 'lamp', 'horizon', 'seed', 'ivory', 'play'));
