-- 15차: XLSX·DOCX·PDF 판독. 한 파일에 여러 표(시트·문서 표·PDF 표)가 있을 수 있다.
-- source_rows 에 표 식별자와 사람이 읽는 위치를 더하고, 원본 바이너리를 보관한다.

alter table public.source_rows add column table_key text not null default 'main';
alter table public.source_rows add column location text;
alter table public.source_rows drop constraint source_rows_file_id_row_number_key;
alter table public.source_rows add constraint source_rows_file_table_row_key unique (file_id, table_key, row_number);

alter table public.source_files add column reader text;
alter table public.source_files add column needs_review boolean not null default false;
alter table public.source_files add column original bytea;

-- 원문 보호 대상에 원본 바이너리와 판독 정보도 포함한다.
create or replace function private.guard_source_file() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'source_files: 자료는 삭제하지 않고 보관 처리합니다.' using errcode = 'P0001';
  end if;
  if new.school_id is distinct from old.school_id or new.content is distinct from old.content
     or new.sha256 is distinct from old.sha256 or new.name is distinct from old.name
     or new.kind is distinct from old.kind or new.sheet_url is distinct from old.sheet_url
     or new.uploaded_by is distinct from old.uploaded_by or new.created_at is distinct from old.created_at
     or new.original is distinct from old.original or new.reader is distinct from old.reader
     or new.needs_review is distinct from old.needs_review then
    raise exception 'source_files: 원문과 소속은 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- 한 번에 올린 여러 파일도 올린 순서가 남도록 트랜잭션 시각(now) 대신 실제 시각을 쓴다.
-- (분석은 먼저 올린 자료부터 읽으므로 순서가 결과에 영향을 준다)
alter table public.source_files alter column created_at set default clock_timestamp();
