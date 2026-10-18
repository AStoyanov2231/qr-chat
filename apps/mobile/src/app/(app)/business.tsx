import { useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Alert, BackHandler, Linking, Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import type { TextInputRef } from '@expo/ui';
import { SafeAreaView } from 'react-native-screens/experimental';
import { qrPayload } from '@qr-chat/domain';
import type { Place } from '@qr-chat/api';
import { placeLinkSchema } from '@qr-chat/validation';
import { Button, Copy, ErrorNotice, Icon, IconButton, NativeInput, PillButton, TextButton, colors, styles, useAction, type NativeInputProps } from '@/components/chat-ui';
import { GroupQr } from '@/components/group-details';
import { NativeAction } from '@/components/native-action';
import { qrPng } from '@/lib/qr-png';
import { webOrigin } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type BusinessApi = NonNullable<ReturnType<typeof useAuth>['api']>;
const placeUrl = (place: Place) => qrPayload(`v:${place.code}`, webOrigin);

/** Shares the printable QR as a PNG file, so owners can save, print or send it. */
async function shareQr(place: Place) {
  const name = place.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '') || 'place';
  const file = new File(Paths.cache, `${name}-qr.png`);
  file.write(qrPng(placeUrl(place)));
  await shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `QR code for ${place.name}` });
}

/** Business owners manage their places here; without the plan, places are read-only. */
export default function BusinessScreen() {
  const { api } = useAuth();
  const action = useAction();
  const [state, setState] = useState<{ business: boolean; places: Place[] } | null>(null);
  // The list is the home; "new" or a place opens the editor, which returns to the list when done.
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const load = useCallback(async () => {
    const [business, places] = await Promise.all([api!.isBusiness(), api!.places()]);
    setState({ business, places });
  }, [api]);
  useEffect(() => { void action.run(load); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = async () => { await load(); setEditing(null); };

  // Swiping back from the editor would leave Business entirely; its back button returns to the list.
  const gesture = <Stack.Screen options={{ gestureEnabled: !editing }} />;
  if (editing && state) return <>{gesture}<PlaceEditor place={editing === 'new' ? null : editing} readOnly={!state.business} api={api!} onDone={done} onBack={() => setEditing(null)} /></>;
  const hasPlaces = !!state?.places.length;
  return <Page title="Business" backLabel="Back" onBack={() => router.back()} onAdd={state?.business ? () => setEditing('new') : undefined}>
    {gesture}
    <ErrorNotice message={action.error} retry={state ? undefined : () => { void action.run(load); }} />
    {!state ? !action.error && <Copy style={styles.muted}>Loading your places…</Copy>
      : !state.business && !hasPlaces ? <Copy style={styles.muted}>This screen is for business accounts.</Copy>
      : <>
        {!state.business && <View accessibilityRole="alert" style={{ padding: 16, borderRadius: 20, backgroundColor: colors.warning }}>
          <Copy style={{ color: colors.onWarning, fontSize: 14, lineHeight: 20 }}>Your business plan is inactive. Your QR codes still work as normal group chats; renew the plan to edit your places again.</Copy>
        </View>}
        {!hasPlaces && <View style={{ gap: 8 }}>
          <Copy accessibilityRole="header" style={styles.subtitle}>Create your first place</Copy>
          <Copy style={styles.muted}>You get one QR code for it. Print it and put it on your tables; guests who scan it join your venue’s chat and can open your menu and link.</Copy>
          <View style={{ marginTop: 12 }}><Button label="Create place" onPress={() => setEditing('new')} /></View>
        </View>}
        {state.places.map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Edit ${place.name}`} onPress={() => setEditing(place)}
          style={({ pressed }) => [styles.row, { gap: 14, padding: 10, paddingRight: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: pressed ? colors.fill : colors.canvas }]}>
          <GroupQr code={placeUrl(place)} size={88} />
          <View style={{ flex: 1, gap: 2 }}>
            <Copy selectable={false} numberOfLines={1} style={{ fontWeight: '700' }}>{place.name}</Copy>
            <Copy selectable={false} numberOfLines={1} style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{place.link_url ? place.link_url.replace(/^https:\/\//u, '') : 'No link'}</Copy>
            <Copy selectable={false} numberOfLines={1} style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{place.menu_url ? 'Menu PDF' : 'No menu'}</Copy>
          </View>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Pressable>)}
      </>}
  </Page>;
}

/** Back button, title and an optional plus above a scrolling body; `footer` stays pinned to the bottom. */
function Page({ title, backLabel, onBack, onAdd, busy, footer, children }: PropsWithChildren<{ title: string; backLabel: string; onBack: () => void; onAdd?: () => void; busy?: boolean; footer?: ReactNode }>) {
  return <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} collapsable={false} style={styles.screen}>
    <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 8 }]}>
      <NativeAction icon="back" accessibilityLabel={backLabel} disabled={busy} onPress={onBack} />
      <Copy selectable={false} accessibilityRole="header" numberOfLines={1} style={[styles.title, { flex: 1 }]}>{title}</Copy>
      {onAdd && <NativeAction icon="plus" accessibilityLabel="Add a place" onPress={onAdd} />}
    </View>
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 24 }]} automaticallyAdjustKeyboardInsets
      keyboardDismissMode={process.env.EXPO_OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    {footer && <View style={{ gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.canvas }}>{footer}</View>}
  </SafeAreaView>;
}

/** The label sits inside the field and moves up once it has focus or a value. */
function FloatField({ label, hint, value, ...props }: Omit<NativeInputProps, 'accessibilityLabel' | 'onFocus' | 'onBlur'> & { label: string; hint?: string }) {
  const input = useRef<TextInputRef>(null);
  const [focused, setFocused] = useState(false);
  const up = focused || !!value;
  return <Pressable accessible={false} onPress={() => input.current?.focus()} style={[styles.input, { minHeight: 58, paddingTop: 20, paddingBottom: 4 }]}>
    <Copy selectable={false} style={[{ position: 'absolute', left: 21, color: colors.muted, pointerEvents: 'none' }, up ? { top: 7, fontSize: 12, lineHeight: 16, fontWeight: '700' } : { top: 17, fontSize: 16, lineHeight: 22 }]}>
      {label}{hint && <Copy style={{ color: colors.muted, fontSize: up ? 12 : 16, fontWeight: '400' }}> {hint}</Copy>}
    </Copy>
    <NativeInput ref={input} accessibilityLabel={label} value={value} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...props} />
  </Pressable>;
}

function PlaceEditor({ place, readOnly, api, onDone, onBack }: { place: Place | null; readOnly: boolean; api: BusinessApi; onDone: () => Promise<void>; onBack: () => void }) {
  const action = useAction();
  const [name, setName] = useState(place?.name ?? '');
  const [link, setLink] = useState(place?.link_url ?? '');
  const [menu, setMenu] = useState<File | null | undefined>();
  const [linkError, setLinkError] = useState('');
  // A new place is created before its link and menu are saved; if that second step fails, a retry must not create it twice.
  const created = useRef<Place | null>(null);
  const url = place && placeUrl(place);
  const disabled = readOnly || action.busy;
  const menuUrl = menu === undefined ? place?.menu_url : null;
  const back = () => { if (!action.busy) onBack(); };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  });
  const save = () => {
    // Checked here so a bad link never reaches the server, where a new place would already be created without it.
    const checked = placeLinkSchema.safeParse(link);
    if (!checked.success) { setLinkError(checked.error.issues[0]?.message ?? 'Enter a link that starts with https://'); return; }
    void action.run(async () => {
      const target = place ?? created.current ?? (created.current = await api.createPlace(name));
      const upload = menu ? { uploadId: randomUUID(), data: await menu.arrayBuffer() } : menu;
      if (place || link || upload) await api.updatePlace(target, { name, link, menu: upload });
      await onDone();
    });
  };
  return <Page title={place ? place.name : 'New place'} backLabel="Back to places" busy={action.busy} onBack={back}
    footer={!readOnly && <>
      <ErrorNotice message={action.error} />
      <Button label={action.busy ? 'Saving…' : place ? 'Save changes' : 'Create place'} disabled={action.busy || !name.trim()} onPress={save} />
    </>}>
    {readOnly && <ErrorNotice message={action.error} />}
    {place && url && <View style={[styles.row, { gap: 16, padding: 14, borderRadius: 24, backgroundColor: colors.fill }]}>
      <GroupQr code={url} size={132} />
      <View style={{ flex: 1, gap: 8, alignItems: 'flex-start' }}>
        <Copy style={{ fontSize: 14, lineHeight: 20 }}>Print it for your tables. Guests who scan it join this place’s chat.</Copy>
        <Copy style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>{url}</Copy>
        <PillButton fill={false} label="Share QR" disabled={action.busy} background={colors.canvas} foreground={colors.text} onPress={() => { void action.run(() => shareQr(place)); }} />
      </View>
    </View>}
    <FloatField label="Name" value={name} onChangeText={setName} maxLength={100} editable={!disabled} autoCapitalize="words" />
    <View style={{ gap: 8 }}>
      <FloatField label="Link" hint="(optional)" value={link} onChangeText={(value) => { setLink(value); setLinkError(''); }} maxLength={2048} editable={!disabled} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Copy accessibilityLiveRegion="polite" style={{ color: linkError ? colors.danger : colors.muted, fontSize: 13, lineHeight: 18 }}>{linkError || 'Your website or payment page. Guests open it from the group chat.'}</Copy>
    </View>
    <View style={{ gap: 8 }}>
      <Copy style={{ fontSize: 14, lineHeight: 20, fontWeight: '700' }}>Menu <Copy style={{ fontSize: 14, color: colors.muted, fontWeight: '400' }}>(optional)</Copy></Copy>
      <View style={[styles.row, { minHeight: 64, padding: 10, paddingLeft: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 20, backgroundColor: colors.fill, opacity: menu === null ? 0.7 : 1 }]}>
        <Icon name="pdf" size={28} />
        <View accessibilityLiveRegion="polite" style={{ flex: 1 }}>
          <Copy numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}
            {...(menuUrl && !menu ? { accessibilityRole: 'link' as const, onPress: () => { void Linking.openURL(menuUrl).catch(() => {}); } } : {})}>
            {menu ? menu.name : menu === null ? 'Menu will be removed' : menuUrl ? 'Current menu' : 'No menu yet'}
          </Copy>
          <Copy style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>{menu ? 'Uploads when you save' : menu === null ? 'When you save' : menuUrl ? 'Tap to view the PDF' : 'PDF, up to 10 MB'}</Copy>
        </View>
        {!readOnly && (menu !== undefined
          ? <TextButton label="Undo" disabled={action.busy} onPress={() => setMenu(undefined)} />
          : <>
            {menuUrl && <IconButton name="trash" label="Remove menu" onPress={() => { if (!action.busy) setMenu(null); }} />}
            <PillButton fill={false} label={menuUrl ? 'Replace' : 'Upload'} disabled={action.busy} background={colors.canvas} foreground={colors.text} onPress={() => {
              void File.pickFileAsync({ mimeTypes: ['application/pdf'] }).then((picked) => { if (!picked.canceled) setMenu(picked.result); }, () => {});
            }} />
          </>)}
      </View>
    </View>
    {!readOnly && place && <View style={{ alignSelf: 'flex-start' }}><TextButton label="Delete place" danger disabled={action.busy} onPress={() => Alert.alert(`Delete ${place.name}?`, 'Its QR code stops working and guests can no longer join.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void action.run(async () => { await api.deletePlace(place.id); await onDone(); }); } },
    ])} /></View>}
  </Page>;
}
