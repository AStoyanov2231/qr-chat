import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
async function load(relative, mocks) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fixture = { exports: {} };
  runInThisContext(`(function(require,module,exports){${output}\n})`)(name => mocks[name] ?? require(name), fixture, fixture.exports);
  return fixture.exports;
}

test('the route passes only the verified user id to the server-side resolver', async () => {
  let authenticated = true; let calls = []; let fails = false;
  const { POST } = await load('../src/app/api/qr-name/route.ts', {
    '@/lib/group-metadata': { resolveGroup: async (...args) => { calls.push(args); if (fails) throw new Error('down'); return 'Fanta Orange'; } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: authenticated ? { sub: 'test-account' } : {} }, error: null }) } }) },
    '@/lib/qr-name-route': await import('../src/lib/qr-name-route.ts'),
  });
  const request = code => new Request('https://app.example/api/qr-name', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code}) });
  const response = await POST(request('gtin:5449000006271'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { name: 'Fanta Orange' });
  assert.deepEqual(calls, [['test-account', 'gtin:5449000006271']]);
  authenticated = false;
  assert.equal((await POST(request('gtin:5449000006271'))).status, 401);
  assert.equal(calls.length, 1);
  authenticated = true; fails = true;
  assert.equal((await POST(request('gtin:5449000006271'))).status, 503);
});

// A chainable stand-in for supabase-js: records every builder call, resolves to the next queued result.
function fakeDb(results) {
  const log = [];
  const builder = (table) => new Proxy({}, { get(_, method) {
    if (method === 'then') { const result = results.shift() ?? { data: null, error: null }; return (resolve) => resolve(result); }
    return (...args) => { log.push([table, method, ...args]); return builder(table); };
  } });
  return { log, client: { from: builder, storage: { from: (bucket) => ({ upload: async (...args) => { log.push([bucket, 'upload', ...args]); return { error: null }; } }) } } };
}
async function loadResolver(db, fetches, pageName = null) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => { const next = fetches.shift(); assert.ok(next, `unexpected fetch ${url}`); return next(String(url)); };
  const resolver = await load('../src/lib/group-metadata.ts', {
    '@supabase/supabase-js': { createClient: () => db.client },
    '@/lib/qr-name-metadata': { lookupQrPageName: async () => pageName },
    '@qr-chat/domain': await import('@qr-chat/domain'),
    '@qr-chat/validation': await import('@qr-chat/validation'),
  });
  return { resolveGroup: resolver.resolveGroup, restore: () => { globalThis.fetch = previous; } };
}
const groupId = '33333333-3333-4333-8333-333333333333';
const cacheMiss = () => ({ data: null, error: null });
const activeMember = (name = null) => ({ data: { expires_at: new Date(Date.now() + 60_000).toISOString(), groups: { id: groupId, name } }, error: null });

test('product lookup names and photographs only an unnamed group the caller is an active member of', async (t) => {
  const db = fakeDb([activeMember(), cacheMiss(), { data: [{ id: groupId }], error: null }, { data: null, error: null }, { data: null, error: null }]);
  const seen = [];
  const { resolveGroup, restore } = await loadResolver(db, [
    (url) => { seen.push(url); return Response.json({ product: { product_name: 'Fanta Orange', brands: 'Fanta, Coca-Cola', image_front_url: 'https://images.openfoodfacts.org/images/products/544/front_en.400.jpg' } }); },
    (url) => { seen.push(url); return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } }); },
  ]);
  t.after(restore);
  assert.equal(await resolveGroup('user-1', 'gtin:5449000006271'), 'Fanta Orange');
  assert.match(seen[0], /\/api\/v2\/product\/5449000006271\?/);
  assert.ok(db.log.some(([table, method, ...args]) => table === 'group_members' && method === 'eq' && args[0] === 'user_id' && args[1] === 'user-1'));
  const upload = db.log.find(([bucket, method]) => bucket === 'group-images' && method === 'upload');
  assert.equal(upload[2], 'p/5449000006271.jpg', 'the photo is stored once per product');
  assert.equal(upload[4].cacheControl, '31536000', 'the per-product photo path is immutable, so it caches for a year');
  const write = db.log.filter(([table, method]) => table === 'groups' && method === 'update').at(-1);
  assert.deepEqual(write[2], { name: 'Fanta Orange', image_path: 'p/5449000006271.jpg' });
});

test('non-members, named groups and throttled groups never trigger a lookup', async (t) => {
  for (const first of [{ data: null, error: null }, activeMember('Fanta Orange'), { data: { expires_at: new Date(Date.now() - 1).toISOString(), groups: { id: groupId, name: null } }, error: null }]) {
    const { resolveGroup, restore } = await loadResolver(fakeDb([first]), []);
    t.after(restore);
    const name = await resolveGroup('user-1', 'gtin:5449000006271');
    assert.equal(name, first.data?.groups.name && Date.parse(first.data.expires_at) > Date.now() ? 'Fanta Orange' : null);
  }
  const throttled = fakeDb([activeMember(), cacheMiss(), { data: [], error: null }]);
  const { resolveGroup, restore } = await loadResolver(throttled, []);
  t.after(restore);
  assert.equal(await resolveGroup('user-1', 'gtin:5449000006271'), null);
  assert.equal(throttled.log.filter(([table, method]) => table === 'groups' && method === 'update').length, 1, 'only the claim, no write');
});

test('EAN-8 codes are looked up unpadded and a product missing from Open Food Facts stays unnamed', async (t) => {
  const db = fakeDb([activeMember(), cacheMiss(), { data: [{ id: groupId }], error: null }]);
  const seen = [];
  const { resolveGroup, restore } = await loadResolver(db, [(url) => { seen.push(url); return new Response('{}', { status: 404 }); }]);
  t.after(restore);
  assert.equal(await resolveGroup('user-1', 'gtin:0000096385074'), null);
  assert.match(seen[0], /\/product\/96385074\?/);
});

const upserts = (db) => db.log.filter(([table, method]) => table === 'products' && method === 'upsert').map((entry) => entry[2]);
const groupWrites = (db) => db.log.filter(([table, method, change]) => table === 'groups' && method === 'update' && 'name' in change).map((entry) => entry[2]);
const offProduct = () => Response.json({ product: { product_name: 'Fanta Orange', brands: 'Fanta', image_front_url: 'https://images.openfoodfacts.org/images/products/544/front_en.400.jpg' } });
const offPhoto = () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });

test('a cached product names the group with no Open Food Facts call and no hourly claim', async (t) => {
  const db = fakeDb([activeMember(), { data: { name: 'Fanta Orange', image_path: 'p/5449000006271.jpg', not_found: false, fetched_at: new Date().toISOString() }, error: null }, { data: null, error: null }]);
  const { resolveGroup, restore } = await loadResolver(db, []);
  t.after(restore);
  assert.equal(await resolveGroup('user-1', 'gtin:5449000006271'), 'Fanta Orange');
  assert.deepEqual(groupWrites(db), [{ name: 'Fanta Orange', image_path: 'p/5449000006271.jpg' }]);
  assert.ok(!db.log.some(([table, method, change]) => table === 'groups' && method === 'update' && 'metadata_checked_at' in change), 'no claim on a cache hit');
  assert.ok(!db.log.some(([, method]) => method === 'upload'), 'the shared photo is not uploaded again');
});

test('a cache miss calls Open Food Facts once and stores the product', async (t) => {
  const db = fakeDb([activeMember(), cacheMiss(), { data: [{ id: groupId }], error: null }, { data: null, error: null }, { data: null, error: null }]);
  let calls = 0;
  const { resolveGroup, restore } = await loadResolver(db, [() => { calls++; return offProduct(); }, offPhoto]);
  t.after(restore);
  assert.equal(await resolveGroup('user-1', 'gtin:5449000006271'), 'Fanta Orange');
  assert.equal(calls, 1);
  const [stored] = upserts(db);
  assert.deepEqual({ ...stored, fetched_at: typeof stored.fetched_at }, { gtin: '5449000006271', name: 'Fanta Orange', image_path: 'p/5449000006271.jpg', not_found: false, fetched_at: 'string' });
});

test('rate limits, server errors and timeouts cache nothing and leave the hourly retry in place', async (t) => {
  for (const failure of [() => new Response('slow down', { status: 429 }), () => new Response('down', { status: 503 }), () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }]) {
    const db = fakeDb([activeMember(), cacheMiss(), { data: [{ id: groupId }], error: null }]);
    const { resolveGroup, restore } = await loadResolver(db, [failure]);
    assert.equal(await resolveGroup('user-1', 'gtin:5449000006271'), null);
    restore();
    assert.deepEqual(upserts(db), [], 'nothing is cached');
    assert.deepEqual(groupWrites(db), [], 'the group keeps its fallback name');
    assert.ok(db.log.some(([table, method, change]) => table === 'groups' && method === 'update' && 'metadata_checked_at' in change), 'the claim records the attempt so the next try is an hour later');
  }
});

test('a product Open Food Facts does not know is cached for 30 days, then looked up again', async (t) => {
  const missing = fakeDb([activeMember(), cacheMiss(), { data: [{ id: groupId }], error: null }, { data: null, error: null }]);
  let lookup = await loadResolver(missing, [() => new Response('{}', { status: 404 })]);
  assert.equal(await lookup.resolveGroup('user-1', 'gtin:5449000006271'), null);
  lookup.restore();
  assert.deepEqual(upserts(missing).map(({ gtin, name, not_found }) => ({ gtin, name, not_found })), [{ gtin: '5449000006271', name: null, not_found: true }]);

  const fresh = fakeDb([activeMember(), { data: { name: null, image_path: null, not_found: true, fetched_at: new Date(Date.now() - 29 * 86400000).toISOString() }, error: null }]);
  lookup = await loadResolver(fresh, []);
  assert.equal(await lookup.resolveGroup('user-1', 'gtin:5449000006271'), null, 'a recent miss makes no call and no claim');
  lookup.restore();
  assert.equal(fresh.log.filter(([table, method]) => table === 'groups' && method === 'update').length, 0);

  const stale = fakeDb([activeMember(), { data: { name: null, image_path: null, not_found: true, fetched_at: new Date(Date.now() - 31 * 86400000).toISOString() }, error: null }, { data: [{ id: groupId }], error: null }, { data: null, error: null }, { data: null, error: null }]);
  let calls = 0;
  lookup = await loadResolver(stale, [() => { calls++; return offProduct(); }, offPhoto]);
  t.after(lookup.restore);
  assert.equal(await lookup.resolveGroup('user-1', 'gtin:5449000006271'), 'Fanta Orange', 'after 30 days the product is fetched again');
  assert.equal(calls, 1);
});

test('two groups from the same barcode share one stored photo', async (t) => {
  const first = fakeDb([activeMember(), cacheMiss(), { data: [{ id: groupId }], error: null }, { data: null, error: null }, { data: null, error: null }]);
  let lookup = await loadResolver(first, [offProduct, offPhoto]);
  await lookup.resolveGroup('user-1', 'gtin:5449000006271');
  lookup.restore();
  const [cached] = upserts(first);
  const otherGroup = '55555555-5555-4555-8555-555555555555';
  const second = fakeDb([{ data: { expires_at: new Date(Date.now() + 60_000).toISOString(), groups: { id: otherGroup, name: null } }, error: null }, { data: cached, error: null }, { data: null, error: null }]);
  lookup = await loadResolver(second, []);
  t.after(lookup.restore);
  await lookup.resolveGroup('user-2', 'gtin:5449000006271');
  assert.equal(groupWrites(first)[0].image_path, 'p/5449000006271.jpg');
  assert.equal(groupWrites(second)[0].image_path, 'p/5449000006271.jpg', 'the second group reuses the first photo');
  assert.equal(second.log.filter(([, method]) => method === 'upload').length, 0);
});

test('web session host pauses on hidden/offline, resumes once and removes lifecycle listeners', async t => {
  const effects=[];const events=new Map();let starts=0;let pauses=0;let active=false;let disposed=false;let authCleaned=false;let authListener;let revoked=false;
  const listen=(name,fn)=>events.set(name,fn);const remove=name=>events.delete(name);
  const previous = Object.fromEntries(['document','navigator','window'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor] of Object.entries(previous)) {if(descriptor) Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  Object.defineProperty(globalThis,'document',{value:{hidden:false,addEventListener:listen,removeEventListener:remove},configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  Object.defineProperty(globalThis,'window',{value:{addEventListener:listen,removeEventListener:remove,location:{replace(path){assert.equal(revoked,true,"Access must be revoked before redirect");assert.equal(path,"/sign-in");}}},configurable:true});
  const api={client:{auth:{getSession:async()=>({data:{session:{}}}),onAuthStateChange:fn=>{authListener=fn;return {data:{subscription:{unsubscribe(){authCleaned=true;}}}};}}}};
  const store={async start(){if(!active){active=true;starts++;}},pause(){if(active){active=false;pauses++;}},dispose(){disposed=true;}};
  const { ChatSessionProvider }=await load('../src/hooks/use-chat-backend.tsx',{
    react:{createContext:()=>({}),useState:fn=>typeof fn === "function" ? [fn()] : [revoked, value=>{revoked=value;}],useEffect:fn=>effects.push(fn)},
    'react/jsx-runtime':{jsx:()=>({protected:true})},
    'react-dom':{flushSync:fn=>fn()},
    '@qr-chat/api':{createChatApi:()=>api,getChatStore:()=>store},
    '@/lib/supabase/client':{createClient:()=>api.client},
    '@/lib/auth/redirect':await import('../src/lib/auth/redirect.ts'),
  });
  ChatSessionProvider({children:null});const cleanup=effects[0]();assert.equal(starts,0,'nothing starts before the session check');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,1);
  document.hidden=true;events.get('visibilitychange')();assert.equal(pauses,1);
  navigator.onLine=false;events.get('offline')();assert.equal(pauses,1);
  document.hidden=false;events.get('visibilitychange')();assert.equal(starts,1);
  navigator.onLine=true;events.get('online')();events.get('visibilitychange')();assert.equal(starts,2);
  authListener("SIGNED_OUT");assert.equal(ChatSessionProvider({children:"Protected content"}),null);
  cleanup();assert.equal(events.size,0);assert.ok(disposed&&authCleaned);
});

test('the static app shell sends a signed-out visitor to sign-in with their destination and starts nothing', async t => {
  const effects=[];let starts=0;let revoked=false;let destination;
  const previous = Object.fromEntries(['document','navigator','window'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor] of Object.entries(previous)) {if(descriptor) Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  Object.defineProperty(globalThis,'document',{value:{hidden:false,addEventListener(){},removeEventListener(){}},configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  Object.defineProperty(globalThis,'window',{value:{addEventListener(){},removeEventListener(){},location:{pathname:'/',search:'?code=Room%2B1',replace(path){assert.equal(revoked,true);destination=path;}}},configurable:true});
  const api={client:{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}};
  const { ChatSessionProvider }=await load('../src/hooks/use-chat-backend.tsx',{
    react:{createContext:()=>({}),useState:fn=>typeof fn === "function" ? [fn()] : [revoked, value=>{revoked=value;}],useEffect:fn=>effects.push(fn)},
    'react/jsx-runtime':{jsx:()=>({protected:true})},
    'react-dom':{flushSync:fn=>fn()},
    '@qr-chat/api':{createChatApi:()=>api,getChatStore:()=>({async start(){starts++;},pause(){},dispose(){}})},
    '@/lib/supabase/client':{createClient:()=>api.client},
    '@/lib/auth/redirect':await import('../src/lib/auth/redirect.ts'),
  });
  ChatSessionProvider({children:null});effects[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(starts,0);
  assert.equal(new URL(destination,'https://qr-chat.example').searchParams.get('next'),'/?code=Room%2B1');
});


test('a session that cannot refresh while offline keeps the user in the app instead of sending them to sign-in', async t => {
  const effects=[];let starts=0;let redirected=false;
  const previous = Object.fromEntries(['document','navigator','window'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor] of Object.entries(previous)) {if(descriptor) Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  Object.defineProperty(globalThis,'document',{value:{hidden:false,addEventListener(){},removeEventListener(){}},configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  Object.defineProperty(globalThis,'window',{value:{addEventListener(){},removeEventListener(){},location:{pathname:'/',search:'',replace(){redirected=true;}}},configurable:true});
  const api={client:{auth:{getSession:async()=>({data:{session:null},error:new Error('AuthRetryableFetchError: Failed to fetch')}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}};
  const { ChatSessionProvider }=await load('../src/hooks/use-chat-backend.tsx',{
    react:{createContext:()=>({}),useState:fn=>typeof fn === "function" ? [fn()] : [false,()=>{}],useEffect:fn=>effects.push(fn)},
    'react/jsx-runtime':{jsx:()=>({protected:true})},
    'react-dom':{flushSync:fn=>fn()},
    '@qr-chat/api':{createChatApi:()=>api,getChatStore:()=>({async start(){starts++;},pause(){},dispose(){}})},
    '@/lib/supabase/client':{createClient:()=>api.client},
    '@/lib/auth/redirect':await import('../src/lib/auth/redirect.ts'),
  });
  ChatSessionProvider({children:null});effects[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(redirected,false,'a refresh failure is not a sign-out');
  assert.equal(starts,1,'the store starts and shows its own connection error until auth recovers');
});

test('malformed barcodes never reach Open Food Facts, the cache or storage', async (t) => {
  const db = fakeDb([activeMember()]);
  const { resolveGroup, restore } = await loadResolver(db, []);
  t.after(restore);
  assert.equal(await resolveGroup('user-1', 'gtin:../../avatars/x'), null);
  assert.deepEqual(db.log.filter(([table]) => table !== 'group_members'), []);
});

test('transport failures show connection guidance while actionable API and validation errors stay useful', async () => {
  const { errorMessage } = await load('../src/hooks/use-chat-backend.tsx', {
    react: { createContext: () => ({}) },
    '@qr-chat/api': {},
    '@/lib/supabase/client': {},
    '@/lib/auth/redirect': {},
  });
  for (const message of ['TypeError: Failed to fetch', 'fetch failed', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed', 'The Internet connection appears to be offline.']) {
    assert.equal(errorMessage(new Error(message)), 'Could not connect. Check your internet connection and try again.');
  }
  assert.equal(errorMessage(new Error('Please sign in again.')), 'Please sign in again.');
  const { ChatApiError } = await import('@qr-chat/api');
  for (const notice of ['You are sending messages too fast. Wait a moment and try again.', 'Slow mode is on in this busy chat. Wait a few seconds between messages.', 'You have joined a lot of chats this hour. Try again later.']) {
    assert.equal(errorMessage(new ChatApiError(notice, 'RATE_LIMITED')), notice, 'rate-limit notices are shown as is');
  }
  const { z } = require('@qr-chat/validation');
  const invalid = z.string().min(1).safeParse('');
  assert.equal(errorMessage(invalid.error), 'Check your input and try again.');
});
