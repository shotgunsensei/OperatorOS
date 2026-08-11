import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { useSync } from '@/lib/sync';

export function ProductScreen({ title, kicker, children, refreshing, onRefresh }: { title: string; kicker: string; children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const sync = useSync();
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text style={styles.kicker}>{kicker.toUpperCase()}</Text><Text accessibilityRole="header" style={styles.title}>{title}</Text></View>
        <View style={[styles.connection, { borderColor: sync.online ? colors.green : colors.amber }]}>
          <Text style={{ color: sync.online ? colors.green : colors.amber, fontSize: 11, fontWeight: '800' }}>{sync.online ? (sync.syncing ? 'SYNCING' : 'ONLINE') : 'OFFLINE'}</Text>
        </View>
      </View>
      {sync.pending > 0 && <Pressable onPress={() => void sync.flush()} style={styles.queue}><Text style={styles.queueText}>{sync.pending} change{sync.pending === 1 ? '' : 's'} queued — tap to reconcile</Text></Pressable>}
      {refreshing ? <ActivityIndicator color={colors.ember} style={{ margin: 40 }} /> : children}
      {onRefresh && <Button label="Refresh" variant="ghost" onPress={onRefresh} />}
    </ScrollView>
  </SafeAreaView>;
}

export function Hero({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <LinearGradient colors={['#3a1710', '#17191b']} style={styles.hero}>
    <Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.heroTitle}>{title}</Text><Text style={styles.body}>{body}</Text>
  </LinearGradient>;
}

export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const content = <View style={styles.card}>{children}</View>;
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}
export function CardTitle({ children }: { children: React.ReactNode }) { return <Text style={styles.cardTitle}>{children}</Text>; }
export function Meta({ children }: { children: React.ReactNode }) { return <Text style={styles.meta}>{children}</Text>; }
export function Body({ children }: { children: React.ReactNode }) { return <Text style={styles.body}>{children}</Text>; }
export function Empty({ title, body }: { title: string; body: string }) { return <Card><CardTitle>{title}</CardTitle><Body>{body}</Body></Card>; }
export function ErrorState({ message }: { message: string }) { return <View style={styles.error}><Text style={styles.errorText}>{message}</Text></View>; }
export function Field(props: TextInputProps & { label: string }) { return <View style={{ gap: 6 }}><Text style={styles.label}>{props.label}</Text><TextInput placeholderTextColor="#6f777d" {...props} style={[styles.input, props.multiline && { minHeight: 92, textAlignVertical: 'top' }, props.style]} /></View>; }
export function Button({ label, onPress, variant = 'primary', disabled }: { label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === 'ghost' && styles.buttonGhost, variant === 'danger' && styles.buttonDanger, (pressed || disabled) && { opacity: .6 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.void }, page: { padding: 18, paddingBottom: 44, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 }, kicker: { color: colors.ember, fontSize: 10, letterSpacing: 2.5, fontWeight: '900' }, title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  connection: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, queue: { backgroundColor: '#37250e', borderColor: '#76561c', borderWidth: 1, borderRadius: 10, padding: 10 }, queueText: { color: colors.amber, fontWeight: '700', fontSize: 12 },
  hero: { borderWidth: 1, borderColor: '#65301d', borderRadius: 18, padding: 20, gap: 7 }, eyebrow: { color: colors.amber, fontSize: 10, letterSpacing: 2, fontWeight: '900' }, heroTitle: { color: colors.text, fontSize: 23, lineHeight: 27, fontWeight: '900' },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 16, gap: 8 }, cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, meta: { color: colors.amber, fontSize: 11, letterSpacing: .6, textTransform: 'uppercase', fontWeight: '800' }, body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .8 }, input: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line, borderRadius: 11, color: colors.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15 },
  button: { backgroundColor: colors.ember, borderRadius: 11, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, buttonGhost: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line }, buttonDanger: { backgroundColor: '#7b1e27' }, buttonText: { color: '#fff', fontWeight: '900', letterSpacing: .4 },
  error: { borderWidth: 1, borderColor: '#7b2630', backgroundColor: '#2a1115', padding: 12, borderRadius: 10 }, errorText: { color: '#ff9da7', fontWeight: '700' },
});
