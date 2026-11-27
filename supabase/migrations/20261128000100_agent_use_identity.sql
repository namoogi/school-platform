-- 83차: 작업 토큰 사용 기록에 '어느 세션·어느 작업자'가 했는지 남긴다.
-- 값은 에이전트가 요청 머리 x-agent-session · x-agent-operator 로 스스로 알린 것(검증되지 않은 자기 신고)이다.
-- 앱(handleAgent)이 트랜잭션 안에서 app.agent_session · app.agent_operator 설정으로 넘기고, 기록 줄을 넣을 때 트리거가 붙인다.
-- 기록을 남기는 DB 함수 14곳을 고치지 않기 위해 트리거로 한다. 기록은 여전히 추가만(수정·삭제 금지 트리거 그대로).
alter table public.agent_token_uses
  add column session_label text check (session_label is null or length(session_label) between 1 and 80),
  add column operator text check (operator is null or length(operator) between 1 and 120);

create or replace function private.agent_use_identity() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare s text; o text;
begin
  -- 제어 문자 제거 · 앞뒤 공백 정리 · 길이 제한. 비었으면 null
  s := nullif(btrim(regexp_replace(coalesce(current_setting('app.agent_session', true), ''), '[[:cntrl:]]', '', 'g')), '');
  o := nullif(btrim(regexp_replace(coalesce(current_setting('app.agent_operator', true), ''), '[[:cntrl:]]', '', 'g')), '');
  new.session_label := left(s, 80);
  new.operator := left(o, 120);
  return new;
end $$;
revoke all on function private.agent_use_identity() from public;

create trigger agent_token_uses_identity before insert on public.agent_token_uses
  for each row execute function private.agent_use_identity();
