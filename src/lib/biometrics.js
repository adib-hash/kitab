import { Capacitor } from '@capacitor/core'

/**
 * Returns true if biometric auth (Face ID / Touch ID) is enrolled and available.
 * Always returns false on web.
 */
export async function isBiometricsAvailable() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    const result = await BiometricAuth.checkBiometry()
    return result.isAvailable === true
  } catch {
    return false
  }
}

/**
 * Presents the Face ID / Touch ID prompt.
 * Returns true on success, false if the user cancels or fails.
 */
export async function authenticateWithBiometrics(reason = 'Confirm your identity to open Kitab') {
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    await BiometricAuth.authenticate({ reason, cancelTitle: 'Use Password' })
    return true
  } catch {
    return false
  }
}
