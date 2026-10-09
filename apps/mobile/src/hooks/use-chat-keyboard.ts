import { useAnimatedKeyboard } from 'react-native-reanimated';

/** The composer rides the keyboard. */
export function useChatKeyboard() {
  const keyboard = useAnimatedKeyboard();
  return { height: keyboard.height };
}
