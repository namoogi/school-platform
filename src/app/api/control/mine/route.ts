import { NextResponse } from 'next/server';
import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

type Msg = { author: string; author_session: string | null; kind: string; created_at: string };
type Req = { id: string; no: number; status: string; assignee_session: string | null; source_session: string | null; messages: Msg[] };

/**
 * 세션이 자기 일을 직접 가져간다(당겨 오기). 관제의 send_message 가 막혀도(신뢰 기기 확인 등) 관제 지시가 닿게 한다.
 * ?session=<내 세션 id> → 내가 맡았거나 내가 올린 요청 가운데, 마지막 사람 글 뒤에 내 답이 아직 없는 것.
 */
export async function GET(req: Request) {
  const session = new URL(req.url).searchParams.get('session') ?? '';
  if (!/^session_[A-Za-z0-9]{8,64}$/.test(session)) return NextResponse.json({ error: '?session=<세션 id>가 필요합니다.' }, { status: 400 });
  return handleControl(req, async (db, t) => {
    const all = (await control.requests(db, t, null)) as Req[];
    return all.filter((r) => (r.assignee_session ?? r.source_session) === session && r.status !== 'pending').flatMap((r) => {
      const msgs = r.messages.filter((m) => m.kind !== 'status');
      const lastUser = msgs.map((m) => m.author).lastIndexOf('user');
      if (lastUser < 0) return [];
      const answered = msgs.slice(lastUser + 1).some((m) => m.author_session === session);
      return answered ? [] : [r];
    });
  });
}
