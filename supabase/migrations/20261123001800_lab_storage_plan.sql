-- 연구소 보드에 '파일 저장소 비용' 연구와 할 일을 올린다 (사용자 요청 2026-11-23)
-- 자세한 비교·계획: docs/research/storage-cost-2026-11.md. 한 번만 넣는다(같은 제목이 있으면 건너뜀).
do $$
declare sys uuid := '00000000-0000-0000-0000-000000000000'; lab uuid;
begin
  if exists (select 1 from public.platform_items where title = '파일 저장소 비용 줄이기: DB 저장 → 객체 저장소(R2 등)') then return; end if;
  insert into public.platform_items(kind, title, body, status, priority, tags, link, sort, created_by) values
    ('lab', '파일 저장소 비용 줄이기: DB 저장 → 객체 저장소(R2 등)',
     E'지금 그림·PDF·원본 파일을 Postgres bytea 에 넣고 Vercel 함수가 내보낸다(DB 디스크·egress·Vercel 전송이 함께 듦).\n'
     || E'비교(2026-11 웹 확인): R2 저장 $0.015/GB·내려받기 무료·10GB 무료 / Supabase 파일 약 $0.021/GB·egress 초과 $0.09/GB / DB 디스크 $0.125/GB / B2 약 $0.007/GB.\n'
     || E'계획: 0 그림 줄이기(WebP·1600px) → 1 사용량 재기 → 2 S3 호환 저장소 어댑터(ADR, 메타데이터는 DB·RLS 유지) → 3 공개 그림은 CDN 주소 → 4 기존 bytea 옮기기 → 5 학교별 사용량 경보.\n'
     || E'저장소 선택(R2 / Supabase Storage / 단계적)은 관제 센터 결정 요청. 결제처가 늘어나는 점(벤더 단일화 선호)을 함께 본다.',
     'idea', 'high', '{저장소,비용}', 'https://github.com/namoogi/school-platform/blob/main/docs/research/storage-cost-2026-11.md', 5, sys)
    returning id into lab;
  insert into public.platform_items(kind, title, body, status, priority, tags, parent_id, sort, created_by) values
    ('todo', '그림 올릴 때 줄이기(WebP·긴 변 1600px)', '어느 저장소든 먼저. 저장·전송을 함께 줄인다. 원본 보관 여부는 학교 설정으로.', 'todo', 'high', '{저장소,비용}', lab, 5, sys),
    ('todo', '파일 사용량 재기(학교별·종류별 크기, 공개 그림 내려받기)', '관제 화면에 보인다. 저장소 선택 전 실제 숫자를 얻는다.', 'todo', 'high', '{저장소,비용}', lab, 6, sys),
    ('todo', '저장소 어댑터 설계 ADR(S3 호환, 키 school/<id>/<sha256>, 판 보존)', '바이트만 객체 저장소로, 메타데이터·RLS 는 DB. 공개 판 자산만 공개 주소, 나머지는 서명 주소.', 'todo', 'normal', '{저장소}', lab, 7, sys);
end $$;
