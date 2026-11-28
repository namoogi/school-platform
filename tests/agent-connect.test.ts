import { describe, expect, it } from 'vitest';
import { buildConnectText, GUIDE_URL, type ConnectInput } from '@/lib/agent-connect';

const TOKEN = `agt_${'a1'.repeat(32)}`;
const base: ConnectInput = {
  ai: 'codex', schoolName: '드리미 예시학교', baseUrl: 'https://onschools.vercel.app/', publicSlug: 'dreamy-a',
  kinds: ['story'], keys: ['after-rain'], perms: ['read', 'upload', 'edit'], expiresAt: '2026-12-01T00:00:00Z', token: TOKEN,
};
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('AI 연결 글 (ADR 0022)', () => {
  it('토큰은 정확히 한 번, 환경 변수 줄로 들어간다', () => {
    const t = buildConnectText(base);
    expect(count(t, TOKEN)).toBe(1);
    expect(t).toContain(`export SCHOOL_AGENT_TOKEN='${TOKEN}'`);
    expect(t).toMatch(/토큰 값을 화면·로그·파일·커밋/);
  });

  it('토큰이 없으면(이미 발급한 토큰) 원문 없이 환경 변수 안내', () => {
    const t = buildConnectText({ ...base, token: null });
    expect(t).not.toMatch(/agt_/);
    expect(t).not.toContain('export SCHOOL_AGENT_TOKEN');
    expect(t).toMatch(/환경 변수 SCHOOL_AGENT_TOKEN 에 있다/);
  });

  it('학교·공개 주소·API 주소·머리·base_version·409·안내 문서가 들어간다', () => {
    const t = buildConnectText(base);
    expect(t).toContain('"드리미 예시학교"');
    expect(t).toContain('https://onschools.vercel.app/s/dreamy-a');
    expect(t).toContain('API 기본 주소: https://onschools.vercel.app\n');
    expect(t).toContain('x-agent-token');
    expect(t).toContain('base_version');
    expect(t).toContain('409');
    expect(t).toContain(GUIDE_URL);
    expect(t).toMatch(/몇 판으로 저장했는지/);
    expect(t).toContain('2026-12-01까지');
  });

  it('주소를 정했으면 그 주소만, 종류별 공개 경로와 함께', () => {
    expect(buildConnectText(base)).toContain('after-rain → https://onschools.vercel.app/s/dreamy-a/stories/after-rain');
    const page = buildConnectText({ ...base, kinds: ['page'], keys: ['home', 'about'] });
    expect(page).toContain('home → https://onschools.vercel.app/s/dreamy-a\n');
    expect(page).toContain('about → https://onschools.vercel.app/s/dreamy-a/p/about');
    const all = buildConnectText({ ...base, kinds: ['page', 'news'], keys: null });
    expect(all).toMatch(/주소: 위 종류의 모든 항목/);
    expect(all).toMatch(/종류: 쪽·소식/);
  });

  it('권한별 문장: 있는 권한만 할 수 있는 일, 없는 권한은 할 수 없는 일', () => {
    const t = buildConnectText(base);
    expect(t).toMatch(/새 판\(내용·구조\)을 저장/);
    expect(t).not.toMatch(/새 항목을 만든다/);
    expect(t).toMatch(/이 토큰에 없는 권한: 새 항목 만들기, 보관, 공개·공개 내림/);
    expect(t).toMatch(/공개는 학교 관리자가 \/site에서 한다/);
    expect(t).not.toMatch(/자동 공개/);
    const pub = buildConnectText({ ...base, perms: ['read', 'edit', 'publish'] });
    expect(pub).toMatch(/"공개해"라고 할 때만/);
    expect(pub).not.toMatch(/공개는 학교 관리자가/);
  });

  it('자동 공개면 "저장하면 바로 공개"와 저장 전 확인 규칙', () => {
    const t = buildConnectText({ ...base, perms: ['read', 'create', 'edit', 'publish', 'autopublish'] });
    expect(t).toMatch(/저장하면 바로 방문자에게 공개된다/);
    expect(t).toMatch(/저장하기 전에 .*"저장해"라는 답을 받은 뒤/);
    expect(t).toMatch(/이전 판으로 다시 공개/);
  });

  it('AI 종류별 한 줄', () => {
    expect(buildConnectText(base)).toMatch(/Codex 클라우드라면 .*onschools\.vercel\.app/);
    expect(buildConnectText({ ...base, ai: 'claude-code' })).toMatch(/Claude Code 클라우드/);
    expect(buildConnectText({ ...base, ai: 'other' })).toMatch(/인터넷 요청\(curl 등\)/);
    expect(buildConnectText({ ...base, expiresAt: null })).toMatch(/무기한/);
  });

  it('61차: 학사 꾸러미 토큰은 정의·꾸러미 API와 "켜기는 관리자" 규칙을 담는다', () => {
    const t = buildConnectText({ ...base, kinds: ['package'], keys: null, perms: ['read', 'create', 'edit'] });
    expect(t).toContain('학사 꾸러미 작업을 돕는다');
    expect(t).toContain('POST /api/agent/definitions');
    expect(t).toContain('/api/agent/packages/<code>/preview');
    expect(t).toMatch(/개인정보 등급/);
    expect(t).toMatch(/켜는 것은 학교 관리자/);
    expect(buildConnectText(base)).not.toContain('/api/agent/definitions');
  });

  it('66차: 쪽 토큰은 템플릿 빈 칸 안내를 담고, 동화만 맡긴 토큰에는 없다', () => {
    expect(buildConnectText({ ...base, kinds: ['page'], keys: null })).toContain('GET /api/agent/templates');
    expect(buildConnectText({ ...base, kinds: ['page'], keys: null })).toMatch(/옛 홈페이지는 공개된 쪽만/);
    expect(buildConnectText(base)).not.toContain('/api/agent/templates');
  });
});
