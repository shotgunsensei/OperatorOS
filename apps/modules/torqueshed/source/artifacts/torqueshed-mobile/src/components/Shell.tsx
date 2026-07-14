import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";

export function Shell({ children, title, action }: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  const { user, launchOperatorOs } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
        {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
        {action ?? (user ? <View style={styles.avatar}><Text style={styles.avatarText}>{initials(user.displayName)}</Text></View> : <Pressable style={styles.signIn} onPress={() => void launchOperatorOs()}><Ionicons name="shield-checkmark-outline" size={14} color="#fff" /><Text style={styles.signInText}>SIGN IN</Text></Pressable>)}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView>
    </SafeAreaView>
  );
}

export function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.kicker}>{kicker}</Text><Text style={styles.title}>{title}</Text></View>;
}

export function Button({ label, icon = "arrow-forward", onPress, secondary = false }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; secondary?: boolean }) {
  return <Pressable style={[styles.button, secondary && styles.buttonSecondary]} onPress={onPress}><Text style={styles.buttonText}>{label}</Text><Ionicons name={icon} size={16} color={secondary ? colors.paper : "#fff"} /></Pressable>;
}

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink }, scroll: { flex: 1 }, content: { paddingBottom: 34 },
  header: { height: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: "#0B0D0D" },
  logo: { width: 112, height: 54 }, headerTitle: { flex: 1, color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, textAlign: "right", textTransform: "uppercase" },
  avatar: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, borderWidth: 1, borderColor: "#68422B", backgroundColor: "#2A1B14" },
  avatarText: { color: colors.orangeHot, fontSize: 10, fontWeight: "900" },
  signIn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 36, backgroundColor: colors.orange },
  signInText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: .7 },
  button: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, backgroundColor: colors.orange },
  buttonSecondary: { borderWidth: 1, borderColor: "#484D4A", backgroundColor: colors.panel }, buttonText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: .8 },
  sectionTitle: { marginHorizontal: 16, marginTop: 34, marginBottom: 16 }, kicker: { color: colors.orangeHot, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  title: { marginTop: 7, color: colors.paper, fontSize: 31, lineHeight: 32, fontWeight: "900", letterSpacing: -1.2, textTransform: "uppercase" },
});
