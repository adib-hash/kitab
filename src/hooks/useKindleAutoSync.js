// Kicks the invisible daily Kindle sync once per app session.
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { runDailyAutoSync } from '../lib/kindleAutoSync'

/**
 * @param {Object} params
 * @param {Array} params.books  Kitab library
 * @param {boolean} params.ready True once the library query has settled — the
 *   scrape needs the book list to know which titles are currently being read.
 */
export function useKindleAutoSync({ books = [], ready = false }) {
  const queryClient = useQueryClient()
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !ready) return
    if (!Capacitor.isNativePlatform()) return
    started.current = true
    runDailyAutoSync({ books, queryClient })
  }, [books, ready, queryClient])
}
