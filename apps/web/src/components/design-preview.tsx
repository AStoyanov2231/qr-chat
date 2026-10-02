"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatSnapshot, Tables } from "@qr-chat/api";
import { codeKeySchema, displayNameSchema, messageBodySchema, profileSchema, qrNameSchema } from "@qr-chat/validation";
import { ChatView, type ChatViewApi, type ChatViewBackend } from "./mobile-chat";

const localUserId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const avatar = "/design-preview/avatar.svg";
const peerId = (index: number) => `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
const connectionId = (index: number) => `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`;
const idle = async () => {};

function sampleSnapshot(now: number): ChatSnapshot {
  const created_at = new Date(now - 86400000).toISOString();
  const profile = (id: string, name: string): Tables<"profiles"> => ({ id, display_name: name, avatar_url: avatar, created_at });
  const names = ["Andy", "Daniel", "Mira", "Sam"];
  return {
    session: { id: localUserId, name: "Local designer", avatarUrl: avatar, hidden: [] },
    group: {
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
    },
    friends: names.map((name, index) => ({
      id: connectionId(index), user_a_id: localUserId, user_b_id: peerId(index), requested_by_id: peerId(index),
      requested_at: created_at, accepted_at: index === 3 ? null : created_at,
      user_a: profile(localUserId, "Local designer"), user_b: profile(peerId(index), name),
    })),
    expiresAt: new Date(now + 15 * 3600000).toISOString(),
    directPreviews: {},
  };
}

function sampleDirectMessages(now: number): Tables<"direct_messages">[] {
  return [0, 1, 2].flatMap((index) => [
    { id: index * 10 + 1, friend_connection_id: connectionId(index), sender_id: peerId(index), body: "Hey, how are you? 😊", created_at: new Date(now - 8 * 60000).toISOString() },
    { id: index * 10 + 2, friend_connection_id: connectionId(index), sender_id: localUserId, body: "All good! What are you up to these days?", created_at: new Date(now - 7 * 60000).toISOString() },
    { id: index * 10 + 3, friend_connection_id: connectionId(index), sender_id: peerId(index), body: "Just working and chilling. You?", created_at: new Date(now - 6 * 60000).toISOString() },
  ]);
}

/** Preview commands update only this component's memory and never contact Supabase. */
export function DesignPreview({ view, initialTime }: { view: "chats" | "profile"; initialTime: number }) {
  const [snapshot, setSnapshot] = useState(() => sampleSnapshot(initialTime));
  const [directRows, setDirectRows] = useState(() => sampleDirectMessages(initialTime));
  const [directId, setDirectId] = useState<string | null>(null);
  const photoUrls = useRef<string[]>([]);
  useEffect(() => () => { photoUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

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
    async sendGroupMessage(_id, input) {
      const text = messageBodySchema.parse(input);
      setSnapshot((current) => ({ ...current, group: current.group && { ...current.group, messages: [...current.group.messages, { id: crypto.randomUUID(), user: localUserId, name: current.session!.name, avatarUrl: current.session!.avatarUrl, text, time: Date.now() }] } }));
    },
    async sendDirectMessage(id, input) {
      const body = messageBodySchema.parse(input);
      setDirectRows((rows) => [...rows, { id: Math.max(0, ...rows.map((row) => row.id)) + 1, friend_connection_id: id, sender_id: localUserId, body, created_at: new Date().toISOString() }]);
    },
    async leaveGroup() { setSnapshot((current) => ({ ...current, group: null, expiresAt: null })); },
    async acceptFriend(id) { setSnapshot((current) => ({ ...current, friends: current.friends.map((friend) => friend.id === id ? { ...friend, accepted_at: new Date().toISOString() } : friend) })); },
    async removeFriend(id) { setSnapshot((current) => ({ ...current, friends: current.friends.filter((friend) => friend.id !== id) })); },
    async requestFriend(id) {
      const member = snapshot.group?.members.find((member) => member.id === id);
      if (!member || snapshot.friends.some((friend) => friend.user_b_id === id)) return;
      setSnapshot((current) => ({ ...current, friends: [...current.friends, {
        id: crypto.randomUUID(), user_a_id: localUserId, user_b_id: id, requested_by_id: localUserId, requested_at: new Date().toISOString(), accepted_at: null,
        user_a: { id: localUserId, display_name: current.session!.name, avatar_url: current.session!.avatarUrl ?? null, created_at: new Date(initialTime).toISOString() },
        user_b: { id, display_name: member.name, avatar_url: member.avatarUrl ?? null, created_at: new Date(initialTime).toISOString() },
      }] }));
    },
    async joinNamedGroup(input, title) {
      const code = codeKeySchema.parse(input);
      const name = qrNameSchema.parse(title);
      const group = sampleSnapshot(initialTime).group!;
      const expires_at = new Date(Date.now() + 15 * 3600000).toISOString();
      setSnapshot((current) => ({ ...current, group: { ...group, venue: { ...group.venue, name, codes: [code] }, messages: [] }, expiresAt: expires_at }));
      return { group_id: groupId, qr_code_id: groupId, display_name: name, expires_at };
    },
    async nameCurrentQrChatIfEmpty(_code, title) { return qrNameSchema.parse(title); },
    async resolveQrChatName(code) { return snapshot.group?.venue.codes.includes(String(code)) ? { kind: "saved", name: snapshot.group.venue.name } : { kind: "missing" }; },
    async resolveQrChatImage() { return "/design-preview/cafe.svg"; },
    async signOut() { setSnapshot(sampleSnapshot(initialTime)); setDirectRows(sampleDirectMessages(initialTime)); },
  }), [initialTime, snapshot]);

  const directPreviews: ChatSnapshot["directPreviews"] = {};
  for (const friend of snapshot.friends.filter((friend) => friend.accepted_at)) {
    directPreviews[friend.id] = { status: "ready", message: directRows.filter((row) => row.friend_connection_id === friend.id).at(-1) ?? null };
  }
  const backend: ChatViewBackend = {
    ...snapshot, directPreviews, api, ready: true, error: "", connection: "connected", hasObservedGroup: true,
    refresh: idle, loadOlder: idle,
  };
  return <ChatView view={view} backend={backend} directId={directId} setDirectId={setDirectId} direct={{
    messages: directRows.filter((row) => row.friend_connection_id === directId), nextCursor: null, loading: false, error: "", connection: "connected", refresh: idle, loadOlder: idle,
  }} />;
}
