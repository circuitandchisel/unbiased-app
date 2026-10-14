/**
 * What the delegation proxy reports about its credential, and the sentence
 * the Account panel shows for it. Mirrors the proxy's `GET /unbiased-proxy/status`
 * (unbiased-proxy README, "For a UI"): `withdrawn.until` is an ISO timestamp,
 * `signIn.last.startedAt` is epoch milliseconds.
 */
export type DelegationStatus =
  | { reachable: false }
  | {
      reachable: true;
      provider: string;
      cred: "plan" | "key";
      declared: boolean;
      withdrawn?: { reason: "limit" | "signin" | "refused" | "ineligible"; since: string; until: string };
      signIn?: { pending: boolean; last?: { startedAt: number; url?: string; outcome?: "ok" | "failed"; error?: string } };
    };

export function delegationStatusText(s: DelegationStatus): string {
  if (!s.reachable) return "The proxy is not reachable; Pareto answers on its own.";
  const on = s.cred === "plan" ? "your ChatGPT plan" : "your OpenAI API key";
  if (s.declared) return `Frontier escalations run on ${on}.`;
  switch (s.withdrawn?.reason) {
    case "limit":
      return `Your ChatGPT plan's usage limit was reached; Pareto answers on its own until ${new Date(s.withdrawn.until).toLocaleTimeString()}.`;
    case "signin":
      if (s.cred !== "plan") return "Your OpenAI API key was refused; check it and restart the proxy. Pareto answers on its own.";
      return s.signIn?.pending ? "Waiting for the ChatGPT sign-in in your browser…" : "Your ChatGPT sign-in lapsed; Pareto answers on its own until you sign in again.";
    case "refused":
      return "Your OpenAI API key was refused; check it and restart the proxy. Pareto answers on its own.";
    case "ineligible":
      return "Your ChatGPT plan is not available to this app (see chatgpt.com/settings/usage); Pareto answers on its own.";
    default:
      return "Pareto answers on its own.";
  }
}

/** Whether a "Sign in to ChatGPT" button makes sense: a lapsed plan sign-in with no attempt pending. */
export function delegationSignInOffered(s: DelegationStatus): boolean {
  return s.reachable && s.cred === "plan" && s.withdrawn?.reason === "signin" && !s.signIn?.pending;
}

/** The sentence for the proxy's answer to a sign-in request. */
export function delegationSignInResultText(result: string): string | null {
  switch (result) {
    case "started": return "Opening your browser to sign in with ChatGPT…";
    case "pending": return "A sign-in is already waiting in your browser.";
    case "suppressed": return "A sign-in was offered recently; check your browser.";
    case "unreachable": return "The proxy did not answer the sign-in request.";
    default: return null;
  }
}
