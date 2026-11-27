#!/usr/bin/env node
// 89차: 템플릿 예시 그림의 '자리 그림'(SVG). 사진풍 그림(.jpg)이 오기 전까지 미리보기·썸네일에 쓴다.
// 색은 각 템플릿 디자인(테마)의 색. 글자는 넣지 않는다(그림 자리임은 모양으로만 — 미리보기 위에 따로 안내).
//   node scripts/template-placeholders.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const PAL = {
  notice: ['#cfe0f7', '#8fb3e6', '#1f5fbf'], story: ['#efe6cf', '#b9c7a8', '#2f5d46'], admissions: ['#fde3dd', '#f1a493', '#c13c27'],
  project: ['#fff3c4', '#ffd23f', '#111111'], mission: ['#f3e6d3', '#d7b48a', '#8a4b1f'], international: ['#dff1ef', '#8ccfc8', '#0b7a75'],
  single: ['#e6f2dc', '#a9cf8f', '#3f7d2b'], kinder: ['#ffe3ec', '#ffc8a8', '#c2366c'],
};
const NAMES = {
  notice: ['hero', 'calendar', 'lunch', 'way'], story: ['hero', 'day', 'learning', 'season-1', 'season-2', 'season-3', 'season-4', 'season-5'], admissions: ['hero', 'class', 'books', 'mentor'],
  project: ['hero', 'river', 'market', 'work-1', 'work-2', 'work-3', 'work-4', 'work-5', 'work-6'], mission: ['hero', 'village'], international: ['hero', 'early', 'primary', 'secondary'], single: ['study', 'outing'],
  kinder: ['hero', 'class-1', 'class-2', 'class-3', 'play'],
};
const svg = ([light, mid, dark], wide, seed) => {
  const w = wide ? 1600 : 1200, h = 900;
  const r = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const hills = [0, 1, 2].map((i) => {
    const y = h * (0.55 + i * 0.12), a = h * (0.08 + r(i) * 0.08);
    return `<path d="M0 ${y} C ${w * 0.25} ${y - a} ${w * 0.45} ${y + a} ${w * 0.7} ${y - a * 0.6} S ${w} ${y} ${w} ${y} V ${h} H 0 Z" fill="${i === 2 ? dark : mid}" opacity="${0.35 + i * 0.25}"/>`;
  }).join('');
  const sun = `<circle cx="${w * (0.2 + r(7) * 0.6)}" cy="${h * 0.3}" r="${h * 0.09}" fill="#ffffff" opacity=".7"/>`;
  const house = `<g transform="translate(${w * 0.62} ${h * 0.46})" fill="#ffffff" opacity=".85"><rect width="${w * 0.14}" height="${h * 0.18}"/><path d="M-${w * 0.01} 0 L ${w * 0.07} -${h * 0.1} L ${w * 0.15} 0 Z"/><rect x="${w * 0.055}" y="${h * 0.08}" width="${w * 0.03}" height="${h * 0.1}" fill="${dark}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${sun}${house}${hills}</svg>\n`;
};
mkdirSync('public/site-templates/img', { recursive: true });
let n = 0;
for (const [key, names] of Object.entries(NAMES)) names.forEach((name, i) => {
  writeFileSync(`public/site-templates/img/${key}-${name}.svg`, svg(PAL[key], name === 'hero', i + key.length * 7));
  n++;
});
console.log(`자리 그림 ${n}개 → public/site-templates/img/`);
