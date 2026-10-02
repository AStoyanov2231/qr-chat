import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../src/index.ts';

const id = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const oldId = '33333333-3333-4333-8333-333333333333';
const base = 'https://project.supabase.co/storage/v1/object/public/avatars/';
const photo = { uploadId, data: new Uint8Array([255,216,255,1]).buffer };

function fixture(avatar_url = `${base}${id}/${oldId}.jpg`) {
  const calls=[];
  let profile={id,display_name:'Andy',avatar_url};
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
  assert.deepEqual(f.calls[1][1],{display_name:'New name',avatar_url:`${base}${id}/${uploadId}.jpg`});
  assert.deepEqual(f.calls[2][1],[`${id}/${oldId}.jpg`]);
});

test('editing the name retains a photo; removal clears it and does not delete provider images',async()=>{
  const f=fixture('https://provider.example/photo.jpg');
  await f.api.saveProfileWithAvatar('Alex');
  assert.equal(f.profile.avatar_url,'https://provider.example/photo.jpg');
  await f.api.saveProfileWithAvatar('Alex',null);
  assert.equal(f.profile.avatar_url,null);
  assert.deepEqual(f.calls.map(([op])=>op),['save','save']);
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

test('cleanup never targets another account or an unexpected object path',async()=>{
  for(const url of [`${base}${oldId}/${uploadId}.jpg`,`${base}${id}/../other.jpg`,`${base}${id}/arbitrary.jpg`]) {
    const f=fixture(url);await f.api.saveProfileWithAvatar('Andy',null);
    assert.deepEqual(f.calls.map(([op])=>op),['save']);
  }
});
