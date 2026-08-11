import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { SyncProvider } from '@/lib/sync';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><SyncProvider>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.panel }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.void } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="live-bay/[id]" options={{ title: 'Live Bay' }} />
      <Stack.Screen name="build/[id]" options={{ title: 'Build Journal' }} />
      <Stack.Screen name="diagnostic/[id]" options={{ title: 'Diagnostic Case' }} />
      <Stack.Screen name="profile" options={{ title: 'Driver Profile' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  </SyncProvider></AuthProvider></SafeAreaProvider>;
}
