export type HomeGithubInput = { start: string; end: string; projectId?: string; includeActivity?: boolean };
export type HomePullRequest = { number: number; title: string; url: string; repository: string; createdAt: string; mergedAt: string | null; state: string };
export type HomeGithubResult = { ok: true; login: string; opened: number; merged: number; pullRequests: HomePullRequest[]; partial: boolean; activity?: GithubActivityDetails; repositories?: string[] } | { ok: false; error: string };
export type GithubActivityKind = "prs" | "issues" | "comments" | "mentions";
export type GithubActivityEvent = { id: string; kind: GithubActivityKind; action: string; title: string; url: string; repository: string; at: string; precision?: "thread-update" };
export type GithubActivityDetails = { events: GithubActivityEvent[]; partial: boolean; notices: string[] };
