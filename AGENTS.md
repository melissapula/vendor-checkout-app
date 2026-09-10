# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Never call `Alert.alert` directly

`react-native-web`'s `Alert.alert()` is a complete no-op — no dialog, no
warning, nothing renders. This app is web-only, so calling it is a silent
bug every time, not an edge case. Use `appAlert` from `src/lib/alert.ts`
instead — identical `(title, message?, buttons?)` signature, rendered by
`AlertHost.tsx`. See the README's "`Alert.alert` does not work on web"
section for the full story (including why it was built on a raw portal
instead of RN's `<Modal>`, which has its own web-only stacking bug).
