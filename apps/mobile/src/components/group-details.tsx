import { useMemo } from 'react';
import { Image } from 'expo-image';
import QRCode from 'qrcode/lib/core/qrcode';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { Group } from '@qr-chat/domain';
import { Copy, ErrorNotice, Icon, colors, styles, useAction } from './chat-ui';
import { Avatar } from './avatar';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';

function GroupQr({ code }: { code: string }) {
  const uri = useMemo(() => {
    try {
      const { modules } = QRCode.create(code, { errorCorrectionLevel: 'M' });
      let path = '';
      for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
        if (modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
      const size = modules.size + 8;
      return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#101820"/></svg>`)}`;
    } catch { return null; }
  }, [code]);
  return uri ? <Image source={{ uri }} contentFit="contain" style={{ width: 180, height: 180, borderRadius: 18 }} accessibilityLabel="Group QR code" /> : <Copy>QR code could not be displayed.</Copy>;
}

export function GroupDetails({ group, onNavigate }: { group: Group; onNavigate?: () => void }) {
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  return <View style={{ flex: 1, gap: 14 }}>
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 18 }}>
      <GroupQr code={group.venue.codes[0]} />
      <Copy accessibilityRole="header" style={{ fontSize: 23, fontWeight: '600', textAlign: 'center' }}>{group.venue.name}</Copy>
      <Copy style={styles.muted}>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</Copy>
    </View>
    <ErrorNotice message={action.error || chat.error} />
    {group.members.map((member) => <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`View ${member.name}'s profile`} onPress={() => { onNavigate?.(); router.push(member.id === userId ? '/edit-profile' : { pathname: '/person/[id]', params: { id: member.id } }); }} style={[styles.row, { minHeight: 60, paddingVertical: 8 }]}>
      <Avatar name={member.name} url={member.avatarUrl} size={44} /><Copy style={{ flex: 1, fontSize: 16 }}>{member.id === userId ? 'You' : member.name}</Copy><Icon name="chevron" size={18} />
    </Pressable>)}
    <View style={{ marginTop: 'auto', paddingTop: 24 }}><Pressable accessibilityRole="button" accessibilityLabel="Leave group" accessibilityState={{ disabled: action.busy }} disabled={action.busy} style={({ pressed }) => [styles.row, { justifyContent: 'center', minHeight: 50, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.8)', opacity: action.busy ? 0.5 : pressed ? 0.7 : 1 }]} onPress={() => Alert.alert('Leave this group?', 'You can join again by scanning its QR code.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => { void action.run(async () => { await api!.leaveGroup(); await chat.refresh(); router.dismissTo('/'); }); } }])}><Icon name="exit" color={colors.danger} size={20} /><Copy style={{ color: colors.danger }}>Leave group</Copy></Pressable></View>
  </View>;
}
