#!/usr/bin/env node
// 134차 ADR 0051: 관제 센터에서 차시·결정 기록(ADR)·마이그레이션 번호를 받는다.
// 사용: npm run number -- <round|adr|migration> "<제목>" [--session session_…] [--dry]
// - 저장소의 main과 모든 원격 브랜치에서 이미 쓰인 가장 큰 번호(floor)를 찾아 함께 보낸다.
//   관제 DB는 floor와 지금까지 나간 번호보다 큰 값을 준다(동시에 받아도 겹치지 않음).
// - 세션 id: --session, 없으면 SP_SESSION, 없으면 CLAUDE_CODE_REMOTE_SESSION_ID(cse_… → session_…).
// - 점검 토큰은 클라우드 환경 프록시가 붙인다(ADR 0024). 토큰을 이 스크립트에 넣지 않는다.
// - --dry: 받지 않고 floor만 보여 준다.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? null; };
const dry = args.includes('--dry'); if (dry) args.splice(args.indexOf('--dry'), 1);
const sessionArg = flag('--session');
const [kind, title] = args;
if (!['round', 'adr', 'migration'].includes(kind) || (!dry && !title)) {
  console.error('사용: npm run number -- <round|adr|migration> "<제목>" [--session session_…] [--dry]');
  process.exit(2);
}
const session = sessionArg || process.env.SP_SESSION || (process.env.CLAUDE_CODE_REMOTE_SESSION_ID ?? '').replace(/^cse_/, 'session_');
if (!dry && !/^session_[A-Za-z0-9]{8,64}$/.test(session)) { console.error('세션 id를 --session 으로 주세요(session_…).'); process.exit(2); }

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
try { git('fetch', '-q', 'origin'); } catch { console.error('(git fetch 실패 — 가지고 있는 원격 브랜치로 셉니다)'); }
const refs = git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin').split('\n').filter((r) => r && !r.endsWith('/HEAD'));
const dirs = { round: 'docs/rounds', adr: 'docs/decisions', migration: 'supabase/migrations' };
const pattern = { round: /round-(\d+)\.md$/, adr: /\/(\d{4})-[^/]+\.md$/, migration: /\/(\d{14})_[^/]+\.sql$/ };
let floor = 0;
for (const r of refs) {
  let names = '';
  try { names = git('ls-tree', '--name-only', r, `${dirs[kind]}/`); } catch { continue; }
  for (const n of names.split('\n')) { const m = n.match(pattern[kind]); if (m) floor = Math.max(floor, Number(m[1])); }
}
if (dry) { console.log(JSON.stringify({ kind, floor, branches: refs.length })); process.exit(0); }

const base = (process.env.SP_BASE ?? 'https://onschools.vercel.app').replace(/\/+$/, '');
const out = execFileSync('curl', ['-sS', '-X', 'POST', `${base}/api/control/numbers`, '-H', 'content-type: application/json', '-H', `origin: ${base}`,
  '--data-binary', JSON.stringify({ kind, session, title, floor })], { encoding: 'utf8' });
let got;
try { got = JSON.parse(out); } catch { console.error('응답을 읽지 못했습니다.'); process.exit(1); }
if (!got?.label) { console.error('번호를 받지 못했습니다:', got?.error ?? got?.code ?? '알 수 없음'); process.exit(1); }
console.log(JSON.stringify({ ...got, floor }));
