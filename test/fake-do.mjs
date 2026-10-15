// A stand-in for a Durable Object namespace in Node (tests, local test server): one instance,
// in-memory storage, and a set of sockets the object "accepted".
export function memoryStorage() {
  const m = new Map();
  return {
    async get(k) {
      if (Array.isArray(k)) return new Map(k.filter((x) => m.has(x)).map((x) => [x, structuredClone(m.get(x))]));
      return m.has(k) ? structuredClone(m.get(k)) : undefined;
    },
    keys: () => [...m.keys()],
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
  };
}

export function fakeNamespace(Cls, env) {
  const sockets = new Set();
  const ctx = {
    storage: memoryStorage(),
    getWebSockets: () => [...sockets],
    acceptWebSocket: (ws) => sockets.add(ws),
  };
  const obj = new Cls(ctx, env);
  return { idFromName: (n) => n, get: () => ({ fetch: (req) => obj.fetch(req) }), sockets, obj };
}
