import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from '../src/store.ts';
const self = '11111111-1111-4111-8111-111111111111';
const room = '22222222-2222-4222-8222-222222222222';
const friend = '33333333-3333-4333-8333-333333333333';
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 15)); };
const row = (id, direct = false) => ({ id, sender_id: self, body: `message ${id}`, created_at: '2026-01-01T00:00:00Z', ...(direct ? { group_id: friend } : { group_id: room, profiles: { display_name: 'Andy', avatar_url: null } }) });
function fixture(options = {}) {
  const calls = []; const reads = []; const channels = []; const mutations = new Set(); let authListener; let id = self;
  const overview = { userId: self, profile: { display_name: 'Andy' }, memberships: [{ group_id: room, expires_at: '2030-01-01', groups: { id: room, code_key: 'Cafe', name: 'Cafe' }, members: [], preview: null, headIds: [2, 1] }], friends: [{ id: friend, accepted_at: 'yes' }], directPreviews: { [friend]: null } };
  const access = { userId: self, memberships: [{ group_id: room, expires_at: '2030-01-01' }], acceptedConnectionIds: [friend] };
  let groupRows = [row(2), row(1)]; let directRows = [row(2, true), row(1, true)];
  const call = (name, value) => { calls.push(name); return structuredClone(value); };
  const page = (rows, before, limit = 50) => { const filtered = rows.filter(row => !before || row.id < before).sort((a,b) => b.id-a.id); const items=filtered.slice(0,limit);return {items,nextCursor:filtered.length>limit?items.at(-1).id:null}; };
  const api = {
    userId: async () => id,
    overview: async () => call('overview', overview),
    access: async () => call('access', access),
    groupMessages: async (_id, options = {}) => call(`group:${options.before ?? 'head'}`, page(groupRows, options.before)),
    directMessages: async (_id, options = {}) => call(`direct:${options.before ?? 'head'}`, page(directRows, options.before)),
    groupMessageIds: async (_id, ids) => call('group:ids', groupRows.filter(row => ids.includes(row.id))),
    directMessageIds: async (_id, ids) => call('direct:ids', directRows.filter(row => ids.includes(row.id))),
    markRead: async (chatId, messageId) => { reads.push([chatId, messageId]); },
    onMutation(listener) { mutations.add(listener); return () => mutations.delete(listener); },
    client: {
      auth: { onAuthStateChange(listener) { authListener = listener; return { data: { subscription: { unsubscribe() {} } } }; } },
      getChannels() { return channels.filter(channel=>!channel.removed); },
      channel(name, params) { const channel = { name, topic:`realtime:${name}`, params, on(type, filter, handler) { this.filter=filter;this.handler=handler;return this; }, subscribe(handler) {this.status=handler;return this;} };channels.push(channel);return channel; },
      removeChannel: async channel => {channel.removed=true;},
    },
  };
  const store = createChatStore(api, { coalesceMs: 1, random: () => 1, ...options });
  return { api, store, calls, reads, overview, access, channels,
    auth(next) {id=next;authListener('SIGNED_IN', next ? {user:{id:next}} : null);},
    write(message, kind='group') {for(const listener of mutations) listener({kind,userId:self,message});},
    topics() {return channels.filter(channel=>!channel.removed).map(channel=>channel.name);},
    live() {for(const channel of channels.filter(channel=>!channel.removed)) channel.status('SUBSCRIBED');},
    broadcast(name, payload) {channels.find(channel=>!channel.removed&&channel.name===name).handler({payload});},
    event(kind, messageId) {
      if(kind==='profiles') this.broadcast(`user:${self}`,{table:'profiles',type:'UPDATE',user_id:self});
      else this.broadcast(kind==='direct'?`user:${self}`:`group:${room}`,{table:'messages',type:'INSERT',id:messageId,group_id:kind==='direct'?friend:room});
    },
    setGroup(rows) {groupRows=rows;overview.memberships[0].headIds=rows.slice(0,50).map(row=>row.id);},
    setDirect(rows) {directRows=rows;overview.directPreviews[friend]=rows[0]??null;},
  };
}
test('idle overview does not read history or individual friends; pause stops work', async t => {
  const {store,calls}=fixture({safetyMs:20});t.after(()=>store.dispose());
  await store.start();await new Promise(resolve=>setTimeout(resolve,65));
  assert.ok(calls.filter(call=>call==='overview').length>=3);
  assert.ok(calls.every(call=>call==='overview'));
  store.pause();assert.equal(store.getState().ready,false);assert.deepEqual(store.getState().snapshot.groups,[]);const paused=calls.length;await new Promise(resolve=>setTimeout(resolve,50));assert.equal(calls.length,paused);
  await store.start();assert.equal(calls.at(-1),'overview');
});
test('only displayed conversations load history and pagination downloads one next page', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.setGroup(Array.from({length:120},(_,i)=>row(120-i)));
  const close=f.store.openGroup(room);await f.store.start();
  assert.equal(f.store.getState().snapshot.groups[0].messages.length,50);f.calls.length=0;
  await f.store.loadOlderGroup(room);assert.deepEqual(f.calls,['group:71','access']);assert.equal(f.store.getState().snapshot.groups[0].messages.length,100);
  close();f.calls.length=0;await f.store.refresh('safety');assert.deepEqual(f.calls,['overview']);
});
test('message bursts fetch authorized IDs without rereading profile, contacts or history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.calls.length=0;
  f.setGroup([row(4),row(3),row(2),row(1)]);f.event('group',3);f.event('group',4);await tick();
  assert.deepEqual(f.calls,['group:ids','access']);assert.deepEqual(f.store.getState().snapshot.groups[0].messages.map(row=>row.id),['1','2','3','4']);
});
test('mutation plus matching event and composer refresh share the returned row', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.calls.length=0;
  f.write(row(3));f.event('group',3);await f.store.refreshGroup(room);assert.deepEqual(f.calls,['access']);
  assert.equal(f.store.getState().snapshot.groups[0].messages.at(-1).id,'3');
});
test('a DM event updates its preview without downloading an unopened conversation', async t => {
  const f=fixture();t.after(()=>f.store.dispose());await f.store.start();f.calls.length=0;
  f.setDirect([row(3,true)]);f.event('direct',3);await tick();assert.deepEqual(f.calls,['direct:ids','access']);
  assert.equal(f.store.getState().snapshot.directPreviews[friend].message.id,3);
});
test('active DM and preview reuse one authorized read', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openDirect(friend);await f.store.start();f.calls.length=0;
  f.setDirect([row(3,true),row(2,true),row(1,true)]);f.event('direct',3);await tick();
  assert.deepEqual(f.calls,['direct:ids','access']);assert.equal(f.store.getDirect(friend).messages.at(-1).id,3);
});
test('overlap recovery includes missed messages below the previous maximum', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);f.setGroup([row(4),row(2),row(1)]);await f.store.start();
  f.setGroup([row(4),row(3),row(2),row(1)]);await f.store.refresh('safety');
  assert.deepEqual(f.store.getState().snapshot.groups[0].messages.map(row=>row.id),['1','2','3','4']);
});
test('long reconnect gaps paginate until overlapping cached history without rereading older pages', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.store.pause();
  f.setGroup(Array.from({length:120},(_,i)=>row(120-i)));f.calls.length=0;await f.store.start();
  assert.deepEqual(f.calls,['overview','group:head','group:71','group:21','access']);assert.equal(f.store.getState().snapshot.groups[0].messages.length,120);
});
test('access revoked during message loading clears the conversation before publication', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();
  f.api.groupMessageIds=async()=>{f.access.memberships=[];return[row(3)];};f.event('group',3);await tick();
  assert.deepEqual(f.store.getState().snapshot.groups,[]);
});
test('failed access check hides private data without claiming membership expired', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();
  f.api.access=async()=>{throw new Error('Offline');};f.event('group',3);await tick();
  assert.equal(f.store.getState().ready,false);assert.deepEqual(f.store.getState().snapshot.groups,[]);assert.equal(f.store.getState().hasObservedGroup,true);assert.equal(f.store.getState().error,'Offline');
});
test('removed friendship clears messages, previews and subscriptions on the safety check', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openDirect(friend);await f.store.start();
  f.overview.friends=[];f.overview.directPreviews={};f.access.acceptedConnectionIds=[];await f.store.refresh('safety');
  assert.equal(f.store.getState().directs[friend],undefined);assert.equal(f.store.getState().snapshot.directPreviews[friend],undefined);
  assert.deepEqual(f.topics(),[`user:${self}`,`group:${room}`],'direct messages ride the user topic; no per-friend channel exists');
});
test('same-identity auth events do not trigger reads; sign-out invalidates in-flight data', async t => {
  const f=fixture();t.after(()=>f.store.dispose());await f.store.start();f.calls.length=0;f.auth(self);await tick();assert.equal(f.calls.length,0);
  let finish;f.api.overview=()=>new Promise(resolve=>{finish=resolve;});const request=f.store.refresh();const rejected=assert.rejects(request,/cancelled/);await tick();f.auth(null);finish(f.overview);await rejected;await tick();
  assert.equal(f.store.getState().snapshot.session,null);assert.equal(f.store.getState().ready,false);
});

test('unchanged displayed conversations add no history reads to the single safety check', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);f.store.openDirect(friend);await f.store.start();
  f.overview.directPreviews[friend]=row(2,true);f.calls.length=0;
  await f.store.refresh('safety');assert.deepEqual(f.calls,['overview']);
});
test('missed deletes are removed from newest and older cached pages on reconnect', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);f.setGroup(Array.from({length:120},(_,i)=>row(120-i)));await f.store.start();await f.store.loadOlderGroup(room);
  f.store.pause();f.setGroup(Array.from({length:120},(_,i)=>row(120-i)).filter(value=>value.id!==119&&value.id!==25));await f.store.start();
  assert.ok(!f.store.getState().snapshot.groups[0].messages.some(row=>['119','25'].includes(row.id)));
  assert.ok(f.calls.includes('group:71'));
});
test('manual retry after failed access restores the overview and displayed history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();const original=f.api.access;
  f.api.access=async()=>{throw new Error('Offline');};f.event('group',3);await tick();assert.equal(f.store.getState().ready,false);
  f.api.access=original;await f.store.refreshGroup(room);assert.equal(f.store.getState().ready,true);assert.equal(f.store.getState().snapshot.groups[0].messages.length,2);
});
test('rapid lifecycle changes cannot publish a previous request or its failure', async t => {
  const f=fixture();t.after(()=>f.store.dispose());await f.store.start();let reject;
  f.api.overview=()=>new Promise((_resolve,fail)=>{reject=fail;});const pending=f.store.refresh();const cancelled=assert.rejects(pending,/cancelled/);await tick();f.store.pause();
  f.api.overview=async()=>structuredClone(f.overview);await f.store.start();reject(new Error('Previous connection failed'));await cancelled;await tick();
  assert.equal(f.store.getState().ready,true);assert.equal(f.store.getState().error,'');
});
test('topic joins reconcile the startup gap once every channel is live', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.calls.length=0;
  assert.deepEqual(f.topics(),[`user:${self}`,`group:${room}`]);
  assert.ok(f.channels.every(channel=>channel.params.config.private===true),'topics are private channels');
  // A message lands after the first read but before the channels join; no event arrives for it.
  f.setGroup([row(3),row(2),row(1)]);
  f.live();await tick();await tick();
  assert.equal(f.calls.filter(call=>call==='overview').length,1);assert.equal(f.store.getState().connection,'connected');
  assert.equal(f.store.getState().snapshot.groups[0].messages.at(-1).id,'3');
});
test('30-minute idle benchmark reduces Auth/Data API requests by over 80 percent', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const flush=async()=>{for(let step=0;step<6;step++){for(let i=0;i<30;i++) await Promise.resolve();t.mock.timers.tick(1);}};
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);f.store.openDirect(friend);f.setDirect([]);
  const started=f.store.start();await flush();await started;f.calls.length=0;
  for(let minute=0;minute<15;minute++) {
    t.mock.timers.tick(120000);await flush();
  }
  assert.deepEqual(f.calls,Array(15).fill('overview'));
  // Conservatively compare with only one old 30s full refresh: five table reads,
  // one preview read and three remote identity lookups each time. Extra watchers excluded.
  const before=60*9;const after=f.calls.length;
  assert.ok(1-after/before>=0.8);
  t.diagnostic(`30m simulated idle: ${before} baseline requests vs ${after} optimized (${(100*(1-after/before)).toFixed(1)}% reduction); zero remote identity lookups.`);
});

test('matching mutation events arriving during access verification do not add a trailing read', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.calls.length=0;
  let finish;f.api.access=()=>{f.calls.push('access');return new Promise(resolve=>{finish=()=>resolve(f.access);});};
  f.write(row(3));const request=f.store.refreshGroup(room);await tick();f.event('group',3);finish();await request;await tick();
  assert.deepEqual(f.calls,['access']);assert.equal(f.store.getState().snapshot.groups[0].messages.at(-1).id,'3');
});
test('an account switch clears cached identity and discards previous-account results', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();let finish;
  const previous=structuredClone(f.overview);f.api.overview=()=>new Promise(resolve=>{finish=resolve;});
  const request=f.store.refresh();const cancelled=assert.rejects(request,/cancelled/);await tick();
  const nextId='44444444-4444-4444-8444-444444444444';
  f.overview.userId=nextId;f.overview.profile.display_name='Other account';f.overview.memberships=[];f.overview.friends=[];f.overview.directPreviews={};f.access.userId=nextId;f.access.memberships=[];f.access.acceptedConnectionIds=[];
  f.api.overview=async()=>structuredClone(f.overview);f.auth(nextId);finish(previous);await cancelled;await tick();
  assert.equal(f.store.getState().snapshot.session.id,nextId);assert.equal(f.store.getState().snapshot.session.name,'Other account');assert.deepEqual(f.store.getState().snapshot.groups,[]);
});

test('overview includes a group preview and group events never download unopened history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.overview.memberships[0].preview=row(2);await f.store.start();
  assert.equal(f.store.getState().snapshot.groups[0].messages.at(-1).text,'message 2');f.calls.length=0;
  f.setGroup([row(3),row(2),row(1)]);f.event('group',3);await tick();
  assert.deepEqual(f.calls,['group:ids','access']);assert.equal(f.store.getState().snapshot.groups[0].messages.at(-1).id,'3');
  f.calls.length=0;f.store.openGroup(room);await tick();assert.deepEqual(f.calls,['group:head','access']);assert.equal(f.store.getState().snapshot.groups[0].messages.length,3);
});
test('reconnect restores a late-committed ID below the newest window in previously loaded history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());const rows=Array.from({length:150},(_,i)=>row(150-i));
  f.store.openGroup(room);f.setGroup(rows.filter(row=>row.id!==25));await f.store.start();await f.store.loadOlderGroup(room);await f.store.loadOlderGroup(room);
  f.store.pause();f.setGroup(rows);await f.store.start();assert.ok(f.store.getState().snapshot.groups[0].messages.some(row=>row.id==='25'));
});

test('repeated message-access failures retain exponential backoff until full recovery', async t => {
  const timeout=setTimeout;const delays=[];
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{if(ms>=800&&ms<=30000) delays.push(ms);return timeout(fn,ms,...args);});
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);f.api.access=async()=>{throw new Error('Offline');};
  await f.store.start();await assert.rejects(f.store.refresh('retry'),/Offline/);await assert.rejects(f.store.refresh('retry'),/Offline/);
  assert.deepEqual(delays,[1000,2000,4000]);assert.equal(f.store.getState().ready,false);
});

test('a replaced membership does not load the new room while the old conversation is displayed', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.calls.length=0;
  const nextRoom='55555555-5555-4555-8555-555555555555';
  f.overview.memberships[0].group_id=nextRoom;f.overview.memberships[0].groups.id=nextRoom;
  await f.store.refresh('safety');assert.deepEqual(f.calls,['overview']);assert.equal(f.store.getState().snapshot.groups[0].id,nextRoom);assert.deepEqual(f.store.getState().snapshot.groups[0].messages,[]);
});

test('profile reconciliation updates cached message authors without reloading history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();
  f.overview.profile={id:self,display_name:'Updated name',avatar_url:'https://example.com/avatar.jpg'};
  f.calls.length=0;await f.store.refresh('safety');
  assert.deepEqual(f.calls,['overview']);
  assert.equal(f.store.getState().snapshot.session.name,'Updated name');
  assert.ok(f.store.getState().snapshot.groups[0].messages.every(message=>message.name==='Updated name'&&message.avatarUrl==='https://example.com/avatar.jpg'));
});

test('profile events reconcile visible identities and dropped peers lose subscriptions', async t => {
  const f=fixture();t.after(()=>f.store.dispose());
  const peer='44444444-4444-4444-8444-444444444444';
  f.overview.memberships[0].members=[{user_id:peer,profiles:{id:peer,display_name:'Peer',avatar_url:null}}];
  await f.store.start();
  assert.deepEqual(f.topics(),[`user:${self}`,`group:${room}`],'peers\' profile edits arrive on the shared group topic');
  f.overview.profile.display_name='Updated';f.calls.length=0;f.event('profiles',null);await tick();
  assert.deepEqual(f.calls,['overview']);assert.equal(f.store.getState().snapshot.session.name,'Updated');
  const channelCount=f.channels.length;
  f.overview.memberships[0].members=[];await f.store.refresh();
  assert.equal(f.channels.length,channelCount,'a dropped peer changes no subscriptions');
});

test('a delayed older page cannot restore profile data superseded by an overview', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);
  f.setGroup(Array.from({length:55},(_,i)=>row(55-i)));await f.store.start();
  const original=f.api.groupMessages;let finish;
  f.api.groupMessages=async(...args)=>{const page=await original(...args);await new Promise(resolve=>{finish=resolve;});return page;};
  const older=f.store.loadOlderGroup(room);await tick();
  f.overview.profile={id:self,display_name:'Updated during pagination',avatar_url:'https://example.com/new.jpg'};
  await f.store.refresh('safety');finish();await older;
  const messages=f.store.getState().snapshot.groups[0].messages;
  assert.equal(messages.length,55);
  assert.ok(messages.every(message=>message.name==='Updated during pagination'&&message.avatarUrl==='https://example.com/new.jpg'));
});

test('a primary-key-only friendship deletion promptly drops cached direct access', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openDirect(friend);await f.store.start();
  assert.ok(f.store.getState().directs[friend].messages.length);
  f.overview.friends=[];f.calls.length=0;
  f.broadcast(`user:${self}`,{table:'friendships',type:'DELETE',group_id:friend});await tick();
  assert.deepEqual(f.calls,['overview']);
  assert.deepEqual(f.store.getState().snapshot.friends,[]);
  assert.equal(f.store.getState().directs[friend],undefined);
});

test('a peer expiry refreshes membership without waiting for the safety poll', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const flush=async()=>{for(let step=0;step<6;step++){for(let i=0;i<30;i++) await Promise.resolve();t.mock.timers.tick(1);}};
  const f=fixture();t.after(()=>f.store.dispose());
  const peer='44444444-4444-4444-8444-444444444444';
  f.overview.memberships[0].members=[{user_id:peer,expires_at:new Date(Date.now()+5000).toISOString(),profiles:{display_name:'Expiring peer'}}];
  const started=f.store.start();await flush();await started;f.calls.length=0;
  assert.equal(f.store.getState().snapshot.groups[0].members.length,1);
  f.overview.memberships[0].members=[];
  t.mock.timers.tick(5100);await flush();
  assert.deepEqual(f.calls,['overview']);
  assert.deepEqual(f.store.getState().snapshot.groups[0].members,[]);
});

test('every joined group stays listed and receives its own message events', async t => {
  const f=fixture();t.after(()=>f.store.dispose());
  const second='66666666-6666-4666-8666-666666666666';
  f.overview.memberships.push({ group_id: second, expires_at: '2030-01-02', groups: { id: second, code_key: 'Bar', name: 'Bar' }, members: [], preview: null, headIds: [] });
  f.access.memberships.push({ group_id: second, expires_at: '2030-01-02' });
  await f.store.start();
  assert.deepEqual(f.store.getState().snapshot.groups.map(group=>group.id),[room,second]);
  assert.deepEqual(f.topics(),[`user:${self}`,`group:${room}`,`group:${second}`]);
  f.access.memberships=f.access.memberships.filter(membership=>membership.group_id!==room);
  f.api.groupMessageIds=async()=>[row(3)];f.event('group',3);await tick();
  assert.deepEqual(f.store.getState().snapshot.groups.map(group=>group.id),[second]);
});
test('realtime refusal polls the overview until resubscribed; pause stops polling and the socket', async t => {
  const f=fixture({fallbackMs:20,safetyMs:100000});t.after(()=>f.store.dispose());
  await f.store.start();
  const channel=f.channels.at(-1);
  channel.status('CHANNEL_ERROR',new Error('too_many_connections'));
  assert.equal(f.store.getState().connection,'polling');
  f.calls.length=0;await new Promise(resolve=>setTimeout(resolve,70));
  const polls=f.calls.filter(call=>call==='overview').length;
  assert.ok(polls>=2,`polled ${polls} times`);
  assert.ok(f.calls.every(call=>call==='overview'),'polling reads only the overview while nothing changed');
  f.store.pause();
  assert.ok(f.channels.every(channel=>channel.removed),'pause removes every channel');
  const paused=f.calls.length;await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(f.calls.length,paused,'no polling while paused');
  await f.store.start();
  await tick();f.live();await tick();
  assert.equal(f.store.getState().connection,'connected');
  f.calls.length=0;await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(f.calls.length,0,'a subscribed store does not poll');
});
test('joining a group adds its topic on the same socket without resubscribing the others', async t => {
  const f=fixture();t.after(()=>f.store.dispose());await f.store.start();f.live();await tick();
  const before=f.channels.slice();
  const second='66666666-6666-4666-8666-666666666666';
  f.overview.memberships.push({ group_id: second, expires_at: '2030-01-02', groups: { id: second, code_key: 'Bar', name: 'Bar' }, members: [], preview: null, headIds: [] });
  f.access.memberships.push({ group_id: second, expires_at: '2030-01-02' });
  await f.store.refresh();
  assert.deepEqual(f.topics(),[`user:${self}`,`group:${room}`,`group:${second}`]);
  assert.ok(before.every(channel=>!channel.removed),'existing channels stay joined');
  assert.equal(f.channels.length,before.length+1,'only the new topic is joined');
  f.calls.length=0;f.live();await tick();await tick();
  assert.deepEqual(f.calls.filter(call=>call==='overview'),['overview'],'the new topic closes its join gap with one refresh');
  assert.equal(f.store.getState().connection,'connected');
});
test('unread counts come from the overview, grow with other people\'s messages and clear when a chat is opened', async t => {
  const f=fixture();t.after(()=>f.store.dispose());const peer=message=>({...message,sender_id:'peer'});
  f.overview.unread={[room]:2};await f.store.start();
  assert.deepEqual(f.store.getState().snapshot.unread,{[room]:2});
  f.setGroup([peer(row(3)),row(2),row(1)]);f.event('group',3);await tick();
  assert.equal(f.store.getState().snapshot.unread[room],3,'a message from someone else adds one');
  f.write(row(4));await tick();
  assert.equal(f.store.getState().snapshot.unread[room],3,'your own message is never unread');
  f.setDirect([peer(row(3,true))]);f.event('direct',3);await tick();
  assert.equal(f.store.getState().snapshot.unread[friend],1);
  const close=f.store.openGroup(room);await tick();
  assert.equal(f.store.getState().snapshot.unread[room],undefined);
  assert.deepEqual(f.reads,[[room,4]],'opening marks the newest message read');
  close();f.overview.unread[friend]=1;await f.store.refresh('safety');
  assert.deepEqual(f.store.getState().snapshot.unread,{[friend]:1},'a server count older than the read marker stays cleared');
  f.store.openDirect(friend);await tick();
  assert.deepEqual(f.store.getState().snapshot.unread,{});assert.deepEqual(f.reads.at(-1),[friend,3]);
});
test('messages arriving in an open chat are marked read instead of counted', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();
  f.setGroup([{...row(3),sender_id:'peer'},row(2),row(1)]);f.event('group',3);await tick();
  assert.deepEqual(f.store.getState().snapshot.unread,{});assert.deepEqual(f.reads.at(-1),[room,3]);
});
