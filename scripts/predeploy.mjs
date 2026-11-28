// Vercel 빌드에서만 실행: 이 프로젝트 전용 Supabase DB에 마이그레이션과 예시 시드를 적용한다.
// 로컬의 `npm run build` 에서는 아무것도 하지 않는다.
// 연결 문자열과 비밀번호는 Vercel 환경 변수에만 두고 저장소·채팅에 남기지 않는다.
import { execFileSync } from 'node:child_process';
import { parseDbUrl } from './pg-options.mjs';

if (process.env.VERCEL !== '1') process.exit(0);

const missing = ['DATABASE_URL', 'SEED_PASSWORD_A', 'SEED_PASSWORD_B'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[predeploy] Vercel 환경 변수가 비어 있습니다: ${missing.join(', ')}`);
  console.error('[predeploy] Project Settings → Environment Variables 에 추가한 뒤 다시 배포하세요. (docs/SETUP-CLOUD.md)');
  process.exit(1);
}
// SESSION_SECRET 은 선택. 없으면 DB가 만든 키를 쓴다. 넣었다면 32자 이상이어야 한다.
if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
  console.error('[predeploy] SESSION_SECRET 은 32자 이상이어야 합니다.');
  process.exit(1);
}
for (const k of ['SEED_PASSWORD_A', 'SEED_PASSWORD_B']) {
  if (process.env[k].length < 10 || /^demo-pass/.test(process.env[k])) {
    console.error(`[predeploy] ${k} 는 10자 이상의 새 비밀번호여야 합니다. (공개 주소에 예시 기본값을 쓰지 않음)`);
    process.exit(1);
  }
}

let host;
try {
  host = parseDbUrl(process.env.DATABASE_URL).hostname;
} catch (e) {
  console.error(`[predeploy] ${e.message}`);
  console.error('[predeploy] Supabase → Connect → Direct → Transaction pooler 주소 전체를 넣으세요. (docs/SETUP-CLOUD.md)');
  process.exit(1);
}
console.log(`[predeploy] ${process.env.VERCEL_ENV ?? 'unknown'} 빌드 · DB 호스트 ${host}`);
// Production과 Preview가 같은 DB를 쓴다(2026-11-22 확인). 미리보기 빌드가 병합 전 브랜치의 마이그레이션·시드를
// 운영 DB에 적용하지 않도록, DB를 바꾸는 일은 Production 빌드(main 병합)에서만 한다. (사용자 결정 2026-11-22)
// 미리보기 전용 DB로 분리하면 PREVIEW_APPLY_MIGRATIONS=1 로 다시 켤 수 있다.
const applyHere = process.env.VERCEL_ENV === 'production' || process.env.PREVIEW_APPLY_MIGRATIONS === '1';
// 77차(ADR 0019 A4, 관제 센터 #17): MIGRATIONS_BY_ACTIONS=1 이면 운영 DB 변경은 GitHub Actions(migrate-production.yml)가 먼저 하고,
// 운영 빌드는 적용하지 않고 '대기 중인 파일이 없는지'만 확인한다. 남아 있으면 빌드를 멈춘다(앱이 아직 없는 표를 쓰지 않게).
const byActions = process.env.MIGRATIONS_BY_ACTIONS === '1';
try {
  if (applyHere && byActions && process.env.VERCEL_ENV === 'production') {
    console.log('[predeploy] 운영 빌드: 마이그레이션은 GitHub Actions가 적용합니다. 대기 중인 파일이 없는지 확인한 뒤 시드·학교 준비만 합니다.');
    execFileSync('node', ['scripts/migrate.mjs', '--check', '--strict'], { stdio: 'inherit' });
    // 78차: 예시 시드·학교 준비는 계속 운영 빌드가 한다(GitHub에 시드 비밀번호·관리자 이메일을 두지 않음)
    execFileSync('node', ['scripts/seed.mjs'], { stdio: 'inherit' });
    execFileSync('node', ['scripts/provision.mjs'], { stdio: 'inherit' });
  } else if (applyHere) {
    execFileSync('node', ['scripts/migrate.mjs'], { stdio: 'inherit' });
    execFileSync('node', ['scripts/seed.mjs'], { stdio: 'inherit' });
    // 실제 학교 준비는 운영 빌드에서만 (미리보기용 DB 분리 여부와 무관하게)
    if (process.env.VERCEL_ENV === 'production') execFileSync('node', ['scripts/provision.mjs'], { stdio: 'inherit' });
  } else {
    console.log('[predeploy] 미리보기 빌드: 마이그레이션·시드를 적용하지 않습니다(운영 DB 공용). 대기 목록만 확인합니다.');
    execFileSync('node', ['scripts/migrate.mjs', '--check'], { stdio: 'inherit' });
  }
} catch {
  // 원인은 위 [db] 또는 마이그레이션 출력에 있다. 여기서는 중복 스택을 남기지 않는다.
  console.error(byActions && process.env.VERCEL_ENV === 'production'
    ? '[predeploy] 운영 DB에 아직 적용하지 않은 마이그레이션이 있어 빌드를 멈춥니다. GitHub Actions의 "운영 DB 마이그레이션" 실행 결과를 확인하세요. (docs/SETUP-MIGRATIONS-CI.md)'
    : '[predeploy] DB 준비에 실패해 빌드를 중단합니다.');
  process.exit(1);
}
