import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ember, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line, height: 66, paddingBottom: 8 } }}>
    <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: ({ color, size }) => <Ionicons name="flame" color={color} size={size} /> }} />
    <Tabs.Screen name="assist" options={{ title: 'Assist', tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
    <Tabs.Screen name="builds" options={{ title: 'Builds', tabBarIcon: ({ color, size }) => <Ionicons name="construct" color={color} size={size} /> }} />
    <Tabs.Screen name="market" options={{ title: 'Market', tabBarIcon: ({ color, size }) => <Ionicons name="pricetag" color={color} size={size} /> }} />
    <Tabs.Screen name="garage" options={{ title: 'Garage', tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" color={color} size={size} /> }} />
  </Tabs>;
}
