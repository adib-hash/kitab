import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

export function BarcodeScannerModal({ open, onClose, onDetect }) {
  const videoRef = useRef(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  useEffect(() => {
    if (!open) return

    // Body scroll lock (position: fixed pattern for iOS)
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    let stopped = false
    let readerRef = null
    let lastIsbn = null
    let consecutiveCount = 0

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8])

    async function startReader() {
      try {
        const reader = new BrowserMultiFormatReader(hints)
        readerRef = reader

        await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result, err) => {
            if (stopped) return
            if (result) {
              const isbn = result.getText()
              if (isbn === lastIsbn) {
                consecutiveCount++
                if (consecutiveCount >= 2) {
                  stopped = true
                  onDetect(isbn)
                }
              } else {
                lastIsbn = isbn
                consecutiveCount = 1
              }
            }
          }
        )
      } catch (err) {
        if (!stopped) {
          console.error('Scanner error:', err)
          if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
            setPermissionDenied(true)
          } else {
            setPermissionDenied(true)
          }
        }
      }
    }

    startReader()

    return () => {
      stopped = true
      try {
        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(t => t.stop())
        }
        BrowserMultiFormatReader.releaseAllStreams()
      } catch (e) {
        // ignore cleanup errors
      }
      // Restore scroll
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  if (!open) return null

  function handleClose() {
    setPermissionDenied(false)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'black',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Camera video */}
      {!permissionDenied && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* Vignette overlay */}
      {!permissionDenied && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {permissionDenied ? (
        /* Permission denied state */
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '2rem' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem' }}>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            Camera access required
          </p>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', marginBottom: '2rem', maxWidth: '280px' }}>
            Allow camera access in your browser settings to scan barcodes.
          </p>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '12px',
              color: 'white',
              fontSize: '0.9375rem',
              fontWeight: '500',
              padding: '0.75rem 2rem',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      ) : (
        /* Viewfinder + instructions */
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          {/* Viewfinder box */}
          <div style={{ position: 'relative', width: '260px', height: '100px' }}>
            {/* Corner brackets */}
            {[
              { top: 0, left: 0, borderTop: '3px solid #2DD4BF', borderLeft: '3px solid #2DD4BF', borderRadius: '4px 0 0 0' },
              { top: 0, right: 0, borderTop: '3px solid #2DD4BF', borderRight: '3px solid #2DD4BF', borderRadius: '0 4px 0 0' },
              { bottom: 0, left: 0, borderBottom: '3px solid #2DD4BF', borderLeft: '3px solid #2DD4BF', borderRadius: '0 0 0 4px' },
              { bottom: 0, right: 0, borderBottom: '3px solid #2DD4BF', borderRight: '3px solid #2DD4BF', borderRadius: '0 0 4px 0' },
            ].map((style, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: '20px',
                  height: '20px',
                  ...style,
                }}
              />
            ))}

            {/* Scan line */}
            <div
              style={{
                position: 'absolute',
                left: '8px',
                right: '8px',
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #2DD4BF, transparent)',
                boxShadow: '0 0 8px #2DD4BF',
                animation: 'kitab-scanline 2s ease-in-out infinite alternate',
              }}
            />
          </div>

          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8125rem', textAlign: 'center', maxWidth: '240px', lineHeight: '1.4' }}>
            Point the camera at the barcode on the back cover
          </p>
        </div>
      )}

      {/* Cancel button */}
      {!permissionDenied && (
        <button
          type="button"
          onClick={handleClose}
          style={{
            position: 'absolute',
            bottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '100px',
            color: 'white',
            fontSize: '0.9375rem',
            fontWeight: '500',
            padding: '0.625rem 2rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      )}

      {/* Scan-line keyframes injected once */}
      <style>{`
        @keyframes kitab-scanline {
          from { top: 8px; }
          to   { top: calc(100% - 10px); }
        }
      `}</style>
    </div>
  )
}
