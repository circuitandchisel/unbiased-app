export function protectedResourceScopes(metadata: Record<string, unknown> | null): string[] {
  if (!Array.isArray(metadata?.scopes_supported)) return [];
  return [...new Set(metadata.scopes_supported.filter(
    (scope): scope is string => typeof scope === "string" && scope.length > 0 && !/\s/.test(scope),
  ))];
}

export function inferredOAuthScopes(configured: string[] | undefined, advertised: string[]): string[] | undefined {
  return configured?.length || advertised.length === 0 ? undefined : advertised;
}
