// react-native-web's Alert.alert() is a no-op (no dialog, no warning,
// nothing) — see AlertHost.tsx for the actual rendering. This is a module
// singleton rather than a hook so every call site stays a plain function
// call, exactly like Alert.alert was.
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

export function appAlert(title: string, message?: string, buttons?: AlertButton[]) {
  listener?.({ title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] });
}
