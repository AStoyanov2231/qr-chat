import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Host, TextInput as NativeTextInput, type TextInputProps as NativeTextInputProps, type TextInputRef } from '@expo/ui';
import { Button as SwiftUIButton, Text as SwiftUIText, useNativeState } from '@expo/ui/swift-ui';
import { accessibilityLabel as nativeAccessibilityLabel, buttonBorderShape, buttonStyle, controlSize, disabled as disabledModifier, font, foregroundStyle, frame, ignoreSafeArea, tint } from '@expo/ui/swift-ui/modifiers';
import { Button as ComposeButton, Text as ComposeText } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, height } from '@expo/ui/jetpack-compose/modifiers';
import { Image } from 'expo-image';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { errorMessage } from '@/providers/chat-provider';

// QR Chat Design System v2 (light). Source: https://claude.ai/artifact/L4fXiY3xa6KRj6vPfez5fA
export const colors = {
  canvas: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#66635c', line: '#ece9e2', fill: '#f3f1ec',
  primary: '#ffc629', onPrimary: '#111111', primaryTint: '#fff1bf', onPrimaryTint: '#5a4a12', secondary: '#2d4bd1', onSecondary: '#ffffff',
  avatar: '#ece9e2', online: '#22b35e', danger: '#c42b2b', dangerTint: '#fdecec', warning: '#ffe4d1', onWarning: '#7a3410', floating: 'rgba(255,255,255,0.94)', photo: '#5b5a55',
  onDanger: '#ffffff', onPhoto: '#ffffff', onPhotoMuted: 'rgba(255,255,255,0.76)', onPhotoLine: 'rgba(255,255,255,0.92)',
  photoScrim: 'rgba(10,20,30,0.29)', // web fades 0.2 to 0.38; flat mean, no expo-linear-gradient
  shadowText: 'rgba(0,0,0,0.4)', scrimLight: 'rgba(17,17,17,0.12)', floatingGlass: 'rgba(255,255,255,0.55)',
  camera: '#07090b', cameraSheet: 'rgba(7,9,11,0.9)', cameraShade: 'rgba(3,5,7,0.48)',
};
export const shadowFloat = '0 1px 2px rgba(17,17,17,0.08), 0 8px 24px rgba(17,17,17,0.12)';
const symbols = {
  back: ['chevron.left', 'arrow_back'], send: ['paperplane', 'send'], exit: ['rectangle.portrait.and.arrow.right', 'logout'],
  qr: ['qrcode', 'qr_code'],
  scan: ['qrcode.viewfinder', 'qr_code_scanner'], group: ['person.2', 'group'], user: ['person', 'person'],
  settings: ['gearshape', 'settings'], edit: ['pencil', 'edit'], search: ['magnifyingglass', 'search'],
  arrow: ['arrow.up', 'arrow_upward'], chevron: ['chevron.right', 'chevron_right'], light: ['lightbulb', 'lightbulb'],
  lock: ['lock', 'lock'],
  block: ['nosign', 'block'], userMinus: ['person.badge.minus.fill', 'person_remove'],
  check: ['checkmark', 'check'], userPlus: ['person.badge.plus.fill', 'person_add'],
  help: ['questionmark.circle', 'help'], pin: ['mappin', 'location_on'], close: ['xmark', 'close'],
  browser: ['safari', 'open_in_browser'], plus: ['plus', 'add'], business: ['storefront', 'storefront'],
  pdf: ['doc.richtext', 'picture_as_pdf'], link: ['link', 'link'], trash: ['trash', 'delete'], share: ['square.and.arrow.up', 'share'],
} as const;
export type IconName = keyof typeof symbols;
export function Icon({ name, size = 25, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  const [ios, android] = symbols[name];
  if (process.env.EXPO_OS === 'ios') return <Image source={`sf:${ios}`} tintColor={color} style={{ width: size, height: size }} accessibilityElementsHidden />;
  return <View collapsable={false} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><SymbolView name={{ android: android as AndroidSymbol }} tintColor={color} size={size} style={{ width: size, height: size }} /></View>;
}
export function Copy({ style, ...props }: TextProps) { return <Text {...props} style={[styles.copy, style]} />; }
export function Screen({ children, contentContainerStyle }: PropsWithChildren<{ contentContainerStyle?: StyleProp<ViewStyle> }>) {
  // Bound the viewport before flex layout so footers cannot grow behind native bars.
  return <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} collapsable={false} style={styles.screen}>
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentContainerStyle]}
      contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
      automaticallyAdjustKeyboardInsets keyboardDismissMode={process.env.EXPO_OS === 'ios' ? 'interactive' : 'on-drag'}
      alwaysBounceVertical={false} overScrollMode="auto" keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </SafeAreaView>;
}
/** SwiftUI / Jetpack Compose pill button. `fill` stretches it across forms; ghost buttons have no background. */
export function PillButton({ label, onPress, disabled, background, foreground, fill }: { label: string; onPress: () => void; disabled?: boolean; background?: string; foreground: string; fill: boolean }) {
  return <Host matchContents={fill ? { vertical: true } : true} colorScheme="light" style={fill ? { alignSelf: 'stretch' } : { alignSelf: 'center', minHeight: 44 }}>
    {process.env.EXPO_OS === 'ios'
      ? <SwiftUIButton onPress={onPress} modifiers={[buttonStyle(background ? 'borderedProminent' : 'borderless'), buttonBorderShape('capsule'), controlSize('large'), ...(background ? [tint(background)] : []), foregroundStyle(foreground), disabledModifier(!!disabled)]}>
        <SwiftUIText modifiers={[font({ size: 16, weight: 'bold' }), ...(fill ? [frame({ maxWidth: Infinity, minHeight: 36 })] : [])]}>{label}</SwiftUIText>
      </SwiftUIButton>
      : <ComposeButton onClick={onPress} enabled={!disabled} modifiers={fill ? [fillMaxWidth(), height(52)] : [height(44)]}
        colors={{ containerColor: background ?? 'transparent', contentColor: foreground, disabledContainerColor: background ? colors.fill : 'transparent', disabledContentColor: colors.muted }}>
        <ComposeText style={{ fontSize: 16, fontWeight: 'bold' }}>{label}</ComposeText>
      </ComposeButton>}
  </Host>;
}
export function Button({ label, onPress, disabled, subtle = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; subtle?: boolean; danger?: boolean }) {
  const [background, foreground] = danger ? [colors.dangerTint, colors.danger] : subtle ? [colors.fill, colors.text] : [colors.primary, colors.onPrimary];
  return <PillButton fill label={label} onPress={onPress} disabled={disabled} background={background} foreground={foreground} />;
}
export function IconButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} hitSlop={4} style={styles.iconButton}><Icon name={name} size={20} /></Pressable>;
}
export function TextButton({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <PillButton fill={false} label={label} onPress={onPress} disabled={disabled} foreground={danger ? colors.danger : colors.text} />;
}
export type NativeInputProps = Omit<NativeTextInputProps, 'value'> & { value: string; accessibilityLabel: string; containerStyle?: StyleProp<ViewStyle> };
export function NativeInput({ value, accessibilityLabel, containerStyle, onChangeText, ...props }: NativeInputProps) {
  const text = useNativeState(value);
  const [editedValue, setEditedValue] = useState(value);
  const processedEdit = useRef(editedValue);
  // Native typing already updates the observable; only write back external changes.
  useEffect(() => {
    const fromTyping = value === editedValue && editedValue !== processedEdit.current;
    processedEdit.current = editedValue;
    if (!fromTyping && text.get() !== value) text.set(value);
  }, [text, value, editedValue]);
  return <Host matchContents={{ vertical: true }} colorScheme="light" seedColor={colors.text} accessibilityLabel={accessibilityLabel}
    style={containerStyle}>
    <NativeTextInput placeholderTextColor={colors.muted} textStyle={{ color: colors.text, fontSize: 16 }} {...props} value={text}
      onChangeText={(next) => { setEditedValue(next); onChangeText?.(next); }}
      // Screens already move fields above the keyboard; SwiftUI's own avoidance would shift the text inside them.
      modifiers={process.env.EXPO_OS === 'ios' ? [...(props.modifiers ?? []), nativeAccessibilityLabel(accessibilityLabel), ignoreSafeArea({ regions: 'keyboard' })] : props.modifiers} />
  </Host>;
}
/** Empties a text field in one tap; sits at the end of the field's box. */
export function ClearButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ position: 'absolute', right: 4, top: '50%', marginTop: -22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={16} color={colors.muted} /></Pressable>;
}
export function Field({ label, containerStyle, value, onChangeText, ...props }: Omit<NativeInputProps, 'accessibilityLabel'> & { label: string }) {
  const input = useRef<TextInputRef>(null);
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 8 }}><Copy style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{label}</Copy>
    <View style={[styles.input, { paddingRight: 52 }, containerStyle]}>
      <NativeInput ref={input} accessibilityLabel={label} value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...props} />
      {focused && !!value && props.editable !== false && <ClearButton label={`Clear ${label.toLowerCase()}`} onPress={() => { onChangeText?.(''); input.current?.focus(); }} />}
    </View></View>;
}
/** Marks the venue's owner in its group: a 24 tag on the primary tint. */
export function OwnerTag() {
  return <View style={{ alignSelf: 'flex-start', height: 24, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.primaryTint }}><Copy selectable={false} style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.onPrimaryTint }}>Owner</Copy></View>;
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}><Copy style={{ color: colors.danger }}>{message}</Copy>{retry && <Button label="Retry" onPress={retry} subtle />}</View>;
}
/** Placeholder bars that pulse together (web shimmers); still under reduced motion. */
export function Skeleton(props: Parameters<typeof SkeletonBody>[0]) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => { if (!reduced) opacity.value = withRepeat(withTiming(0.5, { duration: 800 }), -1, true); }, [reduced, opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={pulse}><SkeletonBody {...props} /></Animated.View>;
}
function SkeletonBody({ profile = false, view = 'groups' }: { profile?: boolean; view?: 'home' | 'groups' | 'chats' | 'messages' }) {
  if (profile) return <View accessibilityLabel="Loading profile" accessibilityRole="progressbar" style={{ gap: 16, alignItems: 'center', paddingTop: 10 }}>
    <View style={[styles.skeleton, { height: 130, width: 130, borderRadius: 65 }]} />
    <View style={[styles.skeleton, { width: 164, height: 28 }]} /><View style={[styles.skeleton, { width: 105, height: 17 }]} />
    {[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { height: 57, width: '100%' }]} />)}
  </View>;
  if (view === 'home') return <View accessibilityLabel="Loading chats" accessibilityRole="progressbar" style={{ flex: 1, gap: 8, paddingHorizontal: 10 }}>
    {[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { width: 138, height: 38 }]} />)}
    <View style={[styles.skeleton, { width: 184, height: 24, marginTop: 10 }]} />
    <View style={[styles.skeleton, { width: 145, height: 145, borderRadius: 73, alignSelf: 'center', marginVertical: 38 }]} />
    <View style={[styles.skeleton, { height: 92, marginTop: 'auto' }]} />
  </View>;
  if (view === 'chats') {
    const row = (index: number) => <View key={index} style={[styles.row, { minHeight: 72, gap: 12, paddingVertical: 10, paddingHorizontal: 8 }]}>
      <View style={[styles.skeleton, { width: 52, height: 52, borderRadius: 26 }]} />
      <View style={{ flex: 1, gap: 8 }}><View style={[styles.skeleton, { width: '70%', height: 14 }]} /><View style={[styles.skeleton, { width: '50%', height: 12 }]} /></View>
      <View style={[styles.skeleton, { width: 36, height: 12 }]} />
    </View>;
    return <View accessibilityLabel="Loading chats" accessibilityRole="progressbar" style={{ gap: 8 }}>
      {[0, 1, 2, 3, 4].map(row)}
      <Copy style={[styles.muted, { textAlign: 'center', marginTop: 16 }]}>Loading chats…</Copy>
    </View>;
  }
  if (view === 'messages') return <View accessibilityLabel="Loading messages" accessibilityRole="progressbar" style={{ gap: 16 }}>
    {[0, 1, 2].map((i) => <View key={i} style={[styles.skeleton, { height: 44, borderRadius: 24, width: i === 1 ? '54%' : '68%', alignSelf: i === 1 ? 'flex-end' : 'flex-start' }]} />)}
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
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 },
  copy: { color: colors.text, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  input: { color: colors.text, borderWidth: 1, borderColor: colors.line, borderRadius: 26, paddingHorizontal: 20, minHeight: 52, justifyContent: 'center', backgroundColor: colors.fill },
  notice: { padding: 16, backgroundColor: colors.fill, borderRadius: 24, gap: 12 },
  skeleton: { borderRadius: 999, backgroundColor: colors.fill },
  empty: { minHeight: 330, paddingVertical: 32, justifyContent: 'center', alignItems: 'center', gap: 16 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 24, paddingHorizontal: 16 },
  // Rounded sheet that overlaps a photo header, matching the conversation surface.
  profileSurface: { flex: 1, marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.canvas, padding: 16, gap: 16 },
});
