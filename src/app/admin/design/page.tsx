import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { Banner, PageHeader, withLink } from '@/components/ui';
import { getI18n, userLang } from '@/lib/i18n/server';
import { ARCHETYPES } from '@/components/archetypes/meta';
import { ArchetypeThumb } from './ArchetypeThumb';
import { ChooseDirection } from './ChooseDirection';

/**
 * 24차 디자인 원형 비교. 색 조합이 아니라 탐색 구조·그리드·서체·밀도·상호작용이 다른 여덟 가지 화면 구조를
 * 같은 합성 자료로 그려 비교한다. 참고 제품은 구조 원리만 가져오고 고유 디자인을 복제하지 않는다.
 * 근거: docs/research/dashboard-rea-2026-11.md
 */
// 축 이름은 사전의 design.axis.*. 원형 내용(ARCHETYPES)은 디자인 조사 자료라 한국어로 둔다
const AXES = ['nav', 'grid', 'type', 'density', 'signature', 'fit', 'risk'] as const;

export default async function DesignArchetypesPage() {
  const { uiLang } = await loadForPlatform(async ({ db }) => ({ uiLang: await userLang(db) }));
  const { t } = await getI18n(uiLang);
  return (
    <>
      <PageHeader title={t('design.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('design.crumb') }]}
        description={t('design.lead')} />

      <Banner tone="info">
        <div>{withLink(t('design.banner'), { shell: <b>{t('design.shell')}</b>, types: <b>{t('design.types')}</b> })}</div>
      </Banner>

      <section className="ar-cards" aria-label={t('design.list')}>
        {ARCHETYPES.map((a) => (
          <article key={a.slug} className="card ar-card" data-testid={`archetype-${a.slug}`} style={{ padding: 0 }}>
            <ArchetypeThumb slug={a.slug} label={`${a.no}. ${a.name}`} />
            <div className="ar-body">
              <span className="fine">{a.category}</span>
              <h2>{a.no}. {a.name}</h2>
              <p className="fine">{t('design.inspired', { x: a.inspired })}</p>
              <dl>
                <dt>{t('design.dt.nav')}</dt><dd>{a.nav}</dd>
                <dt>{t('design.dt.type')}</dt><dd>{a.type}</dd>
                <dt>{t('design.dt.density')}</dt><dd>{a.density}</dd>
              </dl>
            </div>
            <div className="ar-foot">
              <Link href={`/preview/${a.slug}`} className="btn btn-secondary btn-sm">{t('design.full')}</Link>
              <ChooseDirection name={`${a.no}. ${a.name}`} />
            </div>
          </article>
        ))}
      </section>

      <section className="card" aria-labelledby="axes-title">
        <div className="card-header">
          <div><h2 id="axes-title">{t('design.axes')}</h2><p>{t('design.axesNote')}</p></div>
        </div>
        <div className="table-wrap ar-table-wrap">
          <table className="grid-table ar-axes">
            <thead>
              <tr><th scope="col">{t('design.col')}</th>{AXES.map((x) => <th key={x} scope="col">{t(`design.axis.${x}`)}</th>)}</tr>
            </thead>
            <tbody>
              {ARCHETYPES.map((a) => (
                <tr key={a.slug}>
                  <th scope="row"><Link href={`/preview/${a.slug}`}>{a.no}. {a.name}</Link><small>{a.category}</small></th>
                  {AXES.map((x) => <td key={x}>{a[x]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">{t('design.note')}</p>
      </section>
    </>
  );
}
