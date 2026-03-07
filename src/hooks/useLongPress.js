import { useRef, useCallback } from 'react'

/**
 * useLongPress — detect 500ms hold on mobile
 * Cancels if finger moves >8px (scroll or swipe intent)
 * Returns spread-able touch handlers
 */
export function useLongPress(onLongPress, threshold = 500) {
  const timerRef = useRef(null)
  const startPos = useRef(null)
  const fired = useRef(false)

  const start = useCallback((e) => {
    const t = e.touches?.[0]
    startPos.current = { x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
    fired.current = false
    timerRef.current = setTimeout(() => {
      fired.current = true
      onLongPress(e)
    }, threshold)
  }, [onLongPress, threshold])

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  const move = useCallback((e) => {
    if (!startPos.current) return
    const t = e.touches?.[0]
    const dx = Math.abs((t?.clientX ?? 0) - startPos.current.x)
    const dy = Math.abs((t?.clientY ?? 0) - startPos.current.y)
    if (dx > 8 || dy > 8) cancel()
  }, [cancel])

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e) => { if (fired.current) e.preventDefault() },
  }
}
