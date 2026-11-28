-- 121차 (사용자 지시 2026-11-28): 공개 창의 '사진 공개 허가 확인'을 공개 기록에 남긴다.
-- 사진이 든 판을 사람이 공개할 때 서버가 확인을 요구하고(src/lib/site.ts publish), 그 시각과 확인한 사진 목록을 이 행에 적는다.
-- 확인한 사람은 같은 행의 published_by. 공개 기록은 고치지 않고 더하기만 한다(기존 트리거 그대로).
-- 외부 에이전트(작업 토큰) 공개는 이 칸을 비워 둔다(사람 확인이 아님을 기록으로 구분).
alter table public.site_publications
  add column photo_consent_at timestamptz,
  add column photo_consent_assets uuid[];
alter table public.site_publications add constraint site_publications_photo_consent_pair
  check ((photo_consent_at is null) = (photo_consent_assets is null));
comment on column public.site_publications.photo_consent_at is '공개 창에서 사진 공개 허가(학생·보호자·학교)를 확인한 시각. 확인한 사람 = published_by';
comment on column public.site_publications.photo_consent_assets is '그때 확인한 사진(site_assets.id) 목록';
