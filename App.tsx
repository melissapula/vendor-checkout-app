import { StatusBar } from 'expo-status-bar';
import { PiecesProvider } from './src/context/PiecesContext';
import { CartProvider } from './src/context/CartContext';
import { SalesProvider } from './src/context/SalesContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <PiecesProvider>
      <SalesProvider>
        <CartProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </CartProvider>
      </SalesProvider>
    </PiecesProvider>
  );
}
