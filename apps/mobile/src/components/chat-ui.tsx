import { useRef, useState, type PropsWithChildren } from 'react';
import { Image } from 'expo-image';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextProps, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { errorMessage } from '@/providers/chat-provider';

export const colors = { paper: '#fdfdfe', ink: '#0d1114', muted: '#626a78', line: '#eeeff2', soft: '#f3f4f6', blue: '#e9eff8', green: '#29bc68', danger: '#b62929' };
const symbols = {
  qr: ['qrcode', 'qr_code'],
  scan: ['viewfinder', 'qr_code_scanner'], group: ['person.2', 'group'], user: ['person', 'person'],
  settings: ['gearshape', 'settings'], edit: ['pencil', 'edit'], search: ['magnifyingglass', 'search'],
  arrow: ['arrow.up', 'arrow_upward'], chevron: ['chevron.right', 'chevron_right'], light: ['lightbulb', 'lightbulb'],
  bell: ['bell', 'notifications'], bookmark: ['bookmark', 'bookmark'], lock: ['lock', 'lock'],
  help: ['questionmark.circle', 'help'], pin: ['mappin', 'location_on'], close: ['xmark', 'close'],
} as const;
export type IconName = keyof typeof symbols;
export function Icon({ name, size = 25, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  const [ios, android] = symbols[name];
  if (process.env.EXPO_OS === 'ios') return <Image source={`sf:${ios}`} tintColor={color} style={{ width: size, height: size }} accessibilityElementsHidden />;
  return <SymbolView name={{ android: android as AndroidSymbol }} tintColor={color} size={size} style={{ width: size, height: size }} accessibilityElementsHidden />;
}
export function Copy({ style, ...props }: TextProps) { return <Text selectable {...props} style={[styles.copy, style]} />; }
export function Screen({ children, contentContainerStyle }: PropsWithChildren<{ contentContainerStyle?: StyleProp<ViewStyle> }>) {
  // Bound the viewport before flex layout so footers cannot grow behind native bars.
  return <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} collapsable={false} style={styles.screen}>
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentContainerStyle]}
      contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
      alwaysBounceVertical={false} overScrollMode="auto" keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </SafeAreaView>;
}
export function Button({ label, onPress, disabled, subtle = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; subtle?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    android_ripple={{ color: '#dfe4eb' }} style={({ pressed }) => [styles.button, subtle && styles.subtle, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text style={[styles.buttonText, { color: danger ? colors.danger : subtle ? colors.ink : '#fff' }]}>{label}</Text>
  </Pressable>;
}
export function IconButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} hitSlop={4} style={styles.iconButton}><Icon name={name} /></Pressable>;
}
export function TextButton({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    <Text style={{ fontSize: 14, color: danger ? colors.danger : colors.ink }}>{label}</Text>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Copy style={{ fontSize: 14 }}>{label}</Copy><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} /></View>;
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}><Copy style={{ color: colors.danger }}>{message}</Copy>{retry && <Button label="Retry" onPress={retry} subtle />}</View>;
}
export function Skeleton({ profile = false, view = 'groups' }: { profile?: boolean; view?: 'home' | 'groups' | 'chats' | 'messages' }) {
  if (profile) return <View accessibilityLabel="Loading profile" accessibilityRole="progressbar" style={{ gap: 16, alignItems: 'center', paddingTop: 10 }}>
    <View style={[styles.skeleton, { height: 130, width: 130, borderRadius: 65 }]} />
    <View style={[styles.skeleton, { width: 164, height: 28 }]} /><View style={[styles.skeleton, { width: 105, height: 17 }]} />
    <View style={[styles.row, { paddingVertical: 22 }]}>{[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { flex: 1, height: 42 }]} />)}</View>
    {[0, 1, 2, 3].map((i) => <View key={i} style={[styles.skeleton, { height: 57, width: '100%' }]} />)}
  </View>;
  if (view === 'home') return <View accessibilityLabel="Loading chats" accessibilityRole="progressbar" style={{ flex: 1, gap: 8, paddingHorizontal: 10 }}>
    {[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { width: 138, height: 38 }]} />)}
    <View style={[styles.skeleton, { width: 184, height: 24, marginTop: 10 }]} />
    <View style={[styles.skeleton, { width: 145, height: 145, borderRadius: 73, alignSelf: 'center', marginVertical: 38 }]} />
    <View style={[styles.skeleton, { height: 92, marginTop: 'auto' }]} />
  </View>;
  if (view === 'chats') return <View accessibilityLabel="Loading chats" accessibilityRole="progressbar" style={{ gap: 32, paddingVertical: 8 }}>
    <View style={{ gap: 10 }}>
      <Copy style={{ color: colors.muted, fontSize: 20, fontWeight: '600' }}>Your group</Copy>
      <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.soft, gap: 14 }}>
        <View style={[styles.row, { alignItems: 'flex-start' }]}>
          <View style={[styles.skeleton, { width: 56, height: 56, borderRadius: 17 }]} />
          <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
            <View style={[styles.skeleton, { width: '42%', height: 16 }]} />
            <View style={[styles.skeleton, { width: '24%', height: 14 }]} />
            <View style={[styles.skeleton, { width: '76%', height: 14 }]} />
          </View>
        </View>
        <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.skeleton, { width: 18, height: 18, borderRadius: 9 }]} />
          <View style={[styles.skeleton, { width: 148, height: 14 }]} />
        </View>
      </View>
    </View>
    <View style={[styles.row, { justifyContent: 'space-between', minHeight: 40 }]}>
      <Copy style={{ fontSize: 18, fontWeight: '600' }}>Friend requests</Copy>
      <View style={[styles.skeleton, { width: 36, height: 16 }]} />
    </View>
    <View style={{ gap: 4 }}>
      <View style={[styles.row, { justifyContent: 'space-between', minHeight: 48 }]}>
        <Copy style={{ fontSize: 18, fontWeight: '600' }}>Direct messages</Copy>
        <View style={[styles.skeleton, { width: 94, height: 18 }]} />
      </View>
      {[0, 1, 2].map((index) => <View key={index} style={[styles.row, { minHeight: 76, gap: 12 }]}>
        <View style={[styles.skeleton, { width: 50, height: 50, borderRadius: 25 }]} />
        <View style={{ flex: 1, gap: 8, paddingVertical: 12 }}>
          <View style={[styles.skeleton, { width: '44%', height: 15 }]} />
          <View style={[styles.skeleton, { width: '68%', height: 14 }]} />
        </View>
        <View style={[styles.skeleton, { width: 36, height: 14 }]} />
      </View>)}
    </View>
    <Copy style={[styles.muted, { textAlign: 'center', paddingTop: 8 }]}>Loading chats…</Copy>
  </View>;
  if (view === 'messages') return <View accessibilityLabel="Loading messages" accessibilityRole="progressbar" style={{ gap: 16 }}>
    {[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { height: 48, width: i === 1 ? '54%' : '68%', alignSelf: i === 1 ? 'flex-end' : 'flex-start' }]} />)}
  </View>;
  return <View accessibilityLabel="Loading groups" accessibilityRole="progressbar" style={{ gap: 20, paddingVertical: 8 }}>
    <View style={styles.row}>{[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { height: 44, flex: 1, borderRadius: 24 }]} />)}</View>
    {[0, 1, 2].map((i) => <View key={i} style={styles.row}><View style={[styles.skeleton, { width: 77, height: 79 }]} /><View style={{ flex: 1, gap: 10 }}>{[72, 45, 88].map((width) => <View key={width} style={[styles.skeleton, { height: 15, width: `${width}%` }]} />)}</View></View>)}
  </View>;
}
export function Empty({ title, description, action }: { title: string; description: string; action?: () => void }) {
  return <View style={styles.empty}><Icon name="group" size={38} /><Copy style={styles.subtitle}>{title}</Copy><Copy style={styles.muted}>{description}</Copy>{action && <Button label="Scan a code" onPress={action} />}</View>;
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (reason) { setError(errorMessage(reason)); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, run };
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 28, gap: 16 },
  copy: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  title: { fontSize: 35, lineHeight: 40, fontWeight: '700', letterSpacing: -1.2 },
  subtitle: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { minHeight: 50, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  subtle: { backgroundColor: colors.soft },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  input: { color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 50, fontSize: 16, backgroundColor: '#fff' },
  notice: { padding: 14, backgroundColor: colors.soft, borderRadius: 14, gap: 10 },
  skeleton: { borderRadius: 16, backgroundColor: '#e9ecf1' },
  empty: { minHeight: 330, paddingVertical: 32, justifyContent: 'center', alignItems: 'center', gap: 16 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 18 },
});
