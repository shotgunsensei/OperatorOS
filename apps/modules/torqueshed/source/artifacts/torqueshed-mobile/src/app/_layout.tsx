import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../lib/auth";
import { colors } from "../lib/theme";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink }, animation: "fade" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sso" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </AuthProvider>
  );
}
