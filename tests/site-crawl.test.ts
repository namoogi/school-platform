/** 67차 ADR 0031 — 기존 사이트 읽기: 사설·내부 주소 거부(리디렉트 포함), robots.txt, 같은 사이트만·쪽 수 한도, HTML → 제목·목록 줄글, 그림 목록 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertPublicUrl, crawlSite, htmlToText, isPrivateAddress, robotsDisallow } from '@/lib/site-crawl';

let server: http.Server; let base = '';
const PAGES: Record<string, string> = {
  '/': `<html><head><title>예시꿈학교</title><script>alert(1)</script></head><body><nav><a href="/about">소개</a> <a href="/secret/x">비밀</a> <a href="https://other.example/">밖</a> <a href="/file.pdf">PDF</a></nav>
        <h1>예시꿈학교</h1><p>스스로 질문하는 배움터입니다.</p><img src="/img/campus.jpg" alt="학교 전경"></body></html>`,
  '/about': `<html><body><h2>인사말</h2><p>환영합니다. 작은 학교입니다.</p><h2>교육 목표</h2><ul><li>스스로 배우는 사람: 질문한다</li><li>함께 사는 사람: 섬긴다</li></ul>
        <footer><address>경기도 예시시 꿈마을로 12</address><p>전화 031-123-4567</p></footer><a href="/about/more">더</a></body></html>`,
  '/about/more': '<html><body><p>더 보기</p><a href="/about/login">로그인</a></body></html>',
  '/secret/x': '<html><body><p>비밀 쪽</p></body></html>',
  '/robots.txt': 'User-agent: *\nDisallow: /secret\n',
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/about/login') { res.writeHead(302, { location: '/login' }); return res.end(); }
    if (req.url === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body><p>플랫폼 로그인</p></body></html>'); }
    const body = PAGES[req.url ?? ''];
    if (!body) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': req.url === '/robots.txt' ? 'text/plain' : 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('안전 검사', () => {
  it('사설·내부·메타데이터 주소, http(s) 아닌 주소, 다른 포트, 사용자 정보는 거부', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    await expect(assertPublicUrl('http://127.0.0.1/')).rejects.toThrow('공개 인터넷');
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('공개 인터넷');
    await expect(assertPublicUrl('http://localhost/')).rejects.toThrow('내부');
    await expect(assertPublicUrl('ftp://93.184.216.34/')).rejects.toThrow('http');
    await expect(assertPublicUrl('https://93.184.216.34:8443/')).rejects.toThrow('포트');
    await expect(assertPublicUrl('https://user:pw@93.184.216.34/')).rejects.toThrow('사용자 정보');
    await expect(crawlSite(base)).rejects.toThrow(/공개 인터넷|포트/); // 시험 서버도 사설 주소라 기본은 거부
  });

  it('공개 주소에서 사설 주소로 리디렉트하면 거부한다', async () => {
    const fake = (async (url: string) => url.startsWith('http://93.184.216.34/robots')
      ? new Response('', { status: 404 })
      : new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/admin' } })) as unknown as typeof fetch;
    const r = await crawlSite('http://93.184.216.34/', { fetchImpl: fake });
    expect(r.pages).toEqual([]);
    expect(r.skipped[0].why).toContain('공개 인터넷');
  });
});

describe('읽기', () => {
  it('robots.txt 를 따르고, 같은 사이트 HTML 쪽만, 쪽 수 한도, 스크립트는 버린다', async () => {
    const r = await crawlSite(`${base}/`, { allowPrivate: true, maxPages: 3 });
    expect(r.pages.map((p) => new URL(p.url).pathname)).toEqual(['/', '/about', '/about/more']);
    expect(r.skipped.some((s) => s.url.endsWith('/secret/x') && s.why.includes('robots'))).toBe(true);
    expect(r.pages[0].text).not.toContain('alert');
    expect(r.pages[0].images).toEqual([{ src: `${base}/img/campus.jpg`, alt: '학교 전경' }]);
    const about = r.pages[1].text;
    expect(about).toContain('인사말\n환영합니다. 작은 학교입니다.');
    expect(about).toContain('- 스스로 배우는 사람: 질문한다');
    expect(about).toContain('경기도 예시시 꿈마을로 12');
  });

  it('robots 규칙은 User-agent: * 묶음만', () => {
    expect(robotsDisallow('User-agent: Googlebot\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\nDisallow:\n')).toEqual(['/b']);
  });

  it('HTML 줄글 변환: 바깥 블록이 안쪽 글을 두 번 내지 않는다', async () => {
    const { text } = await htmlToText('<div><li><p>한 번만</p></li></div>', 'https://x.example/');
    expect(text.match(/한 번만/g)).toHaveLength(1);
  });

  it('69차: 시작 주소가 하위 경로면 그 경로 아래만 읽는다', async () => {
    const r = await crawlSite(`${base}/about`, { allowPrivate: true, maxPages: 5 });
    expect(r.pages.map((p) => new URL(p.url).pathname)).toEqual(['/about', '/about/more']);
    expect(r.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ why: '사이트 밖으로 넘어감' })]));
  });
});

