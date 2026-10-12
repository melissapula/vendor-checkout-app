import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AppModal from './AppModal';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Piece } from '../types/database';
import { colors } from '../lib/theme';

export type CameraScanLookup = { found: true; piece: Piece } | { found: false; message: string };

export default function CameraScanner({
  visible,
  resolveCode,
  onAdd,
  onClose,
}: {
  visible: boolean;
  resolveCode: (code: string) => CameraScanLookup;
  onAdd: (piece: Piece) => void;
  onClose: () => void;
}) {
  // A plain ref here raced AppModal's own portal setup: AppModal renders
  // `null` for one commit after `visible` flips true (it waits on its own
  // effect to create the portal DOM node), so on that first pass the
  // <video> element didn't exist yet and videoRef.current was still null
  // when decodeFromVideoDevice ran below. zxing then fell back to creating
  // its own detached video element — decoding could still work, but nothing
  // ever streamed into the actually-visible <video> tag, which stayed a
  // static black box forever. A state-backed callback ref re-fires the
  // effect once the element genuinely mounts, closing that race.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A decoded code that's waiting on the vendor to actually confirm it —
  // previously a successful decode added straight to the cart with no
  // visible confirmation (a small text message rendered behind this
  // full-screen camera modal, so it was never actually seen), which made a
  // working scan indistinguishable from a non-working one. Now a decode
  // surfaces what it found (or why it didn't match) right over the video,
  // and nothing touches the cart until Add is tapped. Decoding is paused
  // (see the callback below) while this is set, so the same code in frame
  // doesn't just keep re-resolving underneath the banner.
  const [pending, setPending] = useState<{ code: string; result: CameraScanLookup } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // Read via refs rather than depending on the callback props directly —
  // callers that don't memoize them (or whose memoized version changes
  // because one of its own dependencies legitimately changes, e.g. cart
  // state) would otherwise restart the whole camera stream on every scan,
  // which flickers the video and interrupts scanning the next item.
  const resolveCodeRef = useRef(resolveCode);
  resolveCodeRef.current = resolveCode;
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  useEffect(() => {
    if (!visible || !videoEl) return;

    let cancelled = false;
    setError(null);
    setPending(null);
    const hints = new Map();
    // Label printing can put either a CODE_128 barcode or a QR code on a
    // label (same SKU text either way — see PrintLabelsOverlay.tsx), but
    // this only ever recognized CODE_128, so QR-labeled pieces silently
    // couldn't be scanned. Recognizing both isn't a tradeoff — zxing decodes
    // whichever format is actually in frame, it doesn't need to guess first.
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
    // TRY_HARDER trades a bit of per-frame CPU for materially better
    // real-world decode success (skewed angle, imperfect lighting, a small
    // printed label) — worth it here since this only ever runs while a
    // human is actively holding the scanner open, not in the background.
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);

    // decodeFromVideoDevice's default constraints don't request a specific
    // resolution, so browsers often settle on a low one (e.g. 640x480) —
    // plenty for a video call, not enough detail to reliably resolve a
    // small barcode at normal scanning distance. Asking for a higher
    // resolution (as an `ideal`, not `exact`, so it still degrades
    // gracefully on cameras that can't do 1280x720) gives the decoder a
    // sharper frame to work with.
    const constraints: MediaStreamConstraints = {
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    };

    reader
      .decodeFromConstraints(constraints, videoEl, (result, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled || !result) return;
        if (pendingRef.current) return; // already showing a found (or not-found) result — wait for it to be resolved

        const code = result.getText();
        setPending({ code, result: resolveCodeRef.current(code) });
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
  }, [visible, videoEl]);

  function handleAdd() {
    if (!pending || !pending.result.found) return;
    onAddRef.current(pending.result.piece);
    setPending(null);
  }

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.heading}>Scan a barcode</Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.videoWrap}>
            {/* Raw DOM <video> — web-only, same reasoning as elsewhere in
                this app's web-specific components (see PrintLabelsOverlay). */}
            <video ref={setVideoEl} muted playsInline style={videoStyle} />
            {!pending && (
              <View style={styles.scanningBadge} pointerEvents="none">
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.scanningBadgeText}>Point at a barcode…</Text>
              </View>
            )}
            {pending && (
              <View style={styles.foundBanner}>
                {pending.result.found ? (
                  <>
                    <Text style={styles.foundTitle} numberOfLines={2}>
                      {pending.result.piece.title}
                    </Text>
                    <Text style={styles.foundPrice}>${pending.result.piece.price.toFixed(2)}</Text>
                    <View style={styles.foundButtonRow}>
                      <Pressable style={styles.addButton} onPress={handleAdd}>
                        <Text style={styles.addButtonText}>Add to Cart</Text>
                      </Pressable>
                      <Pressable style={styles.skipButton} onPress={() => setPending(null)}>
                        <Text style={styles.skipButtonText}>Not this one</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.foundErrorText}>{pending.result.message}</Text>
                    <Pressable style={styles.skipButton} onPress={() => setPending(null)}>
                      <Text style={styles.skipButtonText}>Try again</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>
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
  height: '100%',
  backgroundColor: '#000',
  borderRadius: 8,
  objectFit: 'cover',
  display: 'block',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  heading: { fontSize: 20, fontWeight: '700' },
  error: { color: '#b00020', textAlign: 'center', maxWidth: 320 },
  videoWrap: { width: '100%', maxWidth: 480, aspectRatio: 1, position: 'relative' },
  scanningBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  scanningBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  foundBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  foundTitle: { fontSize: 16, fontWeight: '700' },
  foundPrice: { fontSize: 15, color: '#666' },
  foundErrorText: { fontSize: 14, color: '#b00020' },
  foundButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  addButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  skipButton: { paddingVertical: 12, paddingHorizontal: 8 },
  skipButtonText: { color: '#666', fontSize: 13 },
  closeButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  closeButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
