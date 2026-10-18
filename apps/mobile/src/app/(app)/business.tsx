import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Share, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { qrPayload } from '@qr-chat/domain';
import type { MenuUpload, Place } from '@qr-chat/api';
import { Button, Copy, ErrorNotice, Field, Screen, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { GroupQr } from '@/components/group-details';
import { webOrigin } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Business owners manage their places here; without the plan, places are read-only. */
export default function BusinessScreen() {
  const { api } = useAuth();
  const action = useAction();
  const [state, setState] = useState<{ business: boolean; places: Place[] } | null>(null);
  const [name, setName] = useState('');
  const load = useCallback(async () => {
    const [business, places] = await Promise.all([api!.isBusiness(), api!.places()]);
    setState({ business, places });
  }, [api]);
  useEffect(() => { void action.run(load); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (work: () => Promise<unknown>) => action.run(async () => { await work(); await load(); });
  return <Screen>
    <ErrorNotice message={action.error} />
    {state && !state.business && <Copy style={styles.muted}>{state.places.length ? 'Your business plan is inactive. Your QR codes still work as normal group chats; renew the plan to edit your places again.' : 'This screen is for business accounts.'}</Copy>}
    {state?.business && <View style={{ gap: 12 }}>
      <Field label="New place" value={name} onChangeText={setName} placeholder="Your venue’s name" maxLength={100} />
      <Button label="Create place" disabled={action.busy || !name.trim()} onPress={() => { void run(async () => { await api!.createPlace(name); setName(''); }); }} />
    </View>}
    {state?.places.map((place) => <PlaceCard key={place.id} place={place} readOnly={!state.business} busy={action.busy}
      onSave={(input) => run(() => api!.updatePlace(place, input))}
      onDelete={() => { void run(() => api!.deletePlace(place.id)); }} />)}
  </Screen>;
}

function PlaceCard({ place, readOnly, busy, onSave, onDelete }: { place: Place; readOnly: boolean; busy: boolean; onSave: (input: { name: string; link: string; menu?: MenuUpload | null }) => Promise<boolean>; onDelete: () => void }) {
  const [name, setName] = useState(place.name);
  const [link, setLink] = useState(place.link_url ?? '');
  const [menu, setMenu] = useState<File | null | undefined>();
  const url = qrPayload(`v:${place.code}`, webOrigin);
  const disabled = readOnly || busy;
  return <View style={{ gap: 12, padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 24 }}>
    <View style={{ alignItems: 'center', gap: 8 }}><GroupQr code={url} /><Copy style={styles.muted}>{url}</Copy></View>
    <TextButton label="Share QR link" onPress={() => { void Share.share({ message: url }).catch(() => {}); }} />
    <Field label="Name" value={name} onChangeText={setName} maxLength={100} editable={!disabled} />
    <Field label="Link (website or payments)" value={link} onChangeText={setLink} placeholder="https://" maxLength={2048} editable={!disabled} autoCapitalize="none" keyboardType="url" />
    <Copy style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>Menu (PDF, up to 10 MB)</Copy>
    <Copy style={styles.muted}>{menu ? menu.name : menu === null || !place.menu_url ? 'No menu' : 'Menu uploaded'}</Copy>
    {place.menu_url && menu === undefined && <TextButton label="View current menu" onPress={() => { void Linking.openURL(place.menu_url!).catch(() => {}); }} />}
    {!readOnly && <>
      <TextButton label="Choose PDF" disabled={busy} onPress={() => {
        void File.pickFileAsync({ mimeTypes: ['application/pdf'] }).then((picked) => { if (!picked.canceled) setMenu(picked.result); }, () => {});
      }} />
      {(place.menu_url || menu) && menu !== null && <TextButton label="Remove menu" disabled={busy} onPress={() => setMenu(null)} />}
      <Button label="Save" disabled={busy || !name.trim()} onPress={() => {
        void (async () => {
          const upload = menu ? { uploadId: randomUUID(), data: await menu.arrayBuffer() } : menu;
          if (await onSave({ name, link, menu: upload })) setMenu(undefined);
        })();
      }} />
      <Button label="Delete place" danger disabled={busy} onPress={() => Alert.alert(`Delete ${place.name}?`, 'Its QR code stops working.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onDelete },
      ])} />
    </>}
  </View>;
}
