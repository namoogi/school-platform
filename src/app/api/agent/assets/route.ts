import { NextResponse } from 'next/server';
import { handleAgent } from '@/lib/agent-api';
import { agentAssets, agentUpload } from '@/lib/agent';
import { PDF_MAX_BYTES } from '@/lib/pdf-check';

export async function GET(req: Request) {
  return handleAgent(req, (db, token) => agentAssets(db, token));
}

/**
 * 그림·PDF 올리기: 본문에 파일 그대로(curl --data-binary @file), Content-Type 에 형식, ?name= 에 파일 이름.
 * 한 요청 4MB(PDF)·5MB(그림) 이하. Vercel 요청 한도(약 4.5MB) 때문에 실제로는 4MB 안쪽으로 맞춘다.
 */
export async function POST(req: Request) {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > PDF_MAX_BYTES + 1024 * 1024) return NextResponse.json({ error: '파일이 너무 큽니다(4MB 이하).' }, { status: 413 });
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const name = new URL(req.url).searchParams.get('name') ?? 'file';
  return handleAgent(req, async (db, token) => agentUpload(db, token, { name, type, bytes: Buffer.from(await req.arrayBuffer()) }));
}
