import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 학교별 개발 연동: 학교 전용 GitHub 저장소, Claude Code 세션, Codex 환경, Vercel·Supabase 프로젝트 등.
 * 주소와 메모만 저장한다. 토큰·키는 받지 않는다. 쓰기는 전체 관리자만(RLS).
 */
export const LINK_KINDS = {
  github_repo: { label: 'GitHub 저장소', host: /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/, example: 'https://github.com/<owner>/<repo>' },
  claude_session: { label: 'Claude Code 세션', host: /^https:\/\/claude\.ai\/code\//, example: 'https://claude.ai/code/session_…' },
  codex_environment: { label: 'Codex 환경·작업', host: /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//, example: 'https://chatgpt.com/codex/…' },
  vercel_project: { label: 'Vercel 프로젝트', host: /^https:\/\/vercel\.com\//, example: 'https://vercel.com/<team>/<project>' },
  supabase_project: { label: 'Supabase 프로젝트', host: /^https:\/\/supabase\.com\/dashboard\/project\//, example: 'https://supabase.com/dashboard/project/<ref>' },
  other: { label: '기타', host: /^https:\/\//, example: 'https://…' },
} as const;
export type LinkKind = keyof typeof LINK_KINDS;
export const LINK_STATUS = { planned: '예정', active: '사용 중', archived: '보관' } as const;

export type DevLink = {
  id: string; school_id: string; kind: LinkKind; label: string; url: string; notes: string;
  status: keyof typeof LINK_STATUS; created_at: string; updated_at: string;
};

const SECRET = /(ghp_|github_pat_|gho_|sk-ant-|sk-[A-Za-z0-9]{20}|sb_secret_|service_role|eyJ[A-Za-z0-9_-]{20,}\.)/i;

function clean(input: Record<string, unknown>, partial: boolean, currentKind?: LinkKind) {
  const out: Record<string, unknown> = {};
  const kind = (input.kind ?? currentKind) as LinkKind;
  if (!partial || input.kind !== undefined) {
    if (!(kind in LINK_KINDS)) throw new ValidationError('err.devlink.kind');
    out.kind = kind;
  }
  if (!partial || input.label !== undefined) {
    const l = String(input.label ?? '').trim();
    if (!l || l.length > 120) throw new ValidationError('err.devlink.name');
    out.label = l;
  }
  if (!partial || input.url !== undefined) {
    const u = String(input.url ?? '').trim();
    if (!LINK_KINDS[kind].host.test(u)) throw new ValidationError('err.devlink.urlForm', { kind: `devlink.kind.${kind}`, example: LINK_KINDS[kind].example });
    if (u.length > 500) throw new ValidationError('err.devlink.url');
    out.url = u;
  }
  if (input.notes !== undefined) {
    const n = String(input.notes ?? '');
    if (n.length > 2000) throw new ValidationError('err.devlink.notes');
    out.notes = n;
  }
  if (input.status !== undefined) {
    const s = String(input.status);
    if (!(s in LINK_STATUS)) throw new ValidationError('db.badStatus');
    out.status = s;
  }
  // 비밀 값처럼 보이면 저장하지 않는다(값을 오류 메시지에 넣지 않음)
  if (SECRET.test(`${out.url ?? ''} ${out.notes ?? ''}`)) {
    throw new ValidationError('err.devlink.secret');
  }
  return out;
}

export async function listLinks(db: Db, schoolId: string, includeArchived = false): Promise<DevLink[]> {
  if (!isUuid(schoolId)) throw new NotFoundError('err.schoolNotFound');
  const { rows } = await db.query<DevLink>(
    `select * from public.school_dev_links where school_id = $1 and ($2 or status <> 'archived') order by kind, created_at`,
    [schoolId, includeArchived]);
  return rows;
}

export async function createLink(db: Db, schoolId: string, input: Record<string, unknown>) {
  if (!isUuid(schoolId)) throw new NotFoundError('err.schoolNotFound');
  const v = clean(input, false);
  const cols = ['school_id', ...Object.keys(v)];
  const { rows: [r] } = await db.query(
    `insert into public.school_dev_links(${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    [schoolId, ...Object.values(v)]);
  await db.query(`select app.log_access($1, 'devlink.add', $2)`, [schoolId, JSON.stringify({ kind: v.kind, label: v.label })]);
  return { id: r.id as string };
}

export async function updateLink(db: Db, id: string, input: Record<string, unknown>) {
  if (!isUuid(id)) throw new NotFoundError('err.devlink.notFound');
  const { rows: [cur] } = await db.query('select school_id, kind from public.school_dev_links where id = $1', [id]);
  if (!cur) throw new NotFoundError('err.devlink.notFound');
  const v = clean(input, true, cur.kind);
  const keys = Object.keys(v);
  if (!keys.length) return { id };
  const res = await db.query(`update public.school_dev_links set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [id, ...Object.values(v)]);
  if (!res.rowCount) throw new NotFoundError('err.devlink.notFound');
  await db.query(`select app.log_access($1, 'devlink.update', $2)`, [cur.school_id, JSON.stringify({ id, ...('status' in v ? { status: v.status } : {}) })]);
  return { id };
}

/** 학교 전용 개발 세션을 열 때 붙여 넣을 요청 문구 (Claude Code / Codex 공통) */
export function sessionPrompt(school: { id: string; slug: string; name: string }, links: DevLink[], tool: 'claude' | 'codex') {
  const repo = links.find((l) => l.kind === 'github_repo' && l.status !== 'archived');
  const lines = [
    `namoogi/school-platform 저장소에서 '${school.name}'(slug: ${school.slug}, school_id: ${school.id}) 학교 맞춤 작업을 한다.`,
    `먼저 AGENTS.md, docs/COLLABORATION.md를 읽고 ${tool === 'claude' ? 'session-start 스킬로 시작한다' : '같은 점검 순서를 따른다'}.`,
    '학교별 차이는 코드 분기가 아니라 학교 설정·규칙 판·모듈 라이선스로 표현한다. 다른 학교 기록에 영향을 주지 않는다.',
  ];
  if (repo) lines.push(`이 학교 전용 저장소 ${repo.url} 이 있으면 그 저장소의 AGENTS.md도 읽고, 플랫폼 공통 코드는 이 저장소(school-platform)에서만 고친다.`);
  // 36차(ADR 0013): 홈페이지 내용만 바꿀 때는 코드 대신 학교 범위 작업 토큰으로 시안을 만든다
  lines.push(`홈페이지 쪽·소식·동화의 내용·그림·PDF만 바꿀 때는 코드를 고치지 말고, 학교 관리자가 /site 설정 → 'AI 작업 공간'에서 발급한 토큰으로 시안을 만든다(공개는 학교 관리자). 안내: docs/agents/${tool === 'claude' ? 'claude-code' : 'codex'}.md`);
  lines.push(`브랜치 ${tool === 'claude' ? 'school/' : 'codex/school-'}${school.slug}-<주제>, PR 양식을 채우고 상대 쪽(${tool === 'claude' ? 'Codex' : 'Claude'}) 검토를 요청한다. 병합은 사용자 승인 후.`);
  return lines.join('\n');
}
