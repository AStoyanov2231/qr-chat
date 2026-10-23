import { useMemo } from 'react';
import { Image } from 'expo-image';
import QRCode from 'qrcode/lib/core/qrcode';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { groupInitials, type Group } from '@qr-chat/domain';
import { Copy, ErrorNotice, Icon, OwnerTag, colors, styles } from './chat-ui';
import { Avatar } from './avatar';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';

export function GroupQr({ code, size = 180 }: { code: string; size?: number }) {
  const uri = useMemo(() => {
    try {
      const { modules } = QRCode.create(code, { errorCorrectionLevel: 'M' });
      let path = '';
      for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
        if (modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
      const size = modules.size + 8;
      return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#111111"/></svg>`)}`;
    } catch { return null; }
  }, [code]);
  return uri ? <Image source={{ uri }} contentFit="contain" style={{ width: size, height: size, borderRadius: size * 2 / 15 }} accessibilityLabel="Group QR code" /> : <Copy>QR code could not be displayed.</Copy>;
}

export function GroupDetails({ group, onNavigate }: { group: Group; onNavigate?: () => void }) {
  const chat = useChat();
  const { userId } = useAuth();
  return <View style={{ flex: 1, gap: 14 }}>
    {group.venue.imageUrl
      ? <Image source={{ uri: group.venue.imageUrl }} contentFit="cover" style={{ marginHorizontal: -16, aspectRatio: 4 / 3, backgroundColor: colors.avatar }} />
      : <View style={{ marginHorizontal: -16, aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.avatar }}><Copy selectable={false} style={{ fontSize: 48, lineHeight: 56, fontWeight: '700' }}>{groupInitials(group.venue.name)}</Copy></View>}
    <Copy accessibilityRole="header" style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>{`${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`}</Copy>
    <ErrorNotice message={chat.error} />
    {group.members.map((member) => <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`View ${member.name}'s profile`} onPress={() => { onNavigate?.(); router.push(member.id === userId ? '/edit-profile' : { pathname: '/person/[id]', params: { id: member.id } }); }} style={[styles.row, { minHeight: 60, paddingVertical: 8 }]}>
      <Avatar name={member.name} url={member.avatarUrl} size={44} /><Copy style={{ flex: 1, fontSize: 16 }}>{member.id === userId ? 'You' : member.name}</Copy>{member.id === group.venue.place?.ownerId && <OwnerTag />}<Icon name="chevron" size={18} />
    </Pressable>)}
  </View>;
}
