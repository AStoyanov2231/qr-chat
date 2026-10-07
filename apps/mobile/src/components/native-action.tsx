import { Button, Host, RNHostView, type ButtonProps } from '@expo/ui';
import { Button as SwiftUIButton, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { buttonBorderShape, buttonStyle, controlSize, disabled, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { FilledIconButton } from '@expo/ui/jetpack-compose';
import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { View } from 'react-native';
import { colors, Icon } from './chat-ui';

type Props = Omit<ButtonProps, 'style'> & {
  align?: 'center' | 'flex-start' | 'flex-end';
  accessibilityLabel?: string;
  icon?: 'back' | 'settings' | 'close' | 'browser';
};

const systemImages = { back: 'chevron.left', settings: 'gearshape', close: 'xmark', browser: 'safari' } as const;

export function NativeAction({ align = 'center', accessibilityLabel, icon, ...buttonProps }: Props) {
  const activate = () => { if (!buttonProps.disabled) buttonProps.onPress?.(); };
  return <View accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? 'button' : undefined}
    accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!buttonProps.disabled }}
    accessibilityActions={accessibilityLabel ? [{ name: 'activate' }] : undefined}
    onAccessibilityTap={activate} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') activate(); }}
    style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: align }}>
    <View accessibilityElementsHidden={!!accessibilityLabel} importantForAccessibility={accessibilityLabel ? 'no-hide-descendants' : 'auto'}>
      <Host matchContents colorScheme="light" seedColor={colors.ink} style={{ minWidth: 44, minHeight: 44 }}>
        {icon ? process.env.EXPO_OS === 'ios'
          ? <SwiftUIButton onPress={buttonProps.onPress}
            modifiers={[buttonBorderShape('circle'), buttonStyle(isGlassEffectAPIAvailable() ? 'glass' : 'bordered'), controlSize('large'), tint(colors.ink), disabled(!!buttonProps.disabled)]}>
            <SwiftUIImage systemName={systemImages[icon]} size={20} modifiers={[frame({ width: 16, height: 16 })]} />
          </SwiftUIButton>
          : <FilledIconButton onClick={buttonProps.onPress} enabled={!buttonProps.disabled}
            colors={{ containerColor: '#fffffff0', contentColor: colors.ink, disabledContainerColor: '#ffffff78', disabledContentColor: colors.muted }}>
            <RNHostView matchContents><Icon name={icon} size={23} color={buttonProps.disabled ? colors.muted : colors.ink} /></RNHostView>
          </FilledIconButton>
          : <Button {...buttonProps} style={{ height: 44, paddingHorizontal: 10 }} />}
      </Host>
    </View>
  </View>;
}
