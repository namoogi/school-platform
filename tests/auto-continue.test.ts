/** ADR 0044: 멈춤 방지 Stop 훅 — 표시가 없으면 한 번 막고, 표시·백그라운드·이어서 일하는 중·끄기면 멈춤 허용 */
import { describe, expect, it } from 'vitest';
import { decide, MARKERS } from '../.claude/hooks/auto-continue.mjs';

const msg = (t: string, extra: object = {}) => ({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: t, ...extra });

describe('멈춤 방지 훅', () => {
  it('다음 단계를 말하고 끝내면 막고, 이유에 표시 세 가지를 안내한다', () => {
    const d = decide(msg('PR을 올렸습니다. CI가 통과하면 병합하고 운영을 확인하겠습니다.'));
    expect(d.block).toBe(true);
    for (const m of MARKERS) expect(d.reason).toContain(m);
  });
  it.each(MARKERS)('%s 표시가 있으면 멈춤 허용', (m) => {
    expect(decide(msg(`정리했습니다. ${m}`)).block).toBe(false);
  });
  it('이미 훅 때문에 이어서 일하는 중이면 막지 않는다(무한 반복 방지)', () => {
    expect(decide(msg('계속', { stop_hook_active: true })).block).toBe(false);
  });
  it('백그라운드 작업·세션 예약이 있으면 그것이 깨우므로 멈춤 허용', () => {
    expect(decide(msg('CI 기다림', { background_tasks: [{ id: 'b1' }] })).block).toBe(false);
    expect(decide(msg('예약함', { session_crons: [{ id: 'c1' }] })).block).toBe(false);
  });
  it('끄기(SP_AUTO_CONTINUE=off)·빈 글·이상한 입력은 멈춤 허용', () => {
    expect(decide(msg('x'), { SP_AUTO_CONTINUE: 'off' }).block).toBe(false);
    expect(decide(msg('   ')).block).toBe(false);
    expect(decide(null).block).toBe(false);
  });
  it('표시는 마지막 줄에서만 인정한다: 본문·인용·코드 블록의 표시는 끝내는 표시가 아니다(Codex #192)', () => {
    expect(decide(msg('끝 글에는 [완료]를 붙입니다.\n이제 시험을 돌리겠습니다.')).block).toBe(true);
    expect(decide(msg('설명:\n> [대기] 는 기다릴 때')).block).toBe(true);
    expect(decide(msg('예시\n```\n[결정 필요]\n```')).block).toBe(true);
    expect(decide(msg('정리했습니다.\n\n[대기] CI 감시를 걸어 두었습니다.\n')).block).toBe(false);
  });
});
