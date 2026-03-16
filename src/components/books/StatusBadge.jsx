import { STATUS_LABELS } from '../../lib/utils'

const statusClasses = {
  read: 'status-read',
  tbr: 'status-tbr',
  reading: 'status-reading',
  dnf: 'status-dnf',
}

const statusColor = {
  read: '#059669',     // emerald-600
  tbr: '#3B82F6',      // blue-500
  reading: '#0D9488',  // teal-600
  dnf: '#F43F5E',      // rose-500
}

export function StatusBadge({ status }) {
  return (
    <span className={statusClasses[status] || 'tag-pill'}>
      <span
        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-[1px]"
        style={{ backgroundColor: statusColor[status] }}
      />
      {STATUS_LABELS[status] || status}
    </span>
  )
}
