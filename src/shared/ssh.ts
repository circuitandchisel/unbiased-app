/** Host-qualified paths never name a file on the desktop. */
export const SSH_PATH_ROOT = "/__unbiased_ssh__/";
export type SshConnection = { id: string; name: string; host: string; port?: number; identityFile?: string };
export const SSH_ENGINE_INSTALL_COMMAND = "curl -fsSL https://raw.githubusercontent.com/circuitandchisel/unbiased-app-engine/main/install.sh | bash";
export type SshEngineStatus = { state: "installed" | "missing" | "error"; version?: string; path?: string; serverVersion?: string };
export type SshStatus = SshConnection & { state: "disconnected" | "connecting" | "connected" | "error"; error?: string; home?: string; sandboxReady?: boolean; stage?: "checking-host" | "preparing-session" | "starting-engine"; engineState?: "checking" | "install-required" | "restart-required" | "sign-in-required" | "ready" | "error"; engineSetup?: { title: string; message: string; command?: string | null }; standaloneEngine?: SshEngineStatus };
export function sshPath(connectionId: string, path: string): string {
  if (!/^[a-f0-9-]{36}$/.test(connectionId) || !path.startsWith("/") || path.includes("\0")) throw new Error("Invalid SSH path");
  return SSH_PATH_ROOT + connectionId + path;
}
export function parseSshPath(path: string | null | undefined): { connectionId: string; path: string } | null {
  if (!path?.startsWith(SSH_PATH_ROOT)) return null;
  const match = /^\/__unbiased_ssh__\/([a-f0-9-]{36})(\/.*)?$/.exec(path);
  const remotePath = match?.[2] ?? "/";
  if (!match || remotePath.includes("\0") || remotePath.split("/").includes("..")) throw new Error("Invalid SSH path");
  return { connectionId: match[1], path: remotePath };
}
export function displayWorkspacePath(path: string): string { return parseSshPath(path)?.path ?? path; }
