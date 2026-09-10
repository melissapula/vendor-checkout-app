import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppModal from './AppModal';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

// Ignore repeat decodes of the same barcode within this window — otherwise
// holding a label in frame fires onScan many times a second (every decoded
// video frame), adding it to the cart repeatedly.
const RESCAN_COOLDOWN_MS = 2000;

export default function CameraScanner({
  visible,
  onScan,
  onClose,
}: {
  visible: boolean;
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastScanAtRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  // Read via a ref rather than depending on `onScan` directly — callers
  // that don't memoize it (or whose memoized version changes because one
  // of its own dependencies legitimately changes on every successful scan,
  // e.g. cart state) would otherwise restart the whole camera stream on
  // every scan, which flickers the video and interrupts scanning the next item.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setError(null);
    const hints = new Map();
    // Label printing can put either a CODE_128 barcode or a QR code on a
    // label (same SKU text either way — see PrintLabelsOverlay.tsx), but
    // this only ever recognized CODE_128, so QR-labeled pieces silently
    // couldn't be scanned. Recognizing both isn't a tradeoff — zxing decodes
    // whichever format is actually in frame, it doesn't need to guess first.
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled || !result) return;

        const code = result.getText();
        const now = Date.now();
        if (code === lastCodeRef.current && now - lastScanAtRef.current < RESCAN_COOLDOWN_MS) {
          return;
        }
        lastCodeRef.current = code;
        lastScanAtRef.current = now;
        onScanRef.current(code);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not access the camera — check that this site has camera permission.'
          );
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [visible]);

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.heading}>Scan a barcode</Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          // Raw DOM <video> — web-only, same reasoning as elsewhere in this
          // app's web-specific components (see PrintLabelsOverlay).
          <video ref={videoRef} muted playsInline style={videoStyle} />
        )}
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Done</Text>
        </Pressable>
      </View>
    </AppModal>
  );
}

const videoStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  aspectRatio: '1',
  backgroundColor: '#000',
  borderRadius: 8,
  objectFit: 'cover',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  heading: { fontSize: 20, fontWeight: '700' },
  error: { color: '#b00020', textAlign: 'center', maxWidth: 320 },
  closeButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  closeButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
