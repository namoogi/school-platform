/** 66차 ADR 0031 — 학교 자료로 빈 칸 채우기(규칙 기반, DB 없음): 제목 묶음 찾기, 목록·연혁·연락처, 안내 자리만 채움(학교가 쓴 칸은 그대로) */
import { describe, expect, it } from 'vitest';
import { listItems, proposeFills, putProposal, sections } from '@/lib/site-autofill';
import { templateByKey } from '@/lib/site-templates';

// 합성 학교 소개서(실제 학교 아님)
const BROCHURE = `예시꿈학교 학교 소개서

인사말
예시꿈학교를 찾아 주신 여러분을 환영합니다. 우리 학교는 아이들이 스스로 질문하고 함께 답을 찾는 배움터입니다. 작은 학교이지만 한 사람 한 사람을 깊이 만납니다.

교육 목표
- 스스로 배우는 사람: 질문을 세우고 끝까지 탐구한다
- 함께 사는 사람: 이웃과 마을을 섬긴다
- 만들어 나누는 사람: 배운 것을 결과물로 나눈다

연혁
2015년 3월 예시꿈학교 개교
2018. 중등 과정 신설
2023년 마을 배움터 협약

학사일정
3월: 입학식과 개학
7월: 여름 프로젝트 발표회

급식
학교 텃밭에서 기른 채소로 점심을 함께 준비합니다.

오시는 길
경기도 예시시 꿈마을로 12, 예시꿈학교 본관
전화 031-123-4567 · 이메일 hello@example-school.test`;

describe('자료 나누기·목록', () => {
  it('제목 줄로 묶음을 나누고, 목록·연혁 줄을 항목으로 바꾼다', () => {
    const secs = sections([{ name: '소개서.docx', text: BROCHURE }]);
    expect(secs.map((s) => s.heading)).toEqual(expect.arrayContaining(['인사말', '교육 목표', '연혁', '학사일정', '급식', '오시는 길']));
    const goals = secs.find((s) => s.heading === '교육 목표')!;
    expect(listItems(goals.lines)[0]).toEqual({ title: '스스로 배우는 사람', body: '질문을 세우고 끝까지 탐구한다' });
    const history = secs.find((s) => s.heading === '연혁')!;
    expect(listItems(history.lines).map((i) => i.title)).toEqual(['2015', '2018', '2023']);
  });
});

describe('알림 중심형 빈 칸 제안', () => {
  const t = templateByKey('notice');
  const ps = proposeFills(t, [{ name: '소개서.docx', text: BROCHURE }], { schoolName: '예시꿈학교' });
  const by = Object.fromEntries(ps.map((p) => [p.slotId, p]));
  it('인사말·목표·연혁·일정·급식을 제목으로 찾고(높은 확신), 주소·연락처를 꺼낸다', () => {
    expect(by.greeting).toMatchObject({ confidence: 'high', source: { heading: '인사말' } });
    expect(String(by.greeting.value)).toMatch(/^예시꿈학교를 찾아 주신/);
    expect((by.goals.value as { title: string }[]).map((i) => i.title)).toEqual(['스스로 배우는 사람', '함께 사는 사람', '만들어 나누는 사람']);
    expect((by.history.value as { title: string }[]).length).toBe(3);
    expect((by.calendar.value as { title: string }[])[0]).toEqual({ title: '3월', body: '입학식과 개학' });
    expect(String(by.meals.value)).toContain('텃밭');
    expect(by.address.value).toBe('경기도 예시시 꿈마을로 12');
    expect(by.footer.value).toBe('예시꿈학교 · 031-123-4567 · hello@example-school.test');
  });

  it('안내 자리에만 넣고, 학교가 이미 쓴 칸은 건드리지 않는다', () => {
    const about = structuredClone(t.pages.find((p) => p.key === 'about')!.content);
    const greet = t.slots.find((s) => s.id === 'greeting')!;
    expect(putProposal(about, greet, by.greeting.value)).toBe(true);
    expect((about.blocks[0] as { body: { ko: string } }).body.ko).toMatch(/^예시꿈학교를/);
    expect(putProposal(about, greet, '다른 값')).toBe(false); // 이미 채운 칸
    const goals = t.slots.find((s) => s.id === 'goals')!;
    expect(putProposal(about, goals, by.goals.value)).toBe(true);
    expect((about.blocks[1] as { items: { title: { ko: string } }[] }).items[0].title.ko).toBe('스스로 배우는 사람');
    const home = structuredClone(t.pages[0].content);
    expect(putProposal(home, t.slots.find((s) => s.id === 'address')!, by.address.value)).toBe(true);
    expect(home.site?.address).toEqual({ ko: '경기도 예시시 꿈마을로 12' });
  });

  it('맞는 묶음이 없으면 제안하지 않는다(지어내지 않음)', () => {
    const none = proposeFills(t, [{ name: 'x.txt', text: '오늘은 날씨가 맑았다. 점심을 먹었다.' }]);
    expect(none).toEqual([]);
  });
});

describe('69차 운영 시험 반영', () => {
  it('태국어 자료: 단서 낱말을 넓혀 사명·연혁·입학·연락처를 찾고, 태국 주소·전화를 꺼낸다', () => {
    const th = ['พันธกิจ', 'ส่งเสริมให้ผู้เรียนเป็นคนดีและใฝ่เรียนรู้', '', 'ติดต่อเรา', 'โรงเรียนตัวอย่าง 99 หมู่ 1 ตำบลในเมือง อำเภอเมือง จังหวัดอุบลราชธานี 34000',
      'โทร 045-953-2000'].join('\n');
    const t = templateByKey('mission');
    const by = Object.fromEntries(proposeFills(t, [{ name: 'th.txt', text: th }], { schoolName: 'Example School' }).map((p) => [p.slotId, p]));
    expect(String(by.mission.value)).toContain('ส่งเสริม');
    expect(String(by.address.value)).toContain('34000');
    expect(by.footer.value).toBe('Example School · 045-953-2000');
  });

  it('전화번호는 앞뒤가 숫자인 긴 숫자열에서 잘라 내지 않는다', () => {
    const t = templateByKey('single');
    const ps = proposeFills(t, [{ name: 'x.txt', text: '연락처\n우편 626837 045-9532 사무실 02-123-4567' }]);
    expect(ps.find((p) => p.slotId === 'footer')!.value).toBe('02-123-4567');
    const th2 = proposeFills(t, [{ name: 'x.txt', text: 'ติดต่อเรา\nโทร 045-953270 มือถือ 062-0626837' }], { schoolName: 'R' });
    expect(th2.find((p) => p.slotId === 'footer')!.value).toBe('R · 045-953270');
  });
});

