import { Button, Host, type ButtonProps } from '@expo/ui';
import { View } from 'react-native';
import { colors } from './chat-ui';

type Props = Omit<ButtonProps, 'style'> & {
  align?: 'center' | 'flex-start' | 'flex-end';
  accessibilityLabel?: string;
};

export function NativeAction({ align = 'center', accessibilityLabel, ...buttonProps }: Props) {
  const activate = () => { if (!buttonProps.disabled) buttonProps.onPress?.(); };
  return <View accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? 'button' : undefined}
    accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!buttonProps.disabled }}
    accessibilityActions={accessibilityLabel ? [{ name: 'activate' }] : undefined}
    onAccessibilityTap={activate} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') activate(); }}
    style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: align }}>
    <View accessibilityElementsHidden={!!accessibilityLabel} importantForAccessibility={accessibilityLabel ? 'no-hide-descendants' : 'auto'}>
      <Host matchContents colorScheme="light" seedColor={colors.ink} style={{ minWidth: 44, minHeight: 44 }}>
        <Button {...buttonProps} style={{ height: 44, paddingHorizontal: 10 }} />
      </Host>
    </View>
  </View>;
}
