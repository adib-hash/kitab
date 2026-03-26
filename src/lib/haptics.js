import { Capacitor } from '@capacitor/core'

// Lazily loaded — only imports on native platforms
let _Haptics = null
let _ImpactStyle = null
let _NotificationStyle = null

async function getHaptics() {
  if (!Capacitor.isNativePlatform()) return null
  if (_Haptics) return _Haptics
  const mod = await import('@capacitor/haptics')
  _Haptics = mod.Haptics
  _ImpactStyle = mod.ImpactStyle
  _NotificationStyle = mod.NotificationStyle
  return _Haptics
}

/** Light tap — navigation, selection */
export async function impactLight() {
  const h = await getHaptics()
  if (!h) return
  await h.impact({ style: _ImpactStyle.Light })
}

/** Medium tap — confirmations, general buttons */
export async function impactMedium() {
  const h = await getHaptics()
  if (!h) return
  await h.impact({ style: _ImpactStyle.Medium })
}

/** Heavy tap — drag start, forceful actions */
export async function impactHeavy() {
  const h = await getHaptics()
  if (!h) return
  await h.impact({ style: _ImpactStyle.Heavy })
}

/** Success notification — add book, sync complete */
export async function notifySuccess() {
  const h = await getHaptics()
  if (!h) return
  await h.notification({ type: _NotificationStyle.Success })
}

/** Warning notification — delete, DNF */
export async function notifyWarning() {
  const h = await getHaptics()
  if (!h) return
  await h.notification({ type: _NotificationStyle.Warning })
}

/** Error notification */
export async function notifyError() {
  const h = await getHaptics()
  if (!h) return
  await h.notification({ type: _NotificationStyle.Error })
}

/** Continuous selection feedback (e.g. star rating drag) */
export async function selectionChanged() {
  const h = await getHaptics()
  if (!h) return
  await h.selectionChanged()
}
