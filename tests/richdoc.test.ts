/** 81차 — 연구소 본문 서식 해석기: 표·지표·흐름도·막대·계단·강조 상자·인라인, 요약·목차·도식 수. HTML은 해석하지 않는다 */
import { describe, expect, it } from 'vitest';
import { inline, outline, parseRich, shapes, summarize } from '../src/lib/richdoc';

const DOC = `# 시스템 구성안

요약 문단 **굵게** 와 \`코드\` 그리고 [링크](https://example.com).

## 등급
| 등급 | 원가 |
|---|---|
| 공용형 | $0.2~1 |
| 확장형 | +$10~15 |

\`\`\`kpi
월 원가 | $260 | 100곳
학교당 | $2.6
\`\`\`

\`\`\`steps
신청 | 관리자 승인
자동 생성
\`\`\`

\`\`\`bars
공용형 | 1 | $0.2~1
확장형 | 15
\`\`\`

\`\`\`tiers
공용형 | 대부분 | 기본
전용형 | 큰 학교
\`\`\`

> **결정** 등급 이름을 고르세요
> 둘째 줄

### 세부
- 하나
- 둘

<script>alert(1)</script>
`;

describe('parseRich', () => {
  const b = parseRich(DOC);
  it('블록 종류를 순서대로 해석한다', () => {
    expect(b.map((x) => x.k)).toEqual(['h', 'p', 'h', 'table', 'kpi', 'steps', 'bars', 'tiers', 'quote', 'h', 'ul', 'p']);
  });
  it('표: 머리·행', () => {
    const t = b.find((x) => x.k === 'table')!;
    if (t.k !== 'table') throw new Error();
    expect(t.head.map((c) => c.map((i) => i.v).join(''))).toEqual(['등급', '원가']);
    expect(t.rows).toHaveLength(2);
  });
  it('인포그래픽 블록 칸', () => {
    expect(b.find((x) => x.k === 'kpi')).toMatchObject({ items: [{ label: '월 원가', value: '$260', hint: '100곳' }, { label: '학교당', value: '$2.6', hint: '' }] });
    expect(b.find((x) => x.k === 'steps')).toMatchObject({ items: [{ title: '신청', hint: '관리자 승인' }, { title: '자동 생성', hint: '' }] });
    expect(b.find((x) => x.k === 'bars')).toMatchObject({ items: [{ label: '공용형', value: 1, text: '$0.2~1' }, { label: '확장형', value: 15, text: '15' }] });
    expect(b.find((x) => x.k === 'tiers')).toMatchObject({ items: [{ name: '공용형', tag: '기본' }, { name: '전용형', tag: '' }] });
  });
  it('강조 상자 종류: **결정** → decide', () => {
    expect(b.find((x) => x.k === 'quote')).toMatchObject({ tone: 'decide', lines: [[{ t: 'text', v: '등급 이름을 고르세요' }], [{ t: 'text', v: '둘째 줄' }]] });
  });
  it('HTML은 글자 그대로(문단 텍스트)일 뿐 태그로 해석하지 않는다', () => {
    const last = b[b.length - 1];
    expect(last).toMatchObject({ k: 'p', text: [{ t: 'text', v: '<script>alert(1)</script>' }] });
  });
  it('인라인: 굵게·코드·http 링크만', () => {
    expect(inline('a **b** `c` [d](https://x.y) [e](javascript:alert(1))')).toEqual([
      { t: 'text', v: 'a ' }, { t: 'b', v: 'b' }, { t: 'text', v: ' ' }, { t: 'code', v: 'c' }, { t: 'text', v: ' ' },
      { t: 'a', v: 'd', href: 'https://x.y' }, { t: 'text', v: ' [e](javascript:alert(1))' }]);
  });
});

describe('요약·목차·도식 수', () => {
  it('summarize: 첫 문단', () => expect(summarize(DOC)).toBe('요약 문단 굵게 와 코드 그리고 링크.'));
  it('outline: ##·### 만', () => expect(outline(DOC).map((x) => [x.level, x.text])).toEqual([[2, '등급'], [3, '세부']]));
  it('shapes', () => expect(shapes(DOC)).toEqual({ tables: 1, visuals: 4 }));
  it('빈 본문', () => { expect(parseRich('')).toEqual([]); expect(summarize('')).toBe(''); });
});
