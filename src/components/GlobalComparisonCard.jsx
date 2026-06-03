import { formatPercentage } from '../utils/analytics'

const getDifferenceLabel = (difference) => {
  if (typeof difference !== 'number') return 'Sin comparacion'
  if (difference > 0) return `+${formatPercentage(difference)} sobre el promedio`
  if (difference < 0) return `-${formatPercentage(Math.abs(difference))} bajo el promedio`
  return 'Igual al promedio'
}

function GlobalComparisonCard({ comparisons, loading = false, error = '' }) {
  const hasReliableAverage = (comparisons ?? []).some((comparison) => comparison.hasReliableGlobalAverage)

  return (
    <section className="subject-panel global-comparison-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Comparativa</p>
          <h3>Mis estadisticas vs promedio global</h3>
        </div>
      </div>

      {loading ? (
        <div className="comparison-empty">Calculando promedios globales...</div>
      ) : error ? (
        <div className="comparison-empty warning">{error}</div>
      ) : !hasReliableAverage ? (
        <div className="comparison-empty">
          Aun no hay suficientes intentos para calcular un promedio global confiable.
        </div>
      ) : (
        <div className="global-comparison-grid">
          {comparisons.map((comparison) => (
            <article
              className={`global-comparison-item ${comparison.difference >= 0 ? 'above' : 'below'}`}
              key={comparison.subjectKey}
            >
              <div className="global-comparison-head">
                <strong>{comparison.subjectName}</strong>
                <span>{getDifferenceLabel(comparison.difference)}</span>
              </div>

              <div className="comparison-metrics">
                <span>
                  Mi rendimiento
                  <strong>{formatPercentage(comparison.percentage)}</strong>
                </span>
                <span>
                  Promedio global
                  <strong>
                    {comparison.hasReliableGlobalAverage
                      ? formatPercentage(comparison.peerAverage)
                      : 'Sin datos'}
                  </strong>
                </span>
                <span>
                  Posicion relativa
                  <strong>
                    {comparison.userRank && comparison.participantCount
                      ? `${comparison.userRank}/${comparison.participantCount}`
                      : 'Pendiente'}
                  </strong>
                </span>
              </div>

              <p>{comparison.message}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default GlobalComparisonCard
