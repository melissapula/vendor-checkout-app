// A deterrent, not real security: EXPO_PUBLIC_* vars are bundled into the
// client JS in plaintext, so anyone who inspects the app bundle can read
// this. It's meant to stop a customer from casually poking at inventory/
// pricing/deals while the iPad is in their hands, not to protect real
// secrets. Set EXPO_PUBLIC_ADMIN_PIN in .env to change it from the default.
export const ADMIN_PIN = process.env.EXPO_PUBLIC_ADMIN_PIN || '1234';
