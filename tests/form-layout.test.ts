/** ADR 0045: 칸 너비 = 내용 길이 (fieldSize) */
import { describe, expect, it } from 'vitest';
import { fieldSize } from '@/components/ActionForm';

describe('칸 너비 규칙', () => {
  it('종류로 정한다: 숫자 xs · 날짜 sm · 메일 lg · 긴 글 full · 글자 md', () => {
    expect(fieldSize({ name: 'n', label: '', type: 'number' })).toBe('xs');
    expect(fieldSize({ name: 'd', label: '', type: 'date' })).toBe('sm');
    expect(fieldSize({ name: 'e', label: '', type: 'email' })).toBe('lg');
    expect(fieldSize({ name: 't', label: '', type: 'textarea' })).toBe('full');
    expect(fieldSize({ name: 's', label: '' })).toBe('md');
  });
  it('선택은 가장 긴 보기 글자 수로', () => {
    const sel = (labels: string[]) => fieldSize({ name: 's', label: '', type: 'select', options: labels.map((l) => ({ value: l, label: l })) });
    expect(sel(['예', '아니오'])).toBe('xs');
    expect(sel(['졸업', '전출', '자퇴(학업 중단)'])).toBe('sm');
    expect(sel(['Minimum achievement'])).toBe('lg');
    expect(sel(['중학교(점검)', '고등학교 일반과정'])).toBe('sm');
  });
  it('적으면 적은 대로, 옛 이름 narrow·wide 는 sm·full', () => {
    expect(fieldSize({ name: 'r', label: '', width: 'wide' })).toBe('full');
    expect(fieldSize({ name: 'r', label: '', width: 'narrow' })).toBe('sm');
    expect(fieldSize({ name: 'r', label: '', type: 'date', width: 'lg' })).toBe('lg');
  });
});
