import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// react-native-web's <Modal> hardcodes zIndex: 9999 on a portal wrapper
// that's created in document.body the moment the <Modal> component first
// mounts — not when its `visible` prop turns true (see AlertHost.tsx's own
// note on this same quirk). Every screen in this app renders its <Modal>s
// unconditionally in JSX and only toggles `visible`, so when two modals
// live in the same tree (e.g. InventoryScreen's form + label-builder, or
// CartScreen's checkout containing CameraScanner), their portal wrappers
// land in document.body in *mount* order, not *open* order — with a tied
// z-index, whichever mounted first stays on top forever, regardless of
// which one the user actually opened most recently.
//
// This sidesteps it the way AlertHost/PrintLabelsOverlay already do:
// portal manually, and only create (and remove) the DOM node while actually
// `visible` — so its position in document.body always reflects real open
// order, and a later-opened modal naturally paints over an earlier one
// still on screen, with no per-modal z-index bookkeeping required.
const MODAL_Z_INDEX = 10000;

export default function AppModal({
  visible,
  transparent = false,
  onRequestClose,
  children,
}: {
  visible: boolean;
  transparent?: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const el = document.createElement('div');
    document.body.appendChild(el);
    setRoot(el);
    return () => {
      document.body.removeChild(el);
      setRoot(null);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onRequestClose();
    }
    document.addEventListener('keyup', handleEscape);
    return () => document.removeEventListener('keyup', handleEscape);
  }, [visible, onRequestClose]);

  if (!root) return null;

  return createPortal(
    <div style={{ ...wrapperStyle, backgroundColor: transparent ? 'transparent' : '#fff' }}>
      {children}
    </div>,
    root
  );
}

// Plain CSS-in-JS on a raw <div> (not RN's StyleSheet) since `position:
// fixed` isn't a value RN's type system recognizes — same reasoning
// AlertHost.tsx/PrintLabelsOverlay.tsx use for their own raw DOM elements.
const wrapperStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: MODAL_Z_INDEX,
  display: 'flex',
  flexDirection: 'column',
};
