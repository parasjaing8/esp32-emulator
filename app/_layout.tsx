import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DeviceProvider } from '@/context/DeviceContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DeviceProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </DeviceProvider>
    </GestureHandlerRootView>
  );
}
