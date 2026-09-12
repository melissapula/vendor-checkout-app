import React, { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

// A previous approach listened for keystrokes at the document level so a
// Bluetooth/USB "keyboard-wedge" scanner didn't need a focused field to
// type into. That worked in every desktop test but not on an iPad —
// iOS Safari has a well-known limitation where it generally won't deliver
// hardware keyboard events to a page at all unless an actual focused,
// editable element exists; a bare document-level listener with nothing
// focused often just never fires. This sidesteps that limitation instead
// of fighting it: keep a real, always-focused (but invisible) TextInput
// mounted, so there's always something legitimate for the OS to route
// keyboard input into, auto-focused and off-screen instead of requiring a
// tap on a visible field first.
export default function HiddenScanCapture({
  onScan,
  enabled,
}: {
  onScan: (code: string) => void;
  enabled: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const [value, setValue] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function focus() {
      ref.current?.focus();
    }
    focus();
    // Re-claim focus if the tab/page comes back (e.g. after being
    // backgrounded) — iOS can drop focus in ways a blur event never fires
    // for.
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('focus', focus);
    return () => {
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('focus', focus);
    };
  }, [enabled]);

  function handleSubmit() {
    const code = value.trim();
    setValue('');
    if (code) onScanRef.current(code);
    ref.current?.focus();
  }

  function handleBlur() {
    if (!enabled) return;
    // Something else may have legitimately taken focus — a staff member
    // tapping a real field (Staff PIN, a price, the visible SKU box). Only
    // reclaim it if focus landed on nothing at all.
    setTimeout(() => {
      if (document.activeElement === document.body) {
        ref.current?.focus();
      }
    }, 50);
  }

  if (!enabled) return null;

  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={setValue}
      onSubmitEditing={handleSubmit}
      onBlur={handleBlur}
      autoCapitalize="none"
      autoCorrect={false}
      style={hiddenStyle}
    />
  );
}

const hiddenStyle = {
  position: 'absolute' as const,
  left: -9999,
  top: -9999,
  width: 1,
  height: 1,
  opacity: 0,
};
