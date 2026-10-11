import { Host, RNHostView, type ButtonProps } from '@expo/ui';
import { Button as SwiftUIButton, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { buttonBorderShape, buttonStyle, controlSize, disabled, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { FilledIconButton } from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';
import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { View } from 'react-native';
import { colors, Icon, PillButton } from './chat-ui';

type Props = Omit<ButtonProps, 'style'> & {
  align?: 'center' | 'flex-start' | 'flex-end';
  accessibilityLabel?: string;
  icon?: 'back' | 'settings' | 'close' | 'browser' | 'scan';
  /** Yellow 64pt primary action (the Scan FAB). */
  prominent?: boolean;
};

const systemImages = { back: 'chevron.left', settings: 'gearshape', close: 'xmark', browser: 'safari', scan: 'qrcode.viewfinder' } as const;
const labelColors = { filled: [colors.primary, colors.onPrimary], outlined: [colors.fill, colors.text], text: [undefined, colors.text] } as const;

export function NativeAction({ align = 'center', accessibilityLabel, icon, prominent = false, ...buttonProps }: Props) {
  const activate = () => { if (!buttonProps.disabled) buttonProps.onPress?.(); };
  const [background, foreground] = labelColors[buttonProps.variant ?? 'filled'];
  return <View accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? 'button' : undefined}
    accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!buttonProps.disabled }}
    accessibilityActions={accessibilityLabel ? [{ name: 'activate' }] : undefined}
    onAccessibilityTap={activate} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') activate(); }}
    style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: align }}>
    <View accessibilityElementsHidden={!!accessibilityLabel} importantForAccessibility={accessibilityLabel ? 'no-hide-descendants' : 'auto'}>
      {icon ? <Host matchContents colorScheme="light" seedColor={colors.text} style={{ minWidth: 44, minHeight: 44 }}>
        {process.env.EXPO_OS === 'ios'
          ? <SwiftUIButton onPress={buttonProps.onPress}
            modifiers={prominent
              ? [buttonBorderShape('circle'), buttonStyle(isGlassEffectAPIAvailable() ? 'glassProminent' : 'borderedProminent'), controlSize('large'), tint(colors.primary), foregroundStyle(colors.onPrimary), disabled(!!buttonProps.disabled)]
              : [buttonBorderShape('circle'), buttonStyle(isGlassEffectAPIAvailable() ? 'glass' : 'bordered'), controlSize('large'), tint(colors.text), disabled(!!buttonProps.disabled)]}>
            <SwiftUIImage systemName={systemImages[icon]} size={prominent ? 24 : 20} modifiers={[frame(prominent ? { width: 40, height: 40 } : { width: 16, height: 16 })]} />
          </SwiftUIButton>
          : <FilledIconButton onClick={buttonProps.onPress} enabled={!buttonProps.disabled} modifiers={prominent ? [size(64, 64)] : undefined}
            colors={prominent
              ? { containerColor: colors.primary, contentColor: colors.onPrimary, disabledContainerColor: colors.fill, disabledContentColor: colors.muted }
              : { containerColor: colors.floating, contentColor: colors.text, disabledContainerColor: colors.fill, disabledContentColor: colors.muted }}>
            <RNHostView matchContents><Icon name={icon} size={prominent ? 24 : 20} color={buttonProps.disabled ? colors.muted : prominent ? colors.onPrimary : colors.text} /></RNHostView>
          </FilledIconButton>}
      </Host>
        : <PillButton fill={false} label={buttonProps.label ?? ''} onPress={activate} disabled={buttonProps.disabled} background={background} foreground={foreground} />}
    </View>
  </View>;
}
