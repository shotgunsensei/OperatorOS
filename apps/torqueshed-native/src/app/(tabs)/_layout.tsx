import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function TabLayout() {
  const auth = useAuth();
  if (auth.loading) return <View style={styles.gate}><ActivityIndicator color={colors.ember} /></View>;
  if (!auth.session) return <View style={styles.gate}><Text style={styles.mark}>TORQUE<Text style={{ color: colors.ember }}>SHED</Text></Text><Text style={styles.title}>Your garage. Your proof.</Text><Text style={styles.body}>Sign in through OperatorOS to unlock the garage, community, diagnostics, live collaboration, and marketplace for your authorized tenant.</Text><Button label="Connect OperatorOS" onPress={() => void auth.login()} /></View>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ember, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line, height: 66, paddingBottom: 8 } }}>
    <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: ({ color, size }) => <Ionicons name="flame" color={color} size={size} /> }} />
    <Tabs.Screen name="assist" options={{ title: 'Assist', tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
    <Tabs.Screen name="builds" options={{ title: 'Builds', tabBarIcon: ({ color, size }) => <Ionicons name="construct" color={color} size={size} /> }} />
    <Tabs.Screen name="market" options={{ title: 'Market', tabBarIcon: ({ color, size }) => <Ionicons name="pricetag" color={color} size={size} /> }} />
    <Tabs.Screen name="garage" options={{ title: 'Garage', tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" color={color} size={size} /> }} />
  </Tabs>;
}
const styles = StyleSheet.create({ gate: { flex: 1, backgroundColor: colors.void, padding: 28, justifyContent: 'center', gap: 18 }, mark: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 3 }, title: { color: colors.text, fontSize: 36, lineHeight: 39, fontWeight: '900' }, body: { color: colors.muted, fontSize: 16, lineHeight: 24 } });
