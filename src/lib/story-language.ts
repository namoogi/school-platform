import { LANGS, type Content, type Lang } from './site-shared';

const TERMS: Record<string, { en: string; th: string }> = {
  '경청': { en: 'Attentiveness', th: 'การตั้งใจฟัง' },
  '감사': { en: 'Gratefulness', th: 'ความรู้คุณ' },
  '용서': { en: 'Forgiveness', th: 'การให้อภัย' },
  '정돈': { en: 'Orderliness', th: 'ความเป็นระเบียบ' },
  '신중함': { en: 'Cautiousness', th: 'ความรอบคอบ' },
  '너그러움': { en: 'Generosity', th: 'ความเอื้อเฟื้อ' },
  '인내': { en: 'Patience', th: 'ความอดทน' },
  '책임감': { en: 'Responsibility', th: 'ความรับผิดชอบ' },
  '순종': { en: 'Obedience', th: 'การเชื่อฟัง' },
  '절제': { en: 'Self-control', th: 'การควบคุมตนเอง' },
  '지혜': { en: 'Wisdom', th: 'ปัญญา' },
  '사슴': { en: 'Deer', th: 'กวาง' },
  '고슴도치': { en: 'Porcupine', th: 'เม่น' },
  '양': { en: 'Sheep', th: 'แกะ' },
  '다람쥐': { en: 'Squirrel', th: 'กระรอก' },
  '수달': { en: 'Otter', th: 'นาก' },
  '펠리컨': { en: 'Pelican', th: 'นกกระทุง' },
  '나비': { en: 'Butterfly', th: 'ผีเสื้อ' },
  '독수리': { en: 'Eagle', th: 'นกอินทรี' },
  '코끼리': { en: 'Elephant', th: 'ช้าง' },
  '곰': { en: 'Bear', th: 'หมี' },
  '부엉이': { en: 'Owl', th: 'นกฮูก' },
};

/** 기존 성품·캐릭터 표기는 식별에 그대로 쓰고 화면 글자만 번역한다. 사용자 정의 이름은 보존한다. */
export function storyTerm(value: string, lang: Lang): string {
  if (lang === 'ko') return value;
  return value.split(' · ').map((part) => Object.hasOwn(TERMS, part) ? TERMS[part][lang] : part).join(' · ');
}

/** 제목뿐 아니라 공개 본문의 모든 비어 있지 않은 다국어 칸에 번역이 있어야 노출한다. */
export function storyLanguages(content: Content): Lang[] {
  const fields: Partial<Record<Lang, string>>[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const obj = value as Record<string, unknown>;
    if (obj.hidden === true) return;
    if (LANGS.some((l) => typeof obj[l] === 'string' && (obj[l] as string).trim())) {
      fields.push(obj as Partial<Record<Lang, string>>);
    } else Object.values(obj).forEach(visit);
  }
  visit({ title: content.title, summary: content.summary, head: content.head, blocks: content.blocks });
  return LANGS.filter((lang) => Boolean(content.title[lang]?.trim()) && fields.every((field) => Boolean(field[lang]?.trim())));
}

/** 다국어 본문은 원본 그림에 글자가 있더라도 화면에서 읽을 수 있게 한다. */
export function hasMultilingualStoryText(content: Content): boolean {
  return content.blocks.some((b) => b.type === 'story_page' && !b.hidden && LANGS.filter((l) => b.text[l]?.trim()).length > 1);
}
