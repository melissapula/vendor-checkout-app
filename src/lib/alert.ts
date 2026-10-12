// react-native-web's Alert.alert() is a no-op (no dialog, no warning,
// nothing) — see AlertHost.tsx for the actual rendering. This is a module
// singleton rather than a hook so every call site stays a plain function
// call, exactly like Alert.alert was.
import { DEMO_READ_ONLY_MESSAGE, DEMO_READ_ONLY_TITLE } from './demo';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };
type AlertListener = (request: AlertRequest | null) => void;

let listener: AlertListener | null = null;

export function registerAlertListener(fn: AlertListener | null) {
  listener = fn;
}

// A write refused in the demo store (see src/lib/supabase.ts) shows this
// one message. The screen that attempted the write then usually reports
// its own "couldn't save" alert a moment later, which would replace this
// one with something less helpful, so alerts are held off briefly.
let demoAlertUntil = 0;

export function showDemoReadOnlyAlert() {
  demoAlertUntil = Date.now() + 1500;
  listener?.({ title: DEMO_READ_ONLY_TITLE, message: DEMO_READ_ONLY_MESSAGE, buttons: [{ text: 'OK' }] });
}

export function appAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Date.now() < demoAlertUntil) return;
  listener?.({ title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] });
}
