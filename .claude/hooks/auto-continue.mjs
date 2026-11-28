#!/usr/bin/env node
// 2026-11-28 사용자 결정: 세션이 "다음엔 X 하겠습니다"로 끝내고 멈추지 않게 한다.
// 사람 판단이 꼭 필요한 일이 아니면 다음 단계를 그 자리에서 진행시킨다. (Claude Code Stop 훅, .claude/settings.json)
//
// 차례를 끝내도 되는 경우(멈춤 허용)
//  - 마지막 글에 [결정 필요] · [대기] · [완료] 표시가 있다
//    [결정 필요] 되돌리기 어려운 일·사용자 결정이 필요한 일(AGENTS.md '변경 원칙')
//    [대기] CI·배포·다른 세션을 기다리며, 깨울 장치(감시·예약·PR 구독)를 걸어 두었다
//    [완료] 맡은 일이 끝났거나, 사용자의 질문에 답만 하는 차례였다
//  - 백그라운드 작업이나 세션 예약이 걸려 있다(그것이 세션을 다시 깨운다)
//  - 이미 이 훅 때문에 이어서 일하는 중이다(stop_hook_active, 무한 반복 방지)
//  - 끄기: 환경 변수 SP_AUTO_CONTINUE=off
// 그 밖에는 한 번 막고(decision: block) 이유(reason)로 '다음 단계를 지금 진행하라'를 준다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MARKERS = ['[결정 필요]', '[대기]', '[완료]'];

export const REASON = [
  '자동 진행(저장소 규칙, AGENTS.md "승인을 기다리며 멈추지 않는다"): 방금 끝맺음에 정해진 다음 단계가 있으면 사용자를 기다리지 말고 지금 진행하세요.',
  '- 사람의 판단이 꼭 필요한 일(데이터 삭제·덮어쓰기, 개인정보 공개 확대, 비용, 외부 발송, 권한 확대, 범위가 갈리는 선택)만 멈춥니다. 그때는 결정 요청을 올리고 끝 글에 [결정 필요]를 붙이세요.',
  '- CI·배포·다른 세션을 기다려야 하면 깨울 장치(백그라운드 감시·send_later·PR 구독)를 걸고 끝 글에 [대기]를 붙이세요.',
  '- 맡은 일이 끝났거나 질문에 답만 하는 차례였다면 끝 글에 [완료]를 붙이세요.',
].join('\n');

/** 순수 판정: 입력(Stop 훅 stdin JSON)과 환경 → { block, reason? } */
export function decide(input, env = {}) {
  if (String(env.SP_AUTO_CONTINUE ?? '').toLowerCase() === 'off') return { block: false, why: 'off' };
  if (input?.stop_hook_active) return { block: false, why: 'already-continuing' };
  if (Array.isArray(input?.background_tasks) && input.background_tasks.length) return { block: false, why: 'background' };
  if (Array.isArray(input?.session_crons) && input.session_crons.length) return { block: false, why: 'crons' };
  const msg = typeof input?.last_assistant_message === 'string' ? input.last_assistant_message : '';
  if (!msg.trim()) return { block: false, why: 'empty' };
  if (MARKERS.some((m) => msg.includes(m))) return { block: false, why: 'marker' };
  return { block: true, reason: REASON };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { input = {}; }
  const d = decide(input, process.env);
  if (d.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
  process.exit(0);
}
