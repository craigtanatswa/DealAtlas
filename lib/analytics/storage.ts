const memory = new Map<string, string>();

function browserLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export function readLocalValue(key: string): string | null {
  try {
    const storage = browserLocalStorage();
    const stored = storage?.getItem(key) ?? null;
    return stored ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeLocalValue(key: string, value: string): void {
  memory.set(key, value);
  try {
    browserLocalStorage()?.setItem(key, value);
  } catch {
    // Storage can be blocked; the in-memory copy still works for this tab.
  }
}

export function removeLocalValue(key: string): void {
  memory.delete(key);
  try {
    browserLocalStorage()?.removeItem(key);
  } catch {
    // Nothing else to clear.
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  try {
    for (const part of document.cookie.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) {
        return decodeURIComponent(rest.join("="));
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {
    // Cookies can be blocked; localStorage remains the fallback.
  }
}

export function removeCookie(name: string): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // Nothing else to clear.
  }
}

export function resetLocalStorageForTests(): void {
  memory.clear();
}
