import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SyncProvider } from '@/lib/sync';
import { colors } from '@/lib/theme';

function RootNavigator() {
  const auth = useAuth();
  if (auth.loading) return <View style={styles.gate}><ActivityIndicator color={colors.ember} /></View>;
  if (!auth.session) return <View style={styles.gate}>
    <Text style={styles.mark}>TORQUE<Text style={{ color: colors.ember }}>SHED</Text></Text>
    <Text style={styles.title}>Your garage. Your proof.</Text>
    <Text style={styles.body}>Sign in through OperatorOS to resume this route for your authorized tenant.</Text>
    <Button label="Connect OperatorOS" onPress={() => void auth.login()} />
  </View>;
  return <>
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
  </>;
}

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><SyncProvider><RootNavigator /></SyncProvider></AuthProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.void, padding: 28, justifyContent: 'center', gap: 18 },
  mark: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.text, fontSize: 36, lineHeight: 39, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
});
