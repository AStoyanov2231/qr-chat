import type { ChatApi } from './index.ts';
import { createRefreshCoordinator } from './coordinator.ts';
import { topic, watchChanges, type ChangeEvent, type ConnectionState, type Topic } from './realtime.ts';
import { emptySnapshot, snapshotFromOverview, groupMessageView, type ChatSnapshot } from './snapshot.ts';
import type { ChatAccess, ChatOverview, GroupMessage, ChatMutation, DirectMessage } from './overview.ts';

type Row = GroupMessage | DirectMessage;
type Conversation = { rows: Map<number, Row>; nextCursor: number | null; loaded: boolean; headIds: number[] };
export type DirectState = { messages: DirectMessage[]; nextCursor: number | null; loading: boolean; error: string };
export type ChatStoreState = { snapshot: ChatSnapshot; ready: boolean; error: string; connection: ConnectionState; hasObservedGroup: boolean; groupLoading: boolean; directs: Record<string, DirectState> };
const initialState: ChatStoreState = { snapshot: emptySnapshot, ready: false, error: '', connection: 'connecting', hasObservedGroup: false, groupLoading: false, directs: {} };
const emptyDirect: DirectState = { messages: [], nextCursor: null, loading: true, error: '' };

/** One session store per injected API. Hosts provide activity; the store owns networking. */
export function createChatStore(api: ChatApi, options: { random?: () => number; safetyMs?: number; coalesceMs?: number; fallbackMs?: number } = {}) {
  const random = options.random ?? Math.random;
  const coordinator = createRefreshCoordinator(options.coalesceMs ?? 100);
  const listeners = new Set<() => void>();
  const conversations = new Map<string, Conversation>();
  const pendingIds = new Map<string, Set<number>>();
  const recoveries = new Set<string>();
  const olderPages = new Set<string>();
  const validations = new Set<string>();
  const pendingWrites = new Map<string, Row[]>();
  const writtenIds = new Map<string, Set<number>>();
  const directViews = new Map<string, number>();
  // Newest message id each chat's unread count accounts for, and the newest id this session marked read.
  const unreadAfter = new Map<string, number>();
  const readIds = new Map<string, number>();
  let state = initialState;
  let active = false;
  let generation = 0;
  let identity: string | null = null;
  const groupViews = new Map<string, number>();
  const viewingGroup = (id: string) => groupViews.has(id);
  const hasGroup = (id: string) => state.snapshot.groups.some((group) => group.id === id);
  const viewedGroupLoading = (groups: ChatSnapshot['groups']) => groups.some((group) => viewingGroup(group.id) && !conversations.get(`g:${group.id}`)?.loaded);
  let safety: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let controller = new AbortController();
  let watcher: ReturnType<typeof watchChanges> | undefined;
  let watcherKey = '';
  let authSubscription: { unsubscribe(): void } | undefined;
  let unlistenMutation: (() => void) | undefined;
  let recoverOverview = false;
  const publish = (patch: Partial<ChatStoreState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const current = (ticket: number) => active && generation === ticket && !controller.signal.aborted;
  const accepted = () => new Set(state.snapshot.friends.filter((friend) => friend.accepted_at).map((friend) => friend.id));
  function conversation(key: string) {
    let cache = conversations.get(key);
    if (!cache) { cache = { rows: new Map(), nextCursor: null, loaded: false, headIds: [] }; conversations.set(key, cache); }
    return cache;
  }
  function groupMessageViews(rows: Row[], snapshot: ChatSnapshot) {
    const profiles = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    for (const member of [snapshot.session, ...snapshot.groups.flatMap((group) => group.members)]) {
      if (member) profiles.set(member.id, { display_name: member.name, avatar_url: member.avatarUrl ?? null });
    }
    for (const friend of snapshot.friends) {
      if (friend.user_a) profiles.set(friend.user_a.id, friend.user_a);
      if (friend.user_b) profiles.set(friend.user_b.id, friend.user_b);
    }
    // Use current authorized identities even when a history request began before
    // a profile edit. Hidden/departed profiles must not survive in cached rows.
    return rows.map(row => groupMessageView({ ...row, profiles: row.sender_id ? profiles.get(row.sender_id) ?? null : null } as GroupMessage));
  }
  function publishMessages(key: string) {
    const cache = conversations.get(key);
    if (!cache) return;
    const rows = [...cache.rows.values()].sort((a, b) => a.id - b.id);
    const id = key.slice(2);
    if (key.startsWith('g:')) {
      if (!hasGroup(id)) return;
      const groups = state.snapshot.groups.map((group) => group.id === id ? { ...group, messages: groupMessageViews(rows, state.snapshot), nextCursor: cache.nextCursor } : group);
      publish({ snapshot: { ...state.snapshot, groups }, groupLoading: viewedGroupLoading(groups) });
    } else if (key.startsWith('d:') && accepted().has(id)) {
      const latest = rows.at(-1) as DirectMessage | undefined;
      const previous = state.snapshot.directPreviews[id];
      const preview = latest && (previous?.status !== 'ready' || !previous.message || latest.id >= previous.message.id) ? { status: 'ready' as const, message: latest } : previous;
      publish({ directs: { ...state.directs, [id]: { messages: rows as DirectMessage[], nextCursor: cache.nextCursor, loading: false, error: '' } }, snapshot: preview ? { ...state.snapshot, directPreviews: { ...state.snapshot.directPreviews, [id]: preview } } : state.snapshot });
    }
  }
  const viewing = (id: string) => viewingGroup(id) || directViews.has(id);
  function setUnread(id: string, count: number) {
    if ((state.snapshot.unread[id] ?? 0) === count) return;
    const unread = { ...state.snapshot.unread };
    if (count) unread[id] = count; else delete unread[id];
    publish({ snapshot: { ...state.snapshot, unread } });
  }
  /** An open chat is read up to its newest known message. */
  function read(id: string) {
    setUnread(id, 0);
    const latest = unreadAfter.get(id) ?? 0;
    if (latest <= (readIds.get(id) ?? 0)) return;
    readIds.set(id, latest);
    void api.markRead(id, latest).catch(() => { if (readIds.get(id) === latest) readIds.delete(id); });
  }
  /** Rows that reached the cache since the overview: open chats stay read, others count other people's messages. */
  function track(id: string, rows: Row[]) {
    const fresh = rows.filter((row) => row.id > (unreadAfter.get(id) ?? 0));
    if (fresh.length) unreadAfter.set(id, Math.max(...fresh.map((row) => row.id)));
    if (viewing(id)) read(id);
    else setUnread(id, (state.snapshot.unread[id] ?? 0) + fresh.filter((row) => row.sender_id !== identity).length);
  }
  function forgetConversation(key: string) {
    conversations.delete(key); pendingIds.delete(key); pendingWrites.delete(key); writtenIds.delete(key);
    recoveries.delete(key); olderPages.delete(key); validations.delete(key);
  }
  function prune(access: ChatAccess) {
    const allowed = new Set(access.acceptedConnectionIds);
    const memberships = new Map(access.memberships.map((membership) => [membership.group_id, membership.expires_at]));
    const directs = { ...state.directs };
    const previews = { ...state.snapshot.directPreviews };
    for (const key of new Set([...conversations.keys(), ...pendingWrites.keys(), ...writtenIds.keys()])) {
      if (key.startsWith('g:') ? !memberships.has(key.slice(2)) : !allowed.has(key.slice(2))) forgetConversation(key);
    }
    for (const id of Object.keys(directs)) if (!allowed.has(id)) delete directs[id];
    for (const id of Object.keys(previews)) if (!allowed.has(id)) delete previews[id];
    const groups = state.snapshot.groups.filter((group) => memberships.has(group.id)).map((group) => ({ ...group, expiresAt: memberships.get(group.id)! }));
    publish({ directs, snapshot: { ...state.snapshot, groups, friends: state.snapshot.friends.filter((friend) => !friend.accepted_at || allowed.has(friend.id)), directPreviews: previews } });
  }
  function fail(error: unknown, ticket: number) {
    if (!current(ticket)) return;
    generation++; controller.abort(); controller = new AbortController();
    // Cached private bodies are discarded when access cannot be checked.
    conversations.clear(); pendingIds.clear(); pendingWrites.clear(); writtenIds.clear(); recoveries.clear(); olderPages.clear(); validations.clear();
    publish({ snapshot: emptySnapshot, directs: {}, ready: false, groupLoading: false, error: error instanceof Error ? error.message : 'Could not synchronize.', connection: 'reconnecting' });
    stopWatcher();
    clearTimeout(retry);
    retry = setTimeout(() => { if (active) void refresh('retry').catch(() => {}); }, Math.min(1000 * 2 ** attempts++, 30000) * (0.8 + random() * 0.2));
  }
  function stopWatcher() { watcher?.stop(); watcher = undefined; watcherKey = ''; }
  function updateWatcher() {
    if (!active || !identity || !state.ready) return;
    // One private channel for the user's own traffic (memberships, friendships, direct messages, friends'
    // profiles) and one per QR group (its messages, members and member profiles), all on one socket.
    const topics: Topic[] = [topic('user', identity), ...state.snapshot.groups.map((group) => group.id).sort().map((id) => topic('group', id))];
    const key = topics.join(',');
    if (key === watcherKey) return;
    watcherKey = key;
    if (watcher) { watcher.update(topics); return; }
    const ticket = generation;
    watcher = watchChanges(api.client, topics, () => refresh('reconnect'), (connection) => { if (current(ticket)) publish({ connection }); }, {
      onChange: event, random, coordinated: true,
      // Overview polling compares head ids, so unchanged conversations download nothing.
      fallbackMs: options.fallbackMs ?? 5000, onPoll: () => refresh('poll'),
    });
  }
  function scheduleSafety() {
    clearTimeout(safety);
    if (!active) return;
    safety = setTimeout(() => {
      void refresh('safety').catch(() => {});
      scheduleSafety();
    }, (options.safetyMs ?? 120000) * (0.95 + random() * 0.05));
  }
  function scheduleExpiry(memberships: ChatOverview['memberships']) {
    clearTimeout(expiry);
    const deadlines = memberships.flatMap((membership) => [membership.expires_at, ...membership.members.map((member) => member.expires_at)]).filter(Boolean).map(value => Date.parse(value!)).filter(Number.isFinite);
    // Expired peers lose membership/profile visibility even if no database write
    // occurs at their deadline. Reconcile at the earliest visible expiry.
    if (active && deadlines.length) expiry = setTimeout(() => { void refresh('expiry').catch(() => {}); }, Math.min(2147483647, Math.max(1000, Math.min(...deadlines) - Date.now() + 100)));
  }
  async function checkAccess(ticket: number) {
    if (!current(ticket)) return null;
    const access = await api.access(controller.signal);
    if (!current(ticket)) return null;
    const sessionId = await api.userId();
    if (!current(ticket)) return null;
    if (access.userId !== identity || sessionId !== identity) throw new Error('Please sign in again.');
    prune(access);
    return access;
  }
  async function overview(ticket: number) {
    if (!current(ticket)) return;
    const validate = recoverOverview;
    recoverOverview = false;
    try {
      const next = await api.overview(controller.signal);
      if (!current(ticket)) return;
      const sessionId = await api.userId();
      if (!current(ticket)) return;
      if (next.userId !== identity || sessionId !== identity) throw new Error('Please sign in again.');
      const allowed = new Set(next.friends.filter((friend) => friend.accepted_at).map((friend) => friend.id));
      const headIds = new Map(next.memberships.map((membership) => [membership.group_id, membership.headIds]));
      for (const key of new Set([...conversations.keys(), ...pendingWrites.keys(), ...writtenIds.keys()])) if (key.startsWith('g:') ? !headIds.has(key.slice(2)) : !allowed.has(key.slice(2))) forgetConversation(key);
      const snapshot = snapshotFromOverview(next);
      for (const id of [...headIds.keys(), ...allowed]) {
        unreadAfter.set(id, headIds.get(id)?.[0] ?? next.directPreviews[id]?.id ?? 0);
        // The server may answer before a just-sent read marker lands.
        if ((readIds.get(id) ?? 0) >= unreadAfter.get(id)!) delete snapshot.unread[id];
      }
      snapshot.groups = snapshot.groups.map((group) => {
        const cache = conversations.get(`g:${group.id}`);
        return cache?.loaded ? { ...group, messages: groupMessageViews([...cache.rows.values()].sort((a, b) => a.id - b.id), snapshot), nextCursor: cache.nextCursor } : group;
      });
      const directs = Object.fromEntries(Object.entries(state.directs).filter(([id]) => allowed.has(id)));
      publish({ snapshot, directs, ready: true, error: '', groupLoading: viewedGroupLoading(snapshot.groups), hasObservedGroup: state.hasObservedGroup || snapshot.groups.length > 0 });
      updateWatcher(); scheduleExpiry(next.memberships);
      for (const id of unreadAfter.keys()) if (viewing(id)) read(id);
      const tasks: Promise<void>[] = [];
      for (const group of snapshot.groups) if (viewingGroup(group.id)) {
        const key = `g:${group.id}`;
        const cache = conversations.get(key);
        if (!cache?.loaded || validate || headIds.get(group.id)!.join(',') !== cache.headIds.join(',')) tasks.push(refreshConversation(key, true, false, validate && !!cache?.loaded));
      }
      for (const id of directViews.keys()) if (allowed.has(id)) {
        const key = `d:${id}`;
        const preview = next.directPreviews[id];
        const cached = conversations.get(key);
        const latestId = [...(cached?.rows.keys() ?? [])].reduce((max, id) => Math.max(max, id), 0);
        if (!cached?.loaded || validate || (preview?.id ?? 0) !== latestId) tasks.push(refreshConversation(key, true, false, validate && !!cached?.loaded));
      }
      await Promise.all(tasks);
      if (current(ticket)) { attempts = 0; clearTimeout(retry); }
    } catch (error) { fail(error, ticket); throw error; }
  }
  function refresh(reason = 'manual') {
    if (!active) return Promise.resolve();
    if (reason === 'resume' || reason === 'reconnect') recoverOverview = true;
    const ticket = generation;
    return coordinator.request('overview', () => overview(ticket));
  }
  // Reconcile newest-first with overlap; older cached pages are not downloaded again.
  async function recover(key: string, cache: Conversation, signal: AbortSignal, validateCachedRange = false) {
    const id = key.slice(2);
    const previous = new Set(cache.rows.keys());
    const oldest = [...previous].reduce((min, id) => Math.min(min, id), Infinity);
    let before: number | undefined;
    let first = true;
    const seen = new Set<number>();
    let floor = Infinity;
    let ended = false;
    while (true) {
      if (signal.aborted) throw signal.reason ?? new Error('Synchronization cancelled');
      const page = key.startsWith('g:') ? await api.groupMessages(id, { before }, signal) : await api.directMessages(id, { before }, signal);
      if (first) {
        cache.headIds = page.items.map((row) => row.id);
        if (!cache.loaded) cache.nextCursor = page.nextCursor;
      }
      for (const row of page.items) { cache.rows.set(row.id, row); seen.add(row.id); floor = Math.min(floor, row.id); }
      ended = page.nextCursor === null;
      const overlaps = page.items.some((row) => previous.has(row.id));
      if (!cache.loaded || page.nextCursor === null || (validateCachedRange ? floor <= oldest : overlaps)) break;
      before = page.nextCursor;
      first = false;
    }
    // Reconcile deletes in the downloaded range, including an empty newest page.
    for (const id of previous) if ((ended || id >= floor) && !seen.has(id)) cache.rows.delete(id);
    if (ended) cache.nextCursor = null;
    cache.loaded = true;
    return seen;
  }
  function refreshConversation(key: string, recoverHead = false, older = false, validate = false) {
    if (!active) return Promise.resolve();
    const ticket = generation;
    const signal = controller.signal;
    if (recoverHead) recoveries.add(key);
    if (older) olderPages.add(key);
    if (validate) validations.add(key);
    return coordinator.request(key, async () => {
      if (!current(ticket)) return;
      try {
        const id = key.slice(2);
        if (key.startsWith('g:') ? !hasGroup(id) : !accepted().has(id)) return;
        const cache = conversation(key);
        // Work in a copy until the final authorization check succeeds.
        const next = { ...cache, rows: new Map(cache.rows), headIds: [...cache.headIds] };
        const ids = [...(pendingIds.get(key) ?? [])]; pendingIds.delete(key);
        const writes = pendingWrites.get(key) ?? []; pendingWrites.delete(key);
        for (const row of writes) next.rows.set(row.id, row);
        const missing = ids.filter((id) => !next.rows.has(id));
        for (let offset = 0; offset < missing.length; offset += 100) {
          const batch = missing.slice(offset, offset + 100);
          const rows = key.startsWith('g:') ? await api.groupMessageIds(id, batch, signal) : await api.directMessageIds(id, batch, signal);
          for (const row of rows) next.rows.set(row.id, row);
        }
        const needsRecovery = recoveries.delete(key);
        const needsOlder = olderPages.delete(key);
        const validateCachedRange = validations.delete(key);
        if (needsOlder && next.nextCursor !== null) {
          const page = key.startsWith('g:') ? await api.groupMessages(id, { before: next.nextCursor }, signal) : await api.directMessages(id, { before: next.nextCursor }, signal);
          for (const row of page.items) next.rows.set(row.id, row);
          next.nextCursor = page.nextCursor;
        }
        if (!current(ticket)) return;
        if (needsRecovery || (!next.loaded && (key.startsWith('g:') ? viewingGroup(id) : directViews.has(id)))) await recover(key, next, signal, validateCachedRange);
        const fresh = [...next.rows.values()].filter((row) => !cache.rows.has(row.id));
        if (!next.loaded && next.rows.size > 1) {
          const latest = [...next.rows.values()].sort((a, b) => b.id - a.id)[0]!;
          next.rows = new Map([[latest.id, latest]]);
        }
        if (next.loaded) next.headIds = [...next.rows.keys()].sort((a, b) => b - a).slice(0, 50);
        const access = await checkAccess(ticket);
        if (!access || (key.startsWith('g:') ? !access.memberships.some((membership) => membership.group_id === id) : !access.acceptedConnectionIds.includes(id))) { updateWatcher(); return; }
        conversations.set(key, next); publishMessages(key); track(id, fresh);
      } catch (error) { fail(error, ticket); throw error; }
    });
  }
  function event(change: ChangeEvent) {
    if (!active) return;
    if (change.table !== 'messages') { void refresh('event').catch(() => {}); return; }
    // The row ID is only a hint. The subsequent SELECT applies authorization.
    if (!change.id || change.eventType !== 'INSERT') { void refresh('reconnect').catch(() => {}); return; }
    // A callback includes its filter so we can route without trusting the payload.
    const groupId = change.filterId;
    if (groupId && hasGroup(groupId)) enqueue(`g:${groupId}`, change.id);
    else if (groupId && accepted().has(groupId)) enqueue(`d:${groupId}`, change.id);
  }
  function enqueue(key: string, id: number) {
    if (conversations.get(key)?.rows.has(id) || writtenIds.get(key)?.has(id)) return;
    const ids = pendingIds.get(key) ?? new Set<number>(); ids.add(id); pendingIds.set(key, ids);
    void refreshConversation(key).catch(() => {});
  }
  function mutation(change: ChatMutation) {
    if (!active) return;
    if (change.kind === 'overview') { void refresh('mutation').catch(() => {}); return; }
    if (change.userId !== identity) return;
    const key = `${change.kind === 'group' ? 'g' : 'd'}:${change.message.group_id}`;
    const ids = writtenIds.get(key) ?? new Set<number>();
    ids.add(change.message.id);
    if (ids.size > 100) ids.delete(ids.values().next().value!);
    writtenIds.set(key, ids);
    const rows = pendingWrites.get(key) ?? []; rows.push(change.message); pendingWrites.set(key, rows);
    void refreshConversation(key).catch(() => {});
  }
  function resetIdentity(id: string | null) {
    generation++; controller.abort(); controller = new AbortController(); coordinator.cancel(); stopWatcher();
    clearTimeout(expiry); clearTimeout(retry); attempts = 0;
    conversations.clear(); pendingIds.clear(); pendingWrites.clear(); writtenIds.clear(); recoveries.clear(); olderPages.clear(); validations.clear(); recoverOverview = false; identity = id;
    unreadAfter.clear(); readIds.clear();
    publish({ ...initialState });
  }
  function pause() {
    if (!active) return;
    active = false; generation++; controller.abort(); coordinator.cancel(); stopWatcher();
    pendingIds.clear(); pendingWrites.clear(); writtenIds.clear(); recoveries.clear(); olderPages.clear(); validations.clear(); recoverOverview = false;
    clearTimeout(safety); clearTimeout(expiry); clearTimeout(retry);
    publish({ snapshot: emptySnapshot, directs: {}, ready: false, groupLoading: false, connection: 'reconnecting' });
  }
  async function start() {
    if (active) return;
    active = true; controller = new AbortController();
    let ticket = generation;
    try {
      const id = await api.userId();
      if (!current(ticket)) return;
      if (id !== identity) resetIdentity(id);
      ticket = generation;
      if (!authSubscription) {
        authSubscription = api.client.auth.onAuthStateChange((_event, session) => {
          const id = session?.user.id ?? null;
          if (id === identity) return;
          if (!id) pause();
          resetIdentity(id);
          if (active && id) setTimeout(() => { void refresh('identity').catch(() => {}); }, 0);
        }).data.subscription;
        unlistenMutation = api.onMutation(mutation);
      }
      publish({ ready: false, snapshot: emptySnapshot, directs: {} });
      scheduleSafety(); await refresh('resume');
    } catch (error) { fail(error, ticket); }
  }
  return {
    getState: () => state,
    getDirect: (id: string | null) => id && state.ready ? state.directs[id] ?? emptyDirect : emptyDirect,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, pause, refresh,
    openGroup(groupId: string) {
      groupViews.set(groupId, (groupViews.get(groupId) ?? 0) + 1);
      if (active && hasGroup(groupId)) { publish({ groupLoading: !conversations.get(`g:${groupId}`)?.loaded }); read(groupId); void refreshConversation(`g:${groupId}`, true).catch(() => {}); }
      return () => { const count = (groupViews.get(groupId) ?? 1) - 1; if (count) groupViews.set(groupId, count); else groupViews.delete(groupId); };
    },
    openDirect(id: string) {
      directViews.set(id, (directViews.get(id) ?? 0) + 1);
      if (active && state.ready) { read(id); void refreshConversation(`d:${id}`, true).catch(() => {}); }
      return () => { const count = (directViews.get(id) ?? 1) - 1; if (count) directViews.set(id, count); else directViews.delete(id); };
    },
    refreshGroup(groupId: string) { return !state.ready ? refresh() : hasGroup(groupId) ? refreshConversation(`g:${groupId}`) : Promise.resolve(); },
    async refreshDirect(id: string) { if (!state.ready) await refresh(); else await refreshConversation(`d:${id}`); },
    loadOlderGroup: (groupId: string) => refreshConversation(`g:${groupId}`, false, true),
    loadOlderDirect: (id: string) => refreshConversation(`d:${id}`, false, true),
    dispose() { pause(); authSubscription?.unsubscribe(); authSubscription = undefined; unlistenMutation?.(); unlistenMutation = undefined; },
  };
}
const stores = new WeakMap<ChatApi, ReturnType<typeof createChatStore>>();
export function getChatStore(api: ChatApi) {
  let store = stores.get(api);
  if (!store) { store = createChatStore(api); stores.set(api, store); }
  return store;
}
