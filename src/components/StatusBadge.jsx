import { getStatusMeta } from '../utils/helpers'

function StatusBadge({ status, className = '' }) {
  const meta = getStatusMeta(status)

  return (
    <span className={`status-badge ${meta.className} ${className}`.trim()} data-status={meta.key}>
      {meta.label}
    </span>
  )
}

export default StatusBadge
