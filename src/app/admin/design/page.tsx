import { loadForPlatform } from '@/lib/page';
import { PageHeader } from '@/components/ui';
import { DashboardSample } from './DashboardSample';
import { ChooseDirection } from './ChooseDirection';

/**
 * 디자인 방향 비교. 각 방향은 유명 제품의 '설계 철학'에서 영감을 받은 토큰 묶음이며 로고·에셋·고유 화면을 복제하지 않는다.
 * 고른 방향은 의미 토큰만 바꿔 전 화면에 적용한다(docs/design/DESIGN-SYSTEM.md).
 */
const DIRECTIONS = [
  { key: 'base', name: '0. 현재 기준 (18차)', inspired: 'IBM Carbon · GOV.UK · KRDS 원칙', traits: ['흰 탐색', '연한 파랑 선택', '중립 회색', '4px 반경'], fit: '공공·학교 문서 중심. 무난하지만 개성이 약함' },
  { key: 'mono', name: '1. 모노 정밀', inspired: 'Vercel Geist · Linear(라이트)의 흑백 정밀함', traits: ['흑백 대비', '검정 주 버튼', '얇은 1px 선', '숫자 고정폭', '촘촘한 자간'], fit: '개발·운영 도구 느낌. 데이터가 또렷하고 세련됨' },
  { key: 'dark', name: '2. 다크 프로', inspired: 'Linear · Raycast 다크의 집중형 화면', traits: ['어두운 바탕', '보라 강조', '은은한 테두리 빛', '고대비 숫자'], fit: '오래 보는 관리자 화면. 학교 사용자에게는 낯설 수 있음' },
  { key: 'soft', name: '3. 소프트 프리미엄', inspired: 'Stripe 대시보드의 부드러운 깊이', traits: ['큰 반경', '부드러운 그림자', '인디고 강조', '헤더 그라데이션'], fit: '결제·라이선스·지표 화면에 신뢰감. 가장 "제품" 같은 인상' },
  { key: 'enterprise', name: '4. 엔터프라이즈 고밀도', inspired: 'IBM Carbon · Atlassian의 업무 밀도', traits: ['각진 모서리', '32px 행', '진한 상단 막대', '강한 파랑'], fit: '많은 학생·성적 표를 다룰 때. 차갑고 딱딱함' },
  { key: 'warm', name: '5. 따뜻한 에디토리얼', inspired: 'Notion · Apple의 여백과 글자 중심', traits: ['따뜻한 미색 바탕', '명조 제목', '초록 강조', '넉넉한 여백'], fit: '학교·교육 정체성. 문서·학생부와 잘 어울림, 데이터 밀도는 낮음' },
] as const;

export default async function DesignDirectionsPage() {
  await loadForPlatform(async () => ({}));
  return (
    <>
      <PageHeader title="디자인 방향" crumbs={[{ label: '전체 관리' }, { label: '디자인 방향' }]}
        description="같은 관리 대시보드(합성 자료)를 여섯 가지 방향으로 그렸습니다. 각 방향은 해당 제품들의 설계 철학을 참고한 토큰 묶음이며 고유 디자인을 복제하지 않습니다. 고른 방향은 의미 토큰을 바꿔 모든 화면에 적용합니다." />
      <div className="dv-grid">
        {DIRECTIONS.map((d) => (
          <section key={d.key} className="card dv-option" data-testid={`direction-${d.key}`}>
            <div className="card-header">
              <div><h2>{d.name}</h2><p>참고: {d.inspired}</p></div>
              <ChooseDirection name={d.name} />
            </div>
            <div className={`dv dv-${d.key}`}><DashboardSample /></div>
            <div className="dv-meta">
              <div className="tags">{d.traits.map((t) => <span key={t} className="badge">{t}</span>)}</div>
              <p className="fine">{d.fit}</p>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
