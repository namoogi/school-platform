// Vercel 빌드에서만 실행: 이 프로젝트 전용 Supabase DB에 마이그레이션과 예시 시드를 적용한다.
// 로컬의 `npm run build` 에서는 아무것도 하지 않는다.
// 연결 문자열과 비밀번호는 Vercel 환경 변수에만 두고 저장소·채팅에 남기지 않는다.
import { execFileSync } from 'node:child_process';

if (process.env.VERCEL !== '1') process.exit(0);

const missing = ['DATABASE_URL', 'SESSION_SECRET', 'SEED_PASSWORD_A', 'SEED_PASSWORD_B'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[predeploy] Vercel 환경 변수가 비어 있습니다: ${missing.join(', ')}`);
  console.error('[predeploy] Project Settings → Environment Variables 에 추가한 뒤 다시 배포하세요. (docs/SETUP-CLOUD.md)');
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('[predeploy] SESSION_SECRET 은 32자 이상이어야 합니다.');
  process.exit(1);
}
for (const k of ['SEED_PASSWORD_A', 'SEED_PASSWORD_B']) {
  if (process.env[k].length < 10 || /^demo-pass/.test(process.env[k])) {
    console.error(`[predeploy] ${k} 는 10자 이상의 새 비밀번호여야 합니다. (공개 주소에 예시 기본값을 쓰지 않음)`);
    process.exit(1);
  }
}

const host = new URL(process.env.DATABASE_URL).hostname;
console.log(`[predeploy] ${process.env.VERCEL_ENV ?? 'unknown'} 빌드 · DB 호스트 ${host}`);
execFileSync('node', ['scripts/migrate.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/seed.mjs'], { stdio: 'inherit' });
