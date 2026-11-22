import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { Banner, PageHeader } from '@/components/ui';
import { ARCHETYPES } from '@/components/archetypes/meta';
import { ArchetypeThumb } from './ArchetypeThumb';
import { ChooseDirection } from './ChooseDirection';

/**
 * 24차 디자인 원형 비교. 색 조합이 아니라 탐색 구조·그리드·서체·밀도·상호작용이 다른 여덟 가지 화면 구조를
 * 같은 합성 자료로 그려 비교한다. 참고 제품은 구조 원리만 가져오고 고유 디자인을 복제하지 않는다.
 * 근거: docs/research/dashboard-rea-2026-11.md
 */
const AXES = [
  { key: 'nav', label: '탐색 구조' },
  { key: 'grid', label: '레이아웃' },
  { key: 'type', label: '서체·크기' },
  { key: 'density', label: '정보 밀도' },
  { key: 'signature', label: '핵심 상호작용' },
  { key: 'fit', label: '잘 맞는 곳' },
  { key: 'risk', label: '위험' },
] as const;

export default async function DesignArchetypesPage() {
  await loadForPlatform(async () => ({}));
  return (
    <>
      <PageHeader title="디자인 원형 비교" crumbs={[{ label: '전체 관리' }, { label: '디자인 원형' }]}
        description="같은 학교 운영 장면(합성 자료)을 여덟 가지 화면 구조로 그렸습니다. 색만 바꾼 것이 아니라 탐색 방식, 레이아웃 격자, 서체와 글자 크기, 정보 밀도, 핵심 상호작용이 모두 다릅니다. 썸네일을 누르면 전체 화면으로 열리고, 아래 막대로 앞뒤 원형을 넘겨 볼 수 있습니다." />

      <Banner tone="info">
        <div>
        실제 서비스는 보통 하나만 고르지 않고 섞습니다. <b>기본 틀(셸)</b> 하나와 <b>업무별 화면 유형</b> 몇 가지를 고르면 됩니다.
        예: 틀은 1번 학사 업무형, 질문 확인은 8번 작업함형, 수업·명단 표는 7번 그리드형, 전체 관리자 현황은 4번 분석형.
        마음에 드는 원형마다 ‘이 방향 선택’을 누르면 개발·연구소 보드에 기록됩니다.
        </div>
      </Banner>

      <section className="ar-cards" aria-label="원형 목록">
        {ARCHETYPES.map((a) => (
          <article key={a.slug} className="card ar-card" data-testid={`archetype-${a.slug}`} style={{ padding: 0 }}>
            <ArchetypeThumb slug={a.slug} label={`${a.no}. ${a.name}`} />
            <div className="ar-body">
              <span className="fine">{a.category}</span>
              <h2>{a.no}. {a.name}</h2>
              <p className="fine">참고 구조: {a.inspired}</p>
              <dl>
                <dt>탐색</dt><dd>{a.nav}</dd>
                <dt>서체</dt><dd>{a.type}</dd>
                <dt>밀도</dt><dd>{a.density}</dd>
              </dl>
            </div>
            <div className="ar-foot">
              <Link href={`/preview/${a.slug}`} className="btn btn-secondary btn-sm">전체 화면</Link>
              <ChooseDirection name={`${a.no}. ${a.name}`} />
            </div>
          </article>
        ))}
      </section>

      <section className="card" aria-labelledby="axes-title">
        <div className="card-header">
          <div><h2 id="axes-title">비교 축</h2><p>원형마다 일곱 가지 축을 나란히 놓았습니다. 표가 넓으면 옆으로 밀어 보세요.</p></div>
        </div>
        <div className="table-wrap ar-table-wrap">
          <table className="grid-table ar-axes">
            <thead>
              <tr><th scope="col">원형</th>{AXES.map((x) => <th key={x.key} scope="col">{x.label}</th>)}</tr>
            </thead>
            <tbody>
              {ARCHETYPES.map((a) => (
                <tr key={a.slug}>
                  <th scope="row"><Link href={`/preview/${a.slug}`}>{a.no}. {a.name}</Link><small>{a.category}</small></th>
                  {AXES.map((x) => <td key={x.key}>{a[x.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">참고 제품의 로고·에셋·고유 화면은 쓰지 않고 구조 원리만 가져왔습니다. 조사 근거와 출처는 저장소의 docs/research/dashboard-rea-2026-11.md에 있습니다.</p>
      </section>
    </>
  );
}
