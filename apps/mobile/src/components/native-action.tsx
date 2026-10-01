import { Button, Host, type ButtonProps } from '@expo/ui';
import { View } from 'react-native';
import { colors } from './chat-ui';

type Props = Omit<ButtonProps, 'style'> & {
  align?: 'center' | 'flex-start' | 'flex-end';
};

export function NativeAction({ align = 'center', ...buttonProps }: Props) {
  return <View style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: align }}>
    <Host matchContents colorScheme="light" seedColor={colors.ink} style={{ minWidth: 44, minHeight: 44 }}>
      <Button {...buttonProps} style={{ height: 44, paddingHorizontal: 10 }} />
    </Host>
  </View>;
}
