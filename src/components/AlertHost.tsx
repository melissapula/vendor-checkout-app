import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { registerAlertListener, AlertButton } from '../lib/alert';
import { colors } from '../lib/theme';

type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };

// react-native-web's <Modal> hardcodes zIndex: 9999 on its portal wrapper
// with no way to override it, and that wrapper is only created in the DOM
// the moment each <Modal> component first mounts — not when it becomes
// visible. Since this host mounts once at app boot, before any feature
// modal (Edit Piece, Print Labels, etc.) ever opens, its wrapper div always
// ends up earliest in document.body — so any modal opened later permanently
// paints over it, even while it's fully present and correctly rendered.
// Portaling manually (same pattern as PrintLabelsOverlay.tsx) with an
// explicit, much higher z-index sidesteps that entirely.
const ALERT_ROOT_ID = 'alert-root';

function getAlertRoot(): HTMLElement {
  let el = document.getElementById(ALERT_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ALERT_ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

export default function AlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(null);

  useEffect(() => {
    registerAlertListener(setRequest);
    return () => registerAlertListener(null);
  }, []);

  function handlePress(button: AlertButton) {
    setRequest(null);
    button.onPress?.();
  }

  if (!request) return null;

  return createPortal(
    <div style={backdropStyle}>
      <View style={styles.card}>
        <Text style={styles.title}>{request.title}</Text>
        {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
        <View style={styles.buttonRow}>
          {request.buttons.map((button, i) => (
            <Pressable key={i} style={styles.button} onPress={() => handlePress(button)}>
              <Text
                style={[
                  styles.buttonText,
                  button.style === 'cancel' && styles.cancelText,
                  button.style === 'destructive' && styles.destructiveText,
                ]}
              >
                {button.text}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </div>,
    getAlertRoot()
  );
}

// Plain CSS-in-JS on a raw <div> (not RN's StyleSheet) since `position:
// fixed` isn't a value RN's type system recognizes — same reasoning
// PrintLabelsOverlay.tsx uses for its own raw DOM elements.
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 999999,
  backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.background, borderRadius: 12, padding: 20, width: '100%', maxWidth: 340 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  message: { fontSize: 14, color: '#333', marginBottom: 16 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  button: { paddingVertical: 8, paddingHorizontal: 4 },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  cancelText: { color: '#666', fontWeight: '500' },
  destructiveText: { color: '#b00020' },
});
