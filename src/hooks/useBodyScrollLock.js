import { useEffect } from 'react'

export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    return () => {
      const y = Math.abs(parseInt(document.body.style.top || '0'))
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, y)
    }
  }, [active])
}
