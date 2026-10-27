import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, Icon } from './chat-ui';

export function SettingsSidebar({ label, onClose, children }: { label: string; onClose: () => void; children: (close: () => void) => ReactNode }) {
  const [progress] = useState(() => new Animated.Value(1));
  const [closing, setClosing] = useState(false);
  const { width } = useWindowDimensions();
  const sidebarWidth = Math.min(width * 0.72, 350);
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  useEffect(() => () => { progress.stopAnimation(); }, [progress]);
  function close() {
    if (closing) return;
    setClosing(true);
    Animated.timing(progress, { toValue: 1, duration: reduceMotion ? 0 : 240, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  }
  return <Modal transparent visible animationType="none" onShow={() => { if (!closing) Animated.timing(progress, { toValue: 0, duration: reduceMotion ? 0 : 240, useNativeDriver: true }).start(); }} onRequestClose={close}>
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.scrimLight }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label.toLowerCase()}`} onPress={close} style={{ flex: 1 }} />
      <Animated.View accessibilityViewIsModal style={{ width: sidebarWidth, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, sidebarWidth] }) }], overflow: 'hidden', backgroundColor: isGlassEffectAPIAvailable() ? colors.floatingGlass : colors.floating, paddingBottom: insets.bottom, borderTopLeftRadius: 24, borderBottomLeftRadius: 24 }}>
        {isGlassEffectAPIAvailable() && <GlassView glassEffectStyle="regular" colorScheme="light" style={{ position: 'absolute', inset: 0 }} />}
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label.toLowerCase()}`} onPress={close} style={{ position: 'absolute', top: insets.top + 8, right: 16, zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.fill }}><Icon name="close" size={20} /></Pressable>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: 24 }}>
          {children(close)}
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}
