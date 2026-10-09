import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { createChatApi } from '../src/index.ts';
import { avatarColor } from '../src/avatar-color.ts';

const id = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const oldId = '33333333-3333-4333-8333-333333333333';
const base = 'https://project.supabase.co/storage/v1/object/public/avatars/';
const photo = { uploadId, data: new Uint8Array([255,216,255,1]).buffer };

function fixture(avatar_path = `${id}/${oldId}.jpg`) {
  const calls=[];
  let profile={id,display_name:'Andy',avatar_path};
  const failures={};
  const client={
    auth:{getSession:async()=>({data:{session:{user:{id}}},error:null})},
    from:()=>({
      select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})}),
      update:row=>({eq:()=>({select:()=>({single:async()=>{
        calls.push(['save',row]);
        if(failures.save)return {data:null,error:{message:'Save response lost'}};
        profile={...profile,...row};return {data:profile,error:null};
      }})})}),
    }),
    storage:{from:bucket=>({
      upload:async(path,data,options)=>{calls.push(['upload',bucket,path,data,options]);return failures.upload?{data:null,error:{message:'Upload failed'}}:{data:{path},error:null};},
      getPublicUrl:path=>({data:{publicUrl:`${base}${path}`}}),
      remove:async paths=>{calls.push(['remove',paths]);if(failures.cleanup)throw new Error('Offline');return {data:[],error:null};},
    })},
  };
  return {api:createChatApi(client),calls,failures,get profile(){return profile;}};
}

test('avatar uploads use the authenticated folder and save before cleaning up the previous photo',async()=>{
  const f=fixture();await f.api.saveProfileWithAvatar(' New name ',photo);
  assert.deepEqual(f.calls.map(([op])=>op),['upload','save','remove']);
  assert.equal(f.calls[0][2],`${id}/${uploadId}.jpg`);
  assert.deepEqual(f.calls[0][4],{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
  assert.deepEqual(f.calls[1][1],{display_name:'New name',avatar_path:`${id}/${uploadId}.jpg`,avatar_color:null});
  assert.deepEqual(f.calls[2][1],[`${id}/${oldId}.jpg`]);
});

test('editing the name retains a photo; removal clears it and deletes the stored object',async()=>{
  const f=fixture();
  assert.equal((await f.api.saveProfileWithAvatar('Alex')).avatar_url,`${base}${id}/${oldId}.jpg`);
  assert.equal((await f.api.saveProfileWithAvatar('Alex',null)).avatar_url,null);
  assert.deepEqual(f.calls.map(([op])=>op),['save','save','remove']);
});

test('failed uploads do not change profiles, and ambiguous saves retain both images',async()=>{
  const f=fixture();f.failures.upload=true;
  await assert.rejects(f.api.saveProfileWithAvatar('Andy',photo),/Upload failed/);
  assert.deepEqual(f.calls.map(([op])=>op),['upload']);
  f.calls.length=0;f.failures.upload=false;f.failures.save=true;
  await assert.rejects(f.api.saveProfileWithAvatar('Andy',photo),/Save response lost/);
  assert.deepEqual(f.calls.map(([op])=>op),['upload','save']);
});

test('cleanup failure does not turn a committed profile save into failure',async()=>{
  const f=fixture();f.failures.cleanup=true;
  const saved=await f.api.saveProfileWithAvatar('Andy',photo);
  assert.equal(saved.avatar_url,`${base}${id}/${uploadId}.jpg`);
});

test('invalid avatar bytes, paths, and oversized images are rejected before network access',async()=>{
  const api=createChatApi(new Proxy({},{get(){assert.fail('Invalid upload must not access the network');}}));
  for(const upload of [{...photo,uploadId:'../other'},{...photo,data:new ArrayBuffer(0)},{...photo,data:new ArrayBuffer(2097153)},{...photo,data:new Uint8Array([1,2,3]).buffer}]) {
    await assert.rejects(api.saveProfileWithAvatar('Andy',upload));
  }
});

test('profiles without a photo skip cleanup',async()=>{
  const f=fixture(null);await f.api.saveProfileWithAvatar('Andy',null);
  assert.deepEqual(f.calls.map(([op])=>op),['save']);
});

test('avatar colour is the top-strip average, capped in brightness; undecodable photos give none',()=>{
  const white=jpeg.encode({width:64,height:64,data:new Uint8Array(64*64*4).fill(255)},90).data;
  assert.equal(avatarColor(white.buffer.slice(white.byteOffset,white.byteOffset+white.byteLength)),'#595959');
  assert.equal(avatarColor(photo.data),null);
});
