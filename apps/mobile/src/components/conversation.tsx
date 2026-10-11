import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { messageDayLabel, type Message } from '@qr-chat/domain';
import { Copy, ErrorNotice, Icon, NativeInput, Skeleton, TextButton, colors, styles, useAction } from './chat-ui';
import { Avatar } from './avatar';
import { useChatKeyboard } from '@/hooks/use-chat-keyboard';
import { useOutbox, type OutboxItem } from '@/hooks/use-outbox';

type Row = Message & { outbox?: OutboxItem };

type Props = {
  messages: Message[];
  userId: string;
  loading?: boolean;
  error: string;
  available: boolean;
  connected: boolean;
  nextCursor: number | null;
  loadOlder: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (body: string) => Promise<unknown>;
  unavailable: string;
  avatars?: boolean;
  emptyState?: ReactElement | null;
  composerLabel?: string;
  endedAction?: ReactNode;
  openProfile?: (message: Message) => void;
  canOpenProfile?: (message: Message) => boolean;
};

export function Conversation({ messages, userId, loading, error, available, connected, nextCursor, loadOlder, refresh, send, unavailable, avatars = false, emptyState, composerLabel = 'Message', endedAction, openProfile, canOpenProfile }: Props) {
  const [draft, setDraft] = useState('');
  const action = useAction();
  const outbox = useOutbox();
  const list = useRef<FlatList<Row>>(null);
  const insets = useSafeAreaInsets();
  const keyboard = useChatKeyboard();
  const bottomPadding = Math.max(insets.bottom, 12);
  const composer = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value + 8, bottomPadding) }));
  const sendDisabled = loading || !!error || !draft.trim();
  const pending: Row[] = outbox.visible(messages.map((message) => message.id))
    .map((item) => ({ id: item.key, user: userId, name: '', text: item.text, time: item.time, outbox: item }));
  const rows: Row[] = available ? [...messages, ...pending].reverse() : [];
  const deliver = async (body: string) => {
    const message = await send(body);
    void refresh().catch(() => {});
    return message;
  };

  // The draft clears and the message shows at once; the field stays editable so the keyboard stays open.
  function submit() {
    if (sendDisabled) return;
    outbox.send(draft, deliver);
    setDraft('');
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }

  return <View style={styles.screen}>
    <View style={{ paddingHorizontal: 16, gap: 8 }}>
      <ErrorNotice message={error || action.error} retry={() => { void action.run(refresh); }} />
      {!connected && !error && <Copy accessibilityLiveRegion="polite" style={styles.muted}>Reconnecting…</Copy>}
    </View>
    {loading ? <View style={{ flex: 1, padding: 16 }}><Skeleton view="messages" /></View> : <FlatList
      ref={list}
      inverted
      data={rows}
      keyExtractor={(message) => message.id}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode={process.env.EXPO_OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8, flexGrow: 1, justifyContent: available && !rows.length && emptyState ? 'center' : !rows.length ? 'flex-end' : undefined }}
      maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 100 }}
      ListEmptyComponent={available ? emptyState : <Copy style={[styles.muted, { padding: 20, textAlign: 'center' }]}>{unavailable}</Copy>}
      ListFooterComponent={<View style={{ gap: 16 }}>{available && nextCursor !== null && <TextButton label="Load older messages" disabled={action.busy} onPress={() => { void action.run(loadOlder); }} />}</View>}
      renderItem={({ item, index }) => {
        const own = item.user === userId;
        const profileAvailable = !!openProfile && !!canOpenProfile?.(item);
        const day = messageDayLabel(item.time, rows[index + 1]?.time);
        const failed = item.outbox?.failed;
        return <View style={{ gap: 8 }}>
          {day && <View style={{ alignSelf: 'center', height: 24, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.fill, marginVertical: 8 }}><Copy style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.muted }}>{day}</Copy></View>}
          <View style={{ flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
            {avatars && !own && <Pressable accessibilityRole={profileAvailable ? 'button' : undefined} accessibilityLabel={profileAvailable ? `View ${item.name}'s profile` : undefined} disabled={!profileAvailable} onPress={() => openProfile?.(item)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Avatar name={item.name} url={item.avatarUrl} size={32} /></Pressable>}
            <View style={{ maxWidth: '78%', gap: 4 }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, borderCurve: 'continuous', backgroundColor: own ? colors.secondary : colors.fill }}><Copy style={{ fontSize: 16, lineHeight: 22, color: own ? colors.onSecondary : colors.text }}>{item.text}</Copy></View>
              {failed && <Copy style={{ alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.danger }}>Not sent. Tap ! to retry</Copy>}
            </View>
            {failed && <Pressable accessibilityRole="button" accessibilityLabel="Message not sent. Retry" onPress={() => outbox.retry(item.outbox!, deliver)} style={{ width: 44, height: 44, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}><Copy selectable={false} style={{ color: '#fff', fontSize: 14, lineHeight: 18, fontWeight: '800' }}>!</Copy></View>
            </Pressable>}
          </View>
        </View>;
      }}
    />}
    <Animated.View style={[{ paddingHorizontal: 16, paddingTop: 8 }, composer]}>
      {available ? <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingLeft: 14, paddingRight: 3, paddingVertical: 3, borderRadius: 26, backgroundColor: colors.fill, borderWidth: 1, borderColor: colors.line }}>
        <NativeInput accessibilityLabel={composerLabel} placeholder="Message…" value={draft} onChangeText={setDraft} maxLength={4000} multiline containerStyle={{ flex: 1, minWidth: 0, minHeight: 44, maxHeight: 150 }} style={{ paddingHorizontal: 4, paddingVertical: 11 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: sendDisabled }} disabled={sendDisabled} onPress={submit} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.primary, opacity: sendDisabled ? 0.4 : 1, transform: [{ scale: pressed ? 1.08 : 1 }] })}>
          <Icon name="arrow" size={20} color={colors.onPrimary} />
        </Pressable>
      </View> : !loading && endedAction}
    </Animated.View>
  </View>;
}
