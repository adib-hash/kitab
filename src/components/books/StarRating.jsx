import { useState } from 'react'
import { clsx } from 'clsx'

function HalfStar({ filled, half, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`grad-${filled}-${half}`}>
          <stop offset={half ? '50%' : filled ? '100%' : '0%'} stopColor="#F59E0B" />
          <stop offset={half ? '50%' : filled ? '100%' : '0%'} stopColor="#D6D3D1" />
        </linearGradient>
      </defs>
      <path
        d="M10 1.5l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.77l-4.77 2.45.91-5.33L2.27 7.12l5.34-.78L10 1.5z"
        fill={filled ? '#F59E0B' : half ? 'url(#half-fill)' : '#E8DDD0'}
        className="transition-colors duration-100"
      />
      {half && (
        <path
          d="M10 1.5l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.77V1.5z"
          fill="#F59E0B"
        />
      )}
    </svg>
  )
}

export function StarRating({ value, onChange, size = 'md', readOnly = false }) {
  const [hovered, setHovered] = useState(null)
  const starSize = size === 'sm' ? 14 : size === 'lg' ? 24 : 18
  const display = hovered !== null ? hovered : (value || 0)

  function getStarState(starIndex, position) {
    // starIndex 1-5, position 'left' or 'right' for half/full
    const val = starIndex - (position === 'left' ? 0.5 : 0)
    if (display >= starIndex) return 'full'
    if (display >= starIndex - 0.5) return 'half'
    return 'empty'
  }

  function handleMouseMove(e, starIndex) {
    if (readOnly) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setHovered(x < rect.width / 2 ? starIndex - 0.5 : starIndex)
  }

  function handleClick(e, starIndex) {
    if (readOnly || !onChange) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const newVal = x < rect.width / 2 ? starIndex - 0.5 : starIndex
    // Toggle off if same value
    onChange(value === newVal ? null : newVal)
  }

  return (
    <div
      className={clsx('flex items-center gap-0.5', !readOnly && 'cursor-pointer')}
      onMouseLeave={() => !readOnly && setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map(i => {
        const state = getStarState(i, 'right')
        return (
          <span
            key={i}
            onMouseMove={(e) => handleMouseMove(e, i)}
            onClick={(e) => handleClick(e, i)}
            className="relative"
          >
            <svg width={starSize} height={starSize} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              {/* Empty star */}
              <path
                d="M10 1.5l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.77l-4.77 2.45.91-5.33L2.27 7.12l5.34-.78L10 1.5z"
                fill={state === 'empty' ? '#44403C' : '#F59E0B'}
                className="transition-colors duration-75"
              />
              {/* Half star overlay */}
              {state === 'half' && (
                <path
                  d="M10 1.5l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.77V1.5z"
                  fill="#E8DDD0"
                />
              )}
            </svg>
          </span>
        )
      })}
      {value != null && (
        <span className="ml-1 text-xs text-ink-500 font-medium tabular-nums">{value}</span>
      )}
    </div>
  )
}
