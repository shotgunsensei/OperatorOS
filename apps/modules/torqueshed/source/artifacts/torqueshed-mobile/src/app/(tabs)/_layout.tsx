import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "../../lib/theme";

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  assist: "hardware-chip-outline",
  builds: "construct-outline",
  market: "storefront-outline",
  garage: "speedometer-outline",
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? "ellipse-outline"} color={color} size={size} />,
        tabBarActiveTintColor: colors.orangeHot,
        tabBarInactiveTintColor: "#727875",
        tabBarStyle: { height: 74, paddingTop: 8, paddingBottom: 10, borderTopColor: colors.line, backgroundColor: "#0D0F0F" },
        tabBarLabelStyle: { fontSize: 9, fontWeight: "800", letterSpacing: .45, textTransform: "uppercase" },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Feed" }} />
      <Tabs.Screen name="assist" options={{ title: "Assist" }} />
      <Tabs.Screen name="builds" options={{ title: "Builds" }} />
      <Tabs.Screen name="market" options={{ title: "Market" }} />
      <Tabs.Screen name="garage" options={{ title: "Garage" }} />
    </Tabs>
  );
}
