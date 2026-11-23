import { handleChat, jsonBody } from '@/lib/chat-api';
import { chatBadge, listThreads, startChat } from '@/lib/control';

/** 대화 목록 + 숫자(사람이 눌러야 하는 것). ?badge=1 이면 숫자만 */
export async function GET(req: Request) {
  const badge = new URL(req.url).searchParams.get('badge') === '1';
  return handleChat(req, async (db, scope) => {
    const count = await chatBadge(db, scope);
    if (badge) return { count };
    const threads = await listThreads(db, scope);
    // 전체 관리 화면에서만: 새 대화의 학교·맡을 세션 고르기
    const extra = scope.isPlatform && !scope.schoolId ? {
      schools: (await db.query('select id, name from public.schools order by name')).rows,
      sessions: (await db.query('select id, name, school_id, active from public.control_sessions where active order by created_at')).rows,
    } : {};
    return { count, threads, ...extra };
  });
}

/** 새 대화: {topic, body, title?, school_id?(전체 관리 화면), assignee_session?(전체 관리자)} */
export async function POST(req: Request) {
  return handleChat(req, async (db, scope) => startChat(db, scope, await jsonBody(req)));
}
