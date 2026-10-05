import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from '../src/store.ts';
const self = '11111111-1111-4111-8111-111111111111';
const room = '22222222-2222-4222-8222-222222222222';
const friend = '33333333-3333-4333-8333-333333333333';
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 15)); };
const row = (id, direct = false) => ({ id, sender_id: self, body: `message ${id}`, created_at: '2026-01-01T00:00:00Z', ...(direct ? { group_id: friend } : { group_id: room, profiles: { display_name: 'Andy', avatar_url: null } }) });
function fixture(options = {}) {
  const calls = []; const channels = []; const mutations = new Set(); let authListener; let id = self;
  const overview = { userId: self, profile: { display_name: 'Andy' }, membership: { group_id: room, expires_at: '2030-01-01', groups: { id: room, code_key: 'Cafe', name: 'Cafe' } }, members: [], friends: [{ id: friend, accepted_at: 'yes' }], directPreviews: { [friend]: null }, groupHeadIds: [2, 1] };
  const access = { userId: self, membership: overview.membership, acceptedConnectionIds: [friend] };
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
    clearSessionCache() {},
    onMutation(listener) { mutations.add(listener); return () => mutations.delete(listener); },
    client: {
      auth: { onAuthStateChange(listener) { authListener = listener; return { data: { subscription: { unsubscribe() {} } } }; } },
      channel() { const channel = { callbacks: [], on(type, filter, handler) { if(type === 'system') this.system=handler;else this.callbacks.push({filter,handler});return this; }, subscribe(handler) {this.status=handler;return this;} };channels.push(channel);return channel; },
      removeChannel: async channel => {channel.removed=true;},
    },
  };
  const store = createChatStore(api, { coalesceMs: 1, random: () => 1, ...options });
  return { api, store, calls, overview, access, channels,
    auth(next) {id=next;authListener('SIGNED_IN', next ? {user:{id:next}} : null);},
    write(message, kind='group') {for(const listener of mutations) listener({kind,userId:self,message});},
    event(kind, messageId) {const filter=`group_id=eq.${kind==='direct'?friend:room}`;for(const callback of channels.at(-1).callbacks) if(callback.filter.table==='messages'&&callback.filter.filter===filter) callback.handler({new:{id:messageId},eventType:'INSERT'});},
    setGroup(rows) {groupRows=rows;overview.groupHeadIds=rows.slice(0,50).map(row=>row.id);},
    setDirect(rows) {directRows=rows;overview.directPreviews[friend]=rows[0]??null;},
  };
}
test('idle overview does not read history or individual friends; pause stops work', async t => {
  const {store,calls}=fixture({safetyMs:20});t.after(()=>store.dispose());
  await store.start();await new Promise(resolve=>setTimeout(resolve,65));
  assert.ok(calls.filter(call=>call==='overview').length>=3);
  assert.ok(calls.every(call=>call==='overview'));
  store.pause();assert.equal(store.getState().ready,false);assert.equal(store.getState().snapshot.group,null);const paused=calls.length;await new Promise(resolve=>setTimeout(resolve,50));assert.equal(calls.length,paused);
  await store.start();assert.equal(calls.at(-1),'overview');
});
test('only displayed conversations load history and pagination downloads one next page', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.setGroup(Array.from({length:120},(_,i)=>row(120-i)));
  const close=f.store.openGroup();await f.store.start();
  assert.equal(f.store.getState().snapshot.group.messages.length,50);f.calls.length=0;
  await f.store.loadOlderGroup();assert.deepEqual(f.calls,['group:71','access']);assert.equal(f.store.getState().snapshot.group.messages.length,100);
  close();f.calls.length=0;await f.store.refresh('safety');assert.deepEqual(f.calls,['overview']);
});
test('message bursts fetch authorized IDs without rereading profile, contacts or history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();f.calls.length=0;
  f.setGroup([row(4),row(3),row(2),row(1)]);f.event('group',3);f.event('group',4);await tick();
  assert.deepEqual(f.calls,['group:ids','access']);assert.deepEqual(f.store.getState().snapshot.group.messages.map(row=>row.id),['1','2','3','4']);
});
test('mutation plus matching event and composer refresh share the returned row', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();f.calls.length=0;
  f.write(row(3));f.event('group',3);await f.store.refreshGroup();assert.deepEqual(f.calls,['access']);
  assert.equal(f.store.getState().snapshot.group.messages.at(-1).id,'3');
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
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();f.setGroup([row(4),row(2),row(1)]);await f.store.start();
  f.setGroup([row(4),row(3),row(2),row(1)]);await f.store.refresh('safety');
  assert.deepEqual(f.store.getState().snapshot.group.messages.map(row=>row.id),['1','2','3','4']);
});
test('long reconnect gaps paginate until overlapping cached history without rereading older pages', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();f.store.pause();
  f.setGroup(Array.from({length:120},(_,i)=>row(120-i)));f.calls.length=0;await f.store.start();
  assert.deepEqual(f.calls,['overview','group:head','group:71','group:21','access']);assert.equal(f.store.getState().snapshot.group.messages.length,120);
});
test('access revoked during message loading clears the conversation before publication', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();
  f.api.groupMessageIds=async()=>{f.access.membership=null;return[row(3)];};f.event('group',3);await tick();
  assert.equal(f.store.getState().snapshot.group,null);
});
test('failed access check hides private data without claiming membership expired', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();
  f.api.access=async()=>{throw new Error('Offline');};f.event('group',3);await tick();
  assert.equal(f.store.getState().ready,false);assert.equal(f.store.getState().snapshot.group,null);assert.equal(f.store.getState().hasObservedGroup,true);assert.equal(f.store.getState().error,'Offline');
});
test('removed friendship clears messages, previews and subscriptions on the safety check', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openDirect(friend);await f.store.start();
  f.overview.friends=[];f.overview.directPreviews={};f.access.acceptedConnectionIds=[];await f.store.refresh('safety');
  assert.equal(f.store.getState().directs[friend],undefined);assert.equal(f.store.getState().snapshot.directPreviews[friend],undefined);
  assert.ok(f.channels.at(-1).callbacks.every(callback=>!(callback.filter.table==='messages'&&callback.filter.filter===`group_id=eq.${friend}`)));
});
test('same-identity auth events do not trigger reads; sign-out invalidates in-flight data', async t => {
  const f=fixture();t.after(()=>f.store.dispose());await f.store.start();f.calls.length=0;f.auth(self);await tick();assert.equal(f.calls.length,0);
  let finish;f.api.overview=()=>new Promise(resolve=>{finish=resolve;});const request=f.store.refresh();const rejected=assert.rejects(request,/cancelled/);await tick();f.auth(null);finish(f.overview);await rejected;await tick();
  assert.equal(f.store.getState().snapshot.session,null);assert.equal(f.store.getState().ready,false);
});

test('unchanged displayed conversations add no history reads to the single safety check', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();f.store.openDirect(friend);await f.store.start();
  f.overview.directPreviews[friend]=row(2,true);f.calls.length=0;
  await f.store.refresh('safety');assert.deepEqual(f.calls,['overview']);
});
test('missed deletes are removed from newest and older cached pages on reconnect', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();f.setGroup(Array.from({length:120},(_,i)=>row(120-i)));await f.store.start();await f.store.loadOlderGroup();
  f.store.pause();f.setGroup(Array.from({length:120},(_,i)=>row(120-i)).filter(value=>value.id!==119&&value.id!==25));await f.store.start();
  assert.ok(!f.store.getState().snapshot.group.messages.some(row=>['119','25'].includes(row.id)));
  assert.ok(f.calls.includes('group:71'));
});
test('manual retry after failed access restores the overview and displayed history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();const original=f.api.access;
  f.api.access=async()=>{throw new Error('Offline');};f.event('group',3);await tick();assert.equal(f.store.getState().ready,false);
  f.api.access=original;await f.store.refreshGroup();assert.equal(f.store.getState().ready,true);assert.equal(f.store.getState().snapshot.group.messages.length,2);
});
test('rapid lifecycle changes cannot publish a previous request or its failure', async t => {
  const f=fixture();t.after(()=>f.store.dispose());await f.store.start();let reject;
  f.api.overview=()=>new Promise((_resolve,fail)=>{reject=fail;});const pending=f.store.refresh();const cancelled=assert.rejects(pending,/cancelled/);await tick();f.store.pause();
  f.api.overview=async()=>structuredClone(f.overview);await f.store.start();reject(new Error('Previous connection failed'));await cancelled;await tick();
  assert.equal(f.store.getState().ready,true);assert.equal(f.store.getState().error,'');
});
test('replication readiness merges startup hints and reconciles the eventual startup gap', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();f.calls.length=0;
  const channel=f.channels.at(-1);channel.status('SUBSCRIBED');channel.system({extension:'postgres_changes',status:'ok'});await tick();
  assert.equal(f.calls.filter(call=>call==='overview').length,1);await tick();assert.equal(f.store.getState().connection,'connected');
  f.setGroup([row(3),row(2),row(1)]);channel.system({extension:'postgres_changes',status:'ok'});await tick();
  assert.equal(f.store.getState().snapshot.group.messages.at(-1).id,'3');
});
test('30-minute idle benchmark reduces Auth/Data API requests by over 80 percent', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const flush=async()=>{for(let step=0;step<6;step++){for(let i=0;i<30;i++) await Promise.resolve();t.mock.timers.tick(1);}};
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();f.store.openDirect(friend);f.setDirect([]);
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
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();f.calls.length=0;
  let finish;f.api.access=()=>{f.calls.push('access');return new Promise(resolve=>{finish=()=>resolve(f.access);});};
  f.write(row(3));const request=f.store.refreshGroup();await tick();f.event('group',3);finish();await request;await tick();
  assert.deepEqual(f.calls,['access']);assert.equal(f.store.getState().snapshot.group.messages.at(-1).id,'3');
});
test('an account switch clears cached identity and discards previous-account results', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();let finish;
  const previous=structuredClone(f.overview);f.api.overview=()=>new Promise(resolve=>{finish=resolve;});
  const request=f.store.refresh();const cancelled=assert.rejects(request,/cancelled/);await tick();
  const nextId='44444444-4444-4444-8444-444444444444';
  f.overview.userId=nextId;f.overview.profile.display_name='Other account';f.overview.membership=null;f.overview.friends=[];f.overview.directPreviews={};f.access.userId=nextId;f.access.membership=null;f.access.acceptedConnectionIds=[];
  f.api.overview=async()=>structuredClone(f.overview);f.auth(nextId);finish(previous);await cancelled;await tick();
  assert.equal(f.store.getState().snapshot.session.id,nextId);assert.equal(f.store.getState().snapshot.session.name,'Other account');assert.equal(f.store.getState().snapshot.group,null);
});

test('overview includes a group preview and group events never download unopened history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.overview.groupPreview=row(2);await f.store.start();
  assert.equal(f.store.getState().snapshot.group.messages.at(-1).text,'message 2');f.calls.length=0;
  f.setGroup([row(3),row(2),row(1)]);f.event('group',3);await tick();
  assert.deepEqual(f.calls,['group:ids','access']);assert.equal(f.store.getState().snapshot.group.messages.at(-1).id,'3');
  f.calls.length=0;f.store.openGroup();await tick();assert.deepEqual(f.calls,['group:head','access']);assert.equal(f.store.getState().snapshot.group.messages.length,3);
});
test('reconnect restores a late-committed ID below the newest window in previously loaded history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());const rows=Array.from({length:150},(_,i)=>row(150-i));
  f.store.openGroup();f.setGroup(rows.filter(row=>row.id!==25));await f.store.start();await f.store.loadOlderGroup();await f.store.loadOlderGroup();
  f.store.pause();f.setGroup(rows);await f.store.start();assert.ok(f.store.getState().snapshot.group.messages.some(row=>row.id==='25'));
});

test('repeated message-access failures retain exponential backoff until full recovery', async t => {
  const timeout=setTimeout;const delays=[];
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{if(ms>=800&&ms<=30000) delays.push(ms);return timeout(fn,ms,...args);});
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();f.api.access=async()=>{throw new Error('Offline');};
  await f.store.start();await assert.rejects(f.store.refresh('retry'),/Offline/);await assert.rejects(f.store.refresh('retry'),/Offline/);
  assert.deepEqual(delays,[1000,2000,4000]);assert.equal(f.store.getState().ready,false);
});

test('a replaced membership does not load the new room while the old conversation is displayed', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup(room);await f.store.start();f.calls.length=0;
  const nextRoom='55555555-5555-4555-8555-555555555555';
  f.overview.membership.group_id=nextRoom;f.overview.membership.groups.id=nextRoom;
  await f.store.refresh('safety');assert.deepEqual(f.calls,['overview']);assert.equal(f.store.getState().snapshot.group.id,nextRoom);assert.deepEqual(f.store.getState().snapshot.group.messages,[]);
});

test('profile reconciliation updates cached message authors without reloading history', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();await f.store.start();
  f.overview.profile={id:self,display_name:'Updated name',avatar_url:'https://example.com/avatar.jpg'};
  f.calls.length=0;await f.store.refresh('safety');
  assert.deepEqual(f.calls,['overview']);
  assert.equal(f.store.getState().snapshot.session.name,'Updated name');
  assert.ok(f.store.getState().snapshot.group.messages.every(message=>message.name==='Updated name'&&message.avatarUrl==='https://example.com/avatar.jpg'));
});

test('profile events reconcile visible identities and dropped peers lose subscriptions', async t => {
  const f=fixture();t.after(()=>f.store.dispose());
  const peer='44444444-4444-4444-8444-444444444444';
  f.overview.members=[{user_id:peer,profiles:{id:peer,display_name:'Peer',avatar_url:null}}];
  await f.store.start();
  assert.deepEqual(f.channels.at(-1).callbacks.filter(entry=>entry.filter.table==='profiles').map(entry=>entry.filter.filter),[`id=eq.${self}`,`id=eq.${peer}`]);
  f.overview.profile.display_name='Updated';f.calls.length=0;f.event('profiles',null);await tick();
  assert.deepEqual(f.calls,['overview']);assert.equal(f.store.getState().snapshot.session.name,'Updated');
  f.overview.members=[];await f.store.refresh();
  assert.deepEqual(f.channels.at(-1).callbacks.filter(entry=>entry.filter.table==='profiles').map(entry=>entry.filter.filter),[`id=eq.${self}`]);
});

test('a delayed older page cannot restore profile data superseded by an overview', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openGroup();
  f.setGroup(Array.from({length:55},(_,i)=>row(55-i)));await f.store.start();
  const original=f.api.groupMessages;let finish;
  f.api.groupMessages=async(...args)=>{const page=await original(...args);await new Promise(resolve=>{finish=resolve;});return page;};
  const older=f.store.loadOlderGroup();await tick();
  f.overview.profile={id:self,display_name:'Updated during pagination',avatar_url:'https://example.com/new.jpg'};
  await f.store.refresh('safety');finish();await older;
  const messages=f.store.getState().snapshot.group.messages;
  assert.equal(messages.length,55);
  assert.ok(messages.every(message=>message.name==='Updated during pagination'&&message.avatarUrl==='https://example.com/new.jpg'));
});

test('a primary-key-only friendship deletion promptly drops cached direct access', async t => {
  const f=fixture();t.after(()=>f.store.dispose());f.store.openDirect(friend);await f.store.start();
  assert.ok(f.store.getState().directs[friend].messages.length);
  const deletion=f.channels.at(-1).callbacks.find(({filter})=>filter.table==='friendships'&&filter.event==='DELETE');
  assert.equal(deletion.filter.filter,`group_id=eq.${friend}`);
  f.overview.friends=[];f.calls.length=0;
  deletion.handler({eventType:'DELETE',old:{group_id:friend},new:{}});await tick();
  assert.deepEqual(f.calls,['overview']);
  assert.deepEqual(f.store.getState().snapshot.friends,[]);
  assert.equal(f.store.getState().directs[friend],undefined);
  assert.ok(f.channels.at(-1).callbacks.every(({filter})=>filter.filter!==`id=eq.${friend}`));
});

test('a peer expiry refreshes membership without waiting for the safety poll', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const flush=async()=>{for(let step=0;step<6;step++){for(let i=0;i<30;i++) await Promise.resolve();t.mock.timers.tick(1);}};
  const f=fixture();t.after(()=>f.store.dispose());
  const peer='44444444-4444-4444-8444-444444444444';
  f.overview.members=[{user_id:peer,expires_at:new Date(Date.now()+5000).toISOString(),profiles:{display_name:'Expiring peer'}}];
  const started=f.store.start();await flush();await started;f.calls.length=0;
  assert.equal(f.store.getState().snapshot.group.members.length,1);
  f.overview.members=[];
  t.mock.timers.tick(5100);await flush();
  assert.deepEqual(f.calls,['overview']);
  assert.deepEqual(f.store.getState().snapshot.group.members,[]);
});
