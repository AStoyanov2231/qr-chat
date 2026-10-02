// Mock the API/store boundary; shared networking behavior is tested in packages/api.
const stores = new WeakMap();
export function getChatStore(api) {
  const host = globalThis.__qrChatNativeTest;
  if (host.chatStore) return host.chatStore;
  if (stores.has(api)) return stores.get(api);
  const listeners = new Set();
  let state = { snapshot: {session:null,group:null,friends:[],expiresAt:null,directPreviews:{}}, ready: false, error: '', connection: 'connected', hasObservedGroup: false, groupLoading: false, directs: {} };
  const counts = new Map();
  const publish = patch => { state = {...state,...patch}; for(const listener of listeners) listener(); };
  const watcher = filters => { const value={filters,stopped:false,onState:connection=>publish({connection}),stop(){this.stopped=true;}};host.watchers.push(value);return value; };
  let previewWatcher;
  async function refresh() {
    try {
      const snapshot=await host.loadChatSnapshot(api,{groupId:'',count:1});
      publish({snapshot,ready:true,error:'',hasObservedGroup:state.hasObservedGroup||!!snapshot.group});
      const ids=snapshot.friends.filter(friend=>friend.accepted_at).map(friend=>friend.id);
      if(previewWatcher && !ids.length) {previewWatcher.stop();previewWatcher=null;}
      if(ids.length && !previewWatcher) previewWatcher=watcher(ids.map(id=>({table:'direct_messages',id})));
    } catch(error) {publish({snapshot:{session:null,group:null,friends:[],expiresAt:null,directPreviews:{}},ready:false,error:error.message});throw error;}
  }
  async function refreshDirect(id) {
    try {const page=await host.loadDirectSnapshot(api,id,counts.get(id)||1);publish({directs:{...state.directs,[id]:{...page,loading:false,error:''}}});}
    catch(error) {publish({directs:{...state.directs,[id]:{messages:[],nextCursor:null,loading:false,error:error.message}}});throw error;}
  }
  const store={
    getState:()=>state, subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getDirect:id=>state.directs[id]??{messages:[],nextCursor:null,loading:true,error:''},
    start:()=>refresh().catch(()=>{}), pause(){host.watchers.forEach(value=>value.stop());},
    refresh,refreshGroup:refresh,openGroup:()=>()=>{},loadOlderGroup:async()=>{},
    openDirect(id){const value=watcher([{table:'direct_messages',id}]);void refreshDirect(id).catch(()=>{});return()=>value.stop();},
    refreshDirect,async loadOlderDirect(id){counts.set(id,(counts.get(id)||1)+1);await refreshDirect(id);},
  };
  stores.set(api,store);return store;
}
