import { Easing, KeyboardState, useAnimatedKeyboard, useDerivedValue, withTiming } from 'react-native-reanimated';

const easing = Easing.bezier(0.22, 0.61, 0.36, 1);

/** Web parity: the composer rides the keyboard, and the chat surface slides over the header while it is up. */
export function useChatKeyboard() {
  const keyboard = useAnimatedKeyboard();
  const expanded = useDerivedValue(() => withTiming(
    keyboard.state.value === KeyboardState.OPENING || keyboard.state.value === KeyboardState.OPEN ? 1 : 0,
    { duration: 260, easing },
  ));
  return { height: keyboard.height, expanded };
}
