export type HomeGithubInput = { start: string; end: string; projectId?: string };
export type HomePullRequest = { number: number; title: string; url: string; repository: string; createdAt: string; mergedAt: string | null; state: string };
export type HomeGithubResult = { ok: true; login: string; opened: number; merged: number; pullRequests: HomePullRequest[]; partial: boolean } | { ok: false; error: string };
