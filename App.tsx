import { StatusBar } from 'expo-status-bar';
import { CartProvider } from './src/context/CartContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <CartProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </CartProvider>
  );
}
