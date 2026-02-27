import { STATUS_LABELS } from '../../lib/utils'

const statusClasses = {
  read: 'status-read',
  tbr: 'status-tbr',
  reading: 'status-reading',
  dnf: 'status-dnf',
}

const statusDots = {
  read: '●',
  tbr: '○',
  reading: '◑',
  dnf: '✕',
}

export function StatusBadge({ status }) {
  return (
    <span className={statusClasses[status] || 'tag-pill'}>
      <span className="mr-1 text-[10px]">{statusDots[status]}</span>
      {STATUS_LABELS[status] || status}
    </span>
  )
}
