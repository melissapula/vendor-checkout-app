import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppModal from '../components/AppModal';
import InventoryScreen from './InventoryScreen';
import CartScreen from './CartScreen';
import DealsScreen from './DealsScreen';
import ReportsScreen from './ReportsScreen';
import StoreSettingsScreen from './StoreSettingsScreen';
import { useCart } from '../context/CartContext';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';

type Page = 'inventory' | 'cart' | 'deals' | 'reports' | 'settings';

const PAGE_TITLES: Record<Exclude<Page, 'inventory'>, string> = {
  cart: 'Cart',
  deals: 'Manage Deals',
  reports: 'Reports',
  settings: 'Settings',
};

export default function AdminScreen() {
  const [page, setPage] = useState<Page>('inventory');
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount } = useCart();
  const { exitToCustomer } = useAppMode();
  const { store } = useAuth();

  function choose(next: Page) {
    setPage(next);
    setMenuOpen(false);
  }

  const title = page === 'inventory' ? store?.name : PAGE_TITLES[page];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {page !== 'inventory' && (
            <Pressable style={styles.backButton} onPress={() => setPage('inventory')} hitSlop={10}>
              <Text style={styles.backButtonText}>‹ Back</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuButtonText}>
            {title} ▾ <Text style={styles.betaBadgeText}>BETA</Text>
          </Text>
        </Pressable>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.body}>
        {page === 'inventory' && <InventoryScreen />}
        {page === 'cart' && <CartScreen />}
        {page === 'deals' && <DealsScreen />}
        {page === 'reports' && <ReportsScreen />}
        {page === 'settings' && <StoreSettingsScreen />}
      </View>

      <AppModal visible={menuOpen} transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <SafeAreaView edges={['top']} style={styles.menuWrap}>
            <View style={styles.menu}>
              <MenuItem label="Inventory" active={page === 'inventory'} onPress={() => choose('inventory')} />
              <MenuItem
                label={`Cart${itemCount > 0 ? ` (${itemCount})` : ''}`}
                active={page === 'cart'}
                onPress={() => choose('cart')}
              />
              <MenuItem label="Deals" active={page === 'deals'} onPress={() => choose('deals')} />
              <MenuItem label="Reports" active={page === 'reports'} onPress={() => choose('reports')} />
              <MenuItem label="Settings" active={page === 'settings'} onPress={() => choose('settings')} />
              <View style={styles.menuDivider} />
              <MenuItem
                label="Customer View"
                onPress={() => {
                  setMenuOpen(false);
                  exitToCustomer();
                }}
                exit
              />
            </View>
          </SafeAreaView>
        </Pressable>
      </AppModal>
    </SafeAreaView>
  );
}

function MenuItem({
  label,
  active,
  exit,
  onPress,
}: {
  label: string;
  active?: boolean;
  exit?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuItemText, active && styles.menuItemTextActive, exit && styles.menuItemExit]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerSide: { minWidth: 64 },
  backButton: { paddingVertical: 4, paddingHorizontal: 8, alignSelf: 'flex-start' },
  backButtonText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  menuButton: { paddingVertical: 4, paddingHorizontal: 8 },
  menuButtonText: { fontSize: 18, fontWeight: '700' },
  betaBadgeText: { fontSize: 11, fontWeight: '700', color: '#8a6300' },
  body: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  menuWrap: { alignItems: 'center' },
  menu: {
    marginTop: 8,
    width: 240,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 18 },
  menuItemText: { fontSize: 16, color: '#1a1a1a' },
  menuItemTextActive: { fontWeight: '700' },
  menuItemExit: { color: '#666' },
  menuDivider: { height: 1, backgroundColor: '#eee', marginVertical: 6, marginHorizontal: 8 },
});
