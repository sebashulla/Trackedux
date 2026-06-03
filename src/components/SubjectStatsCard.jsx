import { formatPercentage } from '../utils/analytics'

function SubjectStatsCard({ stat }) {
  const progressStyle = { width: `${Math.min(Math.max(stat.percentage, 0), 100)}%` }

  return (
    <article className={`subject-stats-card subject-tone-${stat.status.key}`}>
      <div className="subject-card-head">
        <div>
          <span>{stat.subjectName}</span>
          <strong>{formatPercentage(stat.percentage)}</strong>
        </div>
        <span className="subject-status-badge">{stat.status.label}</span>
      </div>

      <div className="subject-progress-bar" aria-label={`Avance ${stat.subjectName}`}>
        <span style={progressStyle} />
      </div>

      <div className="subject-card-metrics">
        <span>{stat.total} preguntas</span>
        <span>{stat.correct} correctas</span>
        <span>{stat.incorrect} incorrectas</span>
      </div>

      <div className="subject-priority-pill">{stat.priority.label}</div>
    </article>
  )
}

export default SubjectStatsCard
