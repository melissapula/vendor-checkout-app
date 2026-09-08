import React from 'react';
import AdminScreen from '../screens/AdminScreen';
import CustomerScreen from '../screens/CustomerScreen';
import AdminPinScreen from '../screens/AdminPinScreen';
import { useAppMode } from '../context/AppModeContext';

export default function RootNavigator() {
  const { mode } = useAppMode();

  if (mode === 'admin') return <AdminScreen />;
  if (mode === 'pin') return <AdminPinScreen />;
  return <CustomerScreen />;
}
