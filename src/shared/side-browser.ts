export type SideBrowserHelp = { requestId: string; message: string };
export type SideBrowserTab = { id: number; root: string; url: string; title: string; agentOwned: boolean; controlled: boolean; working: boolean; lastUsedAt: number; help: SideBrowserHelp | null };
export type SideBrowserUpdate = { root: string; tabs: SideBrowserTab[]; revealId?: number };
