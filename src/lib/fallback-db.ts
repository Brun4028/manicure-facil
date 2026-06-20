// LocalStorage fallback utility for all new modules when Supabase tables are not created or accessible.
export const fallbackDb = {
  get: <T>(key: string, defaults: T[]): T[] => {
    if (typeof window === "undefined") return defaults;
    try {
      const data = localStorage.getItem(`mf_local_${key}`);
      if (!data) {
        localStorage.setItem(`mf_local_${key}`, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(data);
    } catch {
      return defaults;
    }
  },
  
  set: <T>(key: string, data: T[]) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(`mf_local_${key}`, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to write to localStorage:", e);
    }
  },

  insert: <T extends Record<string, any>>(key: string, item: T, defaults: T[]): T => {
    const list = fallbackDb.get<T>(key, defaults);
    const newItem = { 
      id: crypto.randomUUID(), 
      created_at: new Date().toISOString(), 
      updated_at: new Date().toISOString(),
      ...item 
    };
    list.push(newItem);
    fallbackDb.set(key, list);
    return newItem;
  },

  update: <T extends Record<string, any>>(key: string, id: string, updates: Partial<T>, defaults: T[]): T => {
    const list = fallbackDb.get<T>(key, defaults);
    const idx = list.findIndex(x => x.id === id);
    if (idx !== -1) {
      const updated = { 
        ...list[idx], 
        ...updates, 
        updated_at: new Date().toISOString() 
      };
      list[idx] = updated;
      fallbackDb.set(key, list);
      return updated;
    }
    const updated = { id, ...updates } as unknown as T;
    list.push(updated);
    fallbackDb.set(key, list);
    return updated;
  },

  delete: <T extends Record<string, any>>(key: string, id: string, defaults: T[]): void => {
    const list = fallbackDb.get<T>(key, defaults);
    const filtered = list.filter(x => x.id !== id);
    fallbackDb.set(key, filtered);
  }
};
