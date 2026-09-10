import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { PiecesProvider } from './src/context/PiecesContext';
import { CartProvider } from './src/context/CartContext';
import { SalesProvider } from './src/context/SalesContext';
import { DealsProvider } from './src/context/DealsContext';
import { AppModeProvider } from './src/context/AppModeContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthScreen from './src/screens/auth/AuthScreen';
import CreateStoreScreen from './src/screens/auth/CreateStoreScreen';
import ResetPasswordScreen from './src/screens/auth/ResetPasswordScreen';
import AlertHost from './src/components/AlertHost';

function AppGate() {
  const { session, authLoading, store, storeLoading, storeError, retryStoreFetch } = useAuth();
  const [authView, setAuthView] = useState<'auth' | 'reset'>('auth');

  // Browser tab title / "Add to Home Screen" suggested name — each vendor's
  // own store name once they're signed in, rather than the generic default
  // in public/index.html (app.json's `name` is a shared internal id across
  // every tenant, not a display name — see README's "Multi-tenant" section).
  useEffect(() => {
    if (Platform.OS === 'web' && store) {
      document.title = store.name;
    }
  }, [store]);

  if (authLoading || (session && storeLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return authView === 'reset' ? (
      <ResetPasswordScreen onCancel={() => setAuthView('auth')} />
    ) : (
      <AuthScreen onForgotPassword={() => setAuthView('reset')} />
    );
  }

  if (storeError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text style={{ textAlign: 'center' }}>Couldn't load your store: {storeError}</Text>
        <Pressable
          onPress={retryStoreFetch}
          style={{ backgroundColor: '#111', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!store) return <CreateStoreScreen />;

  return (
    <PiecesProvider>
      <DealsProvider>
        <SalesProvider>
          <CartProvider>
            <AppModeProvider>
              <RootNavigator />
            </AppModeProvider>
          </CartProvider>
        </SalesProvider>
      </DealsProvider>
    </PiecesProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppGate />
        <StatusBar style="auto" />
      </AuthProvider>
      <AlertHost />
    </SafeAreaProvider>
  );
}
