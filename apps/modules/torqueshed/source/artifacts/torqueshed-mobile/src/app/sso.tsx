import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

export default function SsoReceiver() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const { acceptSsoToken } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = Array.isArray(token) ? token[0] : token;
    if (!value) {
      setError("This OperatorOS handoff did not include a token.");
      return;
    }
    acceptSsoToken(value)
      .then(() => router.replace("/(tabs)/garage"))
      .catch(() => setError("This launch expired or could not be verified. Return to OperatorOS and launch TorqueShed again."));
  }, [acceptSsoToken, router, token]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name={error ? "warning-outline" : "shield-checkmark-outline"} size={32} color={colors.orangeHot} /></View>
        <Text style={styles.kicker}>OPERATOROS / SECURE HANDOFF</Text>
        <Text style={styles.title}>{error ? "Launch interrupted." : "Opening your garage."}</Text>
        <Text style={styles.copy}>{error ?? "Verifying the one-time launch and creating a private TorqueShed session."}</Text>
        {error ? <Pressable style={styles.button} onPress={() => router.replace("/(tabs)")}><Text style={styles.buttonText}>BACK TO TORQUESHED</Text><Ionicons name="arrow-forward" size={16} color="#fff" /></Pressable> : <ActivityIndicator size="small" color={colors.orange} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: colors.ink },
  card: { padding: 28, borderWidth: 1, borderColor: "#553722", backgroundColor: colors.panel },
  icon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", marginBottom: 26, borderWidth: 1, borderColor: "#6B3D21", backgroundColor: "#26160F" },
  kicker: { color: colors.orangeHot, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { marginTop: 12, color: colors.paper, fontSize: 42, fontWeight: "900", letterSpacing: -1.8, lineHeight: 42, textTransform: "uppercase" },
  copy: { marginVertical: 18, color: colors.muted, fontSize: 14, lineHeight: 22 },
  button: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, backgroundColor: colors.orange },
  buttonText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
});
