import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { AvatarUpload } from '@qr-chat/api';

// The largest avatar on screen is 130 pt, about 390 px at 3x.
const AVATAR_PX = 400;

export type SelectedAvatar = { uri: string; upload: AvatarUpload };

export async function pickAvatar(): Promise<SelectedAvatar | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  // Same limits as web; HEIC is added because it is the iPhone camera's format. Either field may be missing, so only a known bad value fails.
  if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(asset.mimeType)) throw new Error('Choose a JPEG, PNG, WebP, or HEIC photo.');
  if (asset.fileSize && asset.fileSize > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  // ponytail: transparent pixels still turn black in the JPEG; expo-image-manipulator has no native background fill.
  // Flattening onto white needs a drawing dependency (e.g. @shopify/react-native-skia) if transparent PNGs matter.
  const size = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  context.crop({ originX: (asset.width - size) / 2, originY: (asset.height - size) / 2, width: size, height: size }).resize({ width: AVATAR_PX, height: AVATAR_PX });
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
