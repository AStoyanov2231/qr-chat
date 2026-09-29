import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAvatar } from '../src/lib/avatar.ts';

test('photo normalization crops centrally, resizes, encodes JPEG, and releases the decoded image',async(t)=>{
  const originalBitmap=globalThis.createImageBitmap;
  const originalDocument=globalThis.document;
  t.after(()=>{globalThis.createImageBitmap=originalBitmap;globalThis.document=originalDocument;});
  const calls=[];
  const bitmap={width:1200,height:800,close:()=>calls.push(['close'])};
  globalThis.createImageBitmap=async()=>bitmap;
  const canvas={getContext:()=>({fillRect:(...args)=>calls.push(['fill',...args]),drawImage:(...args)=>calls.push(['draw',...args])}),toBlob:(callback,type,quality)=>{calls.push(['encode',type,quality]);callback(new Blob(['photo'],{type}));}};
  globalThis.document={createElement:()=>canvas};
  const photo=await prepareAvatar({type:'image/png',size:100});
  assert.equal(photo.type,'image/jpeg');
  assert.equal(canvas.width,512);assert.equal(canvas.height,512);
  assert.deepEqual(calls.find(([op])=>op==='draw').slice(2),[200,0,800,800,0,0,512,512]);
  assert.deepEqual(calls.at(-1),['close']);
});

test('unsupported or oversized photos are rejected before decoding',async()=>{
  await assert.rejects(prepareAvatar({type:'image/svg+xml',size:10}),/JPEG, PNG, or WebP/);
  await assert.rejects(prepareAvatar({type:'image/jpeg',size:21*1024*1024}),/smaller than 20 MB/);
});

test('unreadable photos produce a useful error',async(t)=>{
  const original=globalThis.createImageBitmap;t.after(()=>{globalThis.createImageBitmap=original;});
  globalThis.createImageBitmap=async()=>{throw new Error('Decode failed');};
  await assert.rejects(prepareAvatar({type:'image/jpeg',size:10}),/Choose another photo/);
});
