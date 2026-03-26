import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const native = () => Capacitor.isNativePlatform()

export async function impactLight() {
  if (!native()) return
  try { await Haptics.impact({ style: ImpactStyle.Light }) } catch {}
}

export async function impactMedium() {
  if (!native()) return
  try { await Haptics.impact({ style: ImpactStyle.Medium }) } catch {}
}

export async function impactHeavy() {
  if (!native()) return
  try { await Haptics.impact({ style: ImpactStyle.Heavy }) } catch {}
}

export async function notifySuccess() {
  if (!native()) return
  try { await Haptics.notification({ type: NotificationType.Success }) } catch {}
}

export async function notifyWarning() {
  if (!native()) return
  try { await Haptics.notification({ type: NotificationType.Warning }) } catch {}
}

export async function notifyError() {
  if (!native()) return
  try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
}
