-- 로그인 쿠키 서명 키를 DB가 직접 만들어 보관한다. (Vercel에 SESSION_SECRET을 넣지 않아도 됨)
-- private 스키마라 authenticated·anon 역할은 읽을 수 없다. 키는 DB 밖으로 내보내지 않는다.
-- gen_random_uuid()는 Postgres 13+ 기본 함수이며 암호학적 난수를 쓴다. (UUID 3개 ≈ 366비트)
create table private.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

insert into private.app_secrets(name, value)
values ('session_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;
