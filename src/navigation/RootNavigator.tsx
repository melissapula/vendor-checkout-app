import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import InventoryScreen from '../screens/InventoryScreen';
import CartScreen from '../screens/CartScreen';
import { useCart } from '../context/CartContext';

const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  const { itemCount } = useCart();

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
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
      </Tab.Navigator>
    </NavigationContainer>
  );
}
