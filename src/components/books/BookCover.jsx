import { useState } from 'react'
import { getCoverFallback } from '../../lib/utils'
import { clsx } from 'clsx'

export function BookCover({ book, className, size = 'md' }) {
  const [error, setError] = useState(false)
  const fallback = getCoverFallback(book.title, book.author)

  const sizeClasses = {
    sm: 'w-12',
    md: 'w-24',
    lg: 'w-36',
    xl: 'w-48',
    full: 'w-full',
  }

  if (!book.cover_url || error) {
    return (
      <div
        className={clsx(
          'book-cover flex flex-col items-center justify-center rounded-md text-white font-serif font-bold select-none',
          sizeClasses[size],
          className
        )}
        style={{ backgroundColor: fallback.color }}
      >
        <span className={clsx({
          'text-sm': size === 'sm',
          'text-xl': size === 'md',
          'text-3xl': size === 'lg' || size === 'xl',
          'text-4xl': size === 'full',
        })}>
          {fallback.initials}
        </span>
      </div>
    )
  }

  return (
    <img
      src={book.cover_url}
      alt={`Cover of ${book.title}`}
      onError={() => setError(true)}
      className={clsx(
        'book-cover object-cover rounded-md',
        sizeClasses[size],
        className
      )}
    />
  )
}
