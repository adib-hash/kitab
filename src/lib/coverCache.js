import { Capacitor } from '@capacitor/core'

/**
 * Simple djb2 hash for a URL string → stable filename
 */
function urlToFilename(url) {
  let hash = 5381
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash) ^ url.charCodeAt(i)
    hash |= 0 // keep 32-bit
  }
  return `cover_${(hash >>> 0).toString(36)}.jpg`
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Returns a display URL for a book cover.
 * - On web: returns remoteUrl as-is (browser handles its own HTTP cache)
 * - On native iOS: checks Capacitor Filesystem cache, downloads + caches on miss,
 *   falls back to remoteUrl if anything fails
 */
export async function getCachedCoverUrl(remoteUrl) {
  if (!remoteUrl || !Capacitor.isNativePlatform()) return remoteUrl

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const filename = urlToFilename(remoteUrl)

  // Cache hit
  try {
    const result = await Filesystem.readFile({
      path: `covers/${filename}`,
      directory: Directory.Cache,
    })
    return `data:image/jpeg;base64,${result.data}`
  } catch {
    // Not cached yet — fall through to fetch
  }

  // Cache miss — fetch remote, write to disk
  try {
    const response = await fetch(remoteUrl)
    if (!response.ok) return remoteUrl
    const blob = await response.blob()
    const base64 = await blobToBase64(blob)
    const data = base64.split(',')[1]

    // Ensure the subdirectory exists
    try {
      await Filesystem.mkdir({ path: 'covers', directory: Directory.Cache, recursive: true })
    } catch {
      // Directory already exists — ignore
    }

    await Filesystem.writeFile({
      path: `covers/${filename}`,
      data,
      directory: Directory.Cache,
    })
    return base64
  } catch {
    // Any error — fall back to the remote URL
    return remoteUrl
  }
}
