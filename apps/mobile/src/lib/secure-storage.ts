export type PrivateStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Keep every byte in secure storage, including sessions larger than a Keychain item. */
export function createSessionStorage(storage: PrivateStorage, revision: () => string): PrivateStorage {
  let queue = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work);
    queue = next.then(() => {}, () => {});
    return next;
  };
  const readManifest = async (key: string): Promise<{ id: string; count: number } | null> => {
    const value = await storage.getItem(key);
    if (value === null) return null;
    const manifest = JSON.parse(value);
    if (!/^[a-zA-Z0-9-]+$/.test(manifest.id) || !Number.isSafeInteger(manifest.count) || manifest.count < 1 || manifest.count > 256) throw new Error("Secure session storage is unavailable.");
    return manifest;
  };
  const clean = async (key: string, manifest: { id: string; count: number } | null) => {
    if (manifest) for (let i = 0; i < manifest.count; i++) await storage.removeItem(`${key}.${manifest.id}.${i}`);
  };
  return {
    getItem: (key) => serial(async () => {
      const manifest = await readManifest(key);
      if (!manifest) return null;
      const chunks: string[] = [];
      for (let i = 0; i < manifest.count; i++) {
        const value = await storage.getItem(`${key}.${manifest.id}.${i}`);
        if (value === null) throw new Error("Secure session storage is unavailable.");
        chunks.push(value);
      }
      return chunks.join("");
    }),
    setItem: (key, value) => serial(async () => {
      const previous = await readManifest(key);
      const characters = Array.from(value);
      const manifest = { id: revision(), count: Math.max(1, Math.ceil(characters.length / 450)) };
      if (manifest.count > 256) throw new Error("The session is too large to store securely.");
      try {
        for (let i = 0; i < manifest.count; i++) await storage.setItem(`${key}.${manifest.id}.${i}`, characters.slice(i * 450, (i + 1) * 450).join(""));
        await storage.setItem(key, JSON.stringify(manifest));
      } catch (error) {
        await clean(key, manifest).catch(() => {});
        throw error;
      }
      await clean(key, previous);
    }),
    removeItem: (key) => serial(async () => {
      const manifest = await readManifest(key);
      await storage.removeItem(key);
      await clean(key, manifest);
    }),
  };
}
