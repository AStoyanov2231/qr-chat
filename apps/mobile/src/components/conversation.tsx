import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';
import type { Message } from '@qr-chat/domain';
import { Copy, ErrorNotice, Icon, Skeleton, TextButton, colors, styles, useAction } from './chat-ui';
import { Avatar } from './avatar';

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
  intro?: ReactNode;
  emptyState?: ReactElement | null;
  composerLabel?: string;
  endedAction?: ReactNode;
  openProfile?: (message: Message) => void;
  canOpenProfile?: (message: Message) => boolean;
};

export function Conversation({ messages, userId, loading, error, available, connected, nextCursor, loadOlder, refresh, send, unavailable, avatars = false, intro, emptyState, composerLabel = 'Message', endedAction, openProfile, canOpenProfile }: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const action = useAction();
  const list = useRef<FlatList<Message>>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const sendDisabled = action.busy || sending || loading || !!error || !draft.trim();

  async function submit() {
    if (sendDisabled) return;
    setSending(true);
    try {
      await action.run(async () => {
        await send(draft);
        setDraft('');
        await refresh();
        list.current?.scrollToOffset({ offset: 0, animated: false });
      });
    } finally {
      setSending(false);
    }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <View style={{ paddingHorizontal: 22, gap: 8 }}>
      <ErrorNotice message={error || action.error} retry={() => { void action.run(refresh); }} />
      {!connected && available && !error && <Copy accessibilityLiveRegion="polite" style={styles.muted}>Reconnecting…</Copy>}
    </View>
    {loading ? <View style={{ flex: 1, padding: 22 }}><Skeleton view="messages" /></View> : <FlatList
      ref={list}
      inverted
      data={available ? [...messages].reverse() : []}
      keyExtractor={(message) => message.id}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={process.env.EXPO_OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 24, gap: 12, flexGrow: 1, justifyContent: available && !messages.length && emptyState ? 'center' : !available || !messages.length ? 'flex-end' : undefined }}
      maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 100 }}
      ListEmptyComponent={available ? emptyState === undefined ? <Copy style={[styles.muted, { padding: 20, textAlign: 'center' }]}>Be the first to say hello.</Copy> : emptyState : <Copy style={[styles.muted, { padding: 20, textAlign: 'center' }]}>{unavailable}</Copy>}
      ListFooterComponent={<View style={{ gap: 16 }}>{intro}{available && nextCursor !== null && <TextButton label="Load older messages" disabled={action.busy} onPress={() => { void action.run(loadOlder); }} />}</View>}
      renderItem={({ item }) => {
        const own = item.user === userId;
        const profileAvailable = !!openProfile && !!canOpenProfile?.(item);
        return <View style={{ flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 10 }}>
          {avatars && <Pressable accessibilityRole={profileAvailable ? 'button' : undefined} accessibilityLabel={profileAvailable ? `View ${item.name}'s profile` : undefined} disabled={!profileAvailable} onPress={() => openProfile?.(item)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Avatar name={item.name} url={item.avatarUrl} size={32} /></Pressable>}
          <View style={{ maxWidth: '74%', gap: 4 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: own ? 'flex-end' : 'flex-start' }}>
              <Pressable accessibilityRole={profileAvailable ? 'button' : undefined} accessibilityLabel={profileAvailable ? `Open ${item.name}'s profile` : undefined} disabled={!profileAvailable} onPress={() => openProfile?.(item)} style={{ minHeight: profileAvailable ? 44 : undefined, justifyContent: 'center' }}><Copy style={{ fontSize: 12, color: colors.muted }}>{own ? 'You' : item.name}</Copy></Pressable>
            </View>
            <View style={{ paddingHorizontal: 14, paddingVertical: 11, borderRadius: 17, borderTopRightRadius: own ? 6 : 17, borderTopLeftRadius: own ? 17 : 6, backgroundColor: own ? colors.blue : colors.soft }}><Copy style={{ fontSize: 14, lineHeight: 21 }}>{item.text}</Copy></View>
            <Copy style={{ fontSize: 11, color: colors.muted, textAlign: 'right' }}>{new Date(item.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Copy>
          </View>
        </View>;
      }}
    />}
    <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }}>
      {available ? <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 30, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line }}>
        <TextInput accessibilityLabel={composerLabel} placeholder={`${composerLabel}…`} placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} maxLength={4000} multiline editable={!action.busy && !sending} style={{ flex: 1, minWidth: 0, minHeight: 48, maxHeight: 150, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16, color: colors.ink }} />
        <Pressable accessibilityRole="button" accessibilityLabel={sending ? 'Sending message' : 'Send message'} accessibilityState={{ disabled: sendDisabled }} disabled={sendDisabled} onPress={() => { void submit(); }} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.ink, opacity: sendDisabled && !sending ? 0.45 : pressed ? 0.75 : 1 })}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="arrow" size={20} color="#fff" />}
        </Pressable>
      </View> : !loading && endedAction}
    </View>
  </KeyboardAvoidingView>;
}
