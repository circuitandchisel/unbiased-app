const OPENUI_DEVTOOLS_CSP = /Loading the script 'https:\/\/cdn\.jsdelivr\.net\/npm\/@openuidev\/devtools@0\/dist\/devtools\.browser\.js[^']*' violates the following Content Security Policy directive/;
const CSP_FALLBACK_NOTE = /^\s*Note that 'script-src' was not explicitly set, so 'default-src' is used as a fallback\./;

export function blockingPreviewConsoleErrors(messages: string[], isDevPreview: boolean): string[] {
  if (!isDevPreview) return messages;
  return messages.filter((message) => !OPENUI_DEVTOOLS_CSP.test(message) && !CSP_FALLBACK_NOTE.test(message));
}

export function isStaleOptimizedDependency(messages: string[]): boolean {
  return messages.some((message) => /\b504 Outdated Optimize Dep\b/i.test(message) ||
    /Failed to fetch dynamically imported module:.*\/node_modules\/\.vite\/deps\//i.test(message));
}
