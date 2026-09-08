import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InventoryScreen from './InventoryScreen';
import CartScreen from './CartScreen';
import DealsScreen from './DealsScreen';
import { useCart } from '../context/CartContext';
import { useAppMode } from '../context/AppModeContext';

type Page = 'inventory' | 'cart' | 'deals';

const PAGE_TITLES: Record<Page, string> = {
  inventory: "Chrissy's Studio",
  cart: 'Cart',
  deals: 'Manage Deals',
};

export default function AdminScreen() {
  const [page, setPage] = useState<Page>('inventory');
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount } = useCart();
  const { exitToCustomer } = useAppMode();

  function choose(next: Page) {
    setPage(next);
    setMenuOpen(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuButtonText}>{PAGE_TITLES[page]} ▾</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {page === 'inventory' && <InventoryScreen />}
        {page === 'cart' && <CartScreen />}
        {page === 'deals' && <DealsScreen />}
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
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
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  menuButton: { paddingVertical: 4, paddingHorizontal: 8 },
  menuButtonText: { fontSize: 18, fontWeight: '700' },
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
