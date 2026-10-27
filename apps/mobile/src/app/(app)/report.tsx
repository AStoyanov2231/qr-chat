import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';
import { reportReasons, type ReportReason } from '@qr-chat/validation';
import { Button, Copy, ErrorNotice, Field, Icon, Screen, colors, styles, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';
import { notify } from '@/lib/notice';

/** Reports a user (`userId`) or a group (`groupId`); `name` is shown in the title. */
export default function ReportScreen() {
  const { userId, groupId, name } = useLocalSearchParams<{ userId?: string; groupId?: string; name?: string }>();
  const { api } = useAuth();
  const action = useAction();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  return <Screen>
    <Stack.Screen options={{ title: `Report ${name ?? ''}`.trim() }} />
    <Copy style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>What’s wrong?</Copy>
    {(Object.keys(reportReasons) as ReportReason[]).map((key) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: reason === key, disabled: action.busy }} disabled={action.busy} onPress={() => setReason(key)}
      style={[styles.row, { minHeight: 44, justifyContent: 'space-between' }]}>
      <Copy selectable={false}>{reportReasons[key]}</Copy>{reason === key && <Icon name="check" size={20} color={colors.text} />}
    </Pressable>)}
    <Field label="Details (optional)" value={details} onChangeText={setDetails} maxLength={500} multiline editable={!action.busy} />
    <ErrorNotice message={action.error} />
    <Button label={action.busy ? 'Sending…' : 'Send report'} disabled={action.busy || !reason} onPress={() => { void action.run(async () => {
      await api!.report(userId ? { userId } : { groupId: groupId ?? '' }, { reason, details });
      notify('Thanks for the report. We’ll review it.');
      router.back();
    }); }} />
  </Screen>;
}
