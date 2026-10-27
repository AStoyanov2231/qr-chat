"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatSnapshot, Place, Tables } from "@qr-chat/api";
import { avatarUploadSchema, codeKeySchema, displayNameSchema, menuUploadSchema, messageBodySchema, placeLinkSchema, placeNameSchema, profileSchema } from "@qr-chat/validation";
import { groupFallbackName } from "@qr-chat/domain";
import { ChatView, type ChatViewApi, type ChatViewBackend } from "./mobile-chat";
import { BusinessView, type BusinessApi } from "./business-view";

type Friend = ChatSnapshot["friends"][number];

const localUserId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const avatar = "/design-preview/avatar.svg";
const peerId = (index: number) => `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
const connectionId = (index: number) => `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`;
const idle = async () => {};

function sampleSnapshot(now: number): ChatSnapshot {
  const created_at = new Date(now - 86400000).toISOString();
  const profile = (id: string, name: string): NonNullable<Friend["user_a"]> => ({ id, display_name: name, avatar_path: null, avatar_url: avatar, created_at });
  const names = ["Andy", "Daniel", "Mira", "Sam"];
  return {
    session: { id: localUserId, name: "Local designer", avatarUrl: avatar, hidden: [] },
    groups: [{
      id: groupId,
      venue: { id: groupId, name: "Cafe Central", label: "Local design preview", kind: "cafe", codes: ["https://qrchat.example/cafe-central"] },
      members: [{ id: localUserId, name: "Local designer", avatarUrl: avatar }, ...names.slice(0, 3).map((name, index) => ({ id: peerId(index), name, avatarUrl: avatar }))],
      messages: [
        { id: "1", user: peerId(0), name: "Andy", avatarUrl: avatar, text: "Hey! Anyone here for a coffee? ☕", time: now - 15 * 60000 },
        { id: "2", user: peerId(1), name: "Daniel", avatarUrl: avatar, text: "This place is awesome!", time: now - 14 * 60000 },
        { id: "3", user: localUserId, name: "Local designer", avatarUrl: avatar, text: "Totally agree! 🔥", time: now - 13 * 60000 },
        { id: "4", user: peerId(2), name: "Mira", avatarUrl: avatar, text: "Let’s grab a table by the window.", time: now - 12 * 60000 },
      ],
      nextCursor: null,
      expiresAt: new Date(now + 15 * 3600000).toISOString(),
    }],
    friends: names.map((name, index) => ({
      id: connectionId(index), group_id: connectionId(index), user_a_id: localUserId, user_b_id: peerId(index), requested_by_id: peerId(index),
      requested_at: created_at, accepted_at: index === 3 ? null : created_at,
      user_a: profile(localUserId, "Local designer"), user_b: profile(peerId(index), name),
    })),
    directPreviews: {},
    unread: { [groupId]: 2, [connectionId(0)]: 1 },
  };
}

function sampleDirectMessages(now: number): Tables<"messages">[] {
  return [0, 1, 2].flatMap((index) => [
    { id: index * 10 + 1, group_id: connectionId(index), sender_id: peerId(index), body: "Hey, how are you? 😊", client_id: null, created_at: new Date(now - 8 * 60000).toISOString() },
    { id: index * 10 + 2, group_id: connectionId(index), sender_id: localUserId, body: "All good! What are you up to these days?", client_id: null, created_at: new Date(now - 7 * 60000).toISOString() },
    { id: index * 10 + 3, group_id: connectionId(index), sender_id: peerId(index), body: "Just working and chilling. You?", client_id: null, created_at: new Date(now - 6 * 60000).toISOString() },
  ]);
}

/** Preview commands update only this component's memory and never contact Supabase. */
export function DesignPreview({ view, initialTime }: { view: "chats" | "profile"; initialTime: number }) {
  const [snapshot, setSnapshot] = useState(() => sampleSnapshot(initialTime));
  const [directRows, setDirectRows] = useState(() => sampleDirectMessages(initialTime));
  const [directId, setDirectId] = useState<string | null>(null);
  const photoUrls = useRef<string[]>([]);
  const blockedPeers = useRef(new Set<string>());
  useEffect(() => () => { photoUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    // Local fixture control for rendered scanner entry/expiry regressions only.
    const change = (event: Event) => setSnapshot((current) => ({
      ...current, groups: [],
      ...((event as CustomEvent).detail === "empty" ? { friends: [], directPreviews: {} } : {}),
    }));
    window.addEventListener("qrchat-preview-state", change);
    return () => window.removeEventListener("qrchat-preview-state", change);
  }, []);

  const api = useMemo<ChatViewApi>(() => ({
    async saveProfile(input) {
      const { display_name } = profileSchema.parse(input);
      setSnapshot((current) => ({ ...current, session: current.session && { ...current.session, name: display_name } }));
    },
    async saveProfileWithAvatar(input, photo) {
      const name = displayNameSchema.parse(input);
      let url: string | null | undefined;
      if (photo) {
        url = URL.createObjectURL(new Blob([new Uint8Array(photo.data)], { type: "image/jpeg" }));
        photoUrls.current.push(url);
      } else if (photo === null) url = null;
      setSnapshot((current) => ({ ...current, session: current.session && { ...current.session, name, ...(url === undefined ? {} : { avatarUrl: url }) } }));
    },
    async sendGroupMessage(id, input) {
      const text = messageBodySchema.parse(input);
      setSnapshot((current) => ({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, messages: [...group.messages, { id: crypto.randomUUID(), user: localUserId, name: current.session!.name, avatarUrl: current.session!.avatarUrl, text, time: Date.now() }] } : group) }));
    },
    async sendDirectMessage(id, input) {
      const body = messageBodySchema.parse(input);
      setDirectRows((rows) => [...rows, { id: Math.max(0, ...rows.map((row) => row.id)) + 1, group_id: id, sender_id: localUserId, body, client_id: null, created_at: new Date().toISOString() }]);
    },
    async leaveGroup(id) { setSnapshot((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== id) })); },
    async acceptFriend(id) { setSnapshot((current) => ({ ...current, friends: current.friends.map((friend) => friend.id === id ? { ...friend, accepted_at: new Date().toISOString() } : friend) })); },
    async removeFriend(id) { setSnapshot((current) => ({ ...current, friends: current.friends.filter((friend) => friend.id !== id) })); },
    async blockFriend(id) {
      const friend = snapshot.friends.find((friend) => friend.id === id);
      if (friend) blockedPeers.current.add(friend.user_b_id);
      setSnapshot((current) => ({ ...current, friends: current.friends.filter((friend) => friend.id !== id) }));
    },
    async requestFriend(id) {
      if (blockedPeers.current.has(id)) throw new Error("This friendship is unavailable.");
      const member = snapshot.groups.flatMap((group) => group.members).find((member) => member.id === id);
      if (!member || snapshot.friends.some((friend) => friend.user_b_id === id)) return;
      const dmId = crypto.randomUUID();
      setSnapshot((current) => ({ ...current, friends: [...current.friends, {
        id: dmId, group_id: dmId, user_a_id: localUserId, user_b_id: id, requested_by_id: localUserId, requested_at: new Date().toISOString(), accepted_at: null,
        user_a: { id: localUserId, display_name: current.session!.name, avatar_path: null, avatar_url: current.session!.avatarUrl ?? null, created_at: new Date(initialTime).toISOString() },
        user_b: { id, display_name: member.name, avatar_path: null, avatar_url: member.avatarUrl ?? null, created_at: new Date(initialTime).toISOString() },
      }] }));
    },
    async joinGroup(input) {
      const code = codeKeySchema.parse(input);
      const group = sampleSnapshot(initialTime).groups[0];
      const id = crypto.randomUUID();
      const expires_at = new Date(Date.now() + 24 * 3600000).toISOString();
      setSnapshot((current) => ({ ...current, groups: [...current.groups, { ...group, id, venue: { ...group.venue, id, name: groupFallbackName(code), nameMissing: true, codes: [code] }, messages: [], expiresAt: expires_at }] }));
      return { group_id: id, expires_at, name: null };
    },
    async resolveGroup() { return null; },
    async signOut() { setSnapshot(sampleSnapshot(initialTime)); setDirectRows(sampleDirectMessages(initialTime)); },
    async deleteAccount() { setSnapshot(sampleSnapshot(initialTime)); setDirectRows(sampleDirectMessages(initialTime)); },
    async nameProductGroup(id, name) { setSnapshot((current) => ({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, venue: { ...group.venue, name: String(name), nameMissing: false } } : group) })); },
  }), [initialTime, snapshot]);

  const directPreviews: ChatSnapshot["directPreviews"] = {};
  for (const friend of snapshot.friends.filter((friend) => friend.accepted_at)) {
    directPreviews[friend.id] = { status: "ready", message: directRows.filter((row) => row.group_id === friend.id).at(-1) ?? null };
  }
  const backend: ChatViewBackend = {
    ...snapshot, directPreviews, api, ready: true, error: "", connection: "connected", hasObservedGroup: true,
    refresh: idle, refreshGroup: idle, openGroup: () => () => {}, groupLoading: false, groupErrors: {}, loadOlder: idle,
  };
  return <ChatView view={view} backend={backend} directId={directId} setDirectId={setDirectId} business direct={{
    messages: directRows.filter((row) => row.group_id === directId), nextCursor: null, loading: false, error: "", connection: "connected", refresh: idle, loadOlder: idle,
  }} />;
}

const samplePlaces = (now: number): Place[] => [
  { id: "55555555-5555-4555-8555-000000000001", owner_id: localUserId, group_id: groupId, code: "cafecentr2", name: "Cafe Central", link_url: null, menu_path: `${localUserId}/menu.pdf`, menu_url: "https://example.com/menu.pdf", photo_path: null, photo_url: null, created_at: new Date(now - 7 * 86400000).toISOString(), deleted_at: null },
  { id: "55555555-5555-4555-8555-000000000002", owner_id: localUserId, group_id: crypto.randomUUID(), code: "rooftop234", name: "Rooftop Bar", link_url: null, menu_path: null, menu_url: null, photo_path: `${localUserId}/rooftop.jpg`, photo_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 4'%3E%3Crect width='4' height='4' fill='%23c9a227'/%3E%3Ccircle cx='2' cy='2' r='1' fill='%23fff'/%3E%3C/svg%3E", created_at: new Date(now - 86400000).toISOString(), deleted_at: null },
];

/** The Business screen on in-memory places: create, edit, menu and delete behave like the real API, nothing is saved. */
export function BusinessPreview({ initialTime }: { initialTime: number }) {
  const places = useRef(samplePlaces(initialTime));
  const [api] = useState<BusinessApi>(() => ({
    async isBusiness() { return true; },
    async places() { return places.current.filter((place) => !place.deleted_at); },
    async createPlace(input) {
      const place: Place = { id: crypto.randomUUID(), owner_id: localUserId, group_id: crypto.randomUUID(), code: Math.random().toString(36).slice(2, 12).padEnd(10, "2"), name: placeNameSchema.parse(input), link_url: null, menu_path: null, menu_url: null, photo_path: null, photo_url: null, created_at: new Date().toISOString(), deleted_at: null };
      places.current = [...places.current, place];
      return place;
    },
    async updatePlace(place, input) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const upload = input.menu ? menuUploadSchema.parse(input.menu) : input.menu;
      const menu_url = upload ? URL.createObjectURL(new Blob([upload.data], { type: "application/pdf" })) : upload === null ? null : place.menu_url;
      const picked = input.photo ? avatarUploadSchema.parse(input.photo) : input.photo;
      const photo_url = picked ? URL.createObjectURL(new Blob([picked.data], { type: "image/jpeg" })) : picked === null ? null : place.photo_url;
      const saved = { ...place, name: placeNameSchema.parse(input.name), link_url: placeLinkSchema.parse(input.link) || null, menu_url, menu_path: menu_url && `${localUserId}/${upload?.uploadId ?? "menu"}.pdf`, photo_url, photo_path: photo_url && `${localUserId}/${picked?.uploadId ?? "photo"}.jpg` };
      places.current = places.current.map((item) => item.id === place.id ? saved : item);
      return saved;
    },
    async deletePlace(id) { places.current = places.current.map((place) => place.id === id ? { ...place, deleted_at: new Date().toISOString() } : place); },
  }));
  return <BusinessView preview={api} />;
}
