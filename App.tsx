import { StatusBar } from 'expo-status-bar';
import { PiecesProvider } from './src/context/PiecesContext';
import { CartProvider } from './src/context/CartContext';
import { SalesProvider } from './src/context/SalesContext';
import { DealsProvider } from './src/context/DealsContext';
import { AppModeProvider } from './src/context/AppModeContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <PiecesProvider>
      <DealsProvider>
        <SalesProvider>
          <CartProvider>
            <AppModeProvider>
              <RootNavigator />
              <StatusBar style="auto" />
            </AppModeProvider>
          </CartProvider>
        </SalesProvider>
      </DealsProvider>
    </PiecesProvider>
  );
}
