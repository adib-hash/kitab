import { STATUS } from '../../lib/utils'

export function StatusBadge({ status }) {
  return (
    <span className={STATUS[status]?.pill || 'tag-pill'}>
      <span
        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-[1px]"
        style={{ backgroundColor: STATUS[status]?.hex }}
      />
      {STATUS[status]?.label || status}
    </span>
  )
}
