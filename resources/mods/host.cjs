const EVENT_KINDS = new Set(["turn_started", "turn_completed", "tool_called"]);
const MAX_TOOL_TEXT = 2000;

function createHost(catalog, implementations) {
  if (!catalog || catalog.protocolVersion !== 2 || !Array.isArray(catalog.plugins))
    throw new Error("invalid Mods catalog");
  const listeners = new Map();
  const tools = new Map();
  const disposers = [];
  const ids = new Set();
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of disposers.reverse()) {
      try { cleanup(); }
      catch (error) { process.stderr.write(`[mods] cleanup failed: ${String(error).slice(0, 200)}\n`); }
    }
    listeners.clear();
    tools.clear();
  };

  try {
    for (const plugin of catalog.plugins) {
      if (!plugin || typeof plugin.id !== "string" || ids.has(plugin.id) ||
          !Array.isArray(plugin.events) || !Array.isArray(plugin.tools))
        throw new Error("invalid or duplicate Mods plugin");
      ids.add(plugin.id);
      const implementation = implementations[plugin.id];
      if (!implementation || typeof implementation.setup !== "function")
        throw new Error(`missing first-party plugin ${plugin.id}`);
      const allowedEvents = new Set(plugin.events);
      const allowedTools = new Set(plugin.tools.map((tool) => tool.name));
      if ([...allowedEvents].some((kind) => !EVENT_KINDS.has(kind)))
        throw new Error(`unsupported event in ${plugin.id}`);
      const api = {
        onEvent(kind, handler) {
          if (!allowedEvents.has(kind) || typeof handler !== "function")
            throw new Error(`${plugin.id} cannot observe ${kind}`);
          const entries = listeners.get(kind) ?? [];
          entries.push({ id: plugin.id, handler });
          listeners.set(kind, entries);
          const cleanup = () => {
            const index = entries.findIndex((entry) => entry.handler === handler && entry.id === plugin.id);
            if (index >= 0) entries.splice(index, 1);
          };
          disposers.push(cleanup);
          return cleanup;
        },
        registerTool(name, handler) {
          if (!allowedTools.has(name) || typeof handler !== "function" || tools.has(name))
            throw new Error(`${plugin.id} cannot register ${name}`);
          tools.set(name, { id: plugin.id, handler });
          const cleanup = () => tools.delete(name);
          disposers.push(cleanup);
          return cleanup;
        },
      };
      const cleanup = implementation.setup(api);
      if (cleanup !== undefined && typeof cleanup !== "function")
        throw new Error(`${plugin.id} returned an invalid cleanup`);
      if (cleanup) disposers.push(cleanup);
      if ([...allowedTools].some((name) => tools.get(name)?.id !== plugin.id))
        throw new Error(`${plugin.id} did not register its declared tools`);
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    plugins: [...ids],
    tools: [...tools.keys()],
    observe(event) {
      if (disposed || !event || typeof event.threadId !== "string" ||
          !event.threadId || event.threadId.length > 200 || !EVENT_KINDS.has(event.kind)) return;
      for (const { id, handler } of listeners.get(event.kind) ?? []) {
        try { handler(event); }
        catch (error) { process.stderr.write(`[mods] ${id} event failed: ${String(error).slice(0, 200)}\n`); }
      }
    },
    async callTool(threadId, name) {
      if (disposed || typeof threadId !== "string" || !threadId || threadId.length > 200)
        throw new Error("invalid Mods chat");
      const registration = tools.get(name);
      if (!registration) throw new Error("unknown Mods tool");
      const text = await registration.handler(threadId);
      if (typeof text !== "string" || text.length > MAX_TOOL_TEXT)
        throw new Error("invalid Mods tool result");
      return { text };
    },
    dispose,
  };
}

module.exports = { createHost };
