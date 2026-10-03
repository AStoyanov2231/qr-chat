import { createClient } from '@supabase/supabase-js';
import { createChatApi, createObservedFetch, type RequestObserver, type Database } from '@qr-chat/api';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createSessionStorage } from './secure-storage';

export const authCallback = 'qrchat://auth/callback';
export const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? '';
export const providers = {
  google: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_AUTH === 'true',
};

// Supabase uses WebCrypto for S256 PKCE. Supply only missing native primitives.
function installCrypto() {
  const nativeCrypto = globalThis.crypto ?? {};
  if (!nativeCrypto.getRandomValues) Object.defineProperty(nativeCrypto, 'getRandomValues', { value: Crypto.getRandomValues });
  if (!nativeCrypto.subtle) Object.defineProperty(nativeCrypto, 'subtle', { value: {
    digest: (algorithm: string, data: ArrayBuffer) => {
      if (algorithm !== 'SHA-256') throw new Error('Unsupported digest.');
      return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
    },
  } });
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: nativeCrypto });
}

let api: ReturnType<typeof createChatApi> | undefined;
export function getNativeApi(observer?: RequestObserver) {
  if (api) return api;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !key.startsWith('sb_publishable_')) return null;
  installCrypto();
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const storage = createSessionStorage({
    getItem: (name) => SecureStore.getItemAsync(name, options),
    setItem: (name, value) => SecureStore.setItemAsync(name, value, options),
    removeItem: (name) => SecureStore.deleteItemAsync(name, options),
  }, Crypto.randomUUID);
  api = createChatApi(createClient<Database>(url, key, { global: { fetch: createObservedFetch(fetch, observer) }, auth: {
    storage, storageKey: 'qrchat.auth', persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: false, flowType: 'pkce',
  } }), {
    qrNameEndpoint: webOrigin ? `${webOrigin.replace(/\/+$/u, '')}/api/qr-name` : '',
  });
  return api;
}
