import React from 'react';
import { Pressable, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import InventoryScreen from '../screens/InventoryScreen';
import CartScreen from '../screens/CartScreen';
import DealsScreen from '../screens/DealsScreen';
import CustomerScreen from '../screens/CustomerScreen';
import AdminPinScreen from '../screens/AdminPinScreen';
import { useCart } from '../context/CartContext';
import { useAppMode } from '../context/AppModeContext';

const Tab = createBottomTabNavigator();

function ExitToCustomerButton() {
  const { exitToCustomer } = useAppMode();
  return (
    <Pressable onPress={exitToCustomer} style={{ marginRight: 12 }}>
      <Text style={{ color: '#1a1a1a', fontWeight: '600' }}>Customer View</Text>
    </Pressable>
  );
}

function AdminTabs() {
  const { itemCount } = useCart();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{ headerTitleAlign: 'center', headerRight: () => <ExitToCustomerButton /> }}
      >
        <Tab.Screen
          name="Inventory"
          component={InventoryScreen}
          options={{ title: "Chrissy's Studio" }}
        />
        <Tab.Screen
          name="Cart"
          component={CartScreen}
          options={{
            tabBarBadge: itemCount > 0 ? itemCount : undefined,
          }}
        />
        <Tab.Screen name="Deals" component={DealsScreen} options={{ title: 'Manage Deals' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function RootNavigator() {
  const { mode } = useAppMode();

  if (mode === 'admin') return <AdminTabs />;
  if (mode === 'pin') return <AdminPinScreen />;
  return <CustomerScreen />;
}
