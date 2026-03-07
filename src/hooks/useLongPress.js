import { useRef, useCallback } from 'react'

const LONG_PRESS_MS = 500
const MOVE_CANCEL_PX = 8  // cancel if finger drifts this far before timer fires

export function useLongPress(onLongPress, { disabled = false } = {}) {
  const timer       = useRef(null)
  const startPos    = useRef(null)
  const didFire     = useRef(false)

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    startPos.current = null
    didFire.current = false
  }, [])

  const onTouchStart = useCallback((e) => {
    if (disabled) return
    // Block iOS "Open in New Tab" / system context menu from triggering
    // We do NOT call e.preventDefault() here — that would break scrolling.
    // Instead we rely on onContextMenu below.
    didFire.current = false
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    timer.current = setTimeout(() => {
      didFire.current = true
      onLongPress(e)
    }, LONG_PRESS_MS)
  }, [disabled, onLongPress])

  const onTouchMove = useCallback((e) => {
    if (!startPos.current || !timer.current) return
    const dx = Math.abs(e.touches[0].clientX - startPos.current.x)
    const dy = Math.abs(e.touches[0].clientY - startPos.current.y)
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) cancel()
  }, [cancel])

  const onTouchEnd = useCallback(() => {
    cancel()
  }, [cancel])

  // This is the key: suppresses iOS "Open in New Tab" context menu
  const onContextMenu = useCallback((e) => {
    e.preventDefault()
  }, [])

  return { onTouchStart, onTouchMove, onTouchEnd, onContextMenu }
}
