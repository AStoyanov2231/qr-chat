import { useState } from 'react';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { Copy, colors } from './chat-ui';

export function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}>
    {url && url !== failed ? <Image source={url} contentFit="cover" style={{ width: size, height: size }} onError={() => setFailed(url)} accessibilityElementsHidden />
      : <Copy style={{ fontSize: size / 3, lineHeight: size * 0.45, fontWeight: '600' }}>{name.slice(0, 2).toUpperCase() || '?'}</Copy>}
  </View>;
}
