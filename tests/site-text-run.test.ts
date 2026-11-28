// 129차: 짧은 글 구역 묶음 표시(data-run)는 렌더러가 붙인다 — 숨긴 구역은 건너뛰고, 제목 없는 구역은 두 칸을 쓰지 않는다
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import type { Block, Content } from '@/lib/site-shared';

const text = (title: string, extra: Partial<Block> = {}) =>
  ({ type: 'section', template: 'text', title: title ? { ko: title } : undefined, body: { ko: '본문' }, ...extra }) as Block;
const render = (blocks: Block[]) => renderToStaticMarkup(createElement(SiteBlocks, {
  content: { title: { ko: '쪽' }, blocks } as Content, lang: 'ko', fallback: 'ko', assetUrl: (id: string) => `/a/${id}`,
}));
const runs = (html: string) => [...html.matchAll(/<section class="sec"[^>]*>/g)].map((m) => {
  const run = /data-run="(\w+)"/.exec(m[0])?.[1] ?? '-';
  return m[0].includes('data-run-head') ? `${run}+head` : run;
});

describe('짧은 글 구역 묶음', () => {
  it('이어진 글 구역만 묶고 첫 구역과 이어진 구역을 나눈다', () => {
    expect(runs(render([text('하나'), text('둘'), text('셋')]))).toEqual(['first+head', 'next+head', 'next+head']);
    expect(runs(render([text('혼자')]))).toEqual(['-']);
  });
  it('숨긴 구역은 건너뛰고 이웃을 판정한다', () => {
    expect(runs(render([text('하나'), text('숨김', { hidden: true }), text('둘')]))).toEqual(['first+head', 'next+head']);
  });
  it('모양이 있는 구역은 묶지 않는다', () => {
    expect(runs(render([text('하나'), text('카드', { variant: 'overview' } as Partial<Block>), text('둘')]))).toEqual(['-', '-', '-']);
  });
  it('제목·머리말이 없는 구역은 묶음에 있어도 두 칸을 쓰지 않는다', () => {
    expect(runs(render([text('하나'), text('')]))).toEqual(['first+head', 'next']);
  });
});
