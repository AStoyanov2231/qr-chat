// Disposable test accounts only. Emits aggregates, never tokens or message bodies.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createChatApi, createChatStore, createObservedFetch } from '../src/index.ts';

const url = process.env.QR_CHAT_TEST_SUPABASE_URL;
const key = process.env.QR_CHAT_TEST_SUPABASE_PUBLISHABLE_KEY;
assert.equal(process.env.QR_CHAT_BENCHMARK_ENV, 'test', 'Set QR_CHAT_BENCHMARK_ENV=test for an isolated environment.');
assert.ok(url && key && process.env.QR_CHAT_TEST_USERS_FILE, 'Test Supabase URL, public key and disposable user file are required.');
assert.ok(new URL(url).hostname !== 'zkgvdeluswvmwirhhufi.supabase.co', 'Capacity benchmarks must not use the production project.');
const count = Number(process.env.QR_CHAT_BENCHMARK_CLIENTS ?? 1);
const durationMs = Number(process.env.QR_CHAT_BENCHMARK_SECONDS ?? 1800) * 1000;
const roomSize = Number(process.env.QR_CHAT_BENCHMARK_ROOM_SIZE ?? count);
const messageCount = Number(process.env.QR_CHAT_BENCHMARK_MESSAGES ?? 10);
const friendCount = Number(process.env.QR_CHAT_BENCHMARK_FRIENDS ?? 0);
const mode = process.env.QR_CHAT_BENCHMARK_MODE ?? 'idle';
assert.ok(Number.isSafeInteger(count) && count >= 1 && count <= 1000);
assert.ok(durationMs >= 10000 && durationMs <= 3600000);
assert.ok(Number.isSafeInteger(roomSize) && roomSize >= 1 && roomSize <= count);
assert.ok(Number.isSafeInteger(messageCount) && messageCount >= 1 && messageCount <= 100);
assert.ok(Number.isSafeInteger(friendCount) && friendCount >= 0 && friendCount < count && friendCount <= 100);
assert.equal((count*friendCount)%2,0,'An equal accepted-friend count requires an even total degree.');
assert.ok(['idle', 'messages', 'resume'].includes(mode));
const users = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'));
assert.ok(users.length >= count && new Set(users.slice(0,count).map(user=>user.id)).size === count, 'Provide one distinct disposable account per client.');
const actors = [];
const observations = [];
const deliveries = [];
const pending = new Map();
let phase = 'setup';
let decodedResponseBytes = 0;
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const runId = crypto.randomUUID();
const fetcher = async (...args) => {
  const response = await fetch(...args);
  if (phase !== 'setup' && phase !== 'cleanup') decodedResponseBytes += (await response.clone().arrayBuffer()).byteLength;
  return response;
};
function delivered(actor) {
  for (const message of actor.store.getState().snapshot.group?.messages ?? []) {
    const entry = pending.get(message.text);
    if (entry && entry.room === actor.room && !entry.seen.has(actor)) {
      entry.seen.add(actor);deliveries.push(Date.now()-entry.started);
    }
  }
}
const percentile = (values, p) => values.length ? [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)] : null;
try {
  for (const [index,user] of users.slice(0,count).entries()) {
    const observed = createObservedFetch(fetcher, entry => {
      if (phase !== 'setup' && phase !== 'cleanup') observations.push(entry);
    }, () => phase);
    const client = createClient(url,key,{global:{fetch:observed},auth:{persistSession:false,autoRefreshToken:true}});
    const login=await client.auth.signInWithPassword({email:user.email,password:user.password});
    assert.equal(login.error,null,'Test account sign-in failed.');assert.equal(login.data.user.id,user.id);
    const api=createChatApi(client,{qrNameEndpoint:''});
    const store=createChatStore(api);
    const actor={client,api,store,user,room:Math.floor(index/roomSize)};
    actors.push(actor);
    // Dedicated accounts are required because setup removes their previous relationships.
    for(const friend of await api.friends()) await api.removeFriend(friend.id);
    await api.saveProfile({display_name:`Benchmark ${index+1}`});
    await api.joinNamedGroup(`benchmark-${runId}-${actor.room}`,'Traffic benchmark');
    await sleep(200);
  }
  const pairs = new Set();
  for(let i=0;i<count;i++) for(const offset of [...Array.from({length:Math.floor(friendCount/2)},(_,index)=>index+1),...(friendCount%2?[count/2]:[])]) {
    const j=(i+offset)%count;
    const pair=[i,j].sort((a,b)=>a-b).join(':');if(pairs.has(pair)) continue;pairs.add(pair);
    // Accepted friendships persist after shared membership ends; use a temporary room.
    const code=`benchmark-${runId}-connections`;
    await actors[i].api.joinNamedGroup(code,'Benchmark connections');await actors[j].api.joinNamedGroup(code,'Benchmark connections');
    const connection=await actors[i].api.requestFriend(actors[j].user.id);await actors[j].api.acceptFriend(connection);
  }
  if(friendCount) for(const actor of actors) await actor.api.joinNamedGroup(`benchmark-${runId}-${actor.room}`,'Traffic benchmark');
  for(const actor of actors) {actor.store.openGroup();actor.unsubscribe=actor.store.subscribe(()=>delivered(actor));await actor.store.start();actor.groupId=actor.store.getState().snapshot.group.id;}
  // Allow both channel-join and PostgreSQL readiness reconciliations to finish.
  await sleep(5000);
  assert.ok(actors.every(actor=>actor.store.getState().connection==='connected'),'All test clients must be connected before measurement.');
  phase=mode;
  const measuredAt=Date.now();
  if(mode==='idle') await sleep(durationMs);
  else {
    if(mode==='resume') for(const actor of actors) {actor.store.pause();await actor.client.auth.stopAutoRefresh();}
    for(let sequence=0;sequence<messageCount;sequence++) {
      for(const actor of actors.filter((actor,index)=>index%roomSize===0)) {
        const body=`benchmark-${runId}-${sequence}-${actor.room}`;
        pending.set(body,{room:actor.room,started:Date.now(),seen:new Set()});
        await actor.api.sendGroupMessage(actor.groupId,body);
      }
      await sleep(2000);
    }
    if(mode==='resume') for(const actor of actors) {await actor.client.auth.startAutoRefresh();await actor.store.start();}
    await sleep(5000);
  }
  const elapsedSeconds=(Date.now()-measuredAt)/1000;
  const categories=Object.fromEntries([...new Set(observations.map(row=>row.category))].map(category=>{
    const rows=observations.filter(row=>row.category===category);
    return [category,{requests:rows.length,failures:rows.filter(row=>row.status===null||row.status>=400).length,p95Ms:percentile(rows.map(row=>row.durationMs),.95)}];
  }));
  const report={mode,clients:count,roomSize,friendSetupDegree:friendCount,elapsedSeconds,httpRequests:observations.length,requestsPerClientMinute:observations.length/count/(elapsedSeconds/60),decodedResponseBytes,knownWireBytes:observations.reduce((sum,row)=>sum+(row.responseBytes??0),0),unknownWireSizeRequests:observations.filter(row=>row.responseBytes===null).length,categories,deliveryP95Ms:percentile(deliveries,.95),deliveryMaxMs:deliveries.length?Math.max(...deliveries):null,expectedDeliveries:[...pending.values()].reduce((sum,entry)=>sum+actors.filter(actor=>actor.room===entry.room).length,0),receivedDeliveries:deliveries.length};
  console.log(JSON.stringify(report,null,2));
  if(process.env.QR_CHAT_BENCHMARK_OUTPUT) writeFileSync(process.env.QR_CHAT_BENCHMARK_OUTPUT,JSON.stringify(report,null,2));
  if(process.env.QR_CHAT_BASELINE_FILE) {
    const baseline=JSON.parse(readFileSync(process.env.QR_CHAT_BASELINE_FILE,'utf8'));
    assert.equal(baseline.clients,count);assert.equal(baseline.mode,mode);assert.equal(baseline.roomSize,roomSize);assert.equal(baseline.friendSetupDegree,friendCount);
    const before=(baseline.categories.auth?.requests??0)+(baseline.categories.overview?.requests??0)+(baseline.categories.access?.requests??0)+(baseline.categories.messages?.requests??0)+(baseline.categories.other?.requests??0);
    const after=observations.filter(row=>row.category!=='storage'&&row.category!=='metadata').length;
    assert.ok(before>0,'A measured Auth/Data baseline is required.');
    if(mode==='idle') assert.ok(after/elapsedSeconds<=.2*before/baseline.elapsedSeconds,'Idle Auth/Data request reduction must reach 80%.');
  }
  if(mode==='messages') {assert.equal(report.receivedDeliveries,report.expectedDeliveries);assert.ok(report.deliveryMaxMs<=2000,'Healthy delivery must stay within two seconds.');}
  if(mode==='resume') assert.equal(report.receivedDeliveries,report.expectedDeliveries);
} finally {
  phase='cleanup';
  for(const actor of actors) {
    actor.unsubscribe?.();actor.store.dispose();await actor.client.auth.stopAutoRefresh();await actor.client.removeAllChannels();
    for(const friend of await actor.api.friends()) await actor.api.removeFriend(friend.id).catch(()=>{});
    await actor.api.leaveGroup();
  }
}
