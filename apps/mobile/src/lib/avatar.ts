import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { AvatarUpload } from '@qr-chat/api';

export type SelectedAvatar = { uri: string; upload: AvatarUpload };

export async function pickAvatar(): Promise<SelectedAvatar | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  const size = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  context.crop({ originX: (asset.width - size) / 2, originY: (asset.height - size) / 2, width: size, height: size }).resize({ width: 512, height: 512 });
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    const data = await new File(saved.uri).arrayBuffer();
    return { uri: saved.uri, upload: { uploadId: randomUUID(), data } };
  } finally {
    image.release();
    context.release();
  }
}
