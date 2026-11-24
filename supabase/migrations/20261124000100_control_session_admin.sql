-- 51차(ADR 0024): 점검 계정 = 관제 세션(전체 관리자). 읽기 전용 제한은 앱(db.ts)에서 걷었고, 여기서는 표시 이름만 바꾼다.
update private.app_users set display_name = 'Claude 관제 세션'
 where id = '0c1a0de0-0000-4000-8000-000000000001' and display_name = 'Claude 점검(읽기 전용)';
