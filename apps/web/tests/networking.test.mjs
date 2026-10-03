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

test('metadata cache stays outside auth, lasts one hour and excludes transient failures', async () => {
  let authenticated = true; let lookups = 0; let fails = false; let settings;
  const entries = new Map();
  const { POST } = await load('../src/app/api/qr-name/route.ts', {
    'next/cache': { unstable_cache(fn, keys, options) {
      settings = { keys, ...options };
      return async code => {
        if (entries.has(code)) return entries.get(code);
        const value = await fn(code);entries.set(code,value);return value;
      };
    } },
    '@/lib/qr-name-metadata': { lookupQrPageMetadata: async () => { lookups++;return fails ? null : { name: 'Cafe', imageUrl: 'https://public.example/photo.jpg' }; } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: authenticated ? { sub: 'test-account' } : {} }, error: null }) } }) },
    '@/lib/qr-name-route': await import('../src/lib/qr-name-route.ts'),
  });
  const request = code => new Request('https://app.example/api/qr-name', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code}) });
  assert.equal(settings.revalidate,3600);
  for(let i=0;i<2;i++) {
    const response=await POST(request('https://public.example/menu'));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(lookups,1);
  authenticated=false;
  assert.equal((await POST(request('https://public.example/menu'))).status,401);
  assert.equal(lookups,1);
  authenticated=true;fails=true;
  await POST(request('https://public.example/other'));
  assert.equal(entries.has('https://public.example/other'),false);
  fails=false;await POST(request('https://public.example/other'));
  assert.equal(lookups,3);
});

test('web session host pauses on hidden/offline, resumes once and removes lifecycle listeners', async t => {
  const effects=[];const events=new Map();let starts=0;let pauses=0;let active=false;let disposed=false;let authCleaned=false;let authListener;let revoked=false;
  const listen=(name,fn)=>events.set(name,fn);const remove=name=>events.delete(name);
  const previous = Object.fromEntries(['document','navigator','window'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor] of Object.entries(previous)) {if(descriptor) Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  Object.defineProperty(globalThis,'document',{value:{hidden:false,addEventListener:listen,removeEventListener:remove},configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  Object.defineProperty(globalThis,'window',{value:{addEventListener:listen,removeEventListener:remove,location:{replace(path){assert.equal(revoked,true,"Access must be revoked before redirect");assert.equal(path,"/sign-in");}}},configurable:true});
  const api={client:{auth:{onAuthStateChange:fn=>{authListener=fn;return {data:{subscription:{unsubscribe(){authCleaned=true;}}}};}}}};
  const store={async start(){if(!active){active=true;starts++;}},pause(){if(active){active=false;pauses++;}},dispose(){disposed=true;}};
  const { ChatSessionProvider }=await load('../src/hooks/use-chat-backend.tsx',{
    react:{createContext:()=>({}),useState:fn=>typeof fn === "function" ? [fn()] : [revoked, value=>{revoked=value;}],useEffect:fn=>effects.push(fn)},
    'react/jsx-runtime':{jsx:()=>({protected:true})},
    'react-dom':{flushSync:fn=>fn()},
    '@qr-chat/api':{createChatApi:()=>api,getChatStore:()=>store},
    '@/lib/supabase/client':{createClient:()=>api.client},
  });
  ChatSessionProvider({children:null});const cleanup=effects[0]();assert.equal(starts,1);
  document.hidden=true;events.get('visibilitychange')();assert.equal(pauses,1);
  navigator.onLine=false;events.get('offline')();assert.equal(pauses,1);
  document.hidden=false;events.get('visibilitychange')();assert.equal(starts,1);
  navigator.onLine=true;events.get('online')();events.get('visibilitychange')();assert.equal(starts,2);
  authListener("SIGNED_OUT");assert.equal(ChatSessionProvider({children:"Protected content"}),null);
  cleanup();assert.equal(events.size,0);assert.ok(disposed&&authCleaned);
});


test('transport failures show connection guidance while actionable API and validation errors stay useful', async () => {
  const { errorMessage } = await load('../src/hooks/use-chat-backend.tsx', {
    react: { createContext: () => ({}) },
    '@qr-chat/api': {},
    '@/lib/supabase/client': {},
  });
  for (const message of ['TypeError: Failed to fetch', 'fetch failed', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed', 'The Internet connection appears to be offline.']) {
    assert.equal(errorMessage(new Error(message)), 'Could not connect. Check your internet connection and try again.');
  }
  assert.equal(errorMessage(new Error('Please sign in again.')), 'Please sign in again.');
  const { z } = require('@qr-chat/validation');
  const invalid = z.string().min(1).safeParse('');
  assert.equal(errorMessage(invalid.error), 'Check your input and try again.');
});
