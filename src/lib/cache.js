// Session-lived in-memory cache so tab/page revisits render instantly.
// Pages seed their state from here and refresh in the background;
// the skeleton only shows on the very first visit.
const store = new Map()

export function cacheGet(key) {
  return store.get(key)
}

export function cacheSet(key, value) {
  store.set(key, value)
  return value
}

export function cacheClear(prefix) {
  if (!prefix) { store.clear(); return }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
}
