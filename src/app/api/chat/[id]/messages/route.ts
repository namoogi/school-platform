import { handleChat, jsonBody } from '@/lib/chat-api';
import { sendChat } from '@/lib/control';

/** 글 보내기: {body, choice?(결정 카드 선택지), own?(직접 작성한 안), revise?(다시 수정 요청)} */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleChat(req, async (db, scope) => sendChat(db, scope, id, await jsonBody(req)));
}
