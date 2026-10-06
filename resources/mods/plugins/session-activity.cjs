const MAX_SESSIONS = 1000;

module.exports = {
  setup(api) {
    const sessions = new Map();
    const countsFor = (threadId) => {
      let counts = sessions.get(threadId);
      if (!counts) {
        if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
        counts = { turnsStarted: 0, turnsCompleted: 0, toolsCalled: 0 };
        sessions.set(threadId, counts);
      }
      return counts;
    };
    for (const [kind, field] of [
      ["turn_started", "turnsStarted"],
      ["turn_completed", "turnsCompleted"],
      ["tool_called", "toolsCalled"],
    ]) api.onEvent(kind, ({ threadId }) => { countsFor(threadId)[field]++; });
    api.registerTool("mods_session_stats", (threadId) => {
      const counts = sessions.get(threadId) ?? { turnsStarted: 0, turnsCompleted: 0, toolsCalled: 0 };
      return `This chat: ${counts.turnsStarted} turns started, ${counts.turnsCompleted} completed, ${counts.toolsCalled} dynamic tool calls observed since Mods was enabled in this app session.`;
    });
    return () => sessions.clear();
  },
};
