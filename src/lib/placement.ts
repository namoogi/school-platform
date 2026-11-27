import type { Db } from './db';
import { ValidationError } from './services';

/**
 * ADR 0038: 학교별 격리 등급. 판이 없으면 공용·운영 중.
 * 원가는 2026-11 확인값을 바탕으로 한 추정 범위다(docs/research/system-tiers-2026-11.md). 판매 가격이 아니다.
 */
export const TIERS = ['shared', 'extended', 'dedicated', 'independent'] as const;
export const STATES = ['planned', 'moving', 'moved', 'active'] as const;
export type Tier = (typeof TIERS)[number];
export type PlacementState = (typeof STATES)[number];
export const TIER_COST_USD: Record<Tier, [number, number] | null> = {
  shared: [0.2, 1],        // 공용 원가를 학교 수로 나눈 값(100~1,000곳)
  extended: [10, 15],      // + 학교 전용 별관 Supabase 프로젝트(Micro~Small) + 빌드·함수 사용량
  dedicated: [15, 60],     // 학교 전용 프로젝트(Small~Medium), 시점 복구(PITR) 선택 시 +$100
  independent: null,       // 학교가 인프라를 직접 부담
};

export type Placement = {
  school_id: string; version: number; tier: Tier; state: PlacementState; target_url: string | null;
  reason: string; monthly_cost_usd: string | null; created_at: string;
};

/** 학교마다 최신 판(없으면 공용 기본값) */
export async function currentPlacements(db: Db): Promise<Record<string, Placement>> {
  const { rows } = await db.query(
    `select distinct on (school_id) school_id, version, tier, state, target_url, reason, monthly_cost_usd, created_at
       from public.school_placements order by school_id, version desc`);
  return Object.fromEntries(rows.map((r) => [r.school_id, r as Placement]));
}

/** 학교마다 최근 20판을 한 번에(학교 수만큼 질의하지 않게) */
export async function placementHistories(db: Db): Promise<Record<string, Placement[]>> {
  const { rows } = await db.query(
    `select school_id, version, tier, state, target_url, reason, monthly_cost_usd, created_at from (
       select p.*, row_number() over (partition by school_id order by version desc) as rn from public.school_placements p) x
      where rn <= 20 order by school_id, version desc`);
  const out: Record<string, Placement[]> = {};
  for (const r of rows as Placement[]) (out[r.school_id] ??= []).push(r);
  return out;
}

/** 내가 속한 학교 가운데 옮김 판이 마지막인 학교와 새 주소(옮긴 학교 구성원 안내용) */
export async function myMovedSchools(db: Db): Promise<{ name: string; locale: string; target_url: string }[]> {
  const { rows } = await db.query(
    `select s.name, s.locale, p.target_url from public.memberships m join public.schools s on s.id = m.school_id
       join lateral (select state, target_url from public.school_placements x where x.school_id = s.id order by version desc limit 1) p on true
      where m.user_id = app.uid() and p.state = 'moved' and p.target_url is not null order by s.name`);
  return rows as { name: string; locale: string; target_url: string }[];
}

export async function setPlacement(db: Db, schoolId: unknown, input: Record<string, unknown>) {
  if (typeof schoolId !== 'string' || !/^[0-9a-f-]{36}$/i.test(schoolId)) throw new ValidationError('학교를 골라 주세요.');
  const tier = input.tier as Tier;
  if (!TIERS.includes(tier)) throw new ValidationError('격리 등급이 올바르지 않습니다.');
  const state = (tier === 'shared' ? 'active' : input.state) as PlacementState;
  if (!STATES.includes(state)) throw new ValidationError('진행 상태가 올바르지 않습니다.');
  const target = typeof input.target_url === 'string' ? input.target_url.trim() : '';
  if (state === 'moved' && !target) throw new ValidationError('옮긴 주소(https://…)를 적어 주세요.');
  if (target && !/^https:\/\/[a-z0-9.-]+(\/.*)?$/.test(target)) throw new ValidationError('주소는 https:// 로 시작하는 소문자 주소여야 합니다.');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw new ValidationError('바꾸는 이유를 적어 주세요(이력에 남습니다).');
  const cost = input.monthly_cost_usd === '' || input.monthly_cost_usd == null ? null : Number(input.monthly_cost_usd);
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new ValidationError('월 원가는 0 이상의 숫자입니다.');
  const { rows: [r] } = await db.query('select app.set_school_placement($1, $2) as v', [schoolId, JSON.stringify({
    tier, state, target_url: target || null, reason, monthly_cost_usd: cost, base_version: Number(input.base_version ?? 0),
  })]);
  return { version: r.v as number };
}
