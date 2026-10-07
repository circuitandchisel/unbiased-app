const MAX_SESSIONS = 1000;

module.exports = {
  setup(api) {
    const sessions = new Map();
    const timingFor = (threadId) => {
      let timing = sessions.get(threadId);
      if (!timing) {
        if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
        timing = { startedAt: null, lastCompletedMs: null };
        sessions.set(threadId, timing);
      }
      return timing;
    };
    api.onEvent("turn_started", ({ threadId }) => { timingFor(threadId).startedAt = Date.now(); });
    api.onEvent("turn_completed", ({ threadId }) => {
      const timing = timingFor(threadId);
      if (timing.startedAt !== null) timing.lastCompletedMs = Date.now() - timing.startedAt;
      timing.startedAt = null;
    });
    api.registerTool("mods_turn_timing", (threadId) => {
      const timing = sessions.get(threadId);
      if (!timing) return "No turn timing has been observed in this chat yet.";
      const completed = timing.lastCompletedMs === null
        ? "No completed turn timing yet."
        : `Last completed turn: ${(timing.lastCompletedMs / 1000).toFixed(1)}s.`;
      const running = timing.startedAt === null
        ? "No turn is running."
        : `Current turn: ${((Date.now() - timing.startedAt) / 1000).toFixed(1)}s so far.`;
      return `${completed} ${running}`;
    });
    return () => sessions.clear();
  },
};
