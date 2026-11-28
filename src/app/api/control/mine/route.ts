import { fail } from '@/lib/api';
import { NextResponse } from 'next/server';
import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

type Msg = { author: string; author_session: string | null; kind: string; choice?: string | null; created_at: string };
type Req = { id: string; no: number; status: string; door?: string | null; due_at?: string | null; assignee_session: string | null; source_session: string | null; messages: Msg[] };

/**
 * 세션이 자기 일을 직접 가져간다(당겨 오기). 관제의 send_message 가 막혀도(신뢰 기기 확인 등) 관제 지시가 닿게 한다.
 * ?session=<내 세션 id> → 내가 맡았거나 내가 올린 요청 가운데, 마지막 사람 글 뒤에 내 답이 아직 없는 것.
 * + 기한이 지난 '기한 진행' 결정 카드(ADR 0048) 가운데 아직 추천안 진행 중(proceeding)인 것(`due: true`).
 *   세션이 바뀌어도 다음 차례에 이 목록으로 받아 추천안(default_action)을 실행하고 보고한다.
 */
export async function GET(req: Request) {
  const session = new URL(req.url).searchParams.get('session') ?? '';
  if (!/^session_[A-Za-z0-9]{8,64}$/.test(session)) return fail(400, 'err.sessionParam');
  return handleControl(req, async (db, t) => {
    const all = (await control.requests(db, t, null)) as Req[];
    const now = Date.now();
    return all.filter((r) => (r.assignee_session ?? r.source_session) === session && r.status !== 'pending').flatMap((r) => {
      const msgs = r.messages.filter((m) => m.kind !== 'status');
      // 기한 지남은 앞선 글과 따로 본다. 사람이 실제로 답하면 상태가 answered 로 바뀌므로, 아직 proceeding 이면
      // 메모만 남긴 경우까지 포함해 추천안을 실행할 차례다. 세션이 실행하고 상태를 done·review 로 바꿀 때까지 계속 나온다
      // (보고 글만으로는 빼지 않는다: 빼면 관제 센터 '답 필요'에 영영 남는다).
      // 사람이 선택지를 골랐으면(메모로만 남겼어도) 그 답이 우선이다. 아래 보통 답 흐름으로 간다
      const chosen = msgs.some((m) => m.author === 'user' && !!m.choice);
      if (!chosen && r.door === 'default' && r.status === 'proceeding' && !!r.due_at && Date.parse(r.due_at) <= now) {
        return [{ ...r, due: true }];
      }
      const lastUser = msgs.map((m) => m.author).lastIndexOf('user');
      if (lastUser < 0) return [];
      const answered = msgs.slice(lastUser + 1).some((m) => m.author_session === session);
      return answered ? [] : [r];
    });
  });
}
