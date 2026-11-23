/**
 * 43차 사용량·요금 추정: 단가와 계산 (서버·브라우저 공용, DB 의존 없음). ADR 0018
 * 단가는 2026-11-23 웹 확인값이다(docs/research/storage-cost-2026-11.md). 공식 페이지에서 바뀌면 여기만 고친다.
 * 금액은 USD 추정이며 청구서가 아니다. 포함분(무료·요금제 포함)은 플랫폼 전체에 한 번 적용되므로 학교별 금액은 '포함분 빼기 전' 단가 × 사용량이다.
 */
export const PRICES = {
  checked: '2026-11-23',
  r2GbMonth: 0.015, // Cloudflare R2 Standard 저장 GB-월
  r2FreeGb: 10, // R2 계정 무료 저장
  dbGbMonth: 0.125, // Supabase Pro DB 디스크 초과분 GB-월
  dbIncludedGb: 8, // Supabase Pro 포함 DB 디스크
} as const;

export type SchoolUsage = {
  id: string; name: string; files: number; db_site_bytes: number; db_source_bytes: number; r2_bytes: number; db_only_files: number;
  agent_actions_30d: number; ai_calls_30d: number; ai_tokens_30d: number; ai_cost_30d: number;
};

const GB = 1024 ** 3;
export const toGb = (b: number) => b / GB;
export function fmtBytes(b: number) {
  if (b >= GB) return `${(b / GB).toFixed(2)}GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)}MB`;
  if (b > 0) return `${Math.max(1, Math.round(b / 1024))}KB`;
  return '0';
}
export const usd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);

/** 학교 하나의 월 추정(포함분 빼기 전): DB 저장 × DB 단가 + R2 저장 × R2 단가 + AI 최근 30일 */
export function estimate(u: SchoolUsage) {
  const db = toGb(u.db_site_bytes + u.db_source_bytes) * PRICES.dbGbMonth;
  const r2 = toGb(u.r2_bytes) * PRICES.r2GbMonth;
  return { db, r2, ai: u.ai_cost_30d, total: db + r2 + u.ai_cost_30d };
}

/** 플랫폼 전체(포함분 뺀 뒤): R2 무료 10GB, DB 포함 8GB(DB에는 파일 말고 다른 표도 있어 실제보다 낮게 잡힘) */
export function platformEstimate(rows: SchoolUsage[]) {
  const dbGb = toGb(rows.reduce((n, u) => n + u.db_site_bytes + u.db_source_bytes, 0));
  const r2Gb = toGb(rows.reduce((n, u) => n + u.r2_bytes, 0));
  const ai = rows.reduce((n, u) => n + u.ai_cost_30d, 0);
  const db = Math.max(0, dbGb - PRICES.dbIncludedGb) * PRICES.dbGbMonth;
  const r2 = Math.max(0, r2Gb - PRICES.r2FreeGb) * PRICES.r2GbMonth;
  return { dbGb, r2Gb, db, r2, ai, total: db + r2 + ai };
}
