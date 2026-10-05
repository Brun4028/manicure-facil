/**
 * LocalStorage fallback utility.
 *
 * ATENÇÃO: Em PRODUÇÃO (NODE_ENV === 'production'), o fallbackDb é DESATIVADO
 * e retorna os defaults sem armazenar nada. Ele NÃO deve ser usado como
 * armazenamento real em produção.
 *
 * Motivo: localStorage não é seguro para dados sensíveis de clientes.
 * Veja: https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url
 */

// Determinado uma vez na inicialização do módulo
const IS_PRODUCTION: boolean = (() => {
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
})();

let warned = false;

function warnOnce(): void {
  if (IS_PRODUCTION && !warned) {
    warned = true;
    console.warn(
      "[fallbackDb] localStorage fallback DESATIVADO em produção. " +
        "Certifique-se de que o Supabase esteja configurado corretamente.",
    );
  }
}

/**
 * O que a tela envia ao criar um registro: todos os campos do tipo, menos os
 * que o próprio fallback preenche (`id`, `created_at` e `updated_at`).
 */
type NovoRegistro<T> = Omit<T, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export const fallbackDb = {
  get: <T>(key: string, defaults: T[]): T[] => {
    if (typeof window === "undefined") return defaults;
    if (IS_PRODUCTION) {
      warnOnce();
      return defaults;
    }
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
    if (IS_PRODUCTION) {
      warnOnce();
      return;
    }
    try {
      localStorage.setItem(`mf_local_${key}`, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to write to localStorage:", e);
    }
  },

  insert: <T extends { id?: string }>(key: string, item: NovoRegistro<T>, defaults: T[]): T => {
    if (IS_PRODUCTION) {
      warnOnce();
      return { id: crypto.randomUUID(), ...item } as unknown as T;
    }
    const list = fallbackDb.get<T>(key, defaults);
    const newItem = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...item,
    } as unknown as T;
    list.push(newItem);
    fallbackDb.set(key, list);
    return newItem;
  },

  update: <T extends { id?: string }>(
    key: string,
    id: string,
    updates: Partial<T>,
    defaults: T[],
  ): T => {
    if (IS_PRODUCTION) {
      warnOnce();
      return { id, ...updates } as unknown as T;
    }
    const list = fallbackDb.get<T>(key, defaults);
    const idx = list.findIndex((x) => x.id === id);
    if (idx !== -1) {
      const updated = {
        ...list[idx],
        ...updates,
        updated_at: new Date().toISOString(),
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

  delete: <T extends { id?: string }>(key: string, id: string, defaults: T[]): void => {
    if (IS_PRODUCTION) {
      warnOnce();
      return;
    }
    const list = fallbackDb.get<T>(key, defaults);
    const filtered = list.filter((x) => x.id !== id);
    fallbackDb.set(key, filtered);
  },
};
