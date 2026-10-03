// Read-only observation of rendered native Conversation props in a debug runtime.
// Uses Metro's existing inspector. It neither installs auth nor calls application commands.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const expoRequire = createRequire(require.resolve('expo/package.json'));
const WebSocket = expoRequire('ws');
const target = process.argv[2] || 'android';
assert.ok(['android', 'ios'].includes(target));
const endpoints = await (await fetch('http://127.0.0.1:8081/json/list')).json();
const endpoint = endpoints.find(item => (target === 'android' ? /emulator|sdk|android/i : /iPhone|ios/i).test(JSON.stringify(item)));
assert.ok(endpoint, `No active ${target} debug inspector. Use an installed debug native runtime with Metro.`);
const socket = new WebSocket(endpoint.webSocketDebuggerUrl.replace('localhost', '127.0.0.1'), { origin: 'http://127.0.0.1:8081' });
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const calls = new Map();
socket.onmessage = event => { const response = JSON.parse(event.data); calls.get(response.id)?.(response); calls.delete(response.id); };
const call = (method, params = {}) => new Promise((resolve, reject) => {
 const id = ++nextId;
 const timer = setTimeout(() => { calls.delete(id); reject(new Error('Native inspector timed out')); }, 10000);
 calls.set(id, response => { clearTimeout(timer); resolve(response); });
 socket.send(JSON.stringify({id, method, params}));
});
try {
 await call('Runtime.enable');
 const response = await call('Runtime.evaluate', { returnByValue: true, expression: `(()=>{const found=[];function walk(n){if(!n)return;if(n.type?.name==='Conversation')found.push({messages:n.memoizedProps.messages.map(m=>({id:m.id,text:m.text})),loading:n.memoizedProps.loading,nextCursor:n.memoizedProps.nextCursor,available:n.memoizedProps.available});walk(n.child);walk(n.sibling);}for(const r of __REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(1))walk(r.current);return found;})()` });
 assert.ok(!response.error && !response.result?.exceptionDetails, 'Could not read rendered native conversation');
 console.log(JSON.stringify({value:response.result.result.value}));
} finally { socket.close(); }
