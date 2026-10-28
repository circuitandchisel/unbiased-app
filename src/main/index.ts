import { registerBrowserMirrorIpc } from "./browser-mirror-ipc";
import { listSlashCommands, resolveSlashSkill } from "./skill-commands";
import { agentInstructionsGuidance, connectAgentInstructions, registerAgentInstructionsIpc } from "./agent-instructions";
import { SkillOwnershipStore, installOwnedSkill } from "./skill-ownership";
import { ScopedIdentity } from "./scoped-identity";
import { ConversationLineage } from "./conversation-lineage";
import { CloudBindings, ConversationRouter, cloudEligible, keyFingerprint, type SignIn } from "./cloud-binding";
import { gitPreflight } from "./cloud-preflight";
import { EnvironmentStore, TurnEnvironments } from "./environment-store";
import { exportConnector, resolveEnvironment, validateScope, sameOwner, type Owner, type SettingsScope, type EnvironmentManifest } from "./environment";
import { installScopedSkill } from "./scoped-skills";
import { readJson, atomicJson } from "./atomic-store";
import { projectRecord, type ProjectRecord } from "./project-identity";
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  protocol,
  screen,
  shell,
  systemPreferences,
  WebContentsView,
} from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { NativeImage } from "electron";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { homedir, hostname } from "node:os";
import { appendFileSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile as readFileAsync, readdir as readdirAsync, rename as renameFileAsync, stat as statAsync, writeFile as writeFileAsync } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileActionError, localFileForAction, saveLocalFileCopy } from "./file-actions";
import { PetActivity, petTurnActivityKey } from "./pet-activity";
import { clampPetPosition, initialPetPosition, PET_SCALES, petScale, petWindowSize, pointInPetWindow, type PetScale } from "./pet-layout";
import { multiViewRecipients } from "./multi-view-routing";
import { PET_NOTICE_DURATION_MS, PET_NOTICE_SIZE, latestPetResponse, petNoticeStackBounds, petResponseFirstLine } from "./pet-notice";
import { savedPalSelection, type PalSelection } from "./pal-selection";
import { shouldShowCompletedPetNotice } from "./pet-notice-visibility";
import { PetWindowReadiness } from "./pet-window-readiness";
import { activateMainWindowFromPal, PET_WORKSPACE_OPTIONS } from "./pet-window-activation";
import { isPalSelection, ROBOT_PALS, type PalsSettings } from "../shared/pals";
import { resolveEngineDir } from "./engine-path";
import { matchingMessageSnippet, messagesFromTranscriptEntries } from "./thread-search";
import { automationBrowserPaths } from "./browser-binaries";
import { BrowserRuntimeClient } from "./browser-runtime-client";
import { agentStyleInstructions, DEFAULT_AGENT_STYLE, parseAgentStylePrefs, type AgentStylePrefs } from "../shared/agent-style";
import { projectContextForDirectory } from "./project-context";
import { ProjectStore } from "./project-store";
import { OPENUI_VISUAL_INSTRUCTIONS, VISUALIZE_DIRECTIVE } from "./visual-instructions";
import { epochMillis } from "../shared/conversation-time";
import { alignRunningTurnStart, chooseTranscript, initialTranscriptPage, replaceTranscriptTail, retitleTranscript, transcriptPage, type TranscriptRow } from "../shared/transcript-pages";
import { INTERACTIVE_VISUAL_CSP, INTERACTIVE_VISUAL_SCHEME, interactiveVisualDocument, interactiveVisualId, interactiveVisualPreviewCsp, interactiveVisualPreviewDocument, isInteractiveVisualPreviewUrl, isInteractiveVisualSource } from "../shared/interactive-visual";
import { agentInputFields, codexInputResponse, mcpInputFields, mcpInputResponse, validateUserInput, type UserInputRequest, type UserInputValue } from "../shared/user-input";

import { startSecretProxy, type SecretConnector } from "./oauth-proxy";
import { isStripeOnboardingPage } from "../shared/stripe-onboarding-url";
import {
  CATALOGUE_CACHE_VERSION,
  fetchCatalogueFromAnyHost,
  parseCatalogue,
  type Catalogue,
  type CatalogueEntry,
} from "./connector-catalogue";
import type { Server as HttpServer } from "node:http";
import { execFile, execFileSync, spawn as spawnProcess } from "node:child_process";
import { EngineClient, engineVersionFromUserAgent, type EngineStatus } from "./engine";
import { pollDeviceToken, requestDeviceAuthorization } from "./device-auth";
import { RendererCrashRecovery } from "./crash-recovery";
import { connectedConnectorNames, mcpApplyDecision, mcpConfigOverride, overridableServerNames, parseThreadMcp, serializeThreadMcp, THREAD_MCP_FILE } from "./thread-mcp";
import { inferredOAuthScopes, protectedResourceScopes } from "./mcp-oauth-scopes";
import { firstPartyMcpRegistration } from "./mcp-first-party-oauth";
import {
  type BatchStep,
  type AxResult,
  parseCandidates,
  parkedNextCall,
  parkedReadNote,
  batchNudge,
  isSingleEdit,
  stepsForNudge,
  touchedFieldIds,
  renderFieldValues,
  type FieldValue,
  renderInspector,
  type InspectorField,
  BATCH_NUDGE_AFTER,
  type RecentEdit,
  shouldSendSkill,
  skillPreamble,
  prependSkill,
  MAX_CANDIDATES,
  candidateWorked,
  summarizeCandidates,
  renderActionResult,
  TASK_DISCIPLINE_SENTENCE,
  describeAxCall,
  AxClient,
  AxError,
  appOfStep,
  axConsent,
  screenshotToolsOffered,
  coordinateToolAllowed,
  withScreenshotGuidance,
  axReadOptsFrom,
  AX_DEFAULT_READ_OPTS,
  type AxReadOpts,
  shouldRecoverRaise,
  axLooksInstalled,
  axNeedsFocus,
  describeAxAction,
  indexElementLines,
  roleOfLine,
  readAxManifest,
  resolveAxDir,
  shouldOpenAccessibilitySettings,
  axNotTrustedText,
  routesToAx,
  parseBatchSteps,
  summarizeBatch,
  pointerHeadline,
  drawGate,
  DRAW_GATE_POINTS,
  surfaceCommands,
  appendSkill,
  traceStep,
  MAX_CLICKS,
  MAX_BATCH_STEPS,
  APP_STATE_SPACE_SENTENCE,
  RAISE_DESCRIPTION,
  LAUNCH_FRONT_SENTENCE,
  withSpaceGuidance,
  otherSpaceNote,
  launchOutcome,
  ACTION_NO_CHANGE_SENTENCE,
  pointerRoute,
} from "./ax-bridge";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  METRICS_VERSION,
  MetricsLog,
  classifyFailure,
  metricsEnabled,
  payloadOf,
  type DriverRecord,
  type RunRecord,
  type ToolRecord,
  type TurnRecord,
} from "./run-metrics";
import {
  CHECKPOINT_TOOLS, checkpointPath, validateCheckpointNotes, renderCheckpoint, pushFact, checkpointDue,
  checkpointGateText, checkpointPreamble, isGatedTool, pathsInCommand, remeasureNudge, type LedgerEntry,
} from "./checkpoint";
import { looksLikeImage, convertedImagePath, sipsArgs, fileAttachmentContext, stripFileAttachmentContext, attachmentSizeError } from "./attachments";
import { clipboardImageBuffer } from "./clipboard-image";
import { IMAGE_OUTLINE_TOOL, outlineOf, renderOutline, outlineReminder, type PendingOutline } from "./image-outline";
import { isProductionBuild } from "./runtime-mode";
import {
  dueAt,
  isDue,
  loadTasks,
  MAX_NAME_CHARS,
  MAX_PROMPT_CHARS,
  MAX_TASKS,
  parseRunVerdict,
  saveTasks,
  validateSchedule,
  VERDICT_CONTRACT,
  type RunStatus,
  type ScheduledTask,
  type ScheduleSpec,
} from "./scheduler";
import {
  deleteMemoryNote,
  loadMemoryNotes,
  migrateLegacyPlainMemory,
  renderMemorySection,
  saveMemoryNote,
  selectedProjectMemoryDir,
  validateMemory,
} from "./memory";
import { writeAutomaticMemory } from "./automatic-memory";
import { lastFinishedTurnBeforeActive, sideChatStartTarget, SIDE_CHAT_THREAD_SOURCE } from "./side-chat-start";
import { SideChatRecents, listVisibleThreads, parseSideChatRecords } from "./side-chat-recents";
import {
  LearningClient,
  buildEvent,
  buildTaskMeta,
  readSidecarManifest,
  resolveSidecarDir,
  sidecarLooksInstalled,
} from "./learning";
import { spawn as ptySpawn, type IPty } from "@lydell/node-pty";
import {
  COMPUTER_CAPTURE_JPEG_QUALITY,
  COMPUTER_PERMISSION_SETTINGS,
  createComputerUseService,
  openComputerPermissionSettings,
  parseComputerAction,
  requestComputerPermission,
  type ComputerAction,
  type ComputerDisplay,
  type ComputerPermission,
  type NutRuntime,
} from "./computer-use";

/** Whether this run is a real shipped build. NOT `app.isPackaged`: the dev
 *  launcher runs from a signed .app bundle, which makes electron report
 *  isPackaged === true for a checkout. See ./runtime-mode. */
function productionBuild(): boolean {
  return isProductionBuild({ isPackaged: app.isPackaged, devAppName: process.env.UNBIASED_DEV_APP_NAME });
}

if (!productionBuild() && process.env.UNBIASED_DEV_HOME_DIR) {
  app.setPath("home", process.env.UNBIASED_DEV_HOME_DIR);
}
if (!productionBuild() && process.env.UNBIASED_DEV_USER_DATA_DIR) {
  const userDataDir = process.env.UNBIASED_DEV_USER_DATA_DIR;
  if (!isAbsolute(userDataDir)) throw new Error("UNBIASED_DEV_USER_DATA_DIR must be absolute");
  mkdirSync(userDataDir, { recursive: true });
  app.setPath("userData", userDataDir);
}

const engine = new EngineClient();
// Persisted remote bindings guard every thread RPC, including restart recovery.
const cloudBindings = new CloudBindings(join(app.getPath("userData"), "cloud-bindings"));
const scopedIdentity = new ScopedIdentity();
function currentScopedOwner(): Owner | null { return scopedIdentity.owner(readStoredKey()?.key ?? ""); }
const conversationRouter = new ConversationRouter(cloudBindings, () => currentScopedOwner());
const localEngineRequest = engine.request.bind(engine);
engine.request = (method, params = {}) => conversationRouter.request(method, params, () => localEngineRequest(method, params));
const environmentStore = new EnvironmentStore(join(app.getPath("userData"), "environments"));
const turnEnvironments = new TurnEnvironments();
function signInFile(): string { return join(app.getPath("userData"), "sign-in-provenance.json"); }
async function verifiedOwner(): Promise<Owner> {
  const key = readStoredKey()?.key;
  if (!key) throw new Error("Sign in to an account before editing scoped settings");
  return scopedIdentity.verify(key,()=>readStoredKey()?.key ?? "",async()=>{
    const who = await whoamiValidate(key);
    if (!who.ok || who.accessStatus !== "granted" || !who.user?.id || !who.organization?.id) throw new Error("Platform must return a validated organization and user identity");
    return { organizationId:who.organization.id,memberId:who.user.id };
  });
}
function environmentFor(thread: string): EnvironmentManifest | null {
  const owner=currentScopedOwner();
  if (!owner) return null;
  const root = conversationLineage.root(rootThreadOf(thread));
  const projectId = projectMembership(root, threadCwds.get(thread) ?? undefined).projectId;
  const target: SettingsScope = { kind:"conversation",projectId,conversationId:root };
  const scopes: SettingsScope[] = [{kind:"global"},...(projectId ? [{kind:"project",projectId} as const] : []),target];
  const layers = scopes.map(scope => environmentStore.read(owner,scope)).filter((m): m is EnvironmentManifest => m !== null);
  return layers.length ? resolveEnvironment(layers,target) : null;
}
function requireLocalConversation(operation:string): void {
  const thread=panes.main.threadId;const binding=thread ? cloudBindings.read(thread) : null;
  if(binding && binding.state!=="local")throw new Error(`${operation} is unavailable for a remote or handoff-paused conversation; no local execution was performed`);
}
function pinTurnEnvironment(thread: string): void {
  const m = environmentFor(thread);
  if (m) {
    // The portable skill editor is retired. Its saved artifacts remain inert;
    // only skills installed through the normal Skills flow are executable.
    // They must not block local turns after their controls have been removed.
    // Persisted layers are read at each boundary; no shared-engine restart.
    const previous = turnEnvironments.snapshot(thread);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(m)) {
      // Composite layers have independent revisions. Snapshot revision is a local generation.
      turnEnvironments.update(thread,{...m,revision:(previous?.revision ?? 0)+1});
    }
  }
  const denied = new Set(m?.connectors.filter(c => !c.enabled).map(c => c.name) ?? []);
  if ([...enabledMcpFor(thread),...connectedConnectors(readMcpConfig().servers)].some(name => denied.has(name))) throw new Error("ENGINE_ENVIRONMENT_RELOAD_REQUIRED: an inherited connector disablement changed; turn execution is paused until a verified per-thread reload adapter is available");
  turnEnvironments.begin(thread);
}
let win: BrowserWindow | null = null;
let petWin: BrowserWindow | null = null;
let petReadiness: PetWindowReadiness | null = null;
let petNoticeWin: BrowserWindow | null = null;
const petActivity = new PetActivity();
const petReplies = new Map<string, { stream: string; last: string; final: string }>();
const petThreadTitles = new Map<string, string>();
let petNoticeVersion = 0;
let petNoticeTimer: ReturnType<typeof setTimeout> | null = null;
type PetNotice = { id: number; threadId: string; title: string; response: string; expiresAt: number };
let petNotices: PetNotice[] = [];
let nextPetNoticeId = 0;
let visiblePetThreadIds: ReadonlySet<string> = new Set();
let visiblePetPaneIds: ReadonlySet<string> = new Set();
let petSettleTimer: ReturnType<typeof setTimeout> | null = null;
let petSaveTimer: ReturnType<typeof setTimeout> | null = null;
let petHoverTimer: ReturnType<typeof setInterval> | null = null;
let petMotionTimer: ReturnType<typeof setTimeout> | null = null;
let petHovered = false;
type PetPreferences = { visible: boolean; x?: number; y?: number; selection?: PalSelection; scale?: PetScale };
let petPreferences: PetPreferences = { visible: true };
let lastStatus: EngineStatus = { state: "starting" };

// Conversation panes share one engine. Side threads persist for short-term
// recovery, but are excluded from the ordinary conversation sidebar.
type PaneId = string;
const conversationLineage = new ConversationLineage();
const panes: Record<string, { threadId: string | null; turnId: string | null }> = {
  main: { threadId: null, turnId: null },
};
const multiMountLeases = new Map<string, string>();
let sideChatRecents = new SideChatRecents();
const sideChatReopens = new Set<string>();
const sideChatInterrupts = new Map<string, Promise<unknown>>();

function sideChatRecentsFile(): string {
  return join(app.getPath("userData"), "side-chat-recents.json");
}

function sideChatTranscriptFile(threadId: string): string {
  return join(app.getPath("userData"), "transcripts", `${threadId.replace(/[^\w.-]/g, "_")}.json`);
}

function saveSideChatRecents(): void {
  const file = sideChatRecentsFile();
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(sideChatRecents.all()), { mode: 0o600 });
  renameSync(temp, file);
  send("side:recents-updated", { chats: sideChatRecents.recent() });
}

async function pruneSideChatRecents(): Promise<void> {
  const stale = sideChatRecents.expired();
  if (!stale.length) return;
  for (const paneId of new Set(stale)) {
    const record = sideChatRecents.get(paneId);
    if (!record) continue;
    try {
      await engine.request("thread/delete", { threadId: record.threadId });
      sideChatRecents.remove(paneId);
      threadMcp.delete(record.threadId);
      rmSync(sideChatTranscriptFile(record.threadId), { force: true });
    } catch (error) {
      console.warn("[side-chat] could not prune expired thread:", error);
    }
  }
  saveSideChatRecents();
  saveThreadMcp();
}

function ensurePane(paneId: string): { threadId: string | null; turnId: string | null } {
  return (panes[paneId] ??= { threadId: null, turnId: null });
}

/** Answer any local approval waiting on this thread. A dynamic tool call is
 *  blocked on that promise and the engine is blocked on the tool call, so a
 *  torn-down pane would otherwise wedge the turn forever. */
function settleLocalApprovals(threadId: string | null | undefined): void {
  if (!threadId) return;
  for (const [reqId, pending] of pendingApprovals) {
    if (pending.kind !== "local" || pending.threadId !== threadId) continue;
    pendingApprovals.delete(reqId);
    pending.settle("decline");
  }
}

function settleLocalUserInputs(threadId: string | null | undefined): void {
  if (!threadId) return;
  for (const [requestId, pending] of pendingUserInputs) {
    if (pending.kind !== "local" || pending.threadId !== threadId) continue;
    pendingUserInputs.delete(requestId);
    pending.settle(null);
  }
}

/** Close a side pane and stop its running turn before hiding it. */
function dropSidePane(paneId: string): void {
  const pane = panes[paneId];
  if (!pane) return;
  const threadId = pane.threadId;
  settleLocalApprovals(threadId);
  settleLocalUserInputs(threadId);
  if (threadId) {
    const turnId = pane.turnId ?? runningTurns.get(threadId) ?? null;
    if (turnId) {
      const interrupt = engine.request("turn/interrupt", { threadId, turnId }).catch(() => {
        // the turn may have just finished on its own
      });
      sideChatInterrupts.set(threadId, interrupt);
      void interrupt.finally(() => {
        if (sideChatInterrupts.get(threadId) === interrupt) sideChatInterrupts.delete(threadId);
      });
      runningTurns.delete(threadId);
      petFinished(`turn:${threadId}`, "interrupted");
    }
    threadAccessModes.delete(threadId);
  }
  delete panes[paneId];
  if (sideChatRecents.close(paneId)) {
    saveSideChatRecents();
    void pruneSideChatRecents();
  }
}

function resetSidePanes(): void {
  for (const k of Object.keys(panes)) {
    if (k.startsWith("side:")) dropSidePane(k);
  }
}

/** Where chats outside any project live. NOT the home directory: the
 *  engine merges any `.codex/` config folder found at the cwd once the
 *  thread is trusted — and full-access/workspace-write threads self-trust
 *  their cwd at start. $HOME/.codex is the user's PERSONAL codex CLI
 *  config; running chats in ~ imported its model override, MCP servers,
 *  and freeform apply_patch tool, which the gateway rejects with
 *  'only "function" and "namespace" tools are supported (got "custom")'.
 *  A dedicated subfolder has no .codex anywhere on its cwd→root walk. */
function defaultChatDir(): string {
  const dir = join(app.getPath("home"), "Unbiased");
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return app.getPath("home");
  }
}

// ── Agent browser: model-driven browsing via dynamic tools ─────────────
// The standalone runtime advertises the browser tools and executes them.
// Desktop retains conversation routing and permission checks; no browser CLI,
// profile, tab state or raw CDP connection is owned by Electron's main process.
// Consent state, keyed by the ROOT conversation. Plain browsing is gated
// only in "ask" mode (auto and full already permit network work); attaching
// to the user's own Chrome is gated in EVERY mode, because it hands the
// agent their signed-in sessions rather than public pages.
// The mode a thread STARTED under. codex takes approvalPolicy at thread/start,
// so the browser gate must too — otherwise flipping the global toggle for one
// conversation silently ungates a backgrounded one.
const threadAccessModes = new Map<string, AccessMode>();
const browserNetGrants = new Set<string>();
const browserConnectGrants = new Set<string>();
const browserRuntime = new BrowserRuntimeClient({
  entry: productionBuild() ? join(process.resourcesPath, "browser-runtime", "main.js") : join(app.getAppPath(), "build", "browser-runtime", "main.js"),
  options: { browserRoot: automationBrowserPaths(process.resourcesPath, productionBuild(), app.getAppPath()).root,
    home: app.getPath("home"), tempDir: app.getPath("temp"), osVersion: process.getSystemVersion(),
    headed: process.env.UNBIASED_AGENT_CHROME_HEADED === "1" },
  onEvent: (event, payload) => send(event, payload),
});

const TRANSCRIPT_CACHE_VERSION = 2;
let refreshCatalogueAtStartup: () => void = () => {};
let browserShuttingDown = false;
function agentStylePrefsFile(): string {
  return join(app.getPath("userData"), "agent-style.json");
}

let agentStyleCache: AgentStylePrefs | null = null;
function agentStylePrefs(): AgentStylePrefs {
  if (!agentStyleCache) {
    try {
      agentStyleCache = parseAgentStylePrefs(JSON.parse(readFileSync(agentStylePrefsFile(), "utf8")));
    } catch {
      agentStyleCache = { ...DEFAULT_AGENT_STYLE };
    }
  }
  return agentStyleCache;
}

function saveAgentStylePrefs(value: unknown): { ok: boolean; prefs: AgentStylePrefs } {
  const prefs = parseAgentStylePrefs(value);
  try {
    writeFileSync(agentStylePrefsFile(), JSON.stringify(prefs), { mode: 0o600 });
    agentStyleCache = prefs;
    return { ok: true, prefs };
  } catch {
    return { ok: false, prefs: agentStylePrefs() };
  }
}

// The host app's own instructions for every thread it starts (codex's
// developer_instructions channel; sub-agents inherit it). Kept short — it
// rides every request. Its one job is to stop the model asking for
// permission in prose when the APP is the thing that asks: without this the
// model reliably stalls on private-data requests ("go over my email") with a
// "shall I?" instead of calling the tool that triggers the real prompt.
const APP_DEVELOPER_INSTRUCTIONS = [
  ...OPENUI_VISUAL_INSTRUCTIONS,
  "Permission in this app is handled by the app, not by you. When a tool needs the user's consent —",
  "network access, or a signed-in browser session — calling it shows the user a permission card they",
  "approve or deny. So call the tool directly and never ask the user in chat for permission first,",
  "never wait for a yes, and never re-describe what you are about to do instead of doing it. This",
  "applies to private data too (their email, messages, dashboards): the card covers it. The one case",
  "to stop and ask is when a tool result says the browser profile is new and not signed in yet — then",
  "tell the user to sign in in the window that opened, and never ask them for a password yourself.",
  "When a real missing detail or preference blocks progress, use ask_user to show a question card",
  "and continue with its answer. Do not use it for progress updates, passwords, or tool permissions.",
  // Engine errors leak the engine. codex's not-logged-in error for an MCP
  // server ends `Run \`codex mcp login <name>\``, and with nothing said here
  // the model relayed it verbatim — a CLI this product does not ship, pointed
  // at a CODEX_HOME it does not use. Observed live on a HoneyComb server the
  // user had added. The instruction has to name the real affordance, because
  // "do not say that" with no replacement just leaves the user stuck.
  "This app runs on a modified engine, and some of its errors name tools that are not part of this",
  "product. Never pass those on. In particular, if an MCP server reports that it is not logged in,",
  "do NOT repeat any `codex ...` command: signing in lives in the app, under Settings then MCP",
  "servers, where that server now shows a Sign in button. Say that instead. The same applies to any",
  "other command an engine error suggests — describe what the user should do in Unbiased, and if",
  "there is no way to do it in the app, say so plainly rather than inventing one.",
  // The browser. Same reasoning as delegation below, and the same fix: the
  // browser_* tools were declared on every turn but never mentioned here, so
  // asked to do something on the web the model would answer "I have no browser
  // automation capability" and reach for the shell instead — running the
  // agent-browser CLI itself, in its own session and its own signed-out temp
  // profile, outside every gate and invisible to the Agent browser pane.
  // Naming the capability is what stops that.
  "You have a real browser: the browser_* tools drive a Chrome this app manages, and the user watches it",
  "in the app's Agent browser tab. Reach for it on your own initiative whenever a task involves the web —",
  "browser_search for anything public, and browser_connect FIRST for anything behind the user's own login",
  "(their Slack, email, dashboards, admin panels). Never shell out to `agent-browser`, curl, or any other",
  "command to browse: those run outside the app's permission and mirroring, so the user cannot see or",
  "approve them. If a browser tool is genuinely absent from your tools, say the Agent browser is",
  "unavailable rather than substituting a shell command for it.",
  // Delegation. The collaboration tools are available on every turn, but models
  // rarely reach for them unprompted — Claude Code and codex get "automatic"
  // sub-agents purely by saying when to delegate, so this does the same. The
  // retry rule below is not hypothetical: re-briefing a failed agent in-thread
  // stacks instruction blocks into a growing context until it cannot succeed
  // (the Euler failure, 2026-08-21). Keep spawning model-initiated — never
  // tell the user they must ask for agents.
  "Use sub-agents (spawn_agent) on your own initiative when work splits into independent,",
  "parallelizable pieces: exploring several modules or directories at once, producing one artifact",
  "per item in a list, broad research where only conclusions matter, or long self-contained jobs",
  "that would otherwise fill this conversation with intermediate output. Give each agent a",
  "self-contained brief — exact paths, the deliverable, acceptance criteria — because it starts",
  "with none of this conversation's context. Do NOT delegate small edits, sequential steps where",
  "each depends on the last, or anything needing the full discussion so far; do those yourself.",
  "Keep it to the few agents the work genuinely needs. If an agent fails on a provider or stream",
  "error, spawn a FRESH agent with the same brief instead of re-sending instructions to the failed",
  "one — a retried thread accumulates every prior attempt and only gets more likely to fail.",
  // Retry ceiling. A spawn_agent call whose ARGUMENTS come back rejected is a
  // transport failure, not a payload the model can fix by reshaping: observed
  // live, the arguments arrive empty (the model reports "task_name and message
  // were both omitted" for calls it populated). Without a stated ceiling the
  // model reads the parse error as its own mistake and reshapes forever — one
  // review turn burned ~15 attempts and produced no delegation at all. Two
  // strikes, then do the work directly, which is a perfectly good outcome.
  // WORKAROUND (2026-08-26) — remove once the gateway is fixed.
  //
  // A spawn_agent brief containing ANY non-ASCII character arrives at the
  // engine as an EMPTY arguments string. Isolated over six probes on one
  // session:
  //   28 chars, plain words                -> spawned
  //   2,399 chars, plain words             -> spawned   (length is fine)
  //   newline in the message               -> spawned   (escaping is fine)
  //   double quotes in the message         -> spawned   (escaping is fine)
  //   em dash (U+2014) in the message      -> FAILED
  // Engine error: `failed to parse function arguments: EOF while parsing a
  // value at line 1 column 0` — serde's message for zero bytes, so the payload
  // is discarded rather than mangled.
  //
  // This bites hard because the model writes em dashes, curly quotes and
  // ellipses naturally in prose, so almost any conversationally-worded brief
  // fails while a terse one succeeds. That is exactly the pattern seen live:
  // short exploration briefs delegated, PR-review briefs never did.
  //
  // Only the collab tools are affected. The app's own browser_* tools ride the
  // wire as plain function tools and are unharmed, which points at the
  // namespace flatten/split path rather than at tool calls generally.
  "Keep every spawn_agent brief to plain ASCII. Line breaks, straight quotes and backticks are all",
  "fine — the one thing that breaks is any character outside ASCII. Write a hyphen instead of an em",
  "or en dash, straight quotes instead of curly ones, three dots instead of an ellipsis character,",
  "the word \"to\" instead of an arrow, and no emoji or accented letters. This is a transport",
  "limitation rather than a style preference: one non-ASCII character makes the whole brief arrive",
  "as an empty payload and the spawn fails. Length is not a problem, so spell the task out in full.",
  "If spawn_agent still rejects your ARGUMENTS — a parse error, or a complaint that required fields",
  "are missing from a call you populated — retry ONCE with a plainer one-line brief, and if that",
  "also fails, STOP delegating and do the work yourself in this conversation. Say in one line that",
  "delegation was unavailable and get on with the task. Never spend a turn retrying it.",
  // Slot hygiene. The engine is explicit that "completed agents remain open and
  // count toward the concurrency limit until closed", and the cap is 5 per
  // session (max_concurrent_threads_per_session). close_agent exists ONLY as a
  // model tool — there is no client RPC for it, so the app cannot reclaim a
  // slot on the model's behalf; asking here is the only lever there is.
  // Without this, three sub-agents in one conversation permanently consume
  // three of five slots, and a second round of delegation later in the same
  // conversation fails with "agent thread limit reached".
  "The order after delegating is fixed: collect every agent's report, WRITE YOUR FINAL ANSWER, and",
  "only then call close_agent on each one. Closing is cleanup, never the last thing you do — a turn",
  "that ends with progress narration and no answer has failed, however tidy the agents are. Never",
  "close an agent whose report you have not read. A finished agent keeps occupying one of this",
  "conversation's five slots until it is closed, so leaving them open means later delegation in the",
  "same conversation stops working.",
  // Align the model with the schema it was actually given. The engine's own
  // spawn_agent text invites setting `model` ("set `model` only when an
  // explicit override is needed"), but this app configures
  // expose_spawn_agent_model_overrides = false, which removes that field from
  // the schema — so following that advice sends a key the tool does not
  // declare. Sub-agents inherit Pareto either way.
  "Never set a `model` field on spawn_agent. This app does not offer model overrides, and",
  "sub-agents already inherit the current model.",
].join("\n");

/** The instructions a thread actually gets: the static block above plus its
 *  scoped memory index, when it has one. Computed per thread START — the
 *  index a running conversation sees is a snapshot, same as Claude Code's
 *  per-session index, refreshed on the next thread/start or resume. */
function baseDeveloperInstructions(): string {
  return `${APP_DEVELOPER_INSTRUCTIONS}\n\n${agentStyleInstructions(agentStylePrefs())}\n\n${agentInstructionsGuidance(homedir())}`;
}

function developerInstructionsFor(cwd: string | null, threadId: string | null = null, projectId?: string | null): string {
  const dir = memoryDirForCwd(cwd, threadId, projectId);
  const section = dir ? renderMemorySection(loadMemoryNotes(dir), dir) : "";
  const base = baseDeveloperInstructions();
  return [base, configuredProjectContext(cwd, threadId, projectId), section].filter(Boolean).join("\n\n");
}

function configuredProjectContext(cwd: string | null, threadId: string | null = null, projectId?: string | null): string | null {
  const project = projectId !== undefined
    ? loadProjects().find((p) => p.id === projectId) ?? null
    : threadProject(threadId, cwd);
  return project ? projectContextForDirectory({ cwd, projects: [project], worktrees: loadWorktrees(), assignedProject: project.primary }) : null;
}

async function agentBrowserTools() {
  try {
    const tools = await browserRuntime.discoverTools();
    return tools.length ? tools : undefined;
  } catch (error) {
    console.warn("[browser-runtime] Tool discovery failed", error);
    return undefined;
  }
}

const COMPUTER_USE_TOOLS = [
  {
    type: "function",
    name: "computer_screenshot",
    description:
      "Capture the primary display and return it as an image. The result states the exact coordinate frame to use for later computer actions; it is scaled down from the display, so never assume the display resolution. This always requires explicit user approval.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "computer_move",
    description:
      "Move the pointer to coordinates in the frame that computer_screenshot reported, which is NOT the display resolution. Take a fresh computer_screenshot first. This always requires explicit user approval.",
    inputSchema: {
      type: "object",
      properties: { x: { type: "integer" }, y: { type: "integer" } },
      required: ["x", "y"],
    },
  },
  {
    type: "function",
    name: "computer_click",
    description:
      "Click explicit coordinates in the frame that computer_screenshot reported, which is NOT the display resolution. Take a fresh computer_screenshot first. This always requires explicit user approval.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "integer" },
        y: { type: "integer" },
        button: { type: "string", enum: ["left", "middle", "right"], default: "left" },
      },
      required: ["x", "y"],
    },
  },
  {
    type: "function",
    name: "computer_type",
    description:
      "Type text into the application that currently has keyboard focus. Never use this for passwords or secrets. This always requires explicit user approval.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", maxLength: 4000 } },
      required: ["text"],
    },
  },
  {
    type: "function",
    name: "computer_key",
    description:
      "Press one supported key, optionally with command, control, option, or shift. This always requires explicit user approval.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "A letter, digit, F1-F12, arrow key, Enter, Escape, Tab, Space, Backspace, Delete, Home, End, PageUp, or PageDown." },
        modifiers: {
          type: "array",
          items: { type: "string", enum: ["command", "control", "option", "shift"] },
        },
      },
      required: ["key"],
    },
  },
  {
    type: "function",
    name: "computer_scroll",
    description:
      "Scroll at explicit coordinates in the frame that computer_screenshot reported. Positive deltaY scrolls down; positive deltaX scrolls right. Values are OS scroll steps from -100 to 100. This always requires explicit user approval.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "integer" },
        y: { type: "integer" },
        deltaX: { type: "integer", minimum: -100, maximum: 100, default: 0 },
        deltaY: { type: "integer", minimum: -100, maximum: 100, default: 0 },
      },
      required: ["x", "y"],
    },
  },
];

// The accessibility bridge (unbiased-ax): an app's structure as text, acted on
// by element id. Declared only while the bridge is running — see
// threadDynamicTools. Measured against real Brave: the task that took the
// screenshot tools 27 calls and 6.7 minutes took this path 8 calls and 9.3s.
/** Which way a named direction pushes the wheel. Negative dy reveals content
 *  further DOWN, which is what a reader means by "scroll down"; keeping that
 *  convention in one table means the batch and the single verb cannot drift. */
const SCROLL_DELTAS: Record<string, { dx: number; dy: number }> = {
  down: { dx: 0, dy: -1 },
  up: { dx: 0, dy: 1 },
  right: { dx: -1, dy: 0 },
  left: { dx: 1, dy: 0 },
};

const AX_TOOLS = [
  {
    type: "function",
    name: "computer_apps",
    description: "List running apps with the frontmost marked. No approval needed. Use the returned name for the other computer_* tools.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "computer_app_state",
    description:
      "Read an app's windows and UI element tree as text, one element per line: id, role, title, value, flags, and the actions it supports in braces. " +
      "THIS IS THE TOOL FOR APPS THE USER ALREADY HAS OPEN — their running browser and its existing tabs included, so a site they are already signed into (Slack, Gmail, a dashboard) is read and operated here, in their own window. The browser_* tools open a separate browser instead and cannot see any of it. " +
      "Act on those ids: the controls are named, so press them rather than guessing keyboard shortcuts. " +
      "Reach for this BEFORE computer_screenshot: it answers what is on screen, which tab is selected, and where a control is, as text. "
      + "It works on a BACKGROUND app on any Space and never takes over the user's screen. " + TASK_DISCIPLINE_SENTENCE +
      "Ids are stable per app until an element disappears. After the first read of an app the result is a DIFF (~ changed, + added, removed by id) unless full=true. " +
      APP_STATE_SPACE_SENTENCE + "Pass query to search for one control by title instead of reading everything. " +
      "Web page content inside a browser needs web=true. Use computer_screenshot when you need to SEE something the tree cannot express — whether a video is actually playing, a canvas, a rendered chart — and one confirming screenshot at the end of a visual task is worth taking.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string", description: "App name, name prefix, bundle id, or pid — e.g. \"Brave\"." },
        query: { type: "string", description: "Find elements whose title or value contains this, instead of returning the whole tree." },
        role: { type: "string", description: "With query: restrict to a role, e.g. \"text field\", \"link\", \"button\", \"tab\"." },
        interactive: { type: "boolean", default: true, description: "True (default) lists only controls you can operate. Set FALSE when you are reading information rather than looking for something to press: values, labels, prices, distances, times and ratings are static text, and true hides them. Measured on a Maps place card: 46 elements with true, 119 with false — the distance was only in the second." },
        web: { type: "boolean", default: false, description: "Include web page content in browsers (Chromium builds it on request)." },
        full: { type: "boolean", default: false, description: "Return the whole tree even when a diff is available." },
        depth: { type: "integer", description: "Maximum tree depth (default 14)." },
      },
      required: ["app"],
    },
  },
  {
    type: "function",
    name: "computer_raise",
    description:
      RAISE_DESCRIPTION,
    inputSchema: { type: "object", properties: { app: { type: "string" } }, required: ["app"] },
  },
  {
    type: "function",
    name: "computer_launch",
    description:
      "Open an app that is not running yet, by name or bundle id — \"Maps\", \"Slack\", \"com.apple.Maps\". USE THIS, never a shell command: it waits until the app is actually READABLE rather than merely running, and returns its element tree, so the next step can act immediately. Launching by shell returns before the app is in the accessibility tree, and the read that follows fails. " +
      "Harmless if the app is already running — it says so and reads it. " + LAUNCH_FRONT_SENTENCE,
    inputSchema: {
      type: "object",
      properties: { app: { type: "string", description: "App name or bundle id, e.g. \"Maps\"." } },
      required: ["app"],
    },
  },
  {
    type: "function",
    name: "computer_press",
    description:
      "Press an element by the id computer_app_state returned — a button, a link, a tab, a search result, a menu item. This is the ordinary way to operate an app: the tree names the controls, so press the one you want instead of guessing a keyboard shortcut. Works on a background app without taking the user's screen. " +
      "It WAITS for the app to react and returns what changed, so do NOT follow it with computer_app_state — pressing a search result returns the place card, pressing a tab returns that tab's contents. Read again only if the result says nothing changed and you expected something.",
    inputSchema: {
      type: "object",
      properties: { app: { type: "string" }, id: { type: "integer", description: "Element id from computer_app_state." } },
      required: ["app", "id"],
    },
  },
  {
    type: "function",
    name: "computer_set_value",
    description:
      "Set a text field's contents by element id — a search box, an address bar, a message input. Replaces what is there. This does NOT submit: follow it with computer_key key=return when the field needs committing (a search box, a browser address bar, a chat input)." +
      "It waits for the app to react and returns what changed, so do not read again straight afterwards.",
    inputSchema: {
      type: "object",
      properties: { app: { type: "string" }, id: { type: "integer" }, text: { type: "string", description: "The text to put in the field." } },
      required: ["app", "id", "text"],
    },
  },
  {
    type: "function",
    name: "computer_press_key",
    description:
      "Send one real key event. Use it for what pressing a control cannot express: committing a field with return, dismissing with escape, moving with tab or the arrows, and SELECTING A TOOL by its shortcut. " +
      "A single letter or digit is a key, which is often the only way in: a design app puts its tools behind one-character shortcuts and exposes no element for them at all, a pen or shape tool is one letter and nothing else reaches it. modifiers holds command, shift, option or control around the keystroke. " +
      "A bare digit is text: with keyboard focus off a field it is refused, because it would reach the app as a shortcut — enter numbers with type or set_value on the field. A delete with focus off a field removes objects and is watched even inside computer_do, with what it removed named. " +
      "Pass id to aim the key at an element, which is focused first — WITHOUT id it goes wherever keyboard focus already happens to be, which may be another field entirely. Reaches a background app on any Space without taking the user's screen, because a key event does not depend on where the window is. " +
      "It waits for the app to react and returns what changed — committing a search with return comes back with the results in it, so do not read again straight afterwards.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        key: {
          type: "string",
          description: "One letter (a-z), one digit, shortcut punctuation such as ] and [ for bring-to-front and send-to-back, or a named key: return, tab, escape, space, delete, up, down, left, right.",
        },
        modifiers: {
          type: "array",
          description: "Held around the keystroke: command, shift, option, control.",
          items: { type: "string", enum: ["command", "shift", "option", "control"] },
        },
        id: { type: "integer", description: "Focus this element first, so the keystroke lands there." },
      },
      required: ["app", "key"],
    },
  },
  {
    type: "function",
    name: "computer_scroll_view",
    description:
      "Scroll the container an element sits in, to reveal content that is not on screen — the rest of a list, a results panel, a long page. Pass the id of an element inside the thing you want scrolled. Read again afterwards to see what appeared.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        id: { type: "integer", description: "An element inside the container to scroll." },
        direction: { type: "string", enum: ["down", "up", "left", "right"], description: "Which way to reveal more content." },
        amount: { type: "integer", description: "Lines to scroll (default 5)." },
      },
      required: ["app", "id", "direction"],
    },
  },
  {
    type: "function",
    name: "computer_do",
    description:
      "Run several steps on ONE app in a single call, in order, and get back what changed. Use this whenever you already know the next few moves — filling a field and committing it, pressing a tab and reading the result, scrolling and reading. It saves a whole round trip per step, which is the main cost of operating an app. " +
      "Each step is {do, ...}: do=\"press\" with id; do=\"set_value\" with id and text; do=\"key\" with key (and optional id to aim it); do=\"scroll\" with id and direction; do=\"act\" with id and action; do=\"read\" to re-read the app; do=\"screenshot\" to photograph the window at that point — the picture comes back with the result, so a look costs no extra turn. Add wait_ms to a step to pause after it, for content that loads (a tab that shows \"Loading…\"). " +
      `Up to ${MAX_BATCH_STEPS} steps — use them: one shape's position, size, colour and commit is ONE call, not five. It STOPS at the first step that fails and tells you which one — the rest do not run, so do not assume they did. After the batch, every field it touched is read back and listed under \"Fields now:\", so you do not need to read the app to check a value you just wrote. The result also ends with the inspector — every settable control with its id and current value the first time, then only what changed — so the next step can be aimed without reading the app. ` +
      "SETTING A VALUE IN A WEB APP'S PANEL (any Chromium-based app, which is most design and productivity tools): set_value works on an element the tree calls a \"text field\" and is SILENTLY IGNORED on a \"stepper\" — the write appears in the box, the value never changes, and it commits later when focus leaves, which is how a 67 became 100100. For a stepper use the four-step recipe in ONE call: {\"do\":\"pointer\",\"id\":N} then {\"do\":\"key\",\"key\":\"a\",\"modifiers\":[\"command\"]} then {\"do\":\"type\",\"text\":\"460\"} then {\"do\":\"key\",\"key\":\"return\"}. Add clicks:2 to the pointer step if one click does not open the field. Read the value back afterwards: some fields reject what you typed and fall back to 0. " +
      "Opening or raising an app is not batchable: call computer_launch or computer_raise on its own. Do NOT batch steps whose ids you have not read yet, or steps that depend on what an earlier step reveals — read first, then batch what you can see. " +
      `Pass candidates instead of steps when you can see several plausible ways to reach ONE state and cannot tell which the app will honour: press the result row, or send down then return, or type the whole intent into the search field. Each candidate is a route — a step or a short list of steps — they are tried in order, and it stops at the first that changes the app, telling you what each one did. That is a model turn saved per wrong guess. Read the diff and confirm the state is the one you wanted; "it changed something" is not "it worked". Actions only, never for anything you would not want to happen twice. ` +
      TASK_DISCIPLINE_SENTENCE.trim(),
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        candidates: {
          type: "array",
          description: `Instead of steps: alternative routes to ONE state, tried in order, stopping at the first that changes the app. Each entry is a step or a short list of steps, e.g. [{"do":"press","id":88}, [{"do":"key","key":"down"},{"do":"key","key":"return"}]]. Two to ${MAX_CANDIDATES} routes.`,
          items: { type: "array", items: { type: "object" } },
        },
        steps: {
          type: "array",
          description: "The steps to run, in order.",
          items: {
            type: "object",
            properties: {
              do: { type: "string", enum: ["press", "set_value", "key", "scroll", "act", "read", "screenshot"] },
              id: { type: "integer", description: "Element id from computer_app_state." },
              text: { type: "string", description: "With do=set_value, or with do=type: the whole string to type as real keystrokes." },
              clicks: { type: "integer", description: "With do=pointer: 2 for a double click, which some fields need before they accept typing." },
              // The same key surface as computer_press_key. It used to be an
              // enum of nine named keys here, so a tool shortcut ("p" for
              // Figma's pen) and a select-all could not appear in a batch at
              // all — measured: one Figma task sent 91 key presses one per
              // turn, every one of which was legal only as a single call.
              key: { type: "string", description: "With do=key: one letter (a-z), one digit, shortcut punctuation, or a named key — return, tab, escape, space, delete, up, down, left, right." },
              modifiers: {
                type: "array",
                description: "With do=key: held around the keystroke — command, shift, option, control.",
                items: { type: "string", enum: ["command", "shift", "option", "control"] },
              },
              direction: { type: "string", enum: ["down", "up", "left", "right"], description: "With do=scroll." },
              amount: { type: "integer", description: "With do=scroll: lines (default 5)." },
              action: { type: "string", description: "With do=act: one of the actions the element listed in braces." },
              window: { type: "integer", description: "With do=screenshot: window id from computer_app_state (default: the focused window)." },
              wait_ms: { type: "integer", description: "Pause this many ms after the step, for content that loads." },
            },
            required: ["do"],
          },
        },
      },
      required: ["app", "steps"],
    },
  },
  {
    type: "function",
    name: "computer_pointer",
    description:
      "Click or drag INSIDE one element, for surfaces that have no controls to press: a design canvas, a drawing area, a map you must place a point on. This is how you draw. " +
      'Points are FRACTIONS of the anchor element\'s box, never screen pixels: {"x":0,"y":0} is its top-left, {"x":0.5,"y":0.5} its centre, {"x":1,"y":1} its bottom-right. Pass the id of the element you are aiming inside — the canvas or web area, not the window — and the reply tells you the screen points your fractions landed on. ' +
      "Several points are separate clicks, which is how a pen tool takes a path; add hold=true to make them one press-drag-release instead. modifiers holds shift, option, command or control throughout. " +
      "Before a long path, clear the surface: fit the target to the view, and hide the app's panels and toolbars or go full screen — a control floating over the surface, often one that appears only once drawing begins, takes the click instead and ends the path or switches the tool. Then draw the whole shape in ONE call; an app may not join a path continued in a second. " +
      "This is the ONE verb that needs the window actually visible on this Space, because it aims at real screen coordinates and the app hit-tests them. If the window is elsewhere it is BROUGHT FORWARD for you — do not raise it yourself first, and the reply says when that happened so you can tell the user. " +
      "It does NOT move the user's pointer: the clicks are delivered to the window where they land, so their mouse is free while you work. Do not use it to press something that IS in the tree — press that by id.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        id: { type: "integer", description: "The element to aim inside, from computer_app_state. Its box is the coordinate space." },
        path: {
          type: "array",
          description: 'Points in order, each a fraction of the anchor: [{"x":0.25,"y":0.5},{"x":0.75,"y":0.5}].',
          items: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
        },
        clicks: {
          type: "integer",
          description: "2 for a double click at each point — a different event from two clicks, and sometimes the only one a control honours (a design app's number fields).",
        },
        hold: { type: "boolean", description: "True: one drag through every point. False (default): a click at each." },
        modifiers: {
          type: "array",
          description: "Held down throughout: command, shift, option, control.",
          items: { type: "string", enum: ["command", "shift", "option", "control"] },
        },
      },
      required: ["app", "id", "path"],
    },
  },
  {
    type: "function",
    name: "computer_app_screenshot",
    description:
      "Photograph ONE app's window as an image, wherever the window is — another Space included — without raising it or touching the user's screen. Use it when the tree cannot express what you need to see: a rendered chart, whether a video is playing, how things are laid out. " +
      "In a window on another Space, content the app only draws while visible (map tiles, video frames, some web views) may be blank; its controls and text are not. Never raise an app just to look at it: use this.",
    inputSchema: {
      type: "object",
      properties: { app: { type: "string" }, window: { type: "integer", description: "Window id from computer_app_state. Default: the focused window." } },
      required: ["app"],
    },
  },
  {
    type: "function",
    name: "computer_menu",
    description:
      "The app's menu bar commands by NAME, read from the closed menus — nothing opens. Without item: lists the menus (query narrows to the commands whose name or menu contains it, e.g. query \"hide\" or \"full screen\" or \"zoom\"), each with its real shortcut. With item: runs that command by its title, or by \"Menu > Title\" when the title is in several menus. " +
      "Use this for view and window commands — hide panels or toolbars, full screen, zoom to fit or to selection, undo, select all — instead of guessing a shortcut: a wrong guess lands in the app as some other command. " +
      "Running a command brings the app to the front, because a menu action in a background app does nothing.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        query: { type: "string", description: "Filter the listing to commands whose \"Menu > Title\" contains this text." },
        item: { type: "string", description: "Run this command: its exact title, or \"Menu > Title\"." },
      },
      required: ["app"],
    },
  },
  {
    type: "function",
    name: "computer_find",
    description:
      "Find the ONE element matching a description, when you know what you want but not its id — or after a read has gone stale. " +
      "It returns exactly one element or refuses: several matches come back as a list to choose between, none comes back with what nearly matched. " +
      "It never picks for you, because picking would act on something you did not see. " +
      "Matching is exact and case-sensitive unless you ask otherwise. When a label repeats across panels, `within` (an ancestor's id) is usually faster than adding more fields.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        role: { type: "string", description: "Exactly as the tree prints it: \"text field\", \"pop up button\", \"tab button\"." },
        label: { type: "string", description: "The element's name, as quoted in the tree." },
        value: { type: "string" },
        action: { type: "string", description: "An action it must offer, e.g. \"press\" — separates a control from the text that labels it." },
        enabled: { type: "boolean" },
        selected: { type: "boolean" },
        within: { type: "integer", description: "Only look inside this element's subtree. The way to make a repeated label unique." },
        contains: { type: "boolean", description: "Substring instead of exact match on label and value. Off by default: \"Save\" matching \"Save as…\" is how the wrong button gets pressed." },
        caseInsensitive: { type: "boolean" },
      },
      required: ["app"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "computer_verify",
    description:
      "Check a postcondition YOU define: describe an element and the state you expect, and get one of three answers. " +
      "satisfied — proven true. unsatisfied — proven false, after looking again until the timeout. unknown — cannot be proved either way, and unknown is NOT success. " +
      "Use it when an action reported that nothing changed and you need to know whether it actually did nothing. " +
      "Reading again is how a stale tree is answered; sending the action again is not. " +
      "This is especially important for anything with an open/closed or on/off state: pressing it a second time may UNDO the first press rather than repeat it, so ask where it stands before you touch it again. " +
      "Expectations: exists (default true), expanded, selected, focused, value. " +
      "A state the element does not actually expose comes back unknown rather than false — the two are different, and only one of them means 'not open'.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        role: { type: "string", description: "Exactly as the tree prints it, e.g. \"button\", \"tab button\"." },
        label: { type: "string", description: "The element's name, as quoted in the tree." },
        value: { type: "string" },
        action: { type: "string", description: "An action it must offer — separates a control from the text that labels it." },
        within: { type: "integer", description: "Only look inside this element's subtree." },
        contains: { type: "boolean", description: "Substring instead of exact match on label and value." },
        caseInsensitive: { type: "boolean" },
        expect: {
          type: "object",
          description: "What should be true of it. Omit for a plain existence check.",
          properties: {
            exists: { type: "boolean" },
            expanded: { type: "boolean", description: "Open or closed. Returns unknown when the element has no such state." },
            selected: { type: "boolean" },
            focused: { type: "boolean" },
            value: { type: "string" },
          },
          additionalProperties: false,
        },
        timeoutMs: { type: "integer", description: "How long to keep looking before answering unsatisfied. Default 1500." },
      },
      required: ["app"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "computer_act",
    description:
      "Perform a NAMED action other than a plain press — the actions an element lists in braces, e.g. \"show menu\", \"cancel\", \"scroll to visible\", \"focus\". For an ordinary press use computer_click, to fill a field use computer_type, and to send a key use computer_key.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string" },
        id: { type: "integer", description: "Element id from computer_app_state." },
        action: { type: "string", description: "One of the actions the element listed in braces." },
      },
      required: ["app", "id", "action"],
    },
  },
];
// Declared and routed must be the same set. They were not, once: five tools
// were declared here and never added to the routing list, so each of them
// silently reached the coordinate-based screenshot handler, which wants screen
// coordinates and got none. A tool broken that way is invisible — it answers,
// just wrongly — so fail at startup rather than at the twelfth minute of
// somebody's task. The same goes for the three descriptions withSpaceGuidance
// rewrites: it replaces a sentence by value, so a future edit that retypes
// the sentence instead of using the constant makes it a silent no-op.
// The same for computer_screenshot's coordinate-frame sentence: it is replaced
// by value while the bridge is alive, so a retyped description would leave the
// model reading "the exact coordinate frame to use for later computer actions"
// about the one tool whose coordinate verbs are refused.
for (const t of COMPUTER_USE_TOOLS) {
  if (t.name === "computer_screenshot" && withScreenshotGuidance(t, "screenshot-only").description === t.description) {
    throw new Error("computer_screenshot's description no longer carries SCREENSHOT_FRAME_SENTENCE — withScreenshotGuidance would be a no-op; build it from the constant in ax-bridge.ts");
  }
}
for (const t of AX_TOOLS) {
  if (!routesToAx(t.name)) throw new Error(`AX tool ${t.name} is declared but not routed — add it to AX_TOOL_NAMES in ax-bridge.ts`);
  if (["computer_raise", "computer_app_state", "computer_launch"].includes(t.name) && withSpaceGuidance(t, true).description === t.description) {
    throw new Error(`AX tool ${t.name}'s description no longer carries its Space sentence — withSpaceGuidance would be a no-op; build it from the constants in ax-bridge.ts`);
  }
}


// Scheduling, offered to the model as a dynamic tool — the same extension
// point the browser uses, so no new machinery is involved.
//
// The schedule is taken as flat fields rather than the engine's tagged union.
// A oneOf over four variants is exactly the shape models get wrong, and the
// cost of guessing is a task that fires at the wrong time and is not noticed
// for a week. Flat fields with one enum are far harder to misread, and
// validateSchedule rebuilds the real union on this side.
const SCHEDULE_TOOLS = [
  {
    type: "function",
    name: "schedule_create",
    description:
      "Create a recurring scheduled task that runs on its own later. Use when the user asks for something repeating — a morning brief, a Friday summary, a watch on something that changes. The user is shown a card with the full details and must approve it before anything is armed, so propose it directly rather than asking in chat first. Each run starts a FRESH conversation with no memory of this one and runs read-only, so write the prompt as complete standing instructions: name the project, the paths and what to report. Do not use this for one-off work you can simply do now.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short label, e.g. 'Daily brief'." },
        prompt: {
          type: "string",
          description: "The full instruction for each run. Self-contained — the run cannot see this conversation.",
        },
        repeat: {
          type: "string",
          enum: ["daily", "weekdays", "weekly", "hourly"],
          description: "weekdays = Mon–Fri.",
        },
        time: { type: "string", description: "Local time as HH:MM, 24-hour. Required for daily, weekdays and weekly." },
        days: {
          type: "array",
          items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] },
          description: "Required for weekly. Ignored otherwise.",
        },
        intervalHours: { type: "integer", description: "Required for hourly. 1–24." },
        projectPath: {
          type: "string",
          description:
            "Absolute path to the project the run should work in. Omit to use this conversation's project, which is almost always right — pass it only when the user names a different one.",
        },
      },
      required: ["name", "prompt", "repeat"],
    },
  },
];

const ASK_USER_TOOL = {
  type: "function",
  name: "ask_user",
  description:
    "Ask the user for information or a preference needed to continue this turn. " +
    "Use for a real decision, missing detail, or confirmation; do not use for ordinary progress updates. " +
    "The app displays an interactive question card and waits for the answer. " +
    "Ask 1-3 concise questions. Each may have 2-6 choices or no choices for free text. " +
    "The user may cancel; never treat cancellation as approval.",
  inputSchema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique snake_case answer key." },
            header: { type: "string", description: "Short topic label." },
            question: { type: "string", description: "The complete question shown to the user." },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: {
                type: "object",
                properties: { label: { type: "string" }, description: { type: "string" } },
                required: ["label", "description"],
              },
              description: "Omit for a free-text answer.",
            },
            isOther: { type: "boolean", description: "Allow a custom answer alongside the choices." },
          },
          required: ["id", "question"],
        },
      },
    },
    required: ["questions"],
  },
};

// Memory, offered as a dynamic tool the same way scheduling is. The saved
// note only ever becomes prompt text in later threads, so unlike
// schedule_create there is no approval card — visibility comes from the
// "Saved memory" transcript row instead, and memory_forget bounds a mistake.
const MEMORY_TOOLS = [
  {
    type: "function",
    name: "memory_save",
    description:
      "Save a durable note to this conversation's memory, shared with other conversations only when they use the same project. " +
      "Save: corrections and preferences the user states, project facts not written down anywhere, and " +
      "hard-won lessons — each with its Why. Do NOT save things the repo or git history already records, " +
      "or fleeting task details. Saving an existing name updates that note — " +
      "that is how you edit one.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short kebab-case slug, e.g. 'release-needs-em-dash'. Reusing a name overwrites that note.",
        },
        description: {
          type: "string",
          description:
            "ONE sentence: what this says and when to reach for it. This line is all a later " +
            "turn or project conversation sees before deciding to read the note — a vague one makes the memory " +
            "invisible forever.",
        },
        type: {
          type: "string",
          enum: ["user", "feedback", "project", "reference"],
          description: "user = who the user is/preferences; feedback = guidance they gave; project = facts about this project; reference = pointers to external resources.",
        },
        content: {
          type: "string",
          description: "The note body, markdown. The fact, then **Why:** (the evidence behind it), then **How to apply:**.",
        },
      },
      required: ["name", "description", "type", "content"],
    },
  },
  {
    type: "function",
    name: "memory_forget",
    description:
      "Delete one note from this conversation or project's persistent memory, by its exact name from the memory index. " +
      "Use when a memory turns out wrong or obsolete — a wrong note re-read by every future conversation " +
      "is worse than none.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "The note's exact name from the index." } },
      required: ["name"],
    },
  },
];

/** How far before its own task mail a sub-agent's first turn may be stamped
 *  and still count as the agent's. See the filter in subagents:transcript. */
const SPAWN_GRACE_SECONDS = 2;

/** What KIND of thing a step card describes. Sent with every command entry so
 *  the transcript never has to infer it from the text — a shell command, an
 *  MCP call and a scheduling proposal all arrive as `command` entries, and
 *  only this says which is which. Without it the renderer classified by
 *  string prefix and dressed a scheduling card as a shell command, complete
 *  with a fabricated `$` prompt. */
type StepSource = "shell" | "browser" | "computer" | "memory" | "tool";

function dynamicToolSource(tool: string | undefined): StepSource {
  const t = tool ?? "";
  if (t.startsWith("browser_")) return "browser";
  if (t.startsWith("computer_")) return "computer";
  if (t.startsWith("memory_")) return "memory";
  return "tool";
}

/** The step card's label for a dynamic tool call — used by both the live
 *  notification path and history replay, so a call renders identically on
 *  resume. Most tools show their raw arguments (short and informative:
 *  `browser_search {"query":…}`), but the memory tools carry a whole note
 *  body as arguments, and a JSON dump of it reads as debug output. Name the
 *  action and the note instead — the content is one click away on the
 *  "Saved Memory" row. */
function dynamicToolCommandText(tool: string | undefined, rawArgs: unknown): string {
  const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
  const t = tool ?? "tool";
  if (t === "memory_save" || t === "memory_forget") {
    const name = typeof args.name === "string" && args.name.trim() ? args.name.trim() : "memory";
    return `${t === "memory_save" ? "save memory" : "forget memory"} · ${name}`;
  }
  if (t === "computer_apps") return "list apps";
  if (t === "computer_raise") return `raise ${String(args.app)}`;
  if (t === "computer_menu") return typeof args.item === "string" && args.item.trim() ? `run menu command "${args.item}" in ${String(args.app)}` : `list menu commands in ${String(args.app)}`;
  if (t === "computer_app_state") return typeof args.query === "string" ? `find "${args.query}" in ${String(args.app)}` : `read ${String(args.app)}`;
  if (t === "computer_launch") return `open ${String(args.app)}`;
  if (t === "computer_do") {
    const n = Array.isArray(args.steps) ? args.steps.length : 0;
    return `${n} step${n === 1 ? "" : "s"} in ${String(args.app)}`;
  }
  if (t === "computer_press") return `press #${String(args.id)} in ${String(args.app)}`;
  if (t === "computer_set_value") return `set #${String(args.id)} in ${String(args.app)}`;
  if (t === "computer_press_key") return `press ${typeof args.key === "string" ? args.key : "key"} in ${String(args.app)}`;
  if (t === "computer_scroll_view") return `scroll ${typeof args.direction === "string" ? args.direction : "down"} in ${String(args.app)}`;
  if (t === "computer_act") {
    if (typeof args.key === "string") return `press ${args.key} in ${String(args.app)}`;
    if (typeof args.value === "string") return `set #${String(args.id)} in ${String(args.app)}`;
    return `${typeof args.action === "string" ? args.action : "press"} #${String(args.id)} in ${String(args.app)}`;
  }
  if (t === "computer_screenshot") return "capture desktop";
  if (t === "computer_type") return "type text";
  if (t === "computer_move") return `move to ${String(args.x)}, ${String(args.y)}`;
  if (t === "computer_click") return `click at ${String(args.x)}, ${String(args.y)}`;
  if (t === "computer_key") {
    const modifiers = Array.isArray(args.modifiers) ? args.modifiers.filter((x): x is string => typeof x === "string") : [];
    const key = typeof args.key === "string" ? args.key : "key";
    return `press ${[...modifiers, key].join("+")}`;
  }
  if (t === "computer_scroll") return `scroll at ${String(args.x)}, ${String(args.y)}`;
  const argsText = Object.keys(args).length ? ` ${JSON.stringify(args)}` : "";
  return `${t}${argsText}`.slice(0, 400);
}

/**
 * Every dynamic tool a conversation gets.
 *
 * Composed rather than returned from one source: agentBrowserTools() yields
 * undefined when the CLI is absent, and while it was the only contributor that
 * meant "no browser" and "no dynamic tools at all" were the same value. Adding
 * a second family to that would have made scheduling silently disappear on any
 * machine without agent-browser installed.
 */
async function threadDynamicTools(): Promise<Record<string, unknown>[] | undefined> {
  // The same value decides what is on the menu and what handleComputerUseCall
  // will actually run, so a withheld verb cannot come back through the door.
  const screenshots = screenshotToolsOffered({ axAlive: ax?.alive === true });
  const tools = [
    ASK_USER_TOOL,
    ...(ax?.alive ? AX_TOOLS.map((t) => withSpaceGuidance(t, ax!.crossSpace)) : []),
    ...COMPUTER_USE_TOOLS
      .filter((t) => coordinateToolAllowed(t.name, screenshots))
      .map((t) => withScreenshotGuidance(t, screenshots, ax?.crossSpace === true)),
    ...SCHEDULE_TOOLS,
    ...MEMORY_TOOLS,
    ...CHECKPOINT_TOOLS,
    IMAGE_OUTLINE_TOOL,
    ...((await agentBrowserTools()) ?? []),
  ];
  return tools.length ? (tools as Record<string, unknown>[]) : undefined;
}

/** Consent gate. Returns null when the call may proceed, else the refusal to
 *  hand back to the model. */
async function ensureBrowserAllowed(tool: string, threadId: string | null, detail: string): Promise<string | null> {
  if (tool === "browser_close") return null; // cleanup only, no network
  const root = rootThreadOf(threadId);
  const attaching = tool === "browser_connect";
  if (attaching) {
    if (browserConnectGrants.has(root)) return null;
  } else if (liveAccessMode(root) !== "ask" || browserNetGrants.has(root)) {
    return null;
  }
  const decision = await requestLocalApproval(
    threadId,
    attaching ? `Use a signed-in browser session (${detail})` : `Browse the web — ${detail}`,
    attaching
      ? "The agent wants a browser it can use as you — reading pages you are signed into (mail, X, dashboards, internal tools). Approving opens an Unbiased-managed Chrome window; anything you sign into there stays available to the agent. Allow only if you want it acting with those accounts."
      : "The agent wants to use the browser, which reaches the network. This conversation is in Ask-for-approval mode, so nothing goes out until you allow it.",
  );
  if (decision === "decline") {
    return attaching
      ? "The user declined access to their Chrome browser. Continue with public pages via browser_search instead."
      : "The user declined browser/network access for this conversation.";
  }
  if (decision === "acceptForSession") (attaching ? browserConnectGrants : browserNetGrants).add(root);
  return null;
}

/** Only real web pages. Without this the model can point browser_open at
 *  file:///… (verified reachable: /etc/hosts came back through browser_read)
 *  and exfiltrate local files to the gateway, which is the classic
 *  prompt-injection sink for a page-driving agent. */
/** A host we're willing to fetch a favicon from. The renderer's CSP forbids
 *  remote images, so main fetches them instead — which means a link inside a
 *  model-written message becomes an outbound request from this process. Public
 *  DNS names only: loopback and RFC1918 literals are refused so a rendered
 *  message cannot probe the user's LAN, and 169.254 keeps cloud metadata out
 *  of reach. Hostname-level only — a public name that RESOLVES to a private
 *  address still gets through; closing that needs a custom DNS lookup, and the
 *  request carries no credentials or cookies either way. */
function faviconHostOrNull(raw: string): string | null {
  const host = raw.trim().toLowerCase();
  if (!host || host.length > 253) return null;
  // No ports, paths, userinfo or IPv6 brackets — a bare name is all we take.
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes(".") || host.endsWith(".local")) return null;
  if (host === "0.0.0.0" || /^127\./.test(host)) return null;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (/^169\.254\./.test(host)) return null;
  return host;
}

/** Two hosts that are the same site for icon purposes. A leading `www.` on
 *  either side counts (anthropic.com serves its icon from www); nothing else
 *  does. */
function sameIconSite(a: string, b: string): boolean {
  return a.replace(/^www\./, "") === b.replace(/^www\./, "");
}

/** One favicon attempt: fetch https://<host><path> and hand it back as a data:
 *  URL, or null for anything we won't use. Never throws — a missing icon is
 *  not an error condition.
 *
 *  Redirects are walked by hand rather than with redirect:"follow", because
 *  `follow` would carry this request onto whatever a 302 names — including the
 *  loopback and LAN addresses faviconHostOrNull just refused. Checking the
 *  final URL afterwards is too late: the connection has already been made.
 *  Every hop is re-gated, must stay https, and must stay on the same site. */
async function fetchIcon(host: string, path: string): Promise<string | null> {
  let url = `https://${host}${path}`;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
        redirect: "manual",
        headers: { accept: "image/*" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        const next = new URL(loc, url);
        // A downgrade to http is refused outright: no icon is worth turning a
        // TLS fetch into a cleartext one a network attacker can answer.
        if (next.protocol !== "https:") return null;
        const nextHost = faviconHostOrNull(next.hostname);
        if (!nextHost || !sameIconSite(nextHost, host)) return null;
        url = next.toString();
        continue;
      }
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!res.ok || !type.startsWith("image/")) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      // Anything this big is not a favicon. The bytes sit in renderer state for
      // the session, so an unbounded body is a memory bug waiting to happen.
      if (buf.length === 0 || buf.length > 100_000) return null;
      return `data:${type};base64,${buf.toString("base64")}`;
    }
    return null; // redirect loop
  } catch {
    return null; // timeout, DNS, TLS, abort
  }
}

/** agent-browser parses its global flags positionally, and one of them is
 *  `--executable-path` — so a model-controlled value starting with "-" in a
 *  fill/type argument is a flag, not text. Verified: filling a field with
 *  "--headed" relaunched the browser and destroyed the page. Text like that
 *  is written into the field in-page instead, with the events a framework
 *  listens for, so it can never reach the CLI's argument parser. */
const AGENT_BROWSER_OUTPUT_CAP = 30_000;
type DynamicToolResponse = {
  contentItems: ({ type: "inputText"; text: string } | { type: "inputImage"; imageUrl: string })[];
  success: boolean;
};

function primaryComputerDisplay(): ComputerDisplay {
  const display = screen.getPrimaryDisplay();
  return {
    id: display.id,
    bounds: display.bounds,
    size: display.size,
    scaleFactor: display.scaleFactor,
  };
}

let restoreComputerWindow = false;
let screenPermissionEstablished = false;
/** What macOS lists this build under in Privacy & Security. The dev launcher
 *  registers as "Unbiased Dev"; a plain electron-vite run shows up as
 *  "Electron"; the shipped app is "Unbiased". Every message that sends the
 *  user to a permission pane must name the row that is actually there. */
function computerPermissionAppName(): string {
  return productionBuild() ? "Unbiased" : process.env.UNBIASED_DEV_APP_NAME ?? "Electron";
}

const computerUse = createComputerUseService({
  appName: computerPermissionAppName,
  getPrimaryDisplay: primaryComputerDisplay,
  // Captured AT the frame, not at the display: a full-resolution 4K capture is
  // 4.15MB of base64 PNG per screenshot, and since the rollout is re-sent
  // every turn, four of them ended a conversation with 413 Payload Too Large.
  capturePrimaryDisplay: async (display, frame) => {
    const permission = systemPreferences.getMediaAccessStatus("screen");
    if (permission !== "granted") screenPermissionEstablished = false;
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: frame,
      fetchWindowIcons: false,
    });
    const source = sources.find((candidate) => candidate.display_id === String(display.id));
    if (!source) throw new Error("The primary display was not returned by Electron.");
    const image = source.thumbnail.resize(frame);
    if (image.isEmpty()) throw new Error("Electron returned an empty desktop image.");
    screenPermissionEstablished = true;
    // toDataURL() is PNG. See COMPUTER_CAPTURE_JPEG_QUALITY: on a real capture
    // that was 4.15MB of base64 against 0.48MB for the same frame as JPEG.
    const jpeg = image.toJPEG(COMPUTER_CAPTURE_JPEG_QUALITY);
    return { dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, ...image.getSize() };
  },
  accessibilityTrusted: (prompt) => systemPreferences.isTrustedAccessibilityClient(prompt),
  loadNut: async () => (await import("@nut-tree-fork/nut-js")) as unknown as NutRuntime,
  beforeAction: async () => {
    if (!screenPermissionEstablished) return;
    restoreComputerWindow = !!win?.isVisible();
    if (!restoreComputerWindow || !win) return;
    win.hide();
    await new Promise((resolve) => setTimeout(resolve, 120));
  },
  afterAction: () => {
    if (restoreComputerWindow && win && !win.isDestroyed()) win.showInactive();
    restoreComputerWindow = false;
  },
});

function computerApprovalCommand(action: ComputerAction): string {
  switch (action.type) {
    case "screenshot": return "Capture the primary display";
    case "move": return `Move the pointer to (${action.point.x}, ${action.point.y})`;
    case "click": return `${action.button[0].toUpperCase()}${action.button.slice(1)} click at (${action.point.x}, ${action.point.y})`;
    case "type": return `Type ${action.text.length} character${action.text.length === 1 ? "" : "s"}`;
    case "key": return `Press ${[...action.modifiers, action.key].join("+")}`;
    case "scroll": return `Scroll at (${action.point.x}, ${action.point.y}) by (${action.deltaX}, ${action.deltaY})`;
  }
}

function devAccessibilityRecoveryMarker(): string {
  return join(app.getPath("userData"), "dev-accessibility-recovery.json");
}

function scheduleDevAccessibilityRecovery(): void {
  const nodeExecutable = process.env.npm_node_execpath;
  const appPath = app.getAppPath();
  const helperPath = join(appPath, "build", "dev-accessibility-relaunch.cjs");
  const launcherPath = join(appPath, "build", "dev-launcher.cjs");
  if (!nodeExecutable || !existsSync(nodeExecutable)) {
    throw new Error("The Node.js executable used by the dev server could not be found.");
  }
  if (!existsSync(helperPath) || !existsSync(launcherPath)) {
    throw new Error("The Unbiased Dev relaunch helper could not be found.");
  }
  const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? "";
  let port = 5173;
  try {
    port = Number(new URL(rendererUrl).port) || port;
  } catch {
    // The launcher falls back to its standard development port.
  }
  const helper = spawnProcess(
    nodeExecutable,
    [
      helperPath,
      JSON.stringify({
        pid: process.pid,
        bundleIdentifier: "ai.unbiased.desktop.dev",
        bundlePath: dirname(dirname(dirname(process.execPath))),
        appPath,
        launcherPath,
        markerPath: devAccessibilityRecoveryMarker(),
        rendererUrl,
        port,
      }),
    ],
    { detached: true, stdio: "ignore", env: { ...process.env } },
  );
  helper.unref();
  setTimeout(() => {
    app.quit();
    setTimeout(() => app.exit(0), 4_000).unref();
  }, 650).unref();
}

async function completeDevAccessibilityRecovery(): Promise<void> {
  if (productionBuild() || (process.env.UNBIASED_DEV_APP_NAME ?? "") !== "Unbiased Dev") return;
  const markerPath = devAccessibilityRecoveryMarker();
  if (!existsSync(markerPath)) return;
  let recoveryError = "";
  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { error?: unknown };
    recoveryError = typeof marker.error === "string" ? marker.error : "";
  } catch {
    // A malformed marker still means the permission flow needs finishing.
  }
  rmSync(markerPath, { force: true });
  if (recoveryError) {
    console.error(`[computer-use] dev Accessibility recovery failed before relaunch: ${recoveryError}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    app.focus({ steal: true });
  }
  try {
    console.info("[computer-use] requesting native Accessibility registration after dev relaunch");
    const status = await requestComputerPermission("accessibility", async () => {
      const permissionModule = await import("node-mac-permissions");
      return permissionModule.default;
    });
    console.info(`[computer-use] native Accessibility registration returned status=${status}`);
    systemPreferences.isTrustedAccessibilityClient(true);
    await openComputerPermissionSettings("accessibility", (uri) => shell.openExternal(uri));
    console.info(`[computer-use] completed dev Accessibility recovery; status=${status}`);
  } catch (err) {
    console.error("[computer-use] could not complete dev Accessibility recovery:", err);
  }
}

async function offerComputerPermissionSettings(
  threadId: string | null,
  permission: ComputerPermission,
): Promise<string> {
  const settings = COMPUTER_PERMISSION_SETTINGS[permission];
  const permissionAppName = computerPermissionAppName();
  const devAccessibilityRecovery = permission === "accessibility" && !productionBuild() && permissionAppName === "Unbiased Dev";
  const approvalCommand = devAccessibilityRecovery
    ? `/usr/bin/tccutil reset Accessibility ai.unbiased.desktop.dev && /usr/bin/open ${JSON.stringify(settings.uri)}`
    : `/usr/bin/open ${JSON.stringify(settings.uri)}`;
  const approvalReason = devAccessibilityRecovery
    ? [
        "The enabled Unbiased Dev row may belong to an older dev-app signature, which macOS treats as a different app.",
        "Allow clearing only the Accessibility decision for ai.unbiased.desktop.dev, registering this running build, and opening Settings?",
        "You still make the final permission decision in macOS. Use Quit & Reopen if macOS offers it.",
      ].join("\n")
    : [
        `${settings.label} access is blocked. Allow opening the exact macOS Privacy & Security pane?`,
        "macOS keeps the final permission decision with you; Unbiased can only show the native prompt or open Settings.",
        `Enable ${permissionAppName}, then restart the app.`,
      ].join("\n");
  const decision = await requestLocalApproval(
    threadId,
    approvalCommand,
    approvalReason,
    { allowForSession: false },
  );
  if (decision === "decline") return " The user declined to open System Settings.";
  try {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      app.focus({ steal: true });
    }
    if (devAccessibilityRecovery) {
      scheduleDevAccessibilityRecovery();
      return " Restarting Unbiased Dev to replace the stale macOS Accessibility identity. After it reopens, macOS will register this exact build and open Accessibility automatically.";
    }
    const status = await requestComputerPermission(
      permission,
      async () => {
        const permissionModule = await import("node-mac-permissions");
        return permissionModule.default;
      },
    );
    console.info(`[computer-use] requested macOS ${permission} permission; status=${status}`);
    await openComputerPermissionSettings(permission, (uri) => shell.openExternal(uri));
    console.info(`[computer-use] opened macOS ${permission} privacy settings`);
    return devAccessibilityRecovery
      ? ` Cleared the stale dev permission and registered this build. Enable ${permissionAppName} in Accessibility, then use Quit & Reopen if macOS offers it.`
      : ` Opened System Settings > Privacy & Security > ${settings.label}; enable ${permissionAppName} there, then restart this app.`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return ` Could not open System Settings: ${detail}`;
  }
}

// ── The accessibility bridge ─────────────────────────────────────────────
let ax: AxClient | null = null;
/** Conversations that granted desktop control for the session, so "allow for
 *  session" means it. Same shape as browserNetGrants. */
const axGrants = new Set<string>();
/** The app each conversation last brought forward, so an approval that steals
 *  the Space back can be undone. */
const axRaised = new Map<string, string>();

/** Whether the Accessibility pane has already been opened for the user this
 *  run. Reset when the app restarts, which is also when a fresh grant takes
 *  effect, so a second run after a refused grant opens it again. */
let axSettingsOpened = false;

/** The mode to gate a LOCAL desktop action by. threadAccessModes records what
 *  a thread started under, because codex fixes its own approvalPolicy at
 *  thread/start and cannot be changed after — but this app's own cards are not
 *  bound by that, and the pill the user just set is what they meant. */
function liveAccessMode(root: string): AccessMode {
  return accessMode || threadAccessModes.get(root) || "ask";
}

/** Put back a raise that an approval card undid. Cheap when nothing was
 *  raised, and silent on failure: this is a convenience, not a step. Nothing
 *  to put back when the bridge reads across Spaces — the card did not take
 *  anything the work needed. */
async function reassertRaise(root: string): Promise<void> {
  const appName = axRaised.get(root);
  if (!appName || !ax?.alive || ax.crossSpace) return;
  try {
    axLog(`raise ${appName} (re-assert after an approval card)`);
    await ax.request("raise", { app: appName, ...axActionOpts(appName) }, 3_000);
  } catch {
    // the app may have quit; the next read will say so plainly
  }
}
/** id -> element line per app, accumulated from every tree and diff the model
 *  saw, so an approval can say WHICH element is about to be pressed. */
const axLines = new Map<string, Map<number, string>>();

/** The settable controls in the app's latest snapshot, as ids the model can aim
 *  at next. Sent after every action that can change the selection and after
 *  every batch. Identical to the last block sent for this app collapses to one
 *  line, so an unchanged inspector costs almost nothing. Second Figma run,
 *  2026-09-08: 34 of 90 turns were finds for exactly these ids. */
const axLastInspector = new Map<string, InspectorField[]>();
async function inspectorBlock(appName: string): Promise<string | null> {
  try {
    const r = await ax!.request("fields", { app: appName }, 3_000);
    const fields = Array.isArray(r.fields) ? (r.fields as InspectorField[]) : [];
    const text = renderInspector(fields, r.truncated === true, axLastInspector.get(appName));
    if (fields.length) axLastInspector.set(appName, fields);
    return text;
  } catch {
    return null; // an older bridge has no `fields`
  }
}
/** app name -> its icon as a data URL, fetched once per app. The transcript
 *  shows it beside each step, so "press #643 in Brave" carries Brave's icon
 *  rather than a terminal glyph. */
const axIcons = new Map<string, string>();
/** The options each app was last READ with, so every action that follows
 *  snapshots the same way. See AxReadOpts. */
const axReadOpts = new Map<string, AxReadOpts>();

/** The options to send with anything that snapshots this app — every action,
 *  and raise, which rewrites the diff baseline just as an action does:
 *  whatever it was last read with. Defaults match computer_app_state's own,
 *  so a launch of an app nothing has read returns an interactive-only tree —
 *  intended: it is the baseline the first read is diffed against, and a read
 *  that disagrees with its own baseline is the bug this all exists to fix. */
function axActionOpts(appName: string): AxReadOpts {
  return axReadOpts.get(appName) ?? AX_DEFAULT_READ_OPTS;
}

/** Diagnostics. The console is the normal home, but the dev launcher runs the
 *  app through `open -W -n`, which discards stdout — an instrumented run this
 *  week produced an empty log and told us nothing. So with UNBIASED_AX_DEBUG=1
 *  the same lines also append to a file, matching the bridge's own switch.
 *
 *  Off by default: these lines name the apps a user drove and the elements
 *  they touched, and a world-readable /tmp file that grows forever is not
 *  something to hand every user for the sake of one debugging session. */
const AX_DEBUG_FILE = process.env.UNBIASED_AX_DEBUG === "1" ? "/tmp/unbiased-ax-diag.log" : null;

function axLog(line: string): void {
  console.log(`[ax] ${line}`);
  if (!AX_DEBUG_FILE) return;
  try {
    appendFileSync(AX_DEBUG_FILE, `${new Date().toISOString().slice(11, 23)} ${line}\n`);
  } catch {
    // diagnostics must never break a turn
  }
}

/** Phase 0 instrumentation. Off unless UNBIASED_AX_METRICS=1, and separate
 *  from the debug log above: that one quotes element lines and belongs to a
 *  single debugging session, this one carries verbs, counts and durations only
 *  and is meant to accumulate until the baseline is real. It answers whether a
 *  code mode is worth building, so it lives in userData rather than a
 *  world-readable /tmp, and it never records a word from the user's screen. */
let metrics = new MetricsLog(null);

function startMetrics(): void {
  if (!metricsEnabled(process.env)) return;
  const file = join(app.getPath("userData"), "run-metrics.ndjson");
  metrics = new MetricsLog((line) => appendFileSync(file, line + "\n"));
  axLog(`metrics: recording to ${file}`);
}

/** Which tool call a bridge call happened inside. AsyncLocalStorage rather
 *  than a module variable because two threads can have turns in flight at
 *  once, and a counter would file one thread's driver calls under the other's
 *  tool call — which is exactly the kind of quietly wrong number this whole
 *  exercise exists to avoid producing. */
const inToolCall = new AsyncLocalStorage<{ seq: number; thread: string | null; quiet: { id: number | null; role: string | null }[] }>();
let toolSeq = 0;

function metricNow(thread: string | null): { v: number; at: string; thread: string | null } {
  return { v: METRICS_VERSION, at: new Date().toISOString(), thread };
}

/** The icon for a step, if we have already fetched it. Synchronous on purpose:
 *  a transcript row must not wait on IPC, and the icon arrives on the next
 *  read of the same app. */
function axStepIcon(tool: string | undefined, rawArgs: unknown): string | undefined {
  const name = appOfStep(tool ?? "", (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>);
  return name ? axIcons.get(name) || undefined : undefined;
}

async function axIconFor(appName: string): Promise<string | undefined> {
  if (!appName || !ax?.alive) return undefined;
  const cached = axIcons.get(appName);
  if (cached !== undefined) return cached || undefined;
  try {
    const r = await ax.request("icon", { app: appName }, 3_000);
    const png = typeof r.png === "string" ? r.png : "";
    axIcons.set(appName, png ? `data:image/png;base64,${png}` : "");
  } catch {
    axIcons.set(appName, ""); // an app with no icon is not asked about again
  }
  return axIcons.get(appName) || undefined;
}

async function startAxBridge(): Promise<void> {
  if (ax?.alive) return;
  const dir = resolveAxDir({ isPackaged: productionBuild(), resourcesPath: process.resourcesPath, appPath: app.getAppPath() });
  if (!axLooksInstalled(dir)) return; // not installed: the tools are simply absent
  const manifest = readAxManifest(dir);
  if (!manifest) return;
  if ("error" in manifest) {
    console.warn(`[ax] not starting: ${manifest.error}`);
    return;
  }
  const client = new AxClient(manifest);
  client.onCall = (c) => {
    axLog(describeAxCall(c));
    const here = inToolCall.getStore();
    const rec: DriverRecord & { of: number | null } = {
      ...metricNow(here?.thread ?? null),
      kind: "driver",
      method: c.method,
      app: c.app,
      ms: c.ms,
      waitedMs: c.waitedMs,
      bytes: c.bytes,
      lines: c.lines,
      // Which pointer route carried it, when the bridge said. Phase 1 adds the
      // snapshot generation beside this; it does not exist yet, so the field
      // is absent rather than invented.
      targetId: c.targetId,
      // The role comes from the app's own index of element lines: the bridge
      // reply does not carry it, and the line the model was shown does.
      targetRole: c.app && c.targetId !== null ? roleOfLine(axLines.get(c.app)?.get(c.targetId)) : null,
      route: pointerRoute(c.method, c.marks),
      // wroteNothing only. valueUnchanged is the half-signal a batch step can
      // report; its verdict is reached in the batch handler, once the closing
      // diff is in, and recorded on the tool call there.
      ...(c.marks.includes("wroteNothing") ? { silent: true } : {}),
      failure: c.error ? classifyFailure(c.code ?? null, c.error) : null,
      of: here?.seq ?? null,
    };
    metrics.record(rec);
  };
  try {
    const hello = await client.start();
    ax = client;
    axLog(`bridge ${hello.version} ready (${hello.trusted ? "trusted" : "NOT trusted: Accessibility not granted"}, cross-Space ${hello.crossSpace ? "on" : "off"})`);
  } catch (err) {
    console.warn(`[ax] handshake failed: ${String(err)}`);
    client.stop();
  }
}

function axText(text: string, success: boolean): DynamicToolResponse {
  return { contentItems: [{ type: "inputText", text }], success };
}

/** One batch step, as a bridge call. Shared by both batch shapes so a verb can
 *  never mean two things depending on which one ran it. */
/** One batch step, as a bridge call. Shared by both batch shapes so a verb can
 *  never mean two things depending on which one ran it.
 *
 *  `settle` false on every step but the last: a batch reports its NET effect
 *  at the end, so waiting for each step's reaction buys a diff nobody reads.
 *  Measured on a Figma icon built out of inspector fields — 372 actions and
 *  253 seconds of settle waiting, a fifth of the run. */
async function runBatchStep(appName: string, st: BatchStep, settle = true): Promise<AxResult> {
  const opts = { ...axActionOpts(appName), ...(settle ? {} : { settle: false }) };
  switch (st.do) {
    case "read":
      return await ax!.request("tree", { app: appName, ...opts });
    case "press":
      return await ax!.request("act", { app: appName, id: st.id, action: "press", ...opts });
    case "act":
      return await ax!.request("act", { app: appName, id: st.id, action: st.action, ...opts });
    case "set_value":
      return await ax!.request("setValue", { app: appName, id: st.id, value: st.text, ...opts });
    case "select_text":
      // No settle: selecting changes nothing an app reports, so a diff for it
      // would always be "(no changes)" and cost the deadline to say so.
      return await ax!.request("selectText", { app: appName, id: st.id, ...(st.text !== undefined ? { text: st.text } : {}), ...axActionOpts(appName) });
    case "type":
      return await ax!.request("type", { app: appName, text: st.text, ...(st.id !== undefined ? { id: st.id } : {}), ...opts });
    case "pointer":
      // No path: the bridge aims at the element's centre, which is what
      // clicking a field means.
      return await ax!.request("pointer", { app: appName, id: st.id, ...(st.clicks ? { clicks: st.clicks } : {}), ...opts });
    case "key":
      return await ax!.request("key", { app: appName, key: st.key, ...(st.id !== undefined ? { id: st.id } : {}), ...(st.modifiers?.length ? { modifiers: st.modifiers } : {}), ...opts });
    case "screenshot":
      return await ax!.request("screenshot", { app: appName, ...(st.window !== undefined ? { window: st.window } : {}) }, 15_000);
    case "scroll": {
      const amount = typeof st.amount === "number" && st.amount > 0 ? Math.min(st.amount, 40) : 5;
      const d = SCROLL_DELTAS[st.direction];
      if (!d) throw new Error(`unknown direction "${st.direction}"`);
      return await ax!.request("scroll", { app: appName, id: st.id, dx: d.dx * amount, dy: d.dy * amount, ...opts });
    }
  }
}

/** Try each route in order and keep the first that changes the app.
 *
 *  This is the whole of "speculative execution" that survives contact with a
 *  real desktop. There is no reset between routes and none is needed: the
 *  losers are the routes that did nothing, which is precisely why they lost. A
 *  route that DOES something ends the run, so no side effect is ever followed
 *  by another attempt.
 *
 *  A route is judged as a whole, after all of its steps: down-then-return is
 *  one route, and stopping at the selection that "down" produced would have
 *  called a half-finished move a success. Its diffs are joined, because each
 *  step's diff is measured against the one before it.
 *
 *  Approval is unchanged. The card lists every route before any of them runs,
 *  so this cannot be a way to slip an extra press past the user. */
async function runCandidates(appName: string, routes: BatchStep[][], remember: (text: string) => void): Promise<DynamicToolResponse> {
  axLog(`do ${appName} ${routes.length} route(s): ${routes.map((r) => r.map((x) => x.do).join("+")).join(" | ")}`);
  const tried: { label: string; outcome: "worked" | "nothing" | string }[] = [];
  let winner: number | null = null;
  let diff = "";
  for (const [i, steps] of routes.entries()) {
    const label = `${i + 1}. ${steps.map((st) => `${st.do}${"id" in st && typeof st.id === "number" ? ` #${st.id}` : ""}`).join(" then ")}`;
    const diffs: string[] = [];
    let failure: string | null = null;
    for (const st of steps) {
      try {
        const r = await runBatchStep(appName, st);
        const stepDiff = String(r.diff ?? "");
        if (candidateWorked(stepDiff)) diffs.push(stepDiff);
      } catch (err) {
        // A step that cannot even be attempted ends this route, not the call:
        // that is the point of having sent alternatives.
        failure = err instanceof AxError ? err.message : String(err);
        break;
      }
      if (st.waitMs > 0) await new Promise((r) => setTimeout(r, st.waitMs));
    }
    if (failure !== null) {
      tried.push({ label, outcome: failure });
      continue;
    }
    if (diffs.length > 0) {
      tried.push({ label, outcome: "worked" });
      winner = i;
      diff = diffs.join("\n");
      break;
    }
    tried.push({ label, outcome: "nothing" });
  }
  if (diff) remember(diff);
  return axText(
    summarizeCandidates({ tried, winner, diff, remaining: routes.length - tried.length }),
    winner !== null,
  );
}


async function handleAxCall(tool: string, rawArgs: unknown, threadId: string | null): Promise<DynamicToolResponse> {
  if (!ax?.alive) await startAxBridge(); // it may have died; one attempt to bring it back
  if (!ax?.alive) return axText("The accessibility bridge is not running. Use computer_screenshot instead.", false);
  // Ask the bridge again whether it reads across Spaces while it says no: free
  // once it says yes. Before the card and before reassertRaise, which is gated
  // on it — and before `windows`, whose 3s timeout must not pay the bridge's
  // self-check on the first trusted call.
  if (await ax.refreshCrossSpace()) axLog("cross-Space turned on");
  const a = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const appName = typeof a.app === "string" ? a.app.trim() : "";
  if (tool !== "computer_apps" && !appName) return axText("app is required. Call computer_apps to list running apps.", false);

  // The access mode already decided this: full is approvalPolicy "never", and
  // a card there ignores what the user set. Mode first, then the grant.
  const root = rootThreadOf(threadId);
  const mode = liveAccessMode(root);
  // Past the context threshold, the first ACTION is held once and the model is
  // handed the literal save call — before the approval card, so the user is not
  // asked to approve something that will not run. Reads pass: they are how the
  // model finds out where it is.
  const cycle = checkpointCycle(root);
  if (isGatedTool(tool) && checkpointDue({ percent: ctxPercent.get(root) ?? null, savedThisCycle: cycle.savedThisCycle, gateUsed: cycle.gateUsed })) {
    cycle.gateUsed = true;
    axLog(`checkpoint: held ${tool} at ${String(ctxPercent.get(root))}% until notes are saved`);
    return axText(checkpointGateText(ctxPercent.get(root) ?? 0, checkpointFile(root)), false);
  }
  if (axConsent({ tool, mode, granted: axGrants.has(root) }) === "ask") {
    const decision = await requestLocalApproval(
      threadId,
      describeAxAction(tool, a, axLines.get(appName)),
      [
        "This reads or operates the app's user interface through macOS Accessibility, without a screenshot.",
        "UI text (window titles, tab names, field contents) may be added to this conversation and sent to the model.",
        "Allowing for the session covers further desktop reads and actions in this conversation.",
      ].join("\n"),
      { kind: "computer" },
    );
    if (decision === "decline") return axText("The user declined this computer action. Do not retry it unless they ask.", false);
    if (decision === "acceptForSession") axGrants.add(root);
    await reassertRaise(root); // the card took the Space back; put it right
  }

  void axIconFor(appName); // warm the cache; the row picks it up next read
  const remember = (text: string) => {
    if (!appName) return;
    axLines.set(appName, indexElementLines(text, axLines.get(appName)));
  };
  try {
    switch (tool) {
      case "computer_apps": {
        const r = await ax.request("apps", {}, 3_000);
        const apps = (r.apps as { name: string; bundleId?: string; frontmost: boolean }[]) ?? [];
        return axText(apps.map((x) => `${x.name}${x.frontmost ? " [frontmost]" : ""}${x.bundleId ? ` (${x.bundleId})` : ""}`).join("\n") || "(no apps)", true);
      }
      case "computer_menu": {
        if (typeof a.item === "string" && a.item.trim()) {
          axLog(`menu ${appName} run "${a.item}"`);
          const r = await ax.request("menu", { app: appName, item: a.item.trim(), ...axActionOpts(appName) });
          const diff = String(r.diff ?? "");
          remember(diff);
          recordFact(threadId, `${appName} ran menu command ${String(r.ran ?? a.item)}`);
          const shortcut = typeof r.shortcut === "string" ? ` (its shortcut is ${r.shortcut})` : "";
          const ranText = `Ran ${String(r.ran ?? a.item)} in ${appName}${shortcut}.\n${diff || "(nothing in the tree changed)"}`;
          const note = remeasureNote(root);
          return axText(note ? `${ranText}\n${note}` : ranText, true);
        }
        const query = typeof a.query === "string" && a.query.trim() ? a.query.trim() : undefined;
        axLog(`menus ${appName}${query ? ` "${query}"` : ""}`);
        const r = await ax.request("menus", { app: appName, ...(query ? { query } : {}) });
        if (Array.isArray(r.items)) {
          const items = r.items as string[];
          return axText(items.length
            ? [`${String(r.count)} menu command(s) matching "${query}" in ${appName}:`, ...items, ...(typeof r.hint === "string" ? [r.hint] : []), 'Run one with computer_menu {item: "<title or Menu > Title>"}.'].join("\n")
            : `No menu command in ${appName} matches "${query}". Call computer_menu without query to see the menus, or try another word.`, true);
        }
        const menus = Array.isArray(r.menus) ? (r.menus as string[]).join(", ") : "";
        return axText(`${appName} menus: ${menus}. ${String(r.hint ?? "")}`, true);
      }
      case "computer_raise": {
        axLog(`raise ${appName} (the model asked)`);
        axRaised.set(root, appName);
        recordFact(threadId, `${appName} raised (the model asked)`);
        const r = await ax.request("raise", { app: appName, ...axActionOpts(appName) });
        const diff = String(r.diff ?? "");
        remember(diff);
        return axText(`${appName} is in front and its windows are now readable.\n${diff}`, true);
      }
      case "computer_app_state": {
        // Record BEFORE anything snapshots. The auto-recovery raise below ends
        // in the bridge's afterAction, which writes the baseline the read a few
        // lines later is diffed against — in the PREVIOUS read's view, unless
        // this runs first.
        const want = axReadOptsFrom(a);
        axReadOpts.set(appName, want);
        let w = await ax.request("windows", { app: appName }, 3_000);
        // An app this conversation already raised can drift back off-Space
        // between two actions. That is the raise being undone, not a new
        // decision, so put it back rather than making the model ask again.
        if (shouldRecoverRaise({
          windowsHere: ((w.windows as unknown[]) ?? []).length,
          offscreen: Number(w.offscreen ?? 0),
          raisedBefore: axRaised.get(root) === appName,
          crossSpace: ax.crossSpace,
        })) {
          axLog(`raise ${appName} (auto: read found 0 windows here, ${String(w.offscreen)} offscreen)`);
          await ax.request("raise", { app: appName, ...axActionOpts(appName) }, 5_000);
          w = await ax.request("windows", { app: appName }, 3_000);
        }
        const offscreen = Number(w.offscreen ?? 0);
        const windowsText = String(w.text ?? "");
        const head = [
          windowsText ? `windows:\n${windowsText}` : (ax.crossSpace ? "windows: none" : "windows: none on this Space"),
          typeof w.hint === "string" ? w.hint : "",
          parkedReadNote(w.windows),
          otherSpaceNote(ax.crossSpace, windowsText),
        ].filter(Boolean).join("\n");
        if (!windowsText && offscreen > 0) return axText(head, true);
        const opts: Record<string, unknown> = {
          app: appName,
          // Spread rather than rebuilt, so the view this read asks for and the
          // view every action after it uses are one object, not two that can
          // drift.
          ...want,
          // The bridge holds one baseline per filter, so a changed filter is a
          // diff against that filter's own last read — full is only ever the
          // model's explicit ask. (Before that, 28 flips in one Figma run each
          // forced a whole tree and drove two compactions.)
          full: a.full === true,
        };
        if (typeof a.query === "string" && a.query.trim()) {
          const r = await ax.request("find", { ...opts, title: a.query.trim(), ...(typeof a.role === "string" ? { role: a.role } : {}) });
          const matches = (r.matches as string[]) ?? [];
          remember(matches.join("\n"));
          return axText(`${head}\n\n${matches.length} match(es) for "${a.query}":\n${matches.join("\n") || "(none — try without role, or with web=true for page content)"}`, true);
        }
        const r = await ax.request("tree", opts);
        const body = String(r.tree ?? r.diff ?? "");
        remember(body);
        const label = r.tree !== undefined ? "tree" : "changes since last read";
        return axText(`${head}\n\n${label} (${String(r.count)} elements${r.truncated ? ", truncated — use query or depth" : ""}):\n${body}`, true);
      }
      case "computer_launch": {
        axLog(`launch ${appName}`);
        // Without cross-Space the launch is foreground and the app is now where
        // the work is, so treat it as this conversation's raised app for the
        // read-side recovery. With it, the launch is background and there is
        // nothing to put back.
        if (!ax.crossSpace) axRaised.set(root, appName);
        const r = await ax.request("launch", { app: appName, ...axActionOpts(appName) }, 25_000);
        const tree = String(r.tree ?? "");
        remember(tree);
        const already = r.alreadyRunning === true;
        const hint = typeof r.hint === "string" ? `\n${r.hint}` : "";
        // The bridge answers ok at its deadline as long as the app is RUNNING;
        // only a window line proves the tree is readable. With cross-Space on
        // there is never a hint to say otherwise, so the sentence has to.
        recordFact(threadId, `${appName} launched: ${launchOutcome(tree)}`);
        if (launchOutcome(tree) === "running") {
          return axText(`${appName} is running but no window is readable yet — read it again in a moment.${hint}\n${tree}`, true);
        }
        return axText(
          `${appName} is ${already ? "already running" : "open"} and readable.${hint}\n${tree}`,
          true,
        );
      }
      case "computer_do": {
        if (a.candidates !== undefined) {
          if (a.steps !== undefined) return axText("Pass steps for a sequence or candidates for alternatives, not both.", false);
          const routes = parseCandidates(a.candidates);
          if ("error" in routes) return axText(routes.error, false);
          return await runCandidates(appName, routes.candidates, remember);
        }
        const parsed = parseBatchSteps(a.steps);
        if ("error" in parsed) return axText(parsed.error, false);
        const steps = parsed.steps;
        // A batch that edited one thing is one edit, whatever it took to land it;
        // only a batch that edited several things is the behaviour the nudge asks for.
        const batchNudgeText = isSingleEdit(steps)
          ? recordEditAndNudge(root, appName, { tool: "computer_do", app: appName, steps: stepsForNudge(steps) })
          : (axRecentEdits = [], null);
        axLog(`do ${appName} ${steps.length} step(s): ${steps.map((x) => x.do).join(",")}`);
        const ran: string[] = [];
        const pictures: AxResult[] = [];
        const watched: { step: string; diff: string }[] = [];
        let failed: { step: string; message: string } | null = null;
        // One bridge call per step. That is the cheap round trip — 3-70ms over
        // a local pipe — and collapsing them into ONE model round trip is the
        // entire point of this tool.
        const quietSteps: string[] = [];
        /** The ids behind those steps, so the verdict below can say what the
         *  writes were aimed at rather than only how many there were. */
        const quietCandidates: (number | null)[] = [];
        for (const [i, st] of steps.entries()) {
          const label = `step ${i + 1} (${traceStep(st)})`;
          try {
            const stepResult = await runBatchStep(appName, st, i === steps.length - 1);
            if (st.do === "screenshot") pictures.push(stepResult);
            // The bridge watches a delete outside a text field even mid-sequence
            // and hands back that step's own diff: show it, or a frame removed
            // at step 4 is one id range in the closing diff.
            if (typeof stepResult.watched === "string" && typeof stepResult.diff === "string") watched.push({ step: label, diff: stepResult.diff });
            // A write whose target held the same value afterwards. On its own
            // that is not a verdict — some controls take a write and report
            // the old value — so it is collected here and judged against the
            // batch's closing diff, which is the second signal.
            if (stepResult.valueUnchanged === true) {
              quietSteps.push(label);
              quietCandidates.push("id" in st && typeof st.id === "number" ? st.id : null);
            }
            ran.push(label);
            if (st.waitMs > 0) await new Promise((r) => setTimeout(r, st.waitMs));
          } catch (err) {
            failed = { step: label, message: err instanceof AxError ? err.message : String(err) };
            break;
          }
        }
        // The diff is taken once, at the end, against whatever the model last
        // read — so it shows the NET effect of the sequence rather than a
        // step-by-step replay nobody asked for.
        let diff = "";
        try {
          const r = await ax.request("tree", { app: appName, ...axActionOpts(appName) });
          diff = String(r.diff ?? r.tree ?? "");
          remember(diff);
        } catch {
          // A batch that closed the window it was working in has no tree left
          // to show. The step log above still says what ran.
        }
        // Read back every field the batch touched, so nobody has to read the
        // app to check a value it just wrote. One bridge call, one attribute
        // read per id; an older bridge without `values` costs nothing but the
        // caveat.
        let fields: string | undefined;
        const touched = touchedFieldIds(steps);
        if (touched.length) {
          try {
            const r = await ax.request("values", { app: appName, ids: touched }, 3_000);
            const values = Array.isArray(r.values) ? (r.values as FieldValue[]) : [];
            if (values.length) fields = renderFieldValues(values);
            for (const v of values) recordFact(threadId, `${appName} #${v.id}${v.title ? ` ${JSON.stringify(v.title)}` : ""} = ${v.value ?? "(no value)"}`);
          } catch {
            // the diff still stands
          }
        }
        // The verdict, reached here because here is where both signals are: the
        // steps that reported their value unmoved, and the closing diff that
        // says whether anything in the tree moved. Either alone is not it —
        // counting the step's half-signal on its own read ten landed writes as
        // ten failures on a run that succeeded.
        if (diff.trim() === "(no changes)" && quietCandidates.length) {
          const store = inToolCall.getStore();
          for (const qid of quietCandidates) {
            store?.quiet.push({ id: qid, role: qid !== null ? roleOfLine(axLines.get(appName)?.get(qid)) : null });
          }
        }
        const inspector = await inspectorBlock(appName);
        const captions = pictures.map((r, i) => {
          const where = r.onSpace === false ? ", on another Space" : "";
          const note = typeof r.note === "string" ? ` ${r.note}` : "";
          return `Picture ${i + 1}: window ${String(r.window)} of ${appName}, ${String(r.width)}x${String(r.height)}${where}.${note}`;
        });
        const text = [
          summarizeBatch({
            ran, failed, remaining: steps.length - ran.length - (failed ? 1 : 0), diff,
            unwatched: steps.length > 1, fields, watched, quiet: quietSteps,
          }),
          inspector,
          ...captions,
          batchNudgeText,
          remeasureNote(root),
          outlineNote(root),
        ].filter(Boolean).join("\n");
        return {
          contentItems: [
            { type: "inputText", text },
            ...pictures.flatMap((r) => {
              const image = String(r.image ?? "");
              if (!image) return [];
              const mime = typeof r.mime === "string" ? r.mime : "image/png";
              return [{ type: "inputImage" as const, imageUrl: `data:${mime};base64,${image}` }];
            }),
          ],
          success: failed === null,
        };
      }
      case "computer_scroll_view": {
        const amount = typeof a.amount === "number" && a.amount > 0 ? Math.min(a.amount, 40) : 5;
        // Negative wheel1 reveals content further DOWN, which is what a reader
        // means by "scroll down". Naming the direction rather than a signed
        // number keeps that convention out of the model's head.
        const dir = String(a.direction ?? "down");
        const unit = SCROLL_DELTAS[dir];
        const d = unit ? { dx: unit.dx * amount, dy: unit.dy * amount } : undefined;
        if (!d) return axText(`Unknown direction "${dir}". Use down, up, left, or right.`, false);
        axLog(`scroll ${appName} id=${String(a.id)} ${dir} ${amount}`);
        const r = await ax.request("scroll", { app: appName, id: a.id, dx: d.dx, dy: d.dy, ...axActionOpts(appName) });
        const diff = String(r.diff ?? "");
        remember(diff);
        return axText(`Scrolled ${dir}.\n${diff || "(nothing changed — the container may not scroll, or is already at the end)"}`, true);
      }
      case "computer_pointer": {
        // An omitted path is the element's centre: clicking a field to put a
        // caret in it is the commonest use, and it should not need x and y.
        const path = Array.isArray(a.path) && a.path.length > 0 ? a.path : null;
        if (typeof a.id !== "number") return axText("id is required: the element whose box the fractions are measured in.", false);
        const hold = a.hold === true;
        const clicks = typeof a.clicks === "number" ? Math.round(a.clicks) : 1;
        if (clicks < 1 || clicks > MAX_CLICKS) return axText(`clicks must be 1 to ${MAX_CLICKS}; 2 is a double click.`, false);
        const mods = Array.isArray(a.modifiers) ? a.modifiers.filter((m) => typeof m === "string") : [];
        // The first drawing in a conversation is held once so the surface is
        // cleared BEFORE the first point lands, not after a toolbar eats the
        // last dozen. See drawGate for the five runs that made this a gate.
        if (drawGate({ points: path?.length ?? 0, hold, used: drawGateUsed.has(root) })) {
          drawGateUsed.add(root);
          // Hand over the commands with the hold, so it costs two calls and not
          // a lookup, a read and a screenshot. Listing the menu bar is a read.
          let commands: string[] = [];
          try {
            const found: string[] = [];
            for (const query of ["hide", "full screen", "zoom"]) {
              const r = await ax.request("menus", { app: appName, query });
              if (Array.isArray(r.items)) found.push(...(r.items as string[]));
            }
            commands = surfaceCommands(found);
          } catch {
            // The hold stands either way; the text then says how to look them up.
          }
          const gate = drawGate({ points: path?.length ?? 0, hold, used: false, commands });
          axLog(`draw gate: held the first ${path?.length ?? 0}-point path in ${appName} until the surface is cleared${commands.length ? `, naming ${commands.length} command(s)` : ""}`);
          return axText(gate ?? "", false);
        }
        if ((path?.length ?? 0) >= DRAW_GATE_POINTS) agePendingOutline(root, true);
        axLog(`pointer ${appName} #${String(a.id)} ${path ? `${path.length} point(s)` : "centre"}${clicks > 1 ? ` x${clicks}` : ""}${hold ? " held" : ""}${mods.length ? ` +${mods.join("+")}` : ""}`);
        const r = await ax.request("pointer", {
          app: appName,
          id: a.id,
          ...(path ? { path } : {}),
          ...(clicks > 1 ? { clicks } : {}),
          ...(hold ? { hold: true } : {}),
          ...(mods.length ? { modifiers: mods } : {}),
          ...axActionOpts(appName),
        }, 60_000);
        const diff = String(r.diff ?? "");
        remember(diff);
        // Where the fractions landed, so a caller can see its own geometry and
        // correct it without guessing at a display scale.
        const at = Array.isArray(r.at) ? (r.at as { x: number; y: number }[]) : [];
        if (at.length) recordFact(threadId, `${appName} pointer #${String(a.id)} ${hold ? "drag" : "click"} landed ${at.map((q) => `(${q.x},${q.y})`).join(" ")}`);
        const where = at.length ? `\nLanded at ${at.map((q) => `(${q.x},${q.y})`).join(" ")}.` : "";
        const inspector = await inspectorBlock(appName); // a click changes the selection; the inspector follows
        // A plain click is one edit; a drawn stroke has no batch step and only
        // interrupts a run (asStep says so by returning null for a path).
        const pointerNudge = recordEditAndNudge(root, appName, {
          tool: "computer_pointer", app: appName, id: a.id as number, ...(typeof a.clicks === "number" ? { clicks: a.clicks } : {}), ...(path ? { path: true } : {}),
        });
        const headline = pointerHeadline({
          app: appName, hold, asked: path ? path.length : null, landed: at.length || 1,
          note: typeof r.note === "string" ? r.note : null,
        });
        return axText([`${headline}${where}\n${diff || "(nothing in the tree changed — a canvas often shows its result only as a new object, so read the app)"}`, inspector, pointerNudge, remeasureNote(root), outlineNote(root)].filter(Boolean).join("\n"), true);
      }
      case "computer_app_screenshot": {
        const r = await ax.request("screenshot", { app: appName, ...(typeof a.window === "number" ? { window: a.window } : {}) }, 15_000);
        const image = String(r.image ?? r.png ?? "");
        if (!image) return axText("The bridge returned no image.", false);
        const mime = typeof r.mime === "string" ? r.mime : "image/png";
        const where = r.onSpace === false ? " (on another Space)" : "";
        const note = typeof r.note === "string" ? ` ${r.note}` : "";
        return {
          contentItems: [
            { type: "inputText", text: `Window ${String(r.window)} of ${appName}${where}, ${String(r.width)}x${String(r.height)}.${note}` },
            { type: "inputImage", imageUrl: `data:${mime};base64,${image}` },
          ],
          success: true,
        };
      }
      case "computer_find": {
        const sel: Record<string, unknown> = { app: appName, ...axActionOpts(appName) };
        for (const k of ["role", "label", "value", "action"]) if (typeof a[k] === "string") sel[k] = a[k];
        for (const k of ["enabled", "selected", "contains", "caseInsensitive"]) if (typeof a[k] === "boolean") sel[k] = a[k];
        if (typeof a.within === "number") sel.within = a.within;
        axLog(`find ${appName} ${JSON.stringify(Object.fromEntries(Object.entries(sel).filter(([k]) => k !== "app")))}`);
        const r = await ax.request("findUnique", sel);
        if (r.ok === true) {
          const frame = r.frame as { x: number; y: number; w: number; h: number } | undefined;
          return axText(
            `#${String(r.id)} ${String(r.role)}${r.label ? ` ${JSON.stringify(r.label)}` : ""}` +
              `${r.value ? ` = ${String(r.value)}` : ""}` +
              `${Array.isArray(r.actions) && r.actions.length ? ` {${(r.actions as string[]).join(",")}}` : ""}` +
              `${frame ? ` @${frame.x},${frame.y} ${frame.w}x${frame.h}` : ""}`,
            true,
          );
        }
        // Fails closed, and hands back what it saw so the next call is aimed
        // rather than guessed. Reading again does not repair an ambiguity.
        const rows = (r.matches ?? r.near ?? []) as Record<string, unknown>[];
        const listed = rows
          .map((m) => {
            const f = m.frame as { x: number; y: number } | undefined;
            return `  #${String(m.id)} ${String(m.role)}${m.label ? ` ${JSON.stringify(m.label)}` : ""}${f ? ` @${f.x},${f.y}` : ""}`;
          })
          .join("\n");
        return axText([String(r.note ?? r.error ?? "no match"), listed].filter(Boolean).join("\n"), false);
      }
      case "computer_verify": {
        const sel: Record<string, unknown> = { app: appName, ...axActionOpts(appName) };
        for (const k of ["role", "label", "value", "action"]) if (typeof a[k] === "string") sel[k] = a[k];
        for (const k of ["contains", "caseInsensitive"]) if (typeof a[k] === "boolean") sel[k] = a[k];
        if (typeof a.within === "number") sel.within = a.within;
        if (a.expect && typeof a.expect === "object") sel.expect = a.expect;
        if (typeof a.timeoutMs === "number") sel.timeoutMs = a.timeoutMs;
        axLog(`verify ${appName} ${JSON.stringify(a.expect ?? {})}`);
        // The bridge polls until its own deadline, so give the request room.
        const r = await ax.request("verify", sel, 20_000);
        const verdict = String(r.verdict ?? "unknown");
        // ok is about whether the CHECK RAN, never about which way it came out.
        // "unsatisfied" is a successful answer; reporting it as a failed call
        // is how a caller learns to retry the thing it just proved did not
        // happen — which on a toggle undoes the press that did.
        return axText(
          `${verdict.toUpperCase()}${r.id !== undefined ? ` — element #${String(r.id)}` : ""}\n${String(r.note ?? "")}`,
          true,
        );
      }
      case "computer_press":
      case "computer_set_value":
      case "computer_press_key":
      case "computer_act": {
        let r;
        // computer_act used to carry value and key. A model that still sends
        // them must not get a silent press instead of what it asked for, so
        // route on the argument when the old shape shows up.
        const legacyKey = tool === "computer_act" && typeof a.key === "string";
        const legacyValue = tool === "computer_act" && typeof a.value === "string";
        if (tool === "computer_press_key" || legacyKey) {
          if (typeof a.key !== "string") return axText("key is required.", false);
          const mods = Array.isArray(a.modifiers) ? a.modifiers.filter((m) => typeof m === "string") : [];
          axLog(`key ${appName} ${mods.length ? `${mods.join("+")}+` : ""}${a.key}${typeof a.id === "number" ? ` -> #${a.id}` : ""}`);
          // Nothing raises: a key posted to the pid reaches a background app.
          r = await ax.request("key", {
            app: appName,
            key: a.key,
            ...(mods.length ? { modifiers: mods } : {}),
            ...(typeof a.id === "number" ? { id: a.id } : {}),
            ...axActionOpts(appName),
          });
        } else if (tool === "computer_set_value" || legacyValue) {
          const text = typeof a.text === "string" ? a.text : typeof a.value === "string" ? a.value : null;
          if (text === null) return axText("text is required.", false);
          axLog(`type ${appName} #${String(a.id)} <set>`);
          r = await ax.request("setValue", { app: appName, id: a.id, value: text, ...axActionOpts(appName) });
          recordFact(threadId, `${appName} set #${String(a.id)} = ${JSON.stringify(text)}`);
        } else {
          const action = tool === "computer_press" ? "press" : String(a.action ?? "");
          if (!action) return axText("action is required. Use one of the actions the element listed in braces.", false);
          axLog(`act ${appName} #${String(a.id)} ${action}`);
          r = await ax.request("act", { app: appName, id: a.id, action, ...axActionOpts(appName) });
        }
        const diff = String(r.diff ?? "");
        remember(diff);
        const nudge = recordEditAndNudge(root, appName, {
          tool,
          app: appName,
          ...(typeof a.id === "number" ? { id: a.id } : {}),
          ...(typeof a.text === "string" ? { text: a.text } : {}),
          ...(typeof a.key === "string" ? { key: a.key } : {}),
          ...(typeof a.action === "string" ? { action: a.action } : {}),
        });
        const hint = typeof r.hint === "string" ? r.hint : null;
        // Only for the verbs that go through hit-testing. Telling a caller that
        // just sent a key to send a key is noise, and it is the click that
        // dies on a parked window.
        const clicked = tool === "computer_press" || tool === "computer_act" || tool === "computer_set_value";
        // A press or a named action can change the selection, which is when the
        // inspector's ids change; a key or a value write does not.
        const inspector = tool === "computer_press" || tool === "computer_act" ? await inspectorBlock(appName) : null;
        return axText(
          [renderActionResult(diff, hint, hint && clicked ? parkedNextCall(appName) : null), inspector, nudge, remeasureNote(root), outlineNote(root)].filter(Boolean).join("\n"),
          true,
        );
      }
      default:
        return axText(`Unknown tool ${tool}`, false);
    }
  } catch (err) {
    // The bridge's errors already say what to do: no_such_element says to read
    // again, no_such_app says to list apps. not_trusted is the one the user
    // cannot act on from the transcript, so open the pane for them instead of
    // printing directions to it.
    const code = err instanceof AxError ? err.code : null;
    if (shouldOpenAccessibilitySettings({ code, openedBefore: axSettingsOpened })) {
      axSettingsOpened = true;
      // The native prompt registers the app in the pane's list; without it a
      // never-granted app may not have a row to switch on at all.
      systemPreferences.isTrustedAccessibilityClient(true);
      await openComputerPermissionSettings("accessibility", (uri) => shell.openExternal(uri));
      axLog("opened the Accessibility pane: the bridge is running but not trusted");
    }
    if (code === "not_trusted") return axText(axNotTrustedText(computerPermissionAppName(), axSettingsOpened), false);
    return axText(err instanceof AxError ? err.message : String(err), false);
  }
}

async function handleComputerUseCall(
  tool: string,
  rawArgs: unknown,
  threadId: string | null,
): Promise<DynamicToolResponse> {
  // Leaving a tool off the menu does not disable it. Every computer_* name
  // that is not an AX tool arrives here, and in Full access the consent gate
  // below says "allow" — so a model that remembers computer_type from an
  // earlier turn, or invents it, would type at the desktop with no card. The
  // refusal names what to use instead, because the model is usually reaching
  // for this after a read it could have acted on directly.
  if (!coordinateToolAllowed(tool, screenshotToolsOffered({ axAlive: ax?.alive === true }))) {
    return {
      contentItems: [{
        type: "inputText",
        text:
          "Coordinate and typing actions are off while the accessibility bridge is running. " +
          "Read with computer_app_state and act on element ids with computer_press, computer_act, computer_set_value or computer_press_key.",
      }],
      success: false,
    };
  }
  let action: ComputerAction;
  try {
    action = parseComputerAction(tool, rawArgs, computerUse.getPrimaryDisplay());
  } catch (err) {
    return { contentItems: [{ type: "inputText", text: err instanceof Error ? err.message : String(err) }], success: false };
  }
  // The same gate the AX tools use: full access means no card, and a session
  // grant covers the conversation. Without this, five screenshot-tool calls in
  // a Full-access conversation each raised a card — and every card stole the
  // Space back, undoing the raise before it.
  const root = rootThreadOf(threadId);
  if (axConsent({ tool, mode: liveAccessMode(root), granted: axGrants.has(root) }) === "allow") {
    return runComputerAction(action, threadId);
  }
  const decision = await requestLocalApproval(
    threadId,
    computerApprovalCommand(action),
    [
      "This gives Pareto one-time access to the primary display or desktop input.",
      "Visible desktop content and the action result may be added to this conversation and sent to the model.",
      "Review the action carefully, especially before typing or clicking in another app.",
      "Allowing for the session covers further desktop reads and actions in this conversation.",
    ].join("\n"),
    { kind: "computer" },
  );
  if (decision === "decline") {
    return {
      contentItems: [{ type: "inputText", text: "The user declined this computer action. Do not retry it unless they ask." }],
      success: false,
    };
  }
  if (decision === "acceptForSession") axGrants.add(root);
  // A card lives in this app's window, which is usually on the user's own
  // Space — approving it switches back and undoes any raise that preceded it.
  // Measured: 16 raises in one task, each one re-doing what a card had undone.
  await reassertRaise(root);
  return runComputerAction(action, threadId);
}

async function runComputerAction(action: ComputerAction, threadId: string | null): Promise<DynamicToolResponse> {
  const result = await computerUse.run(action);
  const recovery = !result.ok && result.permission
    ? await offerComputerPermissionSettings(threadId, result.permission)
    : "";
  return {
    contentItems: [
      { type: "inputText", text: result.message + recovery },
      ...(result.ok && result.screenshot ? [{ type: "inputImage" as const, imageUrl: result.screenshot.dataUrl }] : []),
    ],
    success: result.ok,
  };
}

async function handleAgentBrowserCall(tool: string, rawArgs: unknown, threadId: string | null): Promise<DynamicToolResponse> {
  const a = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const detail = typeof a.url === "string" ? a.url : typeof a.query === "string" ? `search: ${a.query}` : typeof a.port === "string" ? a.port : tool;
  const refusal = await ensureBrowserAllowed(tool, threadId, detail);
  if (refusal || browserShuttingDown) return { success:false, contentItems:[{type:"inputText",text:refusal ?? "Unbiased is shutting down its browser."}] };
  try {
    return await browserRuntime.request("tool.execute", {tool,args:a,sessionId:rootThreadOf(threadId)}) as DynamicToolResponse;
  } catch(error) {
    return {success:false,contentItems:[{type:"inputText",text:`Browser runtime error: ${String(error)}. If an action was interrupted, inspect the current page before repeating it.`}]};
  }
}

function paneForThread(threadId: unknown): PaneId | null {
  for (const [id, p] of Object.entries(panes)) {
    if (p.threadId === threadId) return id;
  }
  return null;
}

// Turns outlive the pane that started them: switching conversations leaves
// the engine turn running, so live turns are tracked by THREAD. That lets a
// backgrounded conversation be reopened mid-turn with its busy state, the
// partial assistant text, and any approval request the agent is blocked on.
const runningTurns = new Map<string, string>(); // threadId → turnId
// Compaction outlives whichever normal/Mosaic pane requested it.
const compactingThreads = new Set<string>();
function updateThreadCompaction(threadId: string, phase: "started" | "completed" | "failed"): void {
  if (phase === "started") compactingThreads.add(threadId);
  else compactingThreads.delete(threadId);
  const paneId = paneForThread(threadId);
  if (paneId) send("chat:compaction", { paneId, phase });
}
/** threadId → the last token-usage numbers seen, so a retry that re-emits them
 *  unchanged can be told from a new request. */
const lastUsageSig = new Map<string, string>();
const pendingPromptComponents = new Map<string, {
  turnId: string;
  systemInstructionsTokens: number;
  toolDefinitionsTokens: number;
}>();
// The in-flight assistant message per thread. Deltas reach the renderer only
// while a pane owns the thread, so this is the sole record of text streamed
// while a conversation was backgrounded. Cleared when the message completes.
const bgStream = new Map<string, string>();
// Approval requests that arrived for an unwatched thread. Never auto-decline
// these — the engine waits, and they replay when the thread is reopened.
const heldApprovals = new Map<string, Record<string, unknown>[]>();
// Failure of a backgrounded turn — the "⚠ Turn failed" entry is renderer-only,
// so without this a failure while away would vanish entirely.
const heldErrors = new Map<string, string>();

// Sub-agents (multi-agent v2): the engine runs them as separate threads and
// the PARENT's transcript only carries subAgentActivity markers. This map —
// subThreadId → parent + path + live status — is what lets the app group a
// sub-agent's traffic under its parent conversation, route its approval
// requests somewhere visible, and open its transcript on demand. In-memory
// only, matching the engine's own lifetime: spawned agents do not survive an
// engine restart. Note thread/list defaults to interactive sources, so sub
// threads never reach the sidebar in the first place.
type SubAgentInfo = {
  parent: string;
  path: string; // engine agent path, e.g. /root/haiku_writer
  name: string; // last path segment — the model-chosen task name
  status: "running" | "idle" | "failed" | "interrupted";
  // "Closed an agent" has fired for the current task (reset when the parent
  // messages it again) — sub turns also end between queued mails, and those
  // are not closures.
  closedAnnounced?: boolean;
};
const subAgents = new Map<string, SubAgentInfo>();

// Per-turn message phases, cleared when a turn ends. A turn whose only
// assistant output was commentary produced no answer — the app used to treat
// every assistant message alike, so that was indistinguishable from a finished
// reply and the conversation simply appeared to stop.
const turnSawFinalAnswer = new Set<string>();
const turnSawCommentary = new Set<string>();

// Inter-agent mail TO a sub-agent, captured from rawResponseItem/completed
// notifications (the engine emits one for every recorded item — the only
// place the task text a sub-agent was given is visible to a client). Keyed
// by the sub-agent's thread id; merged into its transcript by time.
// preDelivered marks a copy captured from the SENDER's raw call while the
// engine still holds the mail queued; the drain-time copy consumes the flag
// instead of duplicating, and a genuinely repeated identical message keeps
// both entries.
type MailEntry = { at: number; author: string; text: string; preDelivered?: boolean };
const subAgentMail = new Map<string, MailEntry[]>();
const MAIL_CAP = 200;

// Spawn instructions captured from the parent's raw collaboration
// function_call, keyed by "parentThreadId:taskName" until the matching
// subAgentActivity names the sub thread.
const pendingSpawnPrompts = new Map<string, string>();

// Spawn call_id → parent thread, so the raw function_call_output (which
// carries the engine-assigned nickname) can be matched back. Raw items and
// subAgentActivity arrive in either order, so the nickname is stashed by
// "parentThreadId:taskName" when the sub isn't registered yet, and applied
// as a rename when it is.
const pendingSpawnCalls = new Map<string, string>();
const pendingNicknames = new Map<string, string>();

// send_message/followup_task text, keyed like the spawn prompts — feeds the
// "Messaged an agent" row's instructions AND the immediate mailbox delivery
// (the engine queues the mail until the sub's loop drains it, so nothing is
// recorded on the sub thread until then; the pane shouldn't wait).
const pendingMessagePrompts = new Map<string, string>();

/** Every in-memory sub-agent structure is scoped to one engine process:
 *  thread ids, queued approvals, and RPC ids all die with it. Called on
 *  every engine (re)start so a stale roster can't outlive its engine. */
function resetSubAgentState(): void {
  for (const [requestId, pending] of pendingUserInputs) {
    const owner = pending.threadId ? subAgents.get(pending.threadId)?.parent ?? pending.threadId : null;
    const paneId = owner ? paneForThread(owner) : "main";
    if (paneId) send("chat:user-input-canceled", { paneId, requestId });
  }
  subAgents.clear();
  subAgentMail.clear();
  pendingSpawnPrompts.clear();
  pendingSpawnCalls.clear();
  pendingNicknames.clear();
  pendingMessagePrompts.clear();
  heldApprovals.clear();
  for (const pending of pendingApprovals.values()) {
    if (pending.kind === "local") pending.settle("decline");
  }
  pendingApprovals.clear();
  for (const pending of pendingUserInputs.values()) {
    if (pending.kind === "local") pending.settle(null);
  }
  pendingUserInputs.clear();
  browserNetGrants.clear();
  axGrants.clear();
  browserConnectGrants.clear();
  threadAccessModes.clear();
  void browserRuntime.request("session.reset", {}).catch(() => undefined);
}

/** Strip the engine's inter-agent envelope ("Message Type: …\nTask name: …\n
 *  Sender: …\nPayload:\n<text>") down to the payload. */
function interAgentPayload(text: string): { author: string | null; payload: string } {
  const m = /^Message Type: [^\n]*\nTask name: [^\n]*\nSender: ([^\n]*)\nPayload:\n([\s\S]*)$/.exec(text);
  return m ? { author: m[1], payload: m[2] } : { author: null, payload: text };
}

/** Locate a thread's rollout file under the engine home's sessions dir.
 *  Cached per thread — the filename embeds the thread id and never moves. */
const rolloutPathCache = new Map<string, string>();
// Misses are cached briefly too: before the engine's first flush (exactly
// when activity is densest) every lookup would otherwise walk the entire
// sessions tree, up to 4×/second from the debounced viewer refetch.
const rolloutMissAt = new Map<string, number>();
function findRolloutFile(threadId: string): string | null {
  const cached = rolloutPathCache.get(threadId);
  if (cached && existsSync(cached)) return cached;
  const missAt = rolloutMissAt.get(threadId);
  if (missAt !== undefined && Date.now() - missAt < 2000) return null;
  const engineHome =
    lastStatus.state === "connected"
      ? lastStatus.codexHome
      : join(app.getPath("home"), ".unbiased", "app-engine", "home");
  const walk = (dir: string): string | null => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return null;
    }
    for (const n of names) {
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        const hit = walk(p);
        if (hit) return hit;
      } else if (n.startsWith("rollout-") && n.endsWith(`${threadId}.jsonl`)) {
        return p;
      }
    }
    return null;
  };
  const found = walk(join(engineHome, "sessions"));
  if (found) {
    rolloutPathCache.set(threadId, found);
    rolloutMissAt.delete(threadId);
  } else {
    rolloutMissAt.set(threadId, Date.now());
  }
  return found;
}

/** Inter-agent mail addressed to a sub-agent, read from its rollout on disk.
 *  This is the restart-proof source: live raw notifications only flow for
 *  threads STARTED with experimentalRawEvents (resume/fork hardcode it off
 *  at 0.147.0), but the engine persists every agent_message to the rollout
 *  before emitting anything. */
/** Sub-agent nicknames recovered from a thread's own rollout.
 *
 *  The engine assigns a nickname ("Singer", "Ramanujan") and reports it in the
 *  spawn tool's OUTPUT. Live, that arrives as a raw response item — but raws
 *  only flow for threads STARTED with experimentalRawEvents, and the engine
 *  ignores the flag on resume. Measured against 0.147.0 across three separate
 *  processes: start-with-flag emitted 6 raws for one turn, resume-with-flag 0,
 *  resume-without 0. So a reopened conversation never learns the nicknames and
 *  every sub-agent row keeps its raw task name ("app_bridge_routing").
 *
 *  The rollout has it, though: the same function_call_output is persisted as
 *  `{"task_name":"/root/some_task","nickname":"Singer"}`. Same trick
 *  rolloutMail already uses for inter-agent mail, for the same reason.
 *
 *  Returns task name (last path segment, matching the live path) → nickname. */
const rolloutNicknameCache = new Map<string, { mtimeMs: number; size: number; names: Map<string, string> }>();
function rolloutNicknames(threadId: string): Map<string, string> {
  const file = findRolloutFile(threadId);
  if (!file) return new Map();
  let st;
  try {
    st = statSync(file);
  } catch {
    return new Map();
  }
  if (st.size > 8_000_000) return new Map(); // a parent rollout this big is not worth a full parse
  const cached = rolloutNicknameCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return new Map(cached.names);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return new Map();
  }
  const names = new Map<string, string>();
  for (const line of raw.split("\n")) {
    // Cheap reject before JSON.parse: these files run to thousands of lines.
    // Matched WITHOUT quotes on purpose — `output` is a JSON string, so the key
    // is escaped in the raw line (\"nickname\") and a quoted probe matches
    // nothing. The first cut of this rejected every line and silently found no
    // nicknames at all; caught by running it against a real rollout.
    if (!line.includes("nickname")) continue;
    try {
      const parsed = JSON.parse(line) as { payload?: { type?: string; output?: unknown } };
      if (parsed.payload?.type !== "function_call_output") continue;
      if (typeof parsed.payload.output !== "string") continue;
      const out = JSON.parse(parsed.payload.output) as { task_name?: string; nickname?: string };
      const task = out.task_name?.split("/").filter(Boolean).pop();
      // Later spawns of the same task name win, matching the live path's
      // "prefer the newest registration" rule.
      if (task && out.nickname) names.set(task, out.nickname);
    } catch {
      // unparseable line — skip
    }
  }
  rolloutNicknameCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, names: new Map(names) });
  return names;
}

const rolloutMailCache = new Map<string, { mtimeMs: number; size: number; mail: MailEntry[] }>();
function rolloutMail(threadId: string, path: string | null): MailEntry[] {
  const file = findRolloutFile(threadId);
  if (!file) return [];
  let st;
  try {
    st = statSync(file);
  } catch {
    return [];
  }
  if (st.size > 4_000_000) return []; // sub-agent rollouts are small; huge = not worth parsing
  // The viewer refetches on every completed item; only re-parse when the
  // file actually changed.
  const cacheKey = `${file}::${path ?? ""}`;
  const cached = rolloutMailCache.get(cacheKey);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.mail.slice();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const all: { at: number; author: string; recipient: string; text: string; newTask: boolean }[] = [];
  for (const line of raw.split("\n")) {
    if (!line.includes('"agent_message"')) continue;
    try {
      const parsed = JSON.parse(line) as {
        timestamp?: string;
        type?: string;
        payload?: { type?: string; author?: string; recipient?: string; content?: { type?: string; text?: string }[] };
      };
      const pl = parsed.payload;
      if (parsed.type !== "response_item" || pl?.type !== "agent_message") continue;
      const text = (pl.content ?? [])
        .filter((c) => c?.type === "input_text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");
      if (!text) continue;
      const { author, payload } = interAgentPayload(text);
      all.push({
        at: parsed.timestamp ? Date.parse(parsed.timestamp) / 1000 : 0,
        author: author ?? pl.author ?? "",
        recipient: pl.recipient ?? "",
        text: payload,
        newTask: text.startsWith("Message Type: NEW_TASK"),
      });
    } catch {
      // unparseable line — skip
    }
  }
  // Only mail TO this agent. After an app restart the registry is empty and
  // no path is known — but the spawn's NEW_TASK is addressed to this agent,
  // so its recipient recovers the path (without it, the agent's own
  // outbound reports would render as inbound bubbles).
  const recipient = path ?? all.find((m) => m.newTask)?.recipient ?? null;
  const mail: MailEntry[] = all
    .filter((m) => !recipient || m.recipient === recipient)
    .map(({ at, author, text }) => ({ at, author, text }));
  // Keep the NEWEST entries, matching the live mailbox's retention.
  const out = mail.slice(-MAIL_CAP);
  rolloutMailCache.set(cacheKey, { mtimeMs: st.mtimeMs, size: st.size, mail: out });
  return out.slice();
}

/**
 * Recover sub-agent nicknames from a thread's rollout and publish them.
 *
 * Extracted because reopening a conversation was the only thing that ran it,
 * and that is not the only time it is needed. Nicknames normally arrive as raw
 * response items, and the engine emits raws only for threads STARTED with
 * experimentalRawEvents — a RESUMED conversation gets none. So an agent
 * spawned after a resume kept its raw task name ("security_reviewer") even
 * though the engine had already assigned it one ("Dalton"), because nothing
 * re-read the rollout between the spawn and the end of the turn.
 *
 * Idempotent: it renames only entries still carrying the task name, so an
 * agent already named by the live path is untouched. rolloutNicknames is
 * cached on mtime+size, so calling this per turn is close to free.
 */
function applyRolloutNicknames(id: string): void {
  const nicknames = rolloutNicknames(id);
  if (nicknames.size === 0) return;
  for (const [task, nickname] of nicknames) {
    let renamedOne = false;
    for (const [subId, info] of subAgents) {
      if (info.parent !== id || info.name !== task) continue;
      info.name = nickname;
      renamedOne = true;
      const pane = paneForThread(id);
      if (pane) {
        send("chat:subagent-event", {
          paneId: pane,
          event: "renamed",
          name: nickname,
          path: info.path,
          agentThreadId: subId,
        });
      }
    }
    // Nothing registered under that task yet — stash it for whenever the
    // registration arrives, exactly as the live raw path does.
    if (!renamedOne) pendingNicknames.set(`${id}:${task}`, nickname);
  }
  pushSubAgents(id);
  // The registry is empty after an app restart, so the loop above renames
  // nothing and the rows restored from the transcript keep their task names.
  // The renderer still holds those rows, so hand it the whole map and let it
  // retitle by name — that is the only path that works cold.
  const pane = paneForThread(id);
  if (pane) {
    send("chat:subagent-renames", { paneId: pane, names: Object.fromEntries(nicknames) });
  }
}

function subAgentsForParent(parent: string): { threadId: string; name: string; path: string; status: string }[] {
  return [...subAgents.entries()]
    .filter(([, a]) => a.parent === parent)
    .map(([threadId, a]) => ({ threadId, name: a.name, path: a.path, status: a.status }));
}

/** Push the parent's sub-agent roster to whichever pane owns it (if any). */
function pushSubAgents(parent: string): void {
  const paneId = paneForThread(parent);
  if (paneId) send("chat:subagents", { paneId, agents: subAgentsForParent(parent) });
}

// The active main conversation's working directory — file references in
// chat resolve against it. Kept in sync with thread starts/resumes.
let mainCwd: string | null = null;

// threadId → the cwd it was started with. mainCwd only tracks the active
// main pane, but memory writes arrive from scheduled runs and side threads
// too, and a note saved by a background run must land in ITS project's
// store, not whichever conversation happens to be frontmost.
const threadCwds = new Map<string, string>();

const memoryRoot = () => join(homedir(), ".unbiased", "memory");

/** Projects share their notes; ordinary chats have no shared memory until
 *  the engine assigns a thread ID. Unknown cwd fails closed to that thread. */
function memoryDirForCwd(cwd: string | null, threadId: string | null = null, projectId?: string | null): string | null {
  const project = projectId !== undefined
    ? loadProjects().find((p) => p.id === projectId) ?? null
    : threadProject(threadId, cwd);
  return selectedProjectMemoryDir(memoryRoot(), project, defaultChatDir(), threadId ? rootThreadOf(threadId) : null);
}

// ── The learning sidecar (observe-only) ─────────────────────────────────
// Absent unless its bundle is installed, and silent when it is not: this is
// an optional companion process, not a dependency. It observes; nothing it
// learns rides a prompt from here.
let learning: LearningClient | null = null;

/** Fire-and-forget: every call site should be one line that cannot fail. */
function observeLearning(
  kind: Parameters<typeof buildEvent>[0]["kind"],
  threadId: string | null | undefined,
  summary: string,
  data?: Record<string, unknown>,
): void {
  if (!learning?.isReady || !threadId) return;
  try {
    learning.observe(buildEvent({ kind, threadId, turnId: runningTurns.get(threadId) ?? null, summary, data }));
  } catch {
    /* learning must never be able to break a turn */
  }
}

async function startLearning(): Promise<void> {
  const dir = resolveSidecarDir({
    isPackaged: productionBuild(),
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
  if (!sidecarLooksInstalled(dir)) return; // not installed: nothing to say
  const manifest = readSidecarManifest(dir);
  if (!manifest) return;
  if ("error" in manifest) {
    console.warn(`[learning] not starting: ${manifest.error}`);
    return;
  }
  const client = new LearningClient(manifest, join(app.getPath("userData"), "learning.db"));
  try {
    await client.start();
    learning = client;
    console.log(`[learning] sidecar ${manifest.version} observing`);
  } catch (err) {
    console.warn(`[learning] handshake failed, learning is off: ${String(err)}`);
    void client.stop();
  }
}

function memoryDirForThread(threadId: string | null): string | null {
  if (!threadId) return null;
  const root = rootThreadOf(threadId);
  const cwd = threadCwds.get(root) ?? (panes.main.threadId === root ? mainCwd : null);
  return memoryDirForCwd(cwd, root);
}

const automaticMemoryRunning = new Set<string>();
const completedTurnsSinceMemory = new Map<string, number>();

function scheduleAutomaticMemory(threadId: string, reason: "compaction" | "25-turns"): void {
  if (planMode || subAgents.has(threadId) || automaticMemoryRunning.has(threadId)) return;
  automaticMemoryRunning.add(threadId);
  void (async () => {
    const key = readStoredKey()?.key;
    if (!key) return;
    const result = await engine.request("thread/read", { threadId, includeTurns: true }) as { thread: WireThread };
    const thread = result.thread;
    if (thread.threadSource) return; // Scheduled and other internal conversations do not create memories.
    if (thread.cwd) threadCwds.set(threadId, thread.cwd);
    const dir = memoryDirForThread(threadId);
    if (!dir) return;
    const saved = await writeAutomaticMemory({
      threadId, turns: thread.turns ?? [], dir, apiKey: key,
      redact: redactSecrets, canWrite: () => !planMode,
    });
    if (!saved) {
      console.info(`[memory] ${reason}: no durable note for ${threadId}`);
      return;
    }
    console.info(`[memory] ${reason}: saved ${saved.note.name} for ${threadId}`);
    const paneId = paneForThread(threadId);
    if (paneId) send("chat:memory-saved", {
      paneId, name: saved.note.name, description: saved.note.description, path: saved.path, automatic: true,
    });
  })().catch((error) => {
    console.warn(`[memory] ${reason}: automatic write skipped for ${threadId}: ${String(error)}`);
  }).finally(() => automaticMemoryRunning.delete(threadId));
}

// Where the NEXT fresh main chat's thread will live. null = home directory
// (a plain chat, listed under Recents). Set by the project picker or by
// clicking a project header; consumed when the lazy thread is created.
let pendingCwd: string | null = null;
let pendingProjectId: string | null = null;
const projectContextSeen = new Map<string, string>();

// User-selectable access mode (Codex-style). Applied to every new thread
// AND sent as turn-level overrides, which per the protocol change "this
// turn and subsequent turns" — so switching applies mid-conversation.
type AccessMode = "ask" | "auto" | "full";
let accessMode: AccessMode = "ask";

const MODE_THREAD_POLICY: Record<AccessMode, { approvalPolicy: string; sandbox: string }> = {
  // NOT "untrusted": that policy forbids escalation outright — the model
  // can't even ASK to write, so no approval card ever appears. on-request
  // + read-only means reads run free and every write/network action
  // surfaces an approval request.
  ask: { approvalPolicy: "on-request", sandbox: "read-only" },
  auto: { approvalPolicy: "on-request", sandbox: "workspace-write" },
  full: { approvalPolicy: "never", sandbox: "danger-full-access" },
};
const MODE_TURN_SANDBOX: Record<AccessMode, Record<string, unknown>> = {
  ask: { type: "readOnly" },
  // Network on + the Go caches writable: without these, every `go test`
  // (httptest's TCP listener, ~/Library/Caches/go-build) becomes an
  // escalation prompt, which defeats the point of an auto mode. The
  // trade-off is deliberate: networked commands run un-prompted here.
  auto: {
    type: "workspaceWrite",
    networkAccess: true,
    writableRoots: [
      join(homedir(), "Library/Caches/go-build"),
      join(homedir(), "go/pkg/mod"),
    ],
  },
  full: { type: "dangerFullAccess" },
};

function threadPolicy(): { approvalPolicy: string; sandbox: string } {
  return MODE_THREAD_POLICY[accessMode];
}

/** The turn's sandbox policy, worktree-aware: a git worktree's real repo
 *  data lives in the PARENT repo's .git, so without that as a writable
 *  root every `git commit`/`push` from a worktree conversation becomes
 *  an escalation prompt — defeating "Approve for me". */
function turnSandbox(cwd: string | null): Record<string, unknown> {
  const base = MODE_TURN_SANDBOX[accessMode];
  if (base.type !== "workspaceWrite" || !cwd) return base;
  const info = loadWorktrees()[cwd];
  if (!info) return base;
  return {
    ...base,
    writableRoots: [...((base.writableRoots as string[]) ?? []), join(info.project, ".git")],
  };
}

// Last known context usage per thread — lets the composer gauge appear
// immediately on resume instead of waiting for the next turn.
function ctxUsageFile(): string {
  return join(app.getPath("userData"), "context-usage.json");
}
let configuredContextWindowCache: { mtimeMs: number; window: number | null } | null = null;
type ContextUsageSnapshot = {
  used: number;
  window: number | null;
  percent: number | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  systemInstructionsTokens?: number;
  toolDefinitionsTokens?: number;
  promptComponentsTurnId?: string;
};
let ctxUsageCache: Record<string, ContextUsageSnapshot> | null = null;
function loadCtxUsage(): Record<string, ContextUsageSnapshot> {
  if (!ctxUsageCache) {
    try {
      ctxUsageCache = JSON.parse(readFileSync(ctxUsageFile(), "utf8"));
    } catch {
      ctxUsageCache = {};
    }
  }
  return ctxUsageCache!;
}
function configuredUsableContextWindow(): number | null {
  const file = join(homedir(), ".unbiased", "app-engine", "home", "config.toml");
  try {
    const stat = statSync(file);
    if (configuredContextWindowCache?.mtimeMs === stat.mtimeMs) return configuredContextWindowCache.window;
    const text = readFileSync(file, "utf8");
    const raw = Number(/^model_context_window\s*=\s*(\d+)\s*$/m.exec(text)?.[1]);
    if (!Number.isFinite(raw) || raw <= 0) {
      configuredContextWindowCache = { mtimeMs: stat.mtimeMs, window: null };
      return null;
    }
    const percent = Number(/^effective_context_window_percent\s*=\s*(\d+)\s*$/m.exec(text)?.[1] ?? 95);
    const safePercent = Number.isFinite(percent) && percent > 0 ? percent : 95;
    const window = Math.floor((raw * safePercent) / 100);
    configuredContextWindowCache = { mtimeMs: stat.mtimeMs, window };
    return window;
  } catch {
    configuredContextWindowCache = null;
    return null;
  }
}
function currentCtxUsage(threadId: string): ContextUsageSnapshot | null {
  const map = loadCtxUsage();
  const usage = map[threadId] ?? null;
  if (!usage) return null;
  const configured = configuredUsableContextWindow();
  if (!configured || !usage.window || usage.window >= configured) return usage;
  const rebased = { ...usage, window: configured, percent: Math.round((usage.used / configured) * 100) };
  map[threadId] = rebased;
  try {
    writeFileSync(ctxUsageFile(), JSON.stringify(map));
  } catch {
    // best-effort cache repair
  }
  return rebased;
}

// Plan mode: the agent researches read-only and proposes a plan instead
// of acting. Enforced two ways — a hard read-only sandbox override on
// every turn, plus a directive input item shaping the output.
let planMode = false;

const PLAN_DIRECTIVE =
  "PLAN MODE is active. Do not modify files, run mutating commands, or take " +
  "any action with side effects — research read-only. Produce a concrete " +
  "implementation plan: numbered steps, the files to change and how, risks, " +
  "and open questions. End by asking whether to proceed with the plan.";

const COMPUTER_DIRECTIVE =
  // Measured 2026-09-10: with the toggle on, "Hello" got the app list read
  // before the greeting, because this opened with "use them: start with
  // computer_apps". The toggle says where work in apps should be done, not
  // that every message is work in apps.
  "COMPUTER is selected for this turn: work in the user's apps is done through the computer_ tools, not the browser " +
  "or the shell. Use them for anything that involves their apps, starting with computer_apps or computer_app_state. " +
  "A message that needs no app — a greeting, a question you can answer from what you know or from this conversation — " +
  "gets a direct answer and no desktop call. If the app you need is not running, " +
  "call computer_launch — it waits until the app is readable and hands you its tree. " +
  "Do NOT call browser_connect or the other browser_* tools for this turn — those open a SEPARATE browser window and " +
  "cannot see the user's own windows or tabs, which is the opposite of what they asked for. This applies even when the " +
  "task involves a website behind a login: if it is open in a browser they are already running, computer_app_state reads " +
  "it and computer_press operates it. " +
  "When you already know the next few moves, send them together with computer_do rather than one call at a time — " +
  "filling a field and committing it, or pressing a tab and reading the result, is one call, not two. " +
  // Measured, on a task that should have taken four calls: the model shelled
  // out to `open -a Maps`, and never came back. Twenty shell calls, osascript,
  // JXA, and finally a hand-written Swift program that dumped the very tree
  // computer_app_state returns for free — then it reported route figures it
  // had never read, because it never actually operated the app.
  "Do NOT drive the desktop with the shell for this turn. No `open`, no `osascript`, no AppleScript or JXA, no URL " +
  "schemes, no `pbcopy` to smuggle in content the app was supposed to make, and never write a program to inspect the " +
  "UI: the computer_* tools ARE that capability, and a shell detour loses the element ids that make the next step " +
  "possible. Operate the app the way a person would — type into its search field, press its results, press its tabs — " +
  "rather than constructing a URL that guesses at what the user meant. " +
  // Measured 2026-09-09: three pen-tool passes fragmented (a bridge defect,
  // since fixed), and on the fourth attempt the model wrote an SVG from the
  // shell, put it on the clipboard, and pasted it — the one thing the user
  // had said not to do. Repeated failure is a reason to report, not a
  // licence to switch routes.
  "A route the task ruled out is not a fallback. If the app's own tools cannot do what was asked the way it was " +
  "asked, after a real attempt, stop and say exactly what failed — do not quietly switch to the route that was forbidden. " +
  // Scoped to what is PRESENTED as read from an app. Measured 2026-09-10:
  // "every number must appear in a tool result" sent "what is today?" to the
  // Calendar app for 27 seconds, on a turn where the toggle was not even on —
  // the sentence was still in context from earlier turns.
  "Report only what you actually read: a fact you present as coming from an app — a number, name, distance, time or " +
  "price — must appear in a tool result from this turn; if the app never showed it, say what you could not get instead " +
  "of filling the gap. What you know without an app, you may simply say. " +
  // The input-side twin of the sentence above, and measured the same way.
  // 2026-09-09: an attached WebP logo could not be decoded, so it reached the
  // model as nothing at all. The model inferred the subject from the target
  // frame's NAME, drew the mark from memory, and reported success — the one
  // failure in this whole series that produced a wrong result rather than a
  // slow one. Nothing in the tools could have caught it; only the model knows
  // its own context is missing the thing the task is about.
  "Work only from what is actually in front of you. If the task refers to an image, file or document that is not in " +
  "this conversation, say that it did not arrive and stop — never reconstruct it from memory of what it probably " +
  "looks like, and never infer it from a file or frame name. " +
  "Every desktop action still requires explicit user approval.";

// Work-in mode for NEW project chats: the live checkout, or an isolated
// git worktree created per conversation (agent works on its own branch,
// the user's checkout stays untouched).
let workMode: "local" | "worktree" | { existing: string } = "local";

// worktree dir → its parent project + branch. Used to group worktree
// conversations under their project in the sidebar.
function worktreesFile(): string {
  return join(app.getPath("userData"), "worktrees.json");
}

function loadWorktrees(): Record<string, { project: string; branch: string; checkoutId?: string; repositoryId?: string | null; sourceId?: string }> {
  try {
    const parsed = JSON.parse(readFileSync(worktreesFile(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * A readable worktree name, from the first thing asked of it.
 *
 * The old scheme was `<project>-<timestamp>`, which is unique and tells you
 * nothing: a folder full of `unbiased-app-2026-08-19-0226` is unreadable at a
 * glance. Four words of the opening message plus a short hash reads like
 * `repository-exploration-11baed` — recognisable, and still collision-proof
 * when two conversations open the same way.
 */
function worktreeName(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-")
    .slice(0, 40)
    .replace(/-+$/, "");
  const hash = createHash("sha256").update(`${seed}${Date.now()}`).digest("hex").slice(0, 6);
  return slug ? `${slug}-${hash}` : `session-${hash}`;
}

/**
 * Keep a nested worktree out of `git status`, without touching a tracked file.
 *
 * `.gitignore` belongs to the repository and to everyone who clones it; adding
 * an entry there would show up as a change the user did not make and would
 * travel to their colleagues. `.git/info/exclude` is local to this checkout,
 * which is exactly the scope of a directory this app created on this machine.
 * `--git-common-dir` rather than `--git-dir` because the project may itself be
 * a worktree, where the latter points at a per-worktree stub.
 */
function excludeFromGit(project: string, entry: string): void {
  try {
    const common = execFileSync("git", ["-C", project, "rev-parse", "--git-common-dir"], {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
    const gitDir = isAbsolute(common) ? common : join(project, common);
    const file = join(gitDir, "info", "exclude");
    const current = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (current.split("\n").some((line) => line.trim() === entry)) return;
    mkdirSync(join(gitDir, "info"), { recursive: true });
    const sep = current === "" || current.endsWith("\n") ? "" : "\n";
    writeFileSync(file, `${current}${sep}${entry}\n`);
  } catch {
    // Best effort. An un-excluded worktree is untidy, not broken.
  }
}

/** Create a fresh worktree for a conversation; null = fall back to local. */
async function createWorktree(project: string, seed?: string): Promise<string | null> {
  const name = worktreeName(seed ?? "");
  // Inside the project, alongside how codex and Claude Code do it
  // (.codex/worktrees, .claude/worktrees). Keeping them in the app's data
  // folder meant a checkout of your repo living somewhere you would never
  // look, with nothing but a JSON map tying it back.
  const dir = join(project, ".unbiased", "worktrees", name);
  const branch = `pareto/${name}`;
  // The parent only — `git worktree add` refuses a target that already exists.
  mkdirSync(join(project, ".unbiased", "worktrees"), { recursive: true });
  excludeFromGit(project, ".unbiased/");
  const result = await new Promise<{ code: number; err: string }>((resolve) => {
    execFile(
      "git",
      ["worktree", "add", dir, "-b", branch],
      { cwd: project, timeout: 30000 },
      (error, _out, stderr) => resolve({ code: error ? 1 : 0, err: (stderr ?? "").trim() }),
    );
  });
  if (result.code !== 0) {
    console.warn("[app] worktree add failed, falling back to local:", result.err);
    return null;
  }
  const map = loadWorktrees();
  const attachment = loadProjects().flatMap(p=>p.sources).find(source=>source.path===project);
  map[dir] = { project, branch, checkoutId:randomUUID(), repositoryId:attachment?.repositoryId, sourceId:attachment?.id };
  atomicJson(worktreesFile(),map);
  return dir;
}

type ThreadSummary = { id: string; title: string; createdAt?: string; updatedAt?: string | number };
type WireItem = {
  id?: string;
  type?: string;
  text?: string;
  content?: unknown;
  command?: string;
  status?: string;
  exitCode?: number;
  aggregatedOutput?: string;
  kind?: string;
  agentThreadId?: string;
  agentPath?: string;
};
type WireThread = {
  id: string;
  name?: string | null;
  preview?: string;
  createdAt?: string;
  updatedAt?: string | number;
  cwd?: string;
  /** Free-form classification the client set at thread/start, handed back
   *  unchanged. Used to keep scheduled runs out of the sidebar. */
  threadSource?: string | null;
  turns?: { items?: WireItem[]; startedAt?: number; durationMs?: number }[];
};

const threadSearchCache = new Map<string, { updatedAt?: string | number; sourceMtimeMs?: number; cachedAt: number; messages: string[] }>();
const threadSearchReads = new Map<string, Promise<string[]>>();

async function searchableThreadMessages(id: string, updatedAt?: string | number): Promise<string[]> {
  const transcriptPath = join(app.getPath("userData"), "transcripts", `${id.replace(/[^\w.-]/g, "_")}.json`);
  const transcriptStat = await statAsync(transcriptPath).catch(() => null);
  const sourceMtimeMs = transcriptStat?.mtimeMs;
  const cached = threadSearchCache.get(id);
  if (cached && cached.updatedAt === updatedAt && cached.sourceMtimeMs === sourceMtimeMs && Date.now() - cached.cachedAt < 60_000) return cached.messages;
  const pending = threadSearchReads.get(id);
  if (pending) return pending;

  const read = (async () => {
    if (transcriptStat) {
      try {
        const saved = JSON.parse(await readFileAsync(transcriptPath, "utf8")) as { entries?: unknown };
        const messages = redactSecrets(messagesFromTranscriptEntries(saved.entries));
        if (messages.length > 0) {
          threadSearchCache.set(id, { updatedAt, sourceMtimeMs, cachedAt: Date.now(), messages });
          if (threadSearchCache.size > 120) threadSearchCache.delete(threadSearchCache.keys().next().value!);
          return messages;
        }
      } catch {
        // Missing or damaged local transcript: the engine remains the source of truth.
      }
    }
    const result = await engine.request("thread/read", { threadId: id, includeTurns: true }) as { thread: WireThread };
    const messages = (result.thread.turns ?? []).flatMap((turn) => (turn.items ?? []).flatMap((item) => {
      if (item.type === "userMessage") return [stripFileAttachmentContext(item.text ?? contentToText(item.content))];
      if (item.type === "agentMessage" || item.type === "plan") return [item.text ?? ""];
      if (item.type === "message") {
        const message = item as WireItem & { role?: string };
        return message.role === "user" || message.role === "assistant" ? [message.text ?? contentToText(message.content)] : [];
      }
      return [];
    })).filter(Boolean);
    const safeMessages = redactSecrets(messages);
    threadSearchCache.set(id, { updatedAt, sourceMtimeMs, cachedAt: Date.now(), messages: safeMessages });
    if (threadSearchCache.size > 120) threadSearchCache.delete(threadSearchCache.keys().next().value!);
    return safeMessages;
  })();
  threadSearchReads.set(id, read);
  try { return await read; }
  finally { threadSearchReads.delete(id); }
}

// Projects the user has explicitly opened. Persisted so a project appears
// in the sidebar the moment it's chosen — before (and regardless of) any
// conversation existing in it. Thread cwds merge in at list time.


// Two different truths, deliberately reported separately: `connected` is
// what the running engine actually has (authoritative, but empty while the
// engine is down or before a restart), and `configured` is what the user
// has asked for. A server present in the second and absent from the first
// is exactly the "restart to apply" case the panel needs to show.
function mcpConfigPath(): string {
  return join(app.getPath("home"), ".unbiased", "mcp-servers.json");
}
type UserMcpServer = {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  bearerTokenEnvVar?: string;
  /** Absent means on. Off keeps the entry — and its OAuth registration —
   *  while leaving it out of the engine's config. */
  enabled?: boolean;
  /** An OAuth client WE registered with the provider, so its consent screen
   *  shows Unbiased rather than codex's dynamically-registered "Codex". */
  oauthClientId?: string;
  /** Providers whose token exchange needs a secret (Google). Its presence
   *  routes the server through the engine's managed-plugin path. */
  oauthClientSecret?: string;
  scopes?: string[];
  startupTimeoutSec?: number;
  toolTimeoutSec?: number;
  enabledTools?: string[];
};
// Absent and unreadable are NOT the same answer. Returning [] for both let a
// save overwrite a file we had failed to parse — a malformed file read as
// "no servers", and the next Save wrote only the newly added one, silently
// destroying the rest. The engine fails loudly on this file for exactly this
// reason; so must we.
function readMcpConfig(): { servers: UserMcpServer[]; error: string | null } {
  let text: string;
  try {
    text = readFileSync(mcpConfigPath(), "utf8");
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    return { servers: [], error: missing ? null : `Could not read ${mcpConfigPath()}: ${String(err)}` };
  }
  try {
    const raw = JSON.parse(text) as { servers?: unknown };
    if (raw.servers !== undefined && !Array.isArray(raw.servers)) {
      return { servers: [], error: `${mcpConfigPath()} has a "servers" value that is not a list.` };
    }
    return { servers: (raw.servers as UserMcpServer[]) ?? [], error: null };
  } catch {
    return { servers: [], error: `${mcpConfigPath()} is not valid JSON. Fix or delete it — saving now would discard whatever it holds.` };
  }
}

// ── Per-conversation MCP servers ──────────────────────────────────────────
// See src/main/thread-mcp.ts for the measurement. Keyed by ROOT thread so a
// side chat or sub-agent sees what its conversation sees.
function threadMcpFile(): string {
  return join(app.getPath("userData"), THREAD_MCP_FILE);
}

const threadMcp: Map<string, Set<string>> = (() => {
  try {
    return parseThreadMcp(readFileSync(threadMcpFile(), "utf8"));
  } catch {
    return new Map();
  }
})();

/** What the user chose for the conversation they have not sent a message in
 *  yet: consumed by the next main-pane thread/start. */
let pendingNewThreadMcp: string[] | null = null;

function saveThreadMcp(): void {
  const tmp = `${threadMcpFile()}.tmp`;
  writeFileSync(tmp, serializeThreadMcp(threadMcp), { mode: 0o600 });
  renameSync(tmp, threadMcpFile());
}

function enabledMcpFor(threadId: string | null): string[] {
  if (!threadId) return pendingNewThreadMcp ?? [];
  return [...(threadMcp.get(rootThreadOf(threadId)) ?? [])].sort();
}

let connectorCatalogueForMcp: () => { name: string; url: string }[] = () => [];

function connectedConnectors(servers: readonly UserMcpServer[]): string[] {
  return connectedConnectorNames(servers, connectorCatalogueForMcp());
}

/** Threads whose MCP set changed while a turn was running; applied at turn end. */
const mcpApplyPending = new Set<string>();

/** Swap a live thread's MCP servers. The engine gives back the loaded session
 *  on a plain resume and never re-reads config, so the thread has to be
 *  dropped first; unsubscribe + resume re-creates it with the new set in ~2 s,
 *  same id, history intact (measured 2026-09-09). Never call this while a turn
 *  is running — the resume would kill it. */
async function applyThreadMcp(threadId: string): Promise<void> {
  await engine.request("thread/unsubscribe", { threadId });
  await engine.request("thread/resume", await resumeParamsFor(threadId));
  send("mcp:thread-applied", { threadId, enabled: enabledMcpFor(threadId) });
}

/** Connected catalogue entries are app-wide; manual servers remain per-chat. */
function mcpOverrideFor(threadId: string | null): Record<string, unknown> {
  const servers = readMcpConfig().servers;
  const enabled = new Set([...enabledMcpFor(threadId), ...connectedConnectors(servers)]);
  const environment = threadId ? turnEnvironments.snapshot(threadId) ?? environmentFor(threadId) : null;
  for (const connector of environment?.connectors ?? []) if (!connector.enabled) enabled.delete(connector.name);
  return mcpConfigOverride(overridableServerNames(servers), enabled);

}

// Re-declare everything a thread/start would. Tools are declared per
// session, not stored with the thread, so a resumed conversation had
// NO dynamic tools at all — reopening a chat silently cost it the
// agent browser and the scheduling tool, and the model discovered
// that mid-task ("there are no browser_connect tools available").
//
// Same omission as the side-chat fork, in the path I did not check
// when fixing that one. ThreadResumeParams accepts
// developerInstructions; dynamicTools and experimentalRawEvents are
// experimentalApi fields absent from the schema, and the engine
// ignores unknown params, so this cannot break a resume. Whether it
// HONOURS them on resume is unverified — experimentalRawEvents is
// known to be ignored here (measured for the sub-agent nicknames),
// so dynamicTools may be too. If it is, a reopened conversation
// needs a fresh thread to regain tools, not this.
/** Everything a thread/resume must re-declare, plus the conversation's MCP
 *  set. One function so the reopen path and the MCP-switch path can never
 *  disagree — a resume that forgot the override would silently hand the
 *  thread the engine's whole default server set back. */
async function resumeParamsFor(id: string): Promise<Record<string, unknown>> {
  return {
    threadId: id,
    ...threadPolicy(),
    dynamicTools: await threadDynamicTools(),
    // A cold reopen can safely recover thread-private notes by ID. Project
    // memory still needs a known cwd; never substitute the previous chat's.
    developerInstructions: developerInstructionsFor(threadCwds.get(id) ?? null, id),
    experimentalRawEvents: true,
    config: mcpOverrideFor(id),
  };
}

// Project identity is independent of the repository used as its working directory.
function projectStore(): ProjectStore { return new ProjectStore(app.getPath("userData")); }
function loadProjects(): ProjectRecord[] { return projectStore().list(); }
function saveProjects(projects: ProjectRecord[]): void { projectStore().save(projects); }
function projectMembership(id: string, cwd?: string) {
  return projectStore().membership(id, cwd, loadWorktrees());
}
function rememberProject(path: string): ProjectRecord {
  const projects = loadProjects();
  const existing = projects.find((p) => p.folders.includes(path));
  if (existing) return existing;
  const record = projectRecord(path);
  projects.unshift(record);
  saveProjects(projects);
  return record;
}
function threadProject(threadId: string | null, cwd: string | null): ProjectRecord | null {
  return projectStore().projectFor(threadId ? rootThreadOf(threadId) : null, cwd, loadWorktrees());
}

function threadTitle(t: WireThread): string {
  const name = t.name?.trim();
  if (name) return name;
  const preview = t.preview?.trim();
  if (preview) return preview.length > 48 ? preview.slice(0, 48) + "…" : preview;
  return "New chat";
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : ((c as { text?: string })?.text ?? "")))
      .join("");
  }
  return "";
}

/** Flatten a resumed thread's turns into the renderer's entry list. */
function threadToEntries(
  thread: WireThread,
  opts?: { runningLastTurn?: boolean },
): { entries: unknown[]; runningTurnStart: number | null; runningTurnStartedAt: number | null } {
  const entries: unknown[] = [];
  const turns = thread.turns ?? [];
  // Where the in-flight turn's foldable output begins, and when the turn
  // started. Without these, opening a conversation mid-turn stranded the
  // replayed half of that turn outside the fold forever: the live fold at
  // completion only reaches back to the moment the pane opened, so narration
  // replayed from history sat bare above a "Worked" group covering just the
  // tail — the exact split seen on a scheduled run opened via "Open run".
  let runningTurnStart: number | null = null;
  let runningTurnStartedAt: number | null = null;
  for (let t = 0; t < turns.length; t++) {
    const turn = turns[t];
    const startedAt = epochMillis(turn.startedAt) ?? (t === 0 ? epochMillis(thread.createdAt) : null);
    const answeredAt = startedAt !== null && typeof turn.durationMs === "number" && Number.isFinite(turn.durationMs) && turn.durationMs >= 0
      ? startedAt + turn.durationMs
      : startedAt;
    // Per-turn bucket, folded when the turn (or a mid-turn user message)
    // flushes it. The live path folds a completed turn's intermediate output
    // under a "Worked" header at turn/completed — but a REOPENED conversation
    // is rebuilt here, and this function used to replay everything flat, so
    // the folds evaporated on reopen: every line of narration stood bare in
    // the transcript with only the consecutive-command groups surviving
    // (those fold at render time). Mirrors the live semantics exactly: the
    // fold starts after the user message and the trailing assistant message
    // stays outside. Duration is not in the wire history, so the header reads
    // "Worked" rather than "Worked for Ns".
    const bucket: unknown[] = [];
    const durationS = typeof turn.durationMs === "number" ? turn.durationMs / 1000 : null;
    const flush = (keepFinalOut: boolean): void => {
      if (bucket.length === 0) return;
      const last = bucket[bucket.length - 1] as { kind?: string; phase?: string | null } | undefined;
      // The trailing assistant message always stays outside, even when its
      // phase is commentary — live folding does the same, and a turn that
      // narrated and stopped should still show SOMETHING rather than fold
      // itself away entirely.
      const finalMsg = keepFinalOut && last?.kind === "assistant" ? bucket.pop() : null;
      // Fold when the bucket holds interim output: tool work where history
      // kept any, or commentary-phase narration where it did not. A turn of
      // plain messages with no phase info (older engines) stays flat — better
      // a loose transcript than answers hidden behind a fold.
      const didWork = bucket.some((e) => {
        const x = e as { kind?: string; phase?: string | null };
        return x.kind === "command" || x.kind === "agent" || (x.kind === "assistant" && x.phase === "commentary");
      });
      // The duration is the whole TURN's, so only the turn-closing flush may
      // claim it — a steered turn flushes once per user interjection, and
      // stamping each fragment with the full figure would show one turn's
      // time twice.
      if (didWork) entries.push({ kind: "work", duration: keepFinalOut ? durationS : null, entries: [...bucket] });
      else entries.push(...bucket);
      if (finalMsg) entries.push(finalMsg);
      bucket.length = 0;
    };
    // A turn still running when the conversation reopens stays raw: its
    // entries are still growing, and the live fold takes over at completion.
    const foldThisTurn = !(opts?.runningLastTurn && t === turns.length - 1);
    if (!foldThisTurn) {
      runningTurnStart = entries.length;
      runningTurnStartedAt = startedAt;
    }
    for (const item of turn.items ?? []) {
      switch (item.type) {
        case "userMessage":
          // A user message (initial, or a mid-turn steer) never hides inside
          // a fold — flush what came before it, folded, then show it.
          flush(false);
          entries.push({
            kind: "user",
            text: stripFileAttachmentContext(item.text ?? contentToText(item.content)),
            attachments: Array.isArray(item.content)
              ? item.content.flatMap((part: unknown) => {
                  if (!part || typeof part !== "object") return [];
                  const a = part as { type?: string; name?: string; path?: string };
                  if (!a.path || !isAbsolute(a.path)) return [];
                  if (a.type === "mention") return [{ name: a.name ?? a.path.split("/").pop() ?? a.path, path: a.path, kind: "file" }];
                  if (a.type === "localImage") return [{ name: a.path.split("/").pop() ?? a.path, path: a.path, kind: "image" }];
                  return [];
                })
              : [],
            ...(startedAt !== null ? { at: startedAt } : {}),
          });
          // The running turn's fold starts after its user message, matching
          // where the live path plants its start index on send.
          if (!foldThisTurn) runningTurnStart = entries.length;
          break;
        // A reply that came back through the chat-completions dialect is stored
        // raw — `message` with role assistant and an output_text part — rather
        // than as codex's own `agentMessage`. Both shapes occur in one session
        // depending on which backend answered, and only the second was ever
        // handled: the missing replies were in the transcript file the whole
        // time, dropped by this switch on the way to the screen.
        case "message": {
          const m = item as { role?: string; text?: string; content?: unknown; phase?: string | null };
          const text = m.text ?? contentToText(m.content);
          if (!text) break;
          if (m.role === "user") {
            entries.push({ kind: "user", text: stripFileAttachmentContext(text), ...(startedAt !== null ? { at: startedAt } : {}) });
            if (!foldThisTurn) runningTurnStart = entries.length;
          } else {
            bucket.push({ kind: "assistant", text, phase: m.phase ?? null, ...(foldThisTurn && answeredAt !== null ? { at: answeredAt } : {}) });
          }
          break;
        }
        case "agentMessage": {
          // `phase` is the engine's own record of which messages were interim
          // narration ("commentary") and which was the answer
          // ("final_answer"). It is the ONLY signal that survives into
          // history: thread/read returns no tool items at all — measured, a
          // turn with 40+ tool calls replays as 1 user + 15 agent messages —
          // so any fold keyed on "did work happen" sees nothing to fold and
          // replays narration flat. That is exactly the reopened-transcript
          // bug this fixes.
          const m = item as { text?: string; phase?: string | null };
          bucket.push({ kind: "assistant", text: m.text ?? "", phase: m.phase ?? null, ...(foldThisTurn && answeredAt !== null ? { at: answeredAt } : {}) });
          break;
        }
        case "commandExecution":
          bucket.push({
            kind: "command",
            itemId: item.id ?? "unknown",
            command: item.command ?? "(command)",
            status: item.status ?? "completed",
            exitCode: item.exitCode,
            output: item.aggregatedOutput,
            source: "shell",
          });
          break;
        case "dynamicToolCall": {
          const d = item as { id?: string; tool?: string; arguments?: unknown; status?: string; success?: boolean };
          bucket.push({
            kind: "command",
            itemId: d.id ?? "unknown",
            command: dynamicToolCommandText(d.tool, d.arguments),
            status: d.success === false ? "failed" : (d.status ?? "completed"),
            source: dynamicToolSource(d.tool),
            ...(axStepIcon(d.tool, d.arguments) ? { appIcon: axStepIcon(d.tool, d.arguments) } : {}),
          });
          break;
        }
        case "mcpToolCall": {
          const t = item as unknown as {
            id?: string;
            server?: string;
            tool?: string;
            arguments?: unknown;
            status?: string;
            error?: { message?: string } | null;
          };
          const margs = t.arguments && typeof t.arguments === "object" ? t.arguments : {};
          const margsText = Object.keys(margs).length ? ` ${JSON.stringify(margs)}` : "";
          bucket.push({
            kind: "command",
            itemId: t.id ?? "unknown",
            command: `${t.server ?? "mcp"}.${t.tool ?? "tool"}${margsText}`.slice(0, 400),
            status: t.status ?? "completed",
            output: t.error?.message ?? undefined,
            source: "tool",
          });
          break;
        }
        case "contextCompaction":
          bucket.push({ kind: "compaction" });
          break;
        case "plan":
          bucket.push({ kind: "assistant", text: item.text ?? "", ...(foldThisTurn && answeredAt !== null ? { at: answeredAt } : {}) });
          break;
        case "subAgentActivity": {
          const sub = item as { kind?: string; agentThreadId?: string; agentPath?: string };
          bucket.push({
            kind: "agent",
            event: sub.kind ?? "started",
            name: (sub.agentPath ?? "").split("/").filter(Boolean).pop() ?? "agent",
            path: sub.agentPath ?? "",
            agentThreadId: sub.agentThreadId ?? "",
          });
          break;
        }
      }
    }
    if (foldThisTurn) flush(true);
    else {
      entries.push(...bucket);
      bucket.length = 0;
    }
  }
  return { entries, runningTurnStart, runningTurnStartedAt };
}

/** Small data-URL preview for attachment cards; full-size stays on disk. */
function thumbDataUrl(image: NativeImage, max = 112): string {
  const { width, height } = image.getSize();
  const scale = max / Math.max(width, height, 1);
  const small =
    scale < 1
      ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
      : image;
  return small.toDataURL();
}

function pushStatus(status: EngineStatus): void {
  if(status.state === "exited")turnEnvironments.reset();
  lastStatus = status;
  if (status.state === "exited") {
    for (const threadId of compactingThreads) updateThreadCompaction(threadId, "failed");
    if (petSettleTimer) clearTimeout(petSettleTimer);
    petSettleTimer = null;
    petActivity.reset();
    updatePet();
  }
  win?.webContents.send("engine:status", status);
}

// ── Auth / credentials ───────────────────────────────────────────────
// The desktop's sign-in surface. The engine wrapper reads the key from
// ---- Skills ---------------------------------------------------------------
// Three tiers, and the difference between them is a protocol fact rather than a
// preference (measured against engine 0.147.0):
//
//   bundled  resources/skills            read-only, ships with the app
//   global   ~/.unbiased/skills          the user's own, every conversation
//   project  <cwd>/.codex/skills         codex scans this itself, per cwd
//
// Only the third is project-scoped. codex has exactly two inputs: a cwd-relative
// scan hardcoded to `.codex/skills`, and skills/extraRoots/set — a FLAT GLOBAL
// list with no cwd binding. Registering a per-project directory as an extra root
// leaks it: a skill under project A shows up inside a project B conversation,
// tagged scope "user". Verified. Hence the codex-named directory for project
// skills; it is the only project-scoped mechanism that exists.
function bundledSkillsDir(): string {
  const override = process.env.UNBIASED_SKILLS_DIR?.trim();
  if (override) return override;
  return productionBuild()
    ? join(process.resourcesPath, "skills")
    : join(app.getAppPath(), "resources", "skills");
}
/** The computer-use skill's text, read once from the bundled directory the
 *  engine is also given. Cached: a conversation asks for it at most once, but
 *  a long session has many conversations. */
let computerUseSkillCache: string | null | undefined;
function computerUseSkillText(): string | null {
  if (computerUseSkillCache !== undefined) return computerUseSkillCache;
  try {
    computerUseSkillCache = readFileSync(join(bundledSkillsDir(), "computer-use", "SKILL.md"), "utf8");
  } catch (err) {
    // Not fatal: the tools still carry their own descriptions, and the skill
    // is still listed for the model to open itself.
    console.warn("[skills] computer-use skill unreadable, first-call preamble disabled:", String(err));
    computerUseSkillCache = null;
  }
  return computerUseSkillCache;
}

/** Conversations that have already been handed the skill. */
const axSkillSent = new Set<string>();

// ── Working-memory checkpoint (see checkpoint.ts) ─────────────────────────
// Context occupancy per thread and per root, from thread/tokenUsage/updated.
const ctxPercent = new Map<string, number>();
type CheckpointCycle = { savedThisCycle: boolean; gateUsed: boolean; thresholdWritten: boolean; compactions: number; notes: string | null };
const checkpointCycles = new Map<string, CheckpointCycle>();
const checkpointLedger = new Map<string, LedgerEntry[]>();
// Roots whose next tool result must carry the checkpoint back: a compaction
// happened and the model's verbatim history is gone.
const checkpointReplayDue = new Set<string>();
function checkpointCycle(root: string): CheckpointCycle {
  let c = checkpointCycles.get(root);
  if (!c) {
    c = { savedThisCycle: false, gateUsed: false, thresholdWritten: false, compactions: 0, notes: null };
    checkpointCycles.set(root, c);
  }
  return c;
}
function checkpointFile(root: string): string {
  return checkpointPath(threadCwds.get(root) ?? defaultChatDir(), root);
}
function writeCheckpoint(root: string): string {
  const c = checkpointCycle(root);
  const file = checkpointFile(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderCheckpoint({
    root, notes: c.notes, facts: checkpointLedger.get(root) ?? [],
    savedAt: new Date().toISOString(), percent: ctxPercent.get(root) ?? 0, compactions: c.compactions,
  }));
  return file;
}
// Files the model has run a command against, per conversation, and the
// conversations already told about it. See remeasureNudge: the same source
// file was analysed 5, 4 and 3 times across three runs of one task.
const measuredPaths = new Map<string, Map<string, number>>();
const remeasureNudged = new Set<string>();

/** Tally one shell command's file paths, and put the first sighting of each in
 *  the ledger — so the checkpoint file says which files were measured even
 *  though only the model knows what the numbers were. */
function recordMeasuredPaths(threadId: string | null, command: string): void {
  const root = rootThreadOf(threadId);
  const tally = measuredPaths.get(root) ?? new Map<string, number>();
  for (const path of pathsInCommand(command)) {
    const runs = (tally.get(path) ?? 0) + 1;
    tally.set(path, runs);
    if (runs === 1) recordFact(threadId, `measured ${path}`);
  }
  measuredPaths.set(root, tally);
}

/** The re-measurement note for this conversation's next desktop result, or
 *  null. Once per conversation, like the batch nudge — a reminder on every
 *  call is noise, and the point is made the first time. */
function remeasureNote(root: string): string | null {
  if (remeasureNudged.has(root)) return null;
  let worst: { path: string; runs: number } | null = null;
  for (const [path, runs] of measuredPaths.get(root) ?? []) {
    if (!worst || runs > worst.runs) worst = { path, runs };
  }
  if (!worst) return null;
  const text = remeasureNudge({ path: worst.path, runs: worst.runs, savedCheckpoint: checkpointCycle(root).savedThisCycle });
  if (text) remeasureNudged.add(root);
  return text;
}

/** A measured fact the app itself observed — a value read back, where a click
 *  landed, what launched. Never a tree and never a picture. */
function recordFact(threadId: string | null, text: string): void {
  const root = rootThreadOf(threadId);
  const ledger = checkpointLedger.get(root) ?? [];
  pushFact(ledger, text);
  checkpointLedger.set(root, ledger);
}

/** The trailing run of single-action desktop calls, and the conversations that
 *  have already been shown the batch nudge. See batchNudge: said once, because
 *  a reminder on every action would be noise. */
let axRecentEdits: RecentEdit[] = [];
const axBatchNudged = new Set<string>();
/** Conversations whose first long click path has been held once — see drawGate. */
const drawGateUsed = new Set<string>();

/** The outline a conversation measured and has not drawn yet, and how many
 *  desktop calls ago. See outlineReminder for the run this is for. */
const pendingOutline = new Map<string, PendingOutline>();

/** Every desktop call ages it; a long path spends it. */
function agePendingOutline(root: string, drewAPath: boolean): void {
  const p = pendingOutline.get(root);
  if (!p) return;
  if (drewAPath) { pendingOutline.delete(root); return; }
  p.callsSince += 1;
}

function outlineNote(root: string): string | null {
  return outlineReminder(pendingOutline.get(root) ?? null);
}
/** Record one logical edit and, once per compaction cycle, hand back the batch
 *  call that would have carried the recent run of them. */
function recordEditAndNudge(root: string, appName: string, edit: RecentEdit): string | null {
  axRecentEdits.push(edit);
  if (axRecentEdits.length > BATCH_NUDGE_AFTER * 2) axRecentEdits = axRecentEdits.slice(-BATCH_NUDGE_AFTER * 2);
  const nudge = axBatchNudged.has(root) ? null : batchNudge(axRecentEdits);
  if (nudge) {
    axBatchNudged.add(root);
    axLog(`nudged ${appName} toward computer_do after ${axRecentEdits.length} single edits`);
  }
  return nudge;
}

function globalSkillsDir(): string {
  return join(app.getPath("home"), ".unbiased", "skills");
}
/** The roots we hand the engine. Bundled stays read-only — an app update has to
 *  be able to replace it, and a user edit must not be silently clobbered, so
 *  "edit" in the UI means copy-into-global. */
function skillRoots(): string[] {
  const roots: string[] = [];
  const bundled = bundledSkillsDir();
  if (existsSync(bundled)) roots.push(bundled);
  // Created eagerly so the folder exists to reveal in Finder before the user
  // has added anything.
  const g = globalSkillsDir();
  try {
    mkdirSync(g, { recursive: true });
    roots.push(g);
  } catch (err) {
    console.error("[skills] could not create", g, err);
  }
  return roots;
}

// UNBIASED_API_KEY (env) else ~/.unbiased/credentials.json; the login flow
// writes the file and pins the key into the engine's launch env.
// UNBIASED_PLATFORM_URL points a dev build at a local platform. Only the
// platform calls here (whoami, billing, browser sign-in) follow it; the
// engine's gateway URL is pinned by the supervisor and is not affected.
const PLATFORM_BASE = (process.env.UNBIASED_PLATFORM_URL?.trim() || "https://platform.unbiased.ai").replace(/\/+$/, "");
// The app's OAuth public client id, registered on the platform (unbiased-
// platform docs/admin-api.md → Partners). Public by design — it ships in the
// binary; the person's approval in their browser is what carries the trust.
// Registered 2026-08-28 as partner "Unbiased" → client "Unbiased Desktop".
// Empty disables browser sign-in and the login screen offers only paste-a-key.
const OAUTH_CLIENT_ID = process.env.UNBIASED_OAUTH_CLIENT_ID?.trim() || "dhTH_VbRdB88tgW-m1HWiw";
function credentialsPath(): string {
  return join(app.getPath("home"), ".unbiased", "credentials.json");
}

/** The key the engine would use, and where it came from. Env wins (matches
 *  the wrapper's own ResolveKey order), then the credentials file. */
function readStoredKey(): { key: string; source: "env" | "file" } | null {
  const envKey = process.env.UNBIASED_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };
  try {
    const cred = JSON.parse(readFileSync(credentialsPath(), "utf8")) as { apiKey?: unknown };
    if (typeof cred.apiKey === "string" && cred.apiKey.trim()) return { key: cred.apiKey.trim(), source: "file" };
  } catch {
    // no file
  }
  return null;
}

type WhoamiResult =
  | {
      ok: true;
      organization: { id: string; name: string };
      workload: { id: string; name: string };
      keyName: string;
      accessStatus: string;
      user?: { id: string };
      // Present only once the platform's whoami is extended to return it.
      paretoRolloutPercent?: number | null;
    }
  | { ok: false; error: string; code?: string; status?: number };

/** Validate a key against the platform's CLI whoami. Never billable, never
 *  hits the model — a pure identity check safe to run before sign-in. */
async function whoamiValidate(key: string): Promise<WhoamiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${PLATFORM_BASE}/api/cli/whoami`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (res.status === 401) return { ok: false, error: "That API key isn't valid.", code: "invalid_api_key", status: 401 };
    if (res.status === 503) return { ok: false, error: "The platform is temporarily unavailable — try again shortly.", code: "unavailable", status: 503 };
    if (!res.ok) return { ok: false, error: `Validation failed (HTTP ${res.status}).`, status: res.status };
    const body = (await res.json()) as Record<string, unknown>;
    return {
      ok: true,
      user: body.user as { id: string } | undefined,
      organization: body.organization as { id: string; name: string },
      workload: body.workload as { id: string; name: string },
      keyName: String(body.keyName ?? ""),
      accessStatus: String(body.accessStatus ?? "unknown"),
      paretoRolloutPercent:
        typeof body.paretoRolloutPercent === "number" ? body.paretoRolloutPercent : undefined,
    };
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    return { ok: false, error: aborted ? "Validation timed out — check your connection." : "Couldn't reach the platform.", code: "network" };
  } finally {
    clearTimeout(timer);
  }
}

type BillingResult =
  | {
      ok: true;
      organization: { name: string };
      balanceCents: number | null;
      monthToDateSpendCents: number | null;
      spendSyncedAt: string | null;
      tokens: { input: number; cached: number; output: number } | null;
    }
  | { ok: false; error: string };

/** Credits and month-to-date spend, from the platform's CLI billing route.
 *  Replaces the engine's account/rateLimits/read, which is ChatGPT-plan
 *  plumbing and always fails under gateway API-key auth. Pareto has no quota
 *  windows to report — it's prepaid credit — so this is what "usage" means. */
async function readBilling(): Promise<BillingResult> {
  const stored = readStoredKey();
  if (!stored) return { ok: false, error: "not signed in" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${PLATFORM_BASE}/api/cli/billing`, {
      headers: { Authorization: `Bearer ${stored.key}` },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const b = (await res.json()) as {
      organization?: { name?: string };
      balance?: { available?: boolean; balanceCents?: number };
      usage?: {
        available?: boolean;
        monthToDateSpendCents?: number | null;
        spendSyncedAt?: string | null;
        monthToDateUsage?: { totalInputTokens?: number; totalCachedTokens?: number; totalOutputTokens?: number };
      };
    };
    // Balance and usage fail independently upstream, so each is reported
    // separately rather than collapsing the whole card on one outage.
    const u = b.usage?.monthToDateUsage;
    return {
      ok: true,
      organization: { name: b.organization?.name ?? "" },
      balanceCents: b.balance?.available ? (b.balance.balanceCents ?? null) : null,
      monthToDateSpendCents: b.usage?.available ? (b.usage.monthToDateSpendCents ?? null) : null,
      spendSyncedAt: b.usage?.spendSyncedAt ?? null,
      tokens: u
        ? {
            input: u.totalInputTokens ?? 0,
            cached: u.totalCachedTokens ?? 0,
            output: u.totalOutputTokens ?? 0,
          }
        : null,
    };
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    return { ok: false, error: aborted ? "timed out" : "could not reach the platform" };
  } finally {
    clearTimeout(timer);
  }
}

// ── Self-update ──────────────────────────────────────────────────────
// We install updates OURSELVES rather than using electron-updater, because
// Squirrel.Mac refuses to update a bundle that isn't Developer ID signed —
// and ours is ad-hoc signed (see build/adhoc-sign.cjs). Swapping the .app
// ourselves is exactly what scripts/install.sh already does by hand, so the
// same steps work here: download → verify SHA-256 → mount → replace → relaunch.
const UPDATE_REPO = "circuitandchisel/unbiased-app-releases";
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
// A desktop app stays open for days, so a timer alone means a release can go
// unnoticed for hours (the check fires at launch, then not again until the
// interval elapses). Re-check when the window regains focus — that's when
// someone is actually looking at the sidebar — throttled so alt-tabbing
// doesn't hammer the API.
const UPDATE_FOCUS_THROTTLE_MS = 10 * 60 * 1000;
let lastUpdateCheck = 0;

// Release notes come from the releases repo so shipping a changelog entry no
// longer means shipping a build. Cached to disk because the Updates tab must
// say something on a plane, and because GitHub's unauthenticated limit is 60
// requests an hour per IP — several people behind one office NAT would burn
// that on update checks alone.
type ReleaseNote = { version: string; date: string | null; body: string };
function releaseNotesFile(): string {
  return join(app.getPath("userData"), "release-notes.json");
}
let releaseNotesCache: ReleaseNote[] | null = null;
function loadReleaseNotes(): ReleaseNote[] {
  if (!releaseNotesCache) {
    try {
      releaseNotesCache = JSON.parse(readFileSync(releaseNotesFile(), "utf8")) as ReleaseNote[];
    } catch {
      releaseNotesCache = [];
    }
  }
  return releaseNotesCache;
}

/** Everything above the first `---`. Release bodies carry install instructions
 *  below that rule, which are for someone looking at GitHub, not for someone
 *  already running the app. */
function notesAboveRule(body: string): string {
  // Only the rule that DIRECTLY introduces the install block. A bare `---` is
  // also markdown's horizontal rule and its setext-h2 underline, so cutting at
  // the first one anywhere would swallow hand-written notes that use either.
  const m = /^[ \t]*---[ \t]*\r?\n\s*(?:Apple Silicon Mac|Install:)/m.exec(body);
  return (m ? body.slice(0, m.index) : body).trim();
}

async function refreshReleaseNotes(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return; // rate-limited or offline — the cache still stands
    const body = (await res.json()) as { tag_name?: string; published_at?: string; body?: string }[];
    const notes = body
      .filter((r) => r.tag_name)
      .map((r) => ({
        version: String(r.tag_name).replace(/^v/, ""),
        date: r.published_at ?? null,
        body: notesAboveRule(r.body ?? ""),
      }))
      .filter((r) => r.body.length > 0);
    if (notes.length === 0) return; // never replace a good cache with nothing
    releaseNotesCache = notes;
    try {
      writeFileSync(releaseNotesFile(), JSON.stringify(notes));
    } catch {
      /* cache is an optimisation, not a requirement */
    }
  } catch {
    /* offline — the cache still stands */
  }
}

// Auto-download lives HERE, not in renderer localStorage with the other
// preferences: the check fires on a timer 8s after boot and every 6h after,
// with no guarantee a renderer has mounted, let alone told us anything.
// Default on — the people this helps are the ones who would never find the
// switch. Off restores the old behaviour exactly.
function updatePrefsFile(): string {
  return join(app.getPath("userData"), "update-prefs.json");
}
let updatePrefsCache: { autoDownload: boolean } | null = null;
function updatePrefs(): { autoDownload: boolean } {
  if (!updatePrefsCache) {
    try {
      const raw = JSON.parse(readFileSync(updatePrefsFile(), "utf8")) as { autoDownload?: unknown };
      updatePrefsCache = { autoDownload: raw.autoDownload !== false };
    } catch {
      updatePrefsCache = { autoDownload: true };
    }
  }
  return updatePrefsCache;
}
function setUpdatePrefs(next: { autoDownload: boolean }): void {
  updatePrefsCache = next;
  try {
    writeFileSync(updatePrefsFile(), JSON.stringify(next));
  } catch {
    /* a preference that fails to persist is not worth failing the app over */
  }
}
// Suppresses per-chunk progress while auto-downloading: the whole point is
// that nothing interrupts until there is something to act on.
let silentInstall = false;

type UpdateInfo = { version: string; dmgUrl: string; sumsUrl: string | null };
let pendingUpdate: UpdateInfo | null = null;
let updateInstalling = false;
// Where a downloaded-and-verified bundle waits until the user relaunches.
// Two-phase on purpose: downloading 190MB and then yanking the app away in
// one click loses whatever the user was doing. Download in the background,
// then let them pick the moment to relaunch.
let stagedUpdate: { path: string; version: string } | null = null;

/** Hidden sibling of the installed app, so a staged bundle doesn't show up
 *  in Finder as a second "Unbiased" while it waits. */
function stagedPathFor(target: string): string {
  const dir = join(target, "..");
  const name = target.split("/").pop() ?? "Unbiased.app";
  return join(dir, `.${name}.incoming`);
}

/** Numeric-segment compare: "1.10.0" > "1.9.9". Returns >0 if a is newer. */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.-]/);
  const pb = b.replace(/^v/, "").split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i] ?? "0", 10);
    const nb = parseInt(pb[i] ?? "0", 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) continue; // pre-release tails
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** Ask the public releases repo what the latest version is. */
async function checkForUpdate(): Promise<UpdateInfo | null> {
  lastUpdateCheck = Date.now();
  // Alongside the version check, so an app left open for days has the notes
  // for whatever it is about to offer. Boot-only would mean the Updates tab
  // describing the version you are already on while the banner offers another.
  void refreshReleaseNotes();
  // Dev preview: UNBIASED_FAKE_UPDATE=1 surfaces the banner without a
  // packaged build, so the update UI can be iterated on with `npm run dev`.
  // Installing is still gated on isPackaged, so this can't swap anything.
  if (process.env.UNBIASED_FAKE_UPDATE) {
    const info: UpdateInfo = { version: "9.9.9", dmgUrl: "", sumsUrl: null };
    pendingUpdate = info;
    send("update:available", info);
    // =2 previews the downloaded/"ready to relaunch" state (happy dog).
    if (process.env.UNBIASED_FAKE_UPDATE === "2") {
      stagedUpdate = { path: "/dev/null/fake", version: info.version };
      send("update:staged", { version: info.version });
    }
    return info;
  }
  // Unpackaged runs have no .app to replace — never offer an update in dev.
  if (!productionBuild()) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      tag_name?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const tag = body.tag_name;
    if (!tag || compareVersions(tag, app.getVersion()) <= 0) return null;
    const assets = body.assets ?? [];
    const dmg = assets.find((a) => a.name.endsWith(".dmg"));
    if (!dmg) return null;
    const info: UpdateInfo = {
      version: tag.replace(/^v/, ""),
      dmgUrl: dmg.browser_download_url,
      sumsUrl: assets.find((a) => a.name === "SHA256SUMS")?.browser_download_url ?? null,
    };
    pendingUpdate = info;
    if (updatePrefs().autoDownload && !stagedUpdate && !updateInstalling) {
      // Stage it quietly. The banner appears once, saying the only thing the
      // user can usefully act on: restart. update:pending withholds the
      // update from the renderer until then, so no Download button flashes up
      // and then changes under them mid-download.
      silentInstall = true;
      void installUpdate(info).then((r) => {
        silentInstall = false;
        // Announce on BOTH outcomes. Failure falls back to the manual banner.
        // Success must announce too: the banner renders only when the
        // renderer's `update` state is set, and update:staged alone never sets
        // it — so a silently staged update was invisible until the next app
        // restart. Verified live: 1.3.1 sat fully staged on disk for an hour
        // with no banner. staged fired first, so the label says "Relaunch".
        send("update:available", info);
      });
      return info;
    }
    send("update:available", info);
    return info;
  } catch {
    return null; // offline, rate-limited — silent; we retry on the next tick
  }
}

/** The running app's bundle: .../Unbiased.app/Contents/MacOS/Unbiased → the .app. */
function appBundlePath(): string {
  return join(app.getPath("exe"), "..", "..", "..");
}

/** Adopt a bundle staged by a previous run. Without this a completed
 *  180MB+ download is forgotten the moment the app restarts — stagedUpdate is
 *  memory-only — so an interrupted update re-downloads from scratch every
 *  time, which is what made a failed update feel like a loop. */
function recoverStagedUpdate(): void {
  if (!productionBuild()) return;
  const staged = stagedPathFor(appBundlePath());
  const plist = join(staged, "Contents/Info.plist");
  if (!existsSync(plist)) return;
  try {
    const version = execFileSync("/usr/libexec/PlistBuddy", [
      "-c", "Print :CFBundleShortVersionString", plist,
    ], { encoding: "utf8" }).trim();
    if (version && compareVersions(version, app.getVersion()) > 0) {
      stagedUpdate = { path: staged, version };
      pendingUpdate = { version, dmgUrl: "", sumsUrl: null };
      return;
    }
    // Same version or older: it already landed, or it is stale. Either way it
    // is 180MB of nothing, so reclaim the space.
    rmSync(staged, { recursive: true, force: true });
  } catch {
    /* unreadable plist — leave it alone rather than delete something unknown */
  }
}

async function installUpdate(info: UpdateInfo): Promise<{ ok: boolean; error?: string }> {
  if (!productionBuild()) return { ok: false, error: "updates only apply to the installed app" };
  if (updateInstalling) return { ok: false, error: "an update is already installing" };
  updateInstalling = true;
  const tmp = mkdtempSync(join(tmpdir(), "unbiased-update-"));
  const dmgPath = join(tmp, "update.dmg");
  let mounted: string | null = null;
  const cleanup = () => {
    if (mounted) {
      try {
        execFileSync("hdiutil", ["detach", mounted, "-quiet"]);
      } catch {
        /* already gone */
      }
    }
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  try {
    // ── download with progress ──
    if (!silentInstall) send("update:progress", { phase: "downloading", percent: 0 });
    const res = await fetch(info.dmgUrl);
    if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
    const total = Number(res.headers.get("content-length") ?? 0);
    const chunks: Buffer[] = [];
    let received = 0;
    let lastSent = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      const buf = Buffer.from(chunk);
      chunks.push(buf);
      received += buf.length;
      const percent = total ? Math.round((received / total) * 100) : 0;
      // Throttle: a 190MB download would otherwise flood the renderer.
      if (percent !== lastSent && percent % 2 === 0) {
        lastSent = percent;
        if (!silentInstall) send("update:progress", { phase: "downloading", percent });
      }
    }
    const data = Buffer.concat(chunks);
    writeFileSync(dmgPath, data);

    // ── verify ──
    // A corrupted 190MB download must never replace a working app.
    if (info.sumsUrl) {
      if (!silentInstall) send("update:progress", { phase: "verifying", percent: 100 });
      const sums = await (await fetch(info.sumsUrl)).text();
      const name = info.dmgUrl.split("/").pop() ?? "";
      const expected = sums
        .split("\n")
        .map((l) => l.trim().split(/\s+/))
        .find((p) => p[1]?.replace(/^\*/, "") === name)?.[0];
      if (expected) {
        const actual = createHash("sha256").update(data).digest("hex");
        if (actual !== expected) throw new Error("checksum mismatch — update refused");
      }
    }

    // ── swap the bundle ──
    if (!silentInstall) send("update:progress", { phase: "installing", percent: 100 });
    // NOT -quiet: it suppresses the very table we parse the mount point out
    // of, leaving us mounted with no idea where. Columns are tab-separated;
    // the mount point is the last field of the volume's row.
    const out = execFileSync("hdiutil", [
      "attach", dmgPath, "-nobrowse", "-mountrandom", "/tmp",
    ]).toString();
    mounted =
      out
        .split("\n")
        .map((line) => line.split("\t").pop()?.trim() ?? "")
        .filter((p) => p.startsWith("/"))
        .pop() ?? null;
    if (!mounted) throw new Error("could not determine the disk image mount point");
    const srcApp = readdirSync(mounted).find((n) => n.endsWith(".app"));
    if (!srcApp) throw new Error("no .app inside the disk image");
    // Sanity-check the payload BEFORE deleting the installed app: a DMG
    // missing the engine would leave the user with a bundle that can't run.
    if (!existsSync(join(mounted, srcApp, "Contents/Resources/engine/unbiased-app-engine"))) {
      throw new Error("the downloaded app is missing its engine — update refused");
    }

    const target = appBundlePath();
    // Stage beside the target and STOP. The swap happens in applyUpdate(),
    // when the user chooses to relaunch. ditto (not cp -R) preserves the
    // code signature; a broken seal would make macOS refuse to launch it.
    const staged = stagedPathFor(target);
    rmSync(staged, { recursive: true, force: true });
    execFileSync("ditto", [join(mounted, srcApp), staged]);
    cleanup();

    stagedUpdate = { path: staged, version: info.version };
    updateInstalling = false;
    send("update:staged", { version: info.version });
    return { ok: true };
  } catch (err) {
    cleanup();
    updateInstalling = false;
    const message = err instanceof Error ? err.message : String(err);
    send("update:error", { message });
    return { ok: false, error: message };
  }
}

/** Swap the staged bundle in and restart. Only reached once a download has
 *  been verified and staged, so the window where the app is missing is a
 *  single `mv` — not a 190MB copy. */
async function applyUpdate(): Promise<{ ok: boolean; error?: string }> {
  if (browserShuttingDown) return { ok: false, error: "Unbiased is already preparing to quit or update." };
  if (!stagedUpdate || !existsSync(stagedUpdate.path)) {
    // The staged copy vanished (manual cleanup, disk tools). Fall back to
    // offering the download again rather than pretending we can relaunch.
    stagedUpdate = null;
    const message = "the downloaded update is no longer available — download it again";
    send("update:error", { message });
    return { ok: false, error: message };
  }
  const target = appBundlePath();
  try {
    browserShuttingDown = true;
    const stopped = await browserRuntime.shutdown();
    if (!stopped.ok) {
      throw new Error("The Agent browser is still shutting down. Retry the update in a moment.");
    }
    rmSync(target, { recursive: true, force: true });
    execFileSync("mv", [stagedUpdate.path, target]);
    try {
      execFileSync("xattr", ["-dr", "com.apple.quarantine", target]);
    } catch {
      /* nothing to strip */
    }
    app.relaunch();
    app.quit();
    // relaunch only spawns once this process exits, so a quit that stalls
    // leaves the user with an app that swapped itself on disk and never came
    // back — indistinguishable, from the outside, from a broken update.
    // Nothing here should block, but the cost of being wrong is high and the
    // cost of the guard is one timer.
    setTimeout(() => app.exit(0), 4000).unref();
    return { ok: true };
  } catch (err) {
    browserShuttingDown = false;
    const message = err instanceof Error ? err.message : String(err);
    send("update:error", { message });
    return { ok: false, error: message };
  }
}

// ── Secret redaction at the display boundary ─────────────────────────
// Known local secret VALUES (the Unbiased API key). Every engine event
// forwarded to the renderer passes through send(), so masking here
// guarantees a leaked key never renders in the UI or lands in the
// transcript cache — even when a command's output echoes it. This is
// display-layer only: the engine talks to the gateway directly, so what
// the MODEL sees cannot be filtered from this process.
let knownSecrets: string[] | null = null;
function loadKnownSecrets(): string[] {
  if (knownSecrets) return knownSecrets;
  const vals: string[] = [];
  const stored = readStoredKey();
  // Length floor: never build a replacer from a trivial string that could
  // mangle ordinary text.
  if (stored && stored.key.length >= 12) vals.push(stored.key);
  knownSecrets = vals;
  return vals;
}
/** Invalidate the redaction cache after a key change (login/logout). */
function resetKnownSecrets(): void {
  knownSecrets = null;
}

/** Mask known secret values anywhere in a JSON-serializable payload.
 *  Keys are base64url-ish (no JSON-escaped chars), so a straight replace
 *  on the serialized form is exact and catches every nesting depth. */
function redactSecrets<T>(payload: T): T {
  const secrets = loadKnownSecrets();
  if (!secrets.length) return payload;
  let s = JSON.stringify(payload);
  let hit = false;
  for (const sec of secrets) {
    if (s.includes(sec)) {
      hit = true;
      s = s.split(sec).join("•••unbiased-api-key•••");
    }
  }
  return hit ? (JSON.parse(s) as T) : payload;
}

function send(channel: string, payload: unknown): void {
  const safe = redactSecrets(payload);
  win?.webContents.send(channel, safe);
  if (!channel.startsWith("chat:") || !safe || typeof safe !== "object") return;
  const source = (safe as { paneId?: unknown }).paneId;
  if (typeof source !== "string") return;
  for (const paneId of multiViewRecipients(panes, source)) {
    const pane = panes[paneId];
    if (channel === "chat:turn-started") pane.turnId = (safe as { turnId?: string }).turnId ?? null;
    if (channel === "chat:turn-completed") pane.turnId = null;
    win?.webContents.send(channel, { ...safe, paneId });
  }
}

function petPreferencesFile(): string {
  return join(app.getPath("userData"), "pet-window.json");
}

function savePetPreferences(): void {
  try {
    writeFileSync(petPreferencesFile(), JSON.stringify(petPreferences));
  } catch (error) {
    console.warn("[pet] could not save preferences:", error);
  }
}

function palsSettings(): PalsSettings {
  return {
    visible: petPreferences.visible,
    selected: petPreferences.selection ?? "robot",
    scale: petScale(petPreferences.scale),
    choices: [...ROBOT_PALS],
  };
}

function selectPal(id: string): { ok: boolean; settings: PalsSettings } {
  if (!isPalSelection(id)) return { ok: false, settings: palsSettings() };
  petPreferences.selection = id;
  savePetPreferences();
  if (petPreferences.visible) createPetWindow();
  updatePet();
  return { ok: true, settings: palsSettings() };
}

function updatePet(): void {
  if (!petWin || petWin.isDestroyed()) return;
  petWin.webContents.send("pet:update", {
    state: petActivity.state,
    runningCount: petActivity.runningCount,
    completedActions: petActivity.completedActions,
    completedThreads: petActivity.completedThreads,
    inFlightActions: petActivity.inFlightActions,
    selection: petPreferences.selection ?? "robot",
    scale: petScale(petPreferences.scale),
  });
}

function hidePetNotice(): void {
  if (petNoticeTimer) clearTimeout(petNoticeTimer);
  petNoticeTimer = null;
  petNotices = [];
  if (petNoticeWin && !petNoticeWin.isDestroyed()) petNoticeWin.hide();
}

function positionPetNotice(): void {
  if (!petWin || petWin.isDestroyed() || !petNoticeWin || petNoticeWin.isDestroyed() || !petNotices.length) return;
  const bounds = petWin.getBounds();
  const area = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }).workArea;
  petNoticeWin.setBounds(petNoticeStackBounds(bounds, area, petNotices.length));
}

function updatePetNoticeWindow(): void {
  if (!petNoticeWin || petNoticeWin.isDestroyed()) return;
  if (!petNotices.length) {
    petNoticeWin.hide();
    return;
  }
  positionPetNotice();
  if (petNoticeWin.webContents.isLoading()) return;
  petNoticeWin.webContents.send("pet:notice", petNotices.map(({ expiresAt: _expiresAt, ...notice }) => notice));
  petNoticeWin.showInactive();
}

function schedulePetNoticeExpiry(): void {
  if (petNoticeTimer) clearTimeout(petNoticeTimer);
  petNoticeTimer = null;
  if (!petNotices.length) return;
  const nextExpiry = Math.min(...petNotices.map((notice) => notice.expiresAt));
  petNoticeTimer = setTimeout(() => {
    petNotices = petNotices.filter((notice) => notice.expiresAt > Date.now());
    updatePetNoticeWindow();
    schedulePetNoticeExpiry();
  }, Math.max(1, nextExpiry - Date.now()));
}

function clearVisiblePetNotices(): void {
  if (!win?.isFocused() || !petNotices.length) return;
  const remaining = petNotices.filter((notice) =>
    shouldShowCompletedPetNotice(notice.threadId, true, visiblePetThreadIds, visiblePetPaneIds, panes));
  if (remaining.length === petNotices.length) return;
  petNotices = remaining;
  updatePetNoticeWindow();
  schedulePetNoticeExpiry();
}

function showPetNotice(notice: { threadId: string; title: string; response: string }): void {
  if (!petWin || petWin.isDestroyed() || !petWin.isVisible() || !petReadiness?.isReady) return;
  petNotices = [{ ...notice, id: ++nextPetNoticeId, expiresAt: Date.now() + PET_NOTICE_DURATION_MS }, ...petNotices];
  if (!petNoticeWin || petNoticeWin.isDestroyed()) {
    petNoticeWin = new BrowserWindow({
      ...PET_NOTICE_SIZE,
      ...(process.platform === "darwin" ? { type: "panel" } : {}),
      frame: false,
      transparent: true,
      resizable: false,
      fullscreenable: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, "../preload/petNotice.js"),
        sandbox: true,
        partition: "unbiased-pet-overlay",
        zoomMode: "isolated",
        zoomFactor: 1,
      },
    });
    petNoticeWin.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") petNoticeWin.setVisibleOnAllWorkspaces(true, PET_WORKSPACE_OPTIONS);
    petNoticeWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    petNoticeWin.webContents.on("will-navigate", (event) => event.preventDefault());
    petNoticeWin.webContents.on("did-finish-load", () => {
      if (!petNoticeWin || petNoticeWin.isDestroyed()) return;
      petNoticeWin.webContents.setZoomFactor(1);
      updatePetNoticeWindow();
    });
    petNoticeWin.on("closed", () => { petNoticeWin = null; });
    if (process.env.ELECTRON_RENDERER_URL) {
      void petNoticeWin.loadURL(new URL("pet-notice.html", process.env.ELECTRON_RENDERER_URL).toString());
    } else {
      void petNoticeWin.loadFile(join(__dirname, "../renderer/pet-notice.html"));
    }
  } else {
    updatePetNoticeWindow();
  }
  schedulePetNoticeExpiry();
}

function latestPetReply(thread: WireThread): string {
  return latestPetResponse(thread.turns?.at(-1)?.items ?? []);
}

async function showCompletedPetNotice(threadId: string, reply: string, streamedReply: string, version: number): Promise<void> {
  if (!petWin || petWin.isDestroyed()) return;
  const sideRecord = sideChatRecents.forThread(threadId);
  let title = sideRecord?.title ?? petThreadTitles.get(threadId) ?? "New chat";
  let cwd = threadCwds.get(threadId) ?? null;
  try {
    const result = await engine.request("thread/read", { threadId, includeTurns: true }) as { thread: WireThread };
    const updatedTitle = threadTitle(result.thread);
    if (!sideRecord && updatedTitle !== "New chat") title = updatedTitle;
    cwd = result.thread.cwd ?? cwd;
    if (!reply.trim()) reply = latestPetReply(result.thread);
  } catch { /* Keep the title and response already captured from events. */ }
  if (!reply.trim()) reply = streamedReply;
  if (version !== petNoticeVersion || !petWin || petWin.isDestroyed()) return;
  if (!shouldShowCompletedPetNotice(threadId, win?.isFocused() ?? false, visiblePetThreadIds, visiblePetPaneIds, panes)) return;
  const project = threadProject(threadId, cwd);
  showPetNotice({ threadId, title: project ? `${project.name} / ${title}` : title, response: petResponseFirstLine(reply) });
}

function petStarted(key: string): void {
  if (petSettleTimer) clearTimeout(petSettleTimer);
  petSettleTimer = null;
  petActivity.start(key);
  updatePet();
}

function petFinished(key: string, status: "completed" | "failed" | "interrupted"): void {
  const before = petActivity.runningCount;
  petActivity.finish(key, status);
  if (before === petActivity.runningCount) return;
  updatePet();
  if (petActivity.runningCount > 0 || petActivity.state === "idle") return;
  if (petSettleTimer) clearTimeout(petSettleTimer);
  petSettleTimer = setTimeout(() => {
    petActivity.clearRecent();
    petSettleTimer = null;
    updatePet();
  }, 6000);
}

function petPosition(): { x: number; y: number } {
  const saved = petPreferences;
  const size = petWindowSize(petScale(saved.scale));
  const hasSavedPosition = typeof saved.x === "number" && typeof saved.y === "number";
  const display = hasSavedPosition
    ? screen.getDisplayNearestPoint({ x: saved.x!, y: saved.y! })
    : win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const area = display.workArea;
  return hasSavedPosition
    ? clampPetPosition({ x: saved.x!, y: saved.y! }, size, area)
    : initialPetPosition(size, area);
}

function setPetScale(scale: PetScale): void {
  petPreferences.scale = scale;
  if (petWin && !petWin.isDestroyed()) {
    const old = petWin.getBounds();
    const size = petWindowSize(scale);
    const area = screen.getDisplayNearestPoint({ x: old.x + old.width - 1, y: old.y + old.height - 1 }).workArea;
    const position = clampPetPosition({ x: old.x + old.width - size.width, y: old.y + old.height - size.height }, size, area);
    petPreferences.x = position.x;
    petPreferences.y = position.y;
    petWin.setBounds({ ...position, ...size });
    positionPetNotice();
    updatePet();
  }
  savePetPreferences();
}

function updatePetHover(force = false): void {
  if (!petWin || petWin.isDestroyed()) return;
  // Electron drag regions suppress DOM hover events over the pet artwork.
  const hovered = pointInPetWindow(screen.getCursorScreenPoint(), petWin.getBounds());
  if (hovered === petHovered && !force) return;
  petHovered = hovered;
  petWin.webContents.send("pet:hover", hovered);
}

function stopPetHoverTracking(): void {
  if (petHoverTimer) clearInterval(petHoverTimer);
  petHoverTimer = null;
  if (petMotionTimer) clearTimeout(petMotionTimer);
  petMotionTimer = null;
  petHovered = false;
}

function hidePet(): void {
  petNoticeVersion++;
  hidePetNotice();
  stopPetHoverTracking();
  if (petSaveTimer) clearTimeout(petSaveTimer);
  petSaveTimer = null;
  petPreferences.visible = false;
  petReadiness?.hide();
  savePetPreferences();
}

function createPetWindow(): void {
  if (petWin && !petWin.isDestroyed()) {
    if (petPreferences.visible) return;
    petPreferences.visible = true;
    savePetPreferences();
    petReadiness?.show();
    return;
  }
  petPreferences.visible = true;
  savePetPreferences();
  petWin = new BrowserWindow({
    ...petPosition(),
    ...petWindowSize(petScale(petPreferences.scale)),
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../preload/pet.js"),
      sandbox: true,
      partition: "unbiased-pet-overlay",
      backgroundThrottling: false,
      zoomMode: "isolated",
      zoomFactor: 1,
    },
  });
  petWin.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") petWin.setVisibleOnAllWorkspaces(true, PET_WORKSPACE_OPTIONS);
  const createdPetWindow = petWin;
  const readiness = new PetWindowReadiness({
    load: () => process.env.ELECTRON_RENDERER_URL
      ? createdPetWindow.loadURL(new URL("pet.html", process.env.ELECTRON_RENDERER_URL).toString())
      : createdPetWindow.loadFile(join(__dirname, "../renderer/pet.html")),
    show: () => {
      if (!petPreferences.visible || createdPetWindow.isDestroyed()) return;
      const position = petPosition();
      createdPetWindow.setPosition(position.x, position.y);
      createdPetWindow.showInactive();
      createdPetWindow.setPosition(position.x, position.y);
      if (!petHoverTimer) petHoverTimer = setInterval(updatePetHover, 120);
      updatePetHover(true);
    },
    hide: () => {
      if (!createdPetWindow.isDestroyed()) createdPetWindow.hide();
      stopPetHoverTracking();
      hidePetNotice();
    },
  });
  petReadiness = readiness;
  petWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  petWin.webContents.on("did-finish-load", () => {
    if (!createdPetWindow.isDestroyed()) createdPetWindow.webContents.setZoomFactor(1);
  });
  petWin.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument && readiness.isReady) readiness.failed();
  });
  petWin.webContents.on("will-navigate", (event) => event.preventDefault());
  petWin.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) readiness.failed();
  });
  petWin.webContents.on("render-process-gone", () => readiness.failed());
  let previousPosition = petWin.getBounds();
  petWin.on("will-move", (_event, bounds) => {
    petPreferences.x = bounds.x;
    petPreferences.y = bounds.y;
    if (petSaveTimer) clearTimeout(petSaveTimer);
    petSaveTimer = setTimeout(() => { petSaveTimer = null; savePetPreferences(); }, 300);
  });
  petWin.on("move", () => {
    if (!petWin || petWin.isDestroyed()) return;
    const bounds = petWin.getBounds();
    const { x, y } = bounds;
    const dx = x - previousPosition.x;
    const dy = y - previousPosition.y;
    previousPosition = bounds;
    if (process.platform === "linux") {
      petPreferences.x = x;
      petPreferences.y = y;
    }
    if (petNoticeWin?.isVisible()) positionPetNotice();
    if ((dx || dy) && pointInPetWindow(screen.getCursorScreenPoint(), bounds)) {
      const direction = Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
      petWin.webContents.send("pet:motion", direction);
      if (petMotionTimer) clearTimeout(petMotionTimer);
      petMotionTimer = setTimeout(() => {
        petMotionTimer = null;
        if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:motion", null);
      }, 220);
    }
    if (process.platform === "linux") {
      if (petSaveTimer) clearTimeout(petSaveTimer);
      petSaveTimer = setTimeout(() => { petSaveTimer = null; savePetPreferences(); }, 300);
    }
  });
  petWin.on("closed", () => {
    readiness.dispose();
    if (petWin !== createdPetWindow) return;
    petReadiness = null;
    stopPetHoverTracking();
    petWin = null;
  });
  readiness.show();
}

function showPetMenu(): void {
  const sizeMenu: MenuItemConstructorOptions[] = PET_SCALES.map((scale) => ({
    label: `${Math.round(scale * 100)}%`,
    type: "radio",
    checked: petScale(petPreferences.scale) === scale,
    click: () => setPetScale(scale),
  }));
  Menu.buildFromTemplate([
    ...ROBOT_PALS.map((pal): MenuItemConstructorOptions => ({
      label: pal.name,
      type: "radio",
      checked: (petPreferences.selection ?? "robot") === pal.id,
      click: () => selectPal(pal.id),
    })),
    { type: "separator" },
    { label: "Pal Size", submenu: sizeMenu },
    { type: "separator" },
    { label: "Hide Desktop Pal", click: hidePet },
  ]).popup({ window: petWin ?? win ?? undefined });
}

function installAppMenu(): void {
  const command = (name: string) => () => send("app:menu-command", name);
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Chat", accelerator: "CommandOrControl+N", click: command("new-chat") },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Show Main Chat", accelerator: "CommandOrControl+1", click: command("show-main-chat") },
        { label: "Show Side Panel", accelerator: "CommandOrControl+2", click: command("show-side-panel") },
        { label: "Toggle Sidebar", accelerator: "CommandOrControl+B", click: command("toggle-sidebar") },
        { type: "separator" },
        { label: "Show Desktop Pal", click: createPetWindow },
        { label: "Hide Desktop Pal", click: hidePet },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Launcher icon (rasterized from resources/icon.svg). In development it
 *  lives in the repo; packaged builds must ship it via extraResources. */
function resolveIconPath(): string {
  return productionBuild()
    ? join(process.resourcesPath, "icon.png")
    : join(app.getAppPath(), "resources", "icon.png");
}

/** Remembered window bounds, so the app reopens at the size/place the user
 *  left it. Falls back to a large default sized to the current display. */
function windowStateFile(): string {
  return join(app.getPath("userData"), "window-state.json");
}
function loadWindowBounds(): { width: number; height: number; x?: number; y?: number } {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  // Default: fill most of the screen, capped so it isn't unwieldy on huge
  // monitors and never smaller than a usable floor.
  const fallback = {
    width: Math.max(1100, Math.min(1680, Math.round(sw * 0.85))),
    height: Math.max(720, Math.min(1050, Math.round(sh * 0.88))),
  };
  try {
    const saved = JSON.parse(readFileSync(windowStateFile(), "utf8")) as {
      width?: number;
      height?: number;
      x?: number;
      y?: number;
    };
    // Only trust saved bounds that still fit on some connected display.
    if (
      typeof saved.width === "number" &&
      typeof saved.height === "number" &&
      saved.width >= 800 &&
      saved.height >= 600
    ) {
      const onScreen =
        saved.x === undefined ||
        saved.y === undefined ||
        screen.getAllDisplays().some((d) => {
          const b = d.workArea;
          return saved.x! < b.x + b.width && saved.x! + 100 > b.x && saved.y! < b.y + b.height && saved.y! + 40 > b.y;
        });
      return onScreen ? { ...fallback, ...saved } : { width: saved.width, height: saved.height };
    }
  } catch {
    // no saved state
  }
  return fallback;
}

function createWindow(): void {
  const iconPath = resolveIconPath();
  // macOS ignores BrowserWindow icons — the dock owns the launcher icon.
  if (process.platform === "darwin" && existsSync(iconPath)) {
    app.dock?.setIcon(iconPath);
  }
  const bounds = loadWindowBounds();
  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined && bounds.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 800,
    minHeight: 600,
    title: "Unbiased",
    ...(process.platform !== "darwin" && existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: { preload: join(__dirname, "../preload/index.js") },
  });
  win.on("closed", () => {
    if (petSaveTimer) clearTimeout(petSaveTimer);
    petSaveTimer = null;
    savePetPreferences();
    if (petWin && !petWin.isDestroyed()) petWin.destroy();
    petWin = null;
  });
  if (bounds.x === undefined) win.center();

  // Persist size/position (debounced) so the next launch restores them.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persistBounds = () => {
    if (!win || win.isDestroyed()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (win && !win.isDestroyed()) writeFileSync(windowStateFile(), JSON.stringify(win.getBounds()));
      } catch {
        // best-effort
      }
    }, 400);
  };
  win.on("resize", persistBounds);
  win.on("move", persistBounds);
  win.webContents.on("did-start-loading", clearBrowserViews);
  win.webContents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    visiblePetThreadIds = new Set();
    visiblePetPaneIds = new Set();
  });

  // Coming back to the app is the moment a new release should surface.
  win.on("focus", () => {
    clearVisiblePetNotices();
    if (stagedUpdate) return; // already downloaded; nothing to re-check
    if (Date.now() - lastUpdateCheck < UPDATE_FOCUS_THROTTLE_MS) return;
    void checkForUpdate();
  });
  // Links in rendered markdown are real anchors now — route them to the
  // system browser instead of navigating (or spawning) app windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("context-menu", (_event, params) => {
    if (!params.linkURL) return;
    let url: URL;
    try { url = new URL(params.linkURL); } catch { return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    Menu.buildFromTemplate([
      { label: "Open in default browser", click: () => void shell.openExternal(url.href) },
      { label: "Copy link address", click: () => clipboard.writeText(url.href) },
    ]).popup({ window: win ?? undefined });
  });
  win.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame && !registeredInteractiveVisualId(event.url) && !isInteractiveVisualPreviewUrl(event.url)) {
      event.preventDefault();
    }
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (/^https?:/.test(url) && !url.startsWith("http://localhost")) {
      e.preventDefault();
      void shell.openExternal(url);
      return;
    }
    // Anything that is not this app and not an outward link is refused.
    // Previously only http(s) was considered, which left file:// through — and
    // a file:// navigation is exactly what a dropped file produces when no
    // handler claims it. The renderer swallows those first (see main.tsx), so
    // this is the second line rather than the first, but the failure it guards
    // against is the app replacing itself with the contents of a dropped file
    // and no way back short of reopening the window.
    const own = process.env.ELECTRON_RENDERER_URL ?? `file://${join(__dirname, "../renderer/index.html")}`;
    if (!/^https?:/.test(url) && url !== own) {
      console.warn("[window] blocked navigation to", url.slice(0, 120));
      e.preventDefault();
    }
  });
  // A dead render frame is never recreated by Electron, and every send into
  // it throws "Render frame was disposed" — so a single native crash used to
  // cost the whole session: a white window, a healthy main process, and no
  // way back short of quitting. Reload instead. When to STOP reloading is the
  // only judgement here, and it lives in ./crash-recovery where it is tested.
  const crashRecovery = new RendererCrashRecovery();
  win.webContents.on("render-process-gone", (_event, details) => {
    const decision = crashRecovery.onGone(details.reason);
    console.warn(
      `[window] renderer gone (${details.reason}, exit ${details.exitCode}) — ${decision.action}`,
    );
    if (decision.action === "ignore" || !win || win.isDestroyed()) return;
    // Out of the event handler before touching the webContents that just died.
    if (decision.action === "reload") {
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.webContents.reload();
      }, 0);
      return;
    }
    void dialog
      .showMessageBox(win, {
        type: "error",
        title: "Unbiased stopped responding",
        message: "The window keeps crashing.",
        detail:
          `The interface crashed ${decision.attempts} times in under a minute (${details.reason}). ` +
          `Your conversations are saved either way.`,
        buttons: ["Reload", "Quit"],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) {
          app.quit();
          return;
        }
        // The user chose to try again knowing it has been looping.
        crashRecovery.reset();
        if (win && !win.isDestroyed()) win.webContents.reload();
      });
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Server-initiated approval requests awaiting a human decision, keyed by a
// string handle the renderer can safely round-trip. The owning thread is
// kept so the card can be retired when that thread's turn dies (interrupt,
// failure) — the engine drops the request server-side and would never
// answer a late decision.
type ApprovalDecision = "accept" | "acceptForSession" | "decline";
type PendingApproval = { threadId: string | null } & (
  | { kind: "engine"; rpcId: number | string }
  // An MCP tool call. codex gates every one behind
  // mcpServer/elicitation/request and expects {action}, NOT the {decision}
  // every other approval answers with. Answering with {decision} does not
  // merely get refused — it fails to deserialize server-side, and the call
  // comes back to the user as "user rejected MCP tool call", blaming them
  // for a choice they were never shown. Verified against engine 0.147.0.
  | { kind: "elicitation"; rpcId: number | string }
  // Client-executed tools (the agent browser) need the same card, but the
  // decision resolves a promise here instead of answering an engine RPC.
  | { kind: "local"; settle: (decision: ApprovalDecision) => void }
);
const pendingApprovals = new Map<string, PendingApproval>();
type PendingUserInput = { threadId: string | null; request: UserInputRequest } & (
  | { kind: "local"; settle: (values: Record<string, UserInputValue> | null) => void }
  | { kind: "codex" | "mcp"; rpcId: number | string }
);
const pendingUserInputs = new Map<string, PendingUserInput>();
let nextUserInput = 1;
let nextLocalApproval = 1;
// Approval handles are persisted in the transcript, so a card outlives the
// process that created it. Counters restart at 1 every boot, which means a
// card restored from a previous run could carry the SAME id as a live request
// in this one — and answering the stale card would silently answer the new
// request instead. The boot nonce makes that collision impossible: an id from
// a previous run can never match one from this run.
const APPROVAL_BOOT = Math.random().toString(36).slice(2, 8);
// Approval handles are minted here, never derived from the engine's JSON-RPC
// id. Keying the map on `apr_${msg.id}` let a reused id overwrite a live
// entry: the first rpcId was orphaned so that turn waited on a reply that
// could never come, and an Allow click landed on a different request than the
// card described. The rpcId is data we answer with, not identity.
let nextEngineApproval = 1;

function deliverUserInput(request: UserInputRequest, pending: PendingUserInput): void {
  pendingUserInputs.set(request.requestId, pending);
  const sub = pending.threadId ? subAgents.get(pending.threadId) : undefined;
  const target = sub ? sub.parent : pending.threadId;
  const tagged = sub ? { ...request, agentName: sub.name } : request;
  const paneId = target ? paneForThread(target) : null;
  if (paneId) send("chat:user-input-request", { paneId, ...tagged });
  else if (!target) send("chat:user-input-request", { paneId: "main", ...tagged });
}

async function handleAskUser(rawArgs: unknown, threadId: string | null): Promise<DynamicToolResponse> {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs as Record<string, unknown> : {};
  const fields = agentInputFields(args.questions);
  if (!fields) return {
    contentItems: [{ type: "inputText", text: "ask_user needs 1-3 valid questions with unique ids." }],
    success: false,
  };
  const request: UserInputRequest = {
    requestId: `input_${APPROVAL_BOOT}_${nextUserInput++}`,
    title: "The agent has a question",
    source: "agent",
    fields,
  };
  const values = await new Promise<Record<string, UserInputValue> | null>((settle) => {
    deliverUserInput(request, { kind: "local", threadId, request, settle });
  });
  return {
    contentItems: [{ type: "inputText", text: values === null
      ? "The user canceled this question. Do not assume an answer."
      : JSON.stringify({ answers: values }) }],
    success: values !== null,
  };
}

/** Raise a Permissions card for work this process is about to do itself, and
 *  wait for the human. Routed exactly like an engine approval: a sub-agent's
 *  request surfaces in its PARENT's pane, and a backgrounded conversation
 *  holds it until reopened. */
function requestLocalApproval(
  threadId: string | null,
  command: string,
  reason: string,
  options: { allowForSession?: boolean; kind?: "command" | "computer" } = {},
): Promise<ApprovalDecision> {
  const requestId = `apr_${APPROVAL_BOOT}_local_${nextLocalApproval++}`;
  return new Promise((resolve) => {
    pendingApprovals.set(requestId, { kind: "local", threadId, settle: resolve });
    const sub = threadId ? subAgents.get(threadId) : undefined;
    const target = sub ? sub.parent : threadId;
    const payload: Record<string, unknown> = {
      requestId,
      kind: options.kind ?? "command",
      itemId: requestId,
      command,
      cwd: null,
      reason,
      allowForSession: options.allowForSession ?? true,
      ...(sub ? { agentName: sub.name } : {}),
    };
    const paneId = target ? paneForThread(target) : null;
    if (paneId) {
      send("chat:approval-request", { paneId, ...payload });
    } else if (target) {
      const held = heldApprovals.get(target) ?? [];
      held.push(payload);
      heldApprovals.set(target, held);
    } else {
      send("chat:approval-request", { paneId: "main", ...payload });
    }
  });
}

/** The conversation a thread belongs to — sub-agent grants follow the root,
 *  so one approval covers the agent and everything it spawns. */
function rootThreadOf(threadId: string | null): string {
  let id = threadId ?? "main";
  for (let hops = 0; hops < 8; hops++) {
    const sub = subAgents.get(id);
    if (!sub) break;
    id = sub.parent;
  }
  return id;
}

// Live PTYs for the integrated terminal, keyed by handle.
const ptys = new Map<string, IPty>();
// Staged downloads and unpacked archives, removed on quit so a skill the user
// rejected leaves nothing behind. Module scope because window-all-closed —
// which does the cleaning — lives outside the whenReady closure.
const skillStages = new Set<string>();
let nextPtyId = 1;

// The in-page annotation picker, injected with executeJavaScript. Runs
// entirely inside the page: hover-highlight → click to pick an element →
// inline comment bubble → the returned promise resolves with the pick
// (or null on Escape), which is exactly when executeJavaScript resolves.
const ANNOTATE_PICKER = `
(() => {
  if (window.__unbiasedPick) return window.__unbiasedPick;
  window.__unbiasedPick = new Promise((resolve) => {
    const Z = 2147483646;
    const hl = document.createElement('div');
    hl.style.cssText = 'position:fixed;z-index:' + Z + ';pointer-events:none;border:2px solid #FF563F;border-radius:4px;background:rgba(255,86,63,0.08);left:-9999px;top:0';
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;z-index:' + (Z + 1) + ';pointer-events:none;width:22px;height:22px;border-radius:50% 50% 50% 4px;background:#FF563F;left:-9999px;top:0';
    document.documentElement.append(hl, badge);
    let current = null;
    const cleanup = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      hl.remove(); badge.remove();
    };
    const done = (val) => { cleanup(); delete window.__unbiasedPick; resolve(val); };
    const onMove = (e) => {
      badge.style.left = (e.clientX + 10) + 'px';
      badge.style.top = (e.clientY - 28) + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === hl || el === badge) return;
      current = el;
      const r = el.getBoundingClientRect();
      hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px';
      hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    const onClick = (e) => {
      if (!current) return;
      e.preventDefault(); e.stopPropagation();
      const el = current;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      badge.remove();
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;z-index:' + (Z + 1) + ';display:flex;align-items:center;gap:6px;background:#26262b;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,0.5);padding:5px 6px 5px 14px;left:' +
        Math.max(8, Math.min(r.left + r.width / 2 - 140, innerWidth - 300)) + 'px;top:' + Math.max(8, r.top - 48) + 'px';
      const input = document.createElement('input');
      input.placeholder = 'Add an optional comment…';
      input.style.cssText = 'background:transparent;border:none;outline:none;color:#eee;font:13px -apple-system,sans-serif;width:200px';
      const ok = document.createElement('button');
      ok.textContent = '\\u2713';
      ok.style.cssText = 'background:#FF563F;color:#fff;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:13px;line-height:1';
      box.append(input, ok);
      document.documentElement.append(box);
      input.focus();
      const finish = () => {
        const text = (el.innerText || el.textContent || '').trim().slice(0, 1500);
        box.remove();
        done({ text, comment: input.value.trim(), url: location.href, title: document.title, tag: el.tagName.toLowerCase() });
      };
      ok.addEventListener('click', finish);
      input.addEventListener('keydown', (ke) => {
        ke.stopPropagation();
        if (ke.key === 'Enter') finish();
        if (ke.key === 'Escape') { box.remove(); done(null); }
      });
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
  });
  return window.__unbiasedPick;
})()
`;

/** Run the picker in the browser page; forward a completed pick to the
 *  renderer as a main-composer annotation carrying page provenance. */
async function startAnnotatePicker(id: number): Promise<void> {
  const wc = browserViews.get(id)?.webContents;
  if (!wc || wc.isDestroyed()) return;
  try {
    const result = (await wc.executeJavaScript(ANNOTATE_PICKER, true)) as {
      text: string;
      comment: string;
      url: string;
      title: string;
      tag: string;
    } | null;
    if (result?.text) {
      // The page thumbnail rides along, Codex-style, for the sent-message
      // annotation card. Best-effort — a failed capture drops the image.
      let thumb: string | undefined;
      try {
        thumb = thumbDataUrl(await wc.capturePage(), 360);
      } catch {
        thumb = undefined;
      }
      send("browser:annotate", {
        text: `${result.text}\n\n(from ${result.title || "page"} — ${result.url})`,
        comment: result.comment || undefined,
        tag: result.tag,
        thumb,
      });
    }
  } catch {
    // Navigation mid-pick destroys the page context; the pick just ends.
  }
}

// The embedded browser: sandboxed WebContentsViews layered over the side
// panel, one per renderer browser tab, keyed by the tab's id. The renderer
// owns the toolbars and reports each placeholder's bounds; this side owns
// navigation and pushes state back tagged with the id.
const browserViews = new Map<number, WebContentsView>();
const browserVisibility = new Map<number, boolean>();
const browserViewBounds = new Map<number, { x: number; y: number; width: number; height: number }>();

function offscreenBrowserBounds(bounds: { width: number; height: number }) {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  return { x: -width - 1, y: -height - 1, width, height };
}

function setBrowserViewVisible(id: number, view: WebContentsView, visible: boolean): void {
  if (!win || win.isDestroyed()) return;
  if (visible) {
    if (!win.contentView.children.includes(view)) win.contentView.addChildView(view);
    const bounds = browserViewBounds.get(id);
    if (bounds) view.setBounds(bounds);
    view.setVisible(true);
  } else {
    view.setVisible(false);
    // Keep the native layer mounted to avoid a flash on return, but move its
    // hit area away from renderer menus while preserving its page viewport.
    view.setBounds(offscreenBrowserBounds(browserViewBounds.get(id) ?? view.getBounds()));
  }
}

function clearBrowserViews(): void {
  for (const view of browserViews.values()) {
    win?.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
  browserViews.clear();
  browserVisibility.clear();
  browserViewBounds.clear();
}

function ensureBrowserView(id: number): WebContentsView {
  const existing = browserViews.get(id);
  if (existing) return existing;
  const view = new WebContentsView({ webPreferences: { sandbox: true } });
  view.setVisible(false);
  view.setBounds(offscreenBrowserBounds(browserViewBounds.get(id) ?? { width: 1, height: 1 }));
  win?.contentView.addChildView(view);
  browserViews.set(id, view);
  if (browserVisibility.get(id)) setBrowserViewVisible(id, view, true);
  const wc = view.webContents;
  const pushState = () => {
    if (wc.isDestroyed()) return;
    send("browser:state", {
      id,
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
    });
  };
  wc.on("did-navigate", pushState);
  wc.on("did-navigate-in-page", pushState);
  wc.on("page-title-updated", pushState);
  wc.on("did-start-loading", pushState);
  wc.on("did-stop-loading", pushState);
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) send("browser:open-link", { url });
    return { action: "deny" };
  });
  const handOffStripeOnboarding = (event: Electron.Event, url: string) => {
    if (!isStripeOnboardingPage(url, !app.isPackaged)) return;
    event.preventDefault();
    void shell.openExternal(url);
  };
  wc.on("will-navigate", handOffStripeOnboarding);
  wc.on("will-redirect", handOffStripeOnboarding);

  // Right-click menu, Codex-style. "Add … to chat" stages the selection
  // or link as an annotation in the main composer.
  wc.on("context-menu", (_e, params) => {
    const selection = params.selectionText.trim();
    const link = params.linkURL;
    const items: (MenuItemConstructorOptions | null)[] = [
      selection
        ? { label: "Quick annotate", click: () => send("browser:annotate", { text: selection, tag: "selection" }) }
        : link
          ? { label: "Quick annotate", click: () => send("browser:annotate", { text: link, tag: "link" }) }
          : null,
      { label: "Annotate", click: () => void startAnnotatePicker(id) },
      { type: "separator" },
      link && /^https?:\/\//i.test(link)
        ? { label: "Open link in new tab", click: () => send("browser:open-link", { url: link }) }
        : null,
      link ? { label: "Open in external browser", click: () => void shell.openExternal(link) } : null,
      { type: "separator" },
      link ? { label: "Copy link address", click: () => clipboard.writeText(link) } : null,
      selection ? { label: "Copy", click: () => wc.copy() } : null,
      link ? { label: "Save Link As…", click: () => wc.downloadURL(link) } : null,
      { type: "separator" },
      { label: "Inspect", click: () => wc.inspectElement(params.x, params.y) },
    ];
    // Drop the nulls, then collapse the separator runs they leave behind.
    const template = items
      .filter((i): i is MenuItemConstructorOptions => i !== null)
      .filter(
        (item, idx, arr) =>
          item.type !== "separator" || (idx > 0 && idx < arr.length - 1 && arr[idx - 1].type !== "separator"),
      );
    Menu.buildFromTemplate(template).popup({ window: win ?? undefined });
  });
  return view;
}

function wireNotifications(): void {
  engine.on("notification", (msg: { method: string; params?: Record<string, unknown> }) => {
    const params = msg.params ?? {};
    // Per-thread bookkeeping runs for EVERY notification; only the
    // pane-targeted sends require a pane to currently own the thread.
    const paneId = paneForThread(params.threadId);
    const threadId = typeof params.threadId === "string" ? params.threadId : null;
    switch (msg.method) {
      case "rawResponseItem/completed": {
        const raw = params.item as {
          type?: string;
          name?: string;
          namespace?: string;
          arguments?: string;
          author?: string;
          recipient?: string;
          content?: { type?: string; text?: string }[];
        } | undefined;
        if (!raw || !threadId) break;
        // The parent's spawn call carries the instructions the sub-agent
        // will be given — the only client-visible copy.
        if (
          raw.type === "function_call" &&
          raw.namespace === "collaboration" &&
          raw.name === "spawn_agent" &&
          typeof raw.arguments === "string"
        ) {
          try {
            const args = JSON.parse(raw.arguments) as { task_name?: string; message?: string };
            // task_name can arrive path-formed ("/root/x") — key by the last
            // segment, which is what registration looks up.
            const task = args.task_name?.split("/").filter(Boolean).pop();
            if (task && args.message) {
              pendingSpawnPrompts.set(`${threadId}:${task}`, args.message);
            }
          } catch {
            // unparseable args — no prompt preview
          }
          const callId = (params.item as { call_id?: string }).call_id;
          if (typeof callId === "string") pendingSpawnCalls.set(callId, threadId);
        }
        // Corrections/follow-ups: capture the text for the lifecycle row and
        // deliver it to the target's mailbox NOW — the engine holds queued
        // mail invisible until the sub's turn drains it.
        if (
          raw.type === "function_call" &&
          raw.namespace === "collaboration" &&
          (raw.name === "send_message" || raw.name === "followup_task") &&
          typeof raw.arguments === "string"
        ) {
          try {
            const args = JSON.parse(raw.arguments) as { target?: string; message?: string };
            const task = args.target?.split("/").filter(Boolean).pop();
            if (task && args.message) {
              pendingMessagePrompts.set(`${threadId}:${task}`, args.message);
              // The engine frees a closed agent's path for reuse, so the
              // same name can refer to a dead thread AND a live successor —
              // the LAST matching registration is the live one.
              let target: string | null = null;
              for (const [subId, info] of subAgents) {
                if (info.parent === threadId && (info.name === task || info.path.endsWith(`/${task}`))) {
                  target = subId;
                }
              }
              if (target) {
                const box = subAgentMail.get(target) ?? [];
                box.push({ at: Date.now() / 1000, author: "", text: args.message, preDelivered: true });
                if (box.length > MAIL_CAP) box.shift();
                subAgentMail.set(target, box);
                send("chat:subagent-activity", { threadId: target });
              }
            }
          } catch {
            // unparseable args
          }
        }
        // The spawn OUTPUT carries the engine-assigned nickname
        // ({"task_name": "...", "nickname": "Ramanujan"}). Rename the
        // registry entry and let the renderer retitle its rows.
        if (raw.type === "function_call_output") {
          const out = params.item as { call_id?: string; output?: unknown };
          const parent = typeof out.call_id === "string" ? pendingSpawnCalls.get(out.call_id) : undefined;
          if (parent && typeof out.output === "string") {
            pendingSpawnCalls.delete(out.call_id as string);
            try {
              const parsed = JSON.parse(out.output) as { task_name?: string; nickname?: string };
              const task = parsed.task_name?.split("/").filter(Boolean).pop();
              if (parsed.nickname && task) {
                // Path reuse: prefer the newest registration with this name.
                let match: [string, SubAgentInfo] | null = null;
                for (const entry of subAgents) {
                  if (entry[1].parent === parent && entry[1].name === task) match = entry;
                }
                const renamed = match !== null;
                if (match) {
                  const [subId, info] = match;
                  info.name = parsed.nickname;
                  pushSubAgents(parent);
                  const pane = paneForThread(parent);
                  if (pane) {
                    send("chat:subagent-event", {
                      paneId: pane,
                      event: "renamed",
                      name: parsed.nickname,
                      path: info.path,
                      agentThreadId: subId,
                    });
                  }
                }
                // Raws can precede subAgentActivity — stash for registration.
                if (!renamed) pendingNicknames.set(`${parent}:${task}`, parsed.nickname);
              }
            } catch {
              // not a spawn ack — ignore
            }
          }
        }
        // Mail addressed to a sub-agent thread: the task/message text.
        if (raw.type === "agent_message" && Array.isArray(raw.content)) {
          const text = raw.content
            .filter((c) => c?.type === "input_text" && typeof c.text === "string")
            .map((c) => c.text as string)
            .join("\n");
          if (text) {
            const { author, payload } = interAgentPayload(text);
            const box = subAgentMail.get(threadId) ?? [];
            // Corrections are pre-delivered from the sender's raw call while
            // the engine still has them queued: the drain-time copy CONSUMES
            // that flag rather than duplicating — and a repeated identical
            // message (two flags) correctly keeps both entries.
            const pending = box.find((m) => m.preDelivered && m.text === payload);
            if (pending) {
              delete pending.preDelivered;
              if (author ?? raw.author) pending.author = author ?? raw.author ?? pending.author;
            } else {
              box.push({ at: Date.now() / 1000, author: author ?? raw.author ?? "", text: payload });
              if (box.length > MAIL_CAP) box.shift();
              subAgentMail.set(threadId, box);
              send("chat:subagent-activity", { threadId });
            }
          }
        }
        break;
      }
      case "turn/started": {
        const turn = params.turn as { id?: string } | undefined;
        if (threadId && turn?.id) {
          // The judge governor treats "unknown" as busy; say so honestly, so
          // background judging can never compete with this turn for the
          // gateway's per-org concurrency.
          learning?.setIdle(false);
          runningTurns.set(threadId, turn.id);
          petReplies.set(threadId, { stream: "", last: "", final: "" });
          const petKey = petTurnActivityKey(threadId, scheduledRuns.get(threadId)?.key);
          if (petKey && !scheduledRuns.has(threadId)) petStarted(petKey);
          metrics.record({ ...metricNow(threadId), kind: "run", turn: turn.id, phase: "started", status: null } satisfies RunRecord);
          bgStream.delete(threadId);
          send("chat:thread-activity", { threadId, running: true });
          const sub = subAgents.get(threadId);
          if (sub) {
            sub.status = "running";
            pushSubAgents(sub.parent);
            send("chat:subagent-activity", { threadId });
          }
        }
        if (!paneId) break;
        if (turn?.id) panes[paneId].turnId = turn.id;
        send("chat:turn-started", { paneId, turnId: panes[paneId].turnId });
        break;
      }
      case "item/agentMessage/delta": {
        const delta = (params.delta as string) ?? "";
        if (threadId) {
          const reply = petReplies.get(threadId);
          if (reply) reply.stream = (reply.stream + delta).slice(0, 2000);
        }
        // Always accumulate — this is what seeds the transcript when a
        // backgrounded conversation is reopened mid-stream.
        if (threadId) bgStream.set(threadId, (bgStream.get(threadId) ?? "") + delta);
        if (paneId) send("chat:delta", { paneId, delta });
        // A sub-agent's reply streams to its viewer pane (if open).
        if (threadId && subAgents.has(threadId)) send("chat:subagent-delta", { threadId, delta });
        break;
      }
      case "item/commandExecution/outputDelta": {
        const itemId = params.itemId as string | undefined;
        const delta = params.delta as string | undefined;
        if (paneId && itemId && delta) send("chat:command-output", { paneId, itemId, delta });
        break;
      }
      case "item/started":
      case "item/completed": {
        // Phase tracking, to catch a turn that narrates and then stops.
        // `phase` distinguishes interim commentary from the terminal answer.
        // The engine's own note says providers emit it inconsistently and None
        // means UNKNOWN — so this only ever records what it positively sees,
        // and the check at turn end stays silent unless it saw commentary and
        // never saw a final answer.
        if (msg.method === "item/completed" && threadId) {
          const it = params.item as { type?: string; phase?: string | null } | undefined;
          if (it?.type === "agentMessage") {
            if (it.phase === "final_answer") turnSawFinalAnswer.add(threadId);
            else if (it.phase === "commentary") turnSawCommentary.add(threadId);
          }
        }
        const item = params.item as
          | { type?: string; id?: string; status?: string; changes?: { path?: string }[] }
          | undefined;
        const phase = msg.method === "item/started" ? "started" : "completed";
        if (threadId && item?.id && ["commandExecution", "dynamicToolCall", "mcpToolCall", "fileChange"].includes(item.type ?? "")) {
          const key = petTurnActivityKey(threadId, scheduledRuns.get(threadId)?.key);
          const changed = key && (phase === "started"
            ? petActivity.actionStarted(key, item.id)
            : petActivity.actionFinished(key, item.id, item.status !== "failed" && item.status !== "interrupted" && (item as { success?: boolean }).success !== false));
          if (changed) updatePet();
        }
        // A finished assistant message lands in the engine's history — the
        // partial-stream buffer for it is no longer needed.
        // Same shape as the replay case above: a message delivered whole, in
        // the chat-completions form. Nothing streamed it, so without this the
        // pane shows nothing at all — the agent looks like it stopped working
        // when in fact it had answered and finished the turn.
        if (item?.type === "message" && phase === "completed" && threadId) {
          const m = item as unknown as { role?: string; text?: string; content?: unknown };
          const text = m.text ?? contentToText(m.content);
          const reply = petReplies.get(threadId);
          if (reply && m.role !== "user") {
            reply.last = text || reply.stream;
            reply.stream = "";
          }
          // Skip the echo of the user's own message, and anything already
          // streamed — a delta-fed buffer means the pane has it.
          if (text && m.role !== "user" && !bgStream.get(threadId)) {
            if (paneId) {
              send("chat:delta", { paneId, delta: text });
              send("chat:message-boundary", { paneId });
            }
            if (subAgents.has(threadId)) send("chat:subagent-delta", { threadId, delta: text });
          }
          bgStream.delete(threadId);
        }
        if (item?.type === "agentMessage" && phase === "completed" && threadId) {
          const reply = petReplies.get(threadId);
          if (reply) {
            const message = item as typeof item & { text?: string; phase?: string | null };
            const text = message.text || reply.stream;
            if (message.phase === "final_answer") reply.final = text;
            else if (message.phase !== "commentary") reply.last = text;
            reply.stream = "";
          }
          bgStream.delete(threadId);
          // Message boundary: the next delta belongs to a NEW assistant
          // message. Multi-agent turns emit several messages per turn, and
          // without this they concatenate into one run-on paragraph.
          if (paneId) send("chat:message-boundary", { paneId });
        }
        // Sub-agent registry: the parent thread emits a subAgentActivity
        // marker per spawn/interaction. Runs even when the parent is
        // backgrounded — the roster must be current when it reopens.
        if (item?.type === "subAgentActivity" && phase === "completed" && threadId) {
          const p = params.item as { kind?: string; agentThreadId?: string; agentPath?: string };
          if (p.agentThreadId && p.agentPath) {
            const existing = subAgents.get(p.agentThreadId);
            const taskName = p.agentPath.split("/").filter(Boolean).pop() ?? p.agentThreadId;
            const promptKey = `${threadId}:${taskName}`;
            // started rows carry the spawn instructions; interacted rows the
            // send_message/followup text.
            const prompt =
              p.kind === "interacted"
                ? pendingMessagePrompts.get(promptKey)
                : pendingSpawnPrompts.get(promptKey);
            if (p.kind === "interacted") pendingMessagePrompts.delete(promptKey);
            else pendingSpawnPrompts.delete(promptKey);
            // The spawn-output raw (nickname) usually precedes registration.
            const stashedNickname = pendingNicknames.get(promptKey);
            if (stashedNickname !== undefined) pendingNicknames.delete(promptKey);
            const name = existing?.name && existing.name !== taskName ? existing.name : (stashedNickname ?? taskName);
            conversationLineage.register(p.agentThreadId,threadId);
            const parentMembership = projectMembership(threadId,threadCwds.get(threadId) ?? undefined);
            projectStore().assign(p.agentThreadId,parentMembership.projectId);
            subAgents.set(p.agentThreadId, {
              parent: threadId,
              path: p.agentPath,
              name,
              status: p.kind === "interrupted" ? "interrupted" : (existing?.status ?? "running"),
              // A fresh task re-arms the closed-row announcement.
              closedAnnounced: p.kind === "interacted" ? false : existing?.closedAnnounced,
            });
            pushSubAgents(threadId);
            // An approval that raced ahead of this registration was held
            // under the sub's own id, which no pane ever opens — re-route it
            // to the parent now or the spawn hangs on it forever.
            const stranded = heldApprovals.get(p.agentThreadId);
            if (stranded) {
              heldApprovals.delete(p.agentThreadId);
              const parentPane = paneForThread(threadId);
              for (const payload of stranded) {
                const tagged = { ...payload, agentName: name };
                if (parentPane) {
                  send("chat:approval-request", { paneId: parentPane, ...tagged });
                } else {
                  const held = heldApprovals.get(threadId) ?? [];
                  held.push(tagged);
                  heldApprovals.set(threadId, held);
                }
              }
            }
            // Lifecycle row in the parent's transcript, Codex-style
            // ("Created an agent" / "Messaged an agent" / …) — with the
            // spawn instructions when the raw call carried them.
            if (paneId) {
              send("chat:subagent-event", {
                paneId,
                event: p.kind ?? "started",
                name,
                path: p.agentPath,
                agentThreadId: p.agentThreadId,
                prompt: prompt ?? null,
              });
            }
          }
        }
        // A sub-agent's own items (replies, commands) refresh its viewer.
        if (threadId && subAgents.has(threadId) && phase === "completed") {
          send("chat:subagent-activity", { threadId });
        }
        if (item?.type === "contextCompaction" && threadId) {
          updateThreadCompaction(threadId, phase === "started" ? "started" : "completed");
        }
        if (item?.type === "contextCompaction" && phase === "completed" && threadId && !subAgents.has(threadId)) {
          completedTurnsSinceMemory.set(threadId, 0);
          scheduleAutomaticMemory(threadId, "compaction");
        }
        if (!paneId) break; // history holds these for a backgrounded thread
        if (item?.type === "commandExecution") {
          send("chat:command", { paneId, phase, item: { ...(item as object), source: "shell" } });
          // Both halves: the command attempted, and how it ended. The
          // sidecar's reward model reads the exit code, and its
          // repeated-failed-command signal needs the call text to normalise.
          const ce = item as { command?: string; status?: string; exitCode?: number; aggregatedOutput?: string };
          if (phase === "started") {
            observeLearning("tool_call", threadId, ce.command ?? "(command)", { argsSummary: ce.command ?? "" });
            recordMeasuredPaths(threadId, ce.command ?? "");
          } else if (phase === "completed") {
            observeLearning("tool_output", threadId, ce.command ?? "(command)", {
              exitCode: typeof ce.exitCode === "number" ? ce.exitCode : 0,
              commandSummary: ce.command ?? "",
            });
          }
        } else if (item?.type === "dynamicToolCall") {
          // Dynamic tool calls render as command-style cards.
          const d = item as { id?: string; tool?: string; arguments?: unknown; status?: string; success?: boolean };
          send("chat:command", {
            paneId,
            phase,
            item: {
              id: d.id,
              command: dynamicToolCommandText(d.tool, d.arguments),
              source: dynamicToolSource(d.tool),
              ...(axStepIcon(d.tool, d.arguments) ? { appIcon: axStepIcon(d.tool, d.arguments) } : {}),
              // A started call is in progress — defaulting to "completed"
              // showed a green "done" for a page still loading.
              status:
                d.success === false
                  ? "failed"
                  : (d.status ?? (phase === "started" ? "inProgress" : "completed")),
            },
          });
        } else if (item?.type === "mcpToolCall") {
          // MCP tool calls render as command-style cards, like the browser
          // tools above. Status comes straight from the engine, which reports
          // inProgress / completed / failed.
          const t = item as unknown as {
            id?: string;
            server?: string;
            tool?: string;
            arguments?: unknown;
            status?: string;
            error?: { message?: string } | null;
          };
          const margs = t.arguments && typeof t.arguments === "object" ? t.arguments : {};
          const margsText = Object.keys(margs).length ? ` ${JSON.stringify(margs)}` : "";
          send("chat:command", {
            paneId,
            phase,
            item: {
              id: t.id,
              command: `${t.server ?? "mcp"}.${t.tool ?? "tool"}${margsText}`.slice(0, 400),
              source: "tool",
              status: t.status ?? (phase === "started" ? "inProgress" : "completed"),
              // Without this a failed call is a red card with an empty body.
              // The engine puts the cause here ("user rejected MCP tool call",
              // upstream errors), and the step card already renders output.
              output: t.error?.message ?? undefined,
            },
          });
        } else if (item?.type === "plan") {
          if (phase === "completed") {
            const planItem = params.item as { text?: string };
            send("chat:plan", { paneId, text: planItem.text ?? "" });
          }
        } else if (item?.type === "contextCompaction") {
          // Mark where the model's verbatim history got summarized.
          if (phase === "completed") {
            if (threadId) {
              const root = rootThreadOf(threadId);
              const c = checkpointCycle(root);
              c.compactions += 1;
              c.savedThisCycle = false;
              c.gateUsed = false;
              c.thresholdWritten = false;
              checkpointReplayDue.add(root);
              remeasureNudged.delete(root);
              drawGateUsed.delete(root);
              // The summary ate the skill too: last run the model re-read it
              // through the shell, 8KB and a turn. Send it again with the next call.
              axSkillSent.delete(root);
              // The nudge it heard is in the summary too, if at all. Say it again.
              axBatchNudged.delete(root);
              axLog(`checkpoint: compaction ${c.compactions} on ${root}; replay armed, skill and nudge re-armed`);
            }
          }
        } else if (item?.type === "fileChange") {
          // File changes render as command-style cards so the approval
          // buttons have a card to land on.
          const files = (item.changes ?? [])
            .map((c) => c.path?.split("/").filter(Boolean).pop() ?? "?")
            .join(", ");
          send("chat:command", {
            paneId,
            phase,
            item: {
              id: item.id,
              command: `Apply changes: ${files || "(files)"}`,
              status: item.status,
            },
          });
        }
        break;
      }
      case "rawResponse/completed": {
        const components = params.promptComponents as {
          systemInstructionsTokens?: unknown;
          toolDefinitionsTokens?: unknown;
        } | null | undefined;
        const system = components?.systemInstructionsTokens;
        const tools = components?.toolDefinitionsTokens;
        if (threadId && typeof params.turnId === "string" &&
            typeof system === "number" && Number.isSafeInteger(system) && system >= 0 &&
            typeof tools === "number" && Number.isSafeInteger(tools) && tools >= 0) {
          pendingPromptComponents.set(threadId, {
            turnId: params.turnId,
            systemInstructionsTokens: system,
            toolDefinitionsTokens: tools,
          });
        }
        break;
      }
      case "thread/tokenUsage/updated": {
        const tu = params.tokenUsage as
          | {
              last?: {
                inputTokens?: number;
                cachedInputTokens?: number;
                cacheWriteInputTokens?: number;
                outputTokens?: number;
                totalTokens?: number;
              };
              modelContextWindow?: number | null;
            }
          | undefined;
        const last = tu?.last;
        const inputTokens = last?.inputTokens ?? 0;
        const cachedInputTokens = last?.cachedInputTokens ?? 0;
        const cacheWriteInputTokens = last?.cacheWriteInputTokens ?? 0;
        const outputTokens = last?.outputTokens ?? 0;
        // Context occupancy ≈ the latest request's full prompt + completion.
        // cachedInputTokens is a SUBSET of inputTokens (the cache-hit
        // breakdown), NOT an addition — summing it double-counted cached
        // history and showed an impossible >100% context.
        const used = last?.totalTokens ?? inputTokens + outputTokens;
        const window = tu?.modelContextWindow ?? null;
        const usageKey = String(params.threadId);
        const usageTurnId = typeof params.turnId === "string" ? params.turnId : null;
        const pending = pendingPromptComponents.get(usageKey);
        if (pending && pending.turnId === usageTurnId) pendingPromptComponents.delete(usageKey);
        const previous = loadCtxUsage()[usageKey];
        const components = usageTurnId && pending?.turnId === usageTurnId
          ? pending
          : usageTurnId && previous?.promptComponentsTurnId === usageTurnId
            ? previous
            : null;
        const usage = {
          used,
          window,
          // NOT clamped: a conversation that outgrows the window is exactly
          // what the user needs to see. Clamping to 100 showed a calm "100%"
          // at 154% while every request was already failing.
          percent: window ? Math.round((used / window) * 100) : null,
          inputTokens,
          cachedInputTokens,
          cacheWriteInputTokens,
          outputTokens,
          totalTokens: used,
          ...(components && usageTurnId ? {
            systemInstructionsTokens: components.systemInstructionsTokens,
            toolDefinitionsTokens: components.toolDefinitionsTokens,
            promptComponentsTurnId: usageTurnId,
          } : {}),
        };
        // A retry that never completes leaves tokenUsage.last exactly where it
        // was, so the same numbers arrive again. Marked, not dropped: the
        // repeats are the only evidence here that something retried at all.
        const usageSig = `${inputTokens}/${cachedInputTokens}/${cacheWriteInputTokens}/${outputTokens}/${used}`;
        const repeated = lastUsageSig.get(usageKey) === usageSig;
        lastUsageSig.set(usageKey, usageSig);
        metrics.record({
          ...metricNow(params.threadId ? String(params.threadId) : null),
          kind: "turn",
          ...(repeated ? { repeat: true as const } : {}),
          turn: runningTurns.get(String(params.threadId)) ?? null,
          // `last` is the latest REQUEST's prompt and completion, so input is
          // the whole context re-sent on that turn. Summed over a run that is
          // the real bill; it is not the conversation's size.
          input: inputTokens,
          cached: cachedInputTokens,
          output: outputTokens,
          total: used,
        } satisfies TurnRecord);
        // Persist per thread so the gauge survives restarts and resumes.
        try {
          const map = loadCtxUsage();
          map[String(params.threadId)] = usage;
          writeFileSync(ctxUsageFile(), JSON.stringify(map));
        } catch {
          // best-effort
        }
        if (paneId) send("chat:token-usage", { paneId, ...usage });
        if (usage.percent !== null) {
          const root = rootThreadOf(String(params.threadId));
          ctxPercent.set(String(params.threadId), usage.percent);
          ctxPercent.set(root, usage.percent);
          // Past the threshold, write what the app knows right away; the model's
          // own notes arrive when the gate hands it the call.
          const c = checkpointCycle(root);
          if (!c.thresholdWritten && checkpointDue({ percent: usage.percent, savedThisCycle: c.savedThisCycle, gateUsed: c.gateUsed })) {
            c.thresholdWritten = true;
            try {
              writeCheckpoint(root);
              axLog(`checkpoint: wrote app facts at ${usage.percent}% for ${root}`);
            } catch {
              // best-effort; the gate still fires
            }
          }
        }
        break;
      }
      case "turn/completed": {
        if (threadId && compactingThreads.has(threadId)) updateThreadCompaction(threadId, "failed");
        if (threadId) turnEnvironments.end(threadId);
        const turn = params.turn as
          | { status?: string; usage?: unknown; error?: { message?: string; additionalDetails?: string | null } | null }
          | undefined;
        if (threadId) {
          if (turn?.status === "completed" && !subAgents.has(threadId)) {
            const count = (completedTurnsSinceMemory.get(threadId) ?? 0) + 1;
            completedTurnsSinceMemory.set(threadId, count);
            if (count >= 25) {
              completedTurnsSinceMemory.set(threadId, 0);
              scheduleAutomaticMemory(threadId, "25-turns");
            }
          }
          // The event the sidecar's whole reflex hangs on: turn_completed is
          // what triggers scoring and distillation on its side. Observed
          // BEFORE runningTurns is cleared so the event still carries its
          // turn id, then flushed — a turn boundary is exactly the moment the
          // app is between pieces of work.
          observeLearning("turn_completed", threadId, `turn ${turn?.status ?? "completed"}`, {
            status: turn?.status ?? "completed",
          });
          // Before runningTurns is cleared below: the id is what pairs this
          // with its start record, and after the delete there is nothing to
          // pair with.
          metrics.record({
            ...metricNow(threadId),
            kind: "run",
            turn: runningTurns.get(threadId) ?? null,
            phase: "completed",
            status: turn?.status ?? "completed",
          } satisfies RunRecord);
          learning?.flush();
          // Idle again: nothing of the user's is competing for the gateway.
          if (runningTurns.size <= 1) learning?.setIdle(true);
          runningTurns.delete(threadId);
          const reply = petReplies.get(threadId);
          petReplies.delete(threadId);
          const scheduledKey = scheduledRuns.get(threadId)?.key;
          if (!scheduledKey) petFinished(`turn:${threadId}`, turn?.status === "failed" ? "failed" : turn?.status === "interrupted" ? "interrupted" : "completed");
          if (turn?.status === "completed" && !subAgents.has(threadId) && !scheduledKey?.startsWith("tune:")) {
            const version = petNoticeVersion;
            void showCompletedPetNotice(threadId, reply?.final || reply?.last || "", reply?.stream || "", version);
          }
          if (mcpApplyPending.delete(threadId)) {
            // Queued while the turn ran; the thread is idle now.
            void applyThreadMcp(threadId).catch((err) =>
              send("mcp:thread-applied", { threadId, enabled: enabledMcpFor(threadId), error: String(err) }),
            );
          }
          bgStream.delete(threadId);
          // A turn can't end while the engine still waits on an approval —
          // it dropped the request (interrupt/failure). Retire the card so
          // dead Allow/Deny buttons don't linger in the transcript.
          const droppedApprovals: string[] = [];
          for (const [reqId, info] of pendingApprovals) {
            if (info.threadId !== threadId) continue;
            pendingApprovals.delete(reqId);
            // A local waiter would hang forever otherwise.
            if (info.kind === "local") info.settle("decline");
            droppedApprovals.push(reqId);
            const owner = subAgents.get(threadId)?.parent ?? threadId;
            const ownerPane = paneForThread(owner);
            if (ownerPane) send("chat:approval-canceled", { paneId: ownerPane, requestId: reqId });
          }
          if (droppedApprovals.length) {
            for (const [tid, arr] of heldApprovals) {
              const kept = arr.filter((a) => !droppedApprovals.includes(a.requestId as string));
              if (kept.length !== arr.length) {
                if (kept.length) heldApprovals.set(tid, kept);
                else heldApprovals.delete(tid);
              }
            }
          }
          for (const [requestId, pending] of pendingUserInputs) {
            if (pending.threadId !== threadId) continue;
            pendingUserInputs.delete(requestId);
            if (pending.kind === "local") pending.settle(null);
            const owner = subAgents.get(threadId)?.parent ?? threadId;
            const ownerPane = paneForThread(owner);
            if (ownerPane) send("chat:user-input-canceled", { paneId: ownerPane, requestId });
          }
          const sub = subAgents.get(threadId);
          if (sub) {
            sub.status =
              turn?.status === "failed" ? "failed" : turn?.status === "interrupted" ? "interrupted" : "idle";
            pushSubAgents(sub.parent);
            send("chat:subagent-activity", { threadId });
            // Closure/failure rows fire once per task — sub turns also end
            // between queued mails, and an interrupted turn already tells
            // its own story via the interrupt marker.
            const isFailure = turn?.status === "failed";
            if ((isFailure || turn?.status === "completed") && !sub.closedAnnounced) {
              sub.closedAnnounced = true;
              const parentPane = paneForThread(sub.parent);
              if (parentPane) {
                send("chat:subagent-event", {
                  paneId: parentPane,
                  event: isFailure ? "failed" : "completed",
                  name: sub.name,
                  path: sub.path,
                  agentThreadId: threadId,
                });
              }
            }
          }
          if (!paneId && turn?.status === "failed") {
            heldErrors.set(
              threadId,
              [turn.error?.message, turn.error?.additionalDetails].filter(Boolean).join(" — ") ||
                "unknown error",
            );
          }
          send("chat:thread-activity", { threadId, running: false, completed: turn?.status === "completed" && !subAgents.has(threadId) });
          // Nicknames, for the case where raws never arrive. The engine emits
          // raw items only for threads STARTED with experimentalRawEvents, so
          // a resumed conversation learns nothing from the live path — and a
          // spawn made during that conversation kept its task name. By turn
          // end the spawn's output is in the rollout, so read it from there.
          // Runs for the ROOT: a sub-agent's own turn ending is also the
          // moment its nickname becomes readable.
          const nickRoot = rootThreadOf(threadId);
          for (const info of subAgents.values()) {
            if (info.parent !== nickRoot) continue;
            applyRolloutNicknames(nickRoot);
            break;
          }
        }
        // A turn that only ever narrated: positively saw commentary, never a
        // final answer. Reported as a status rather than an error, because the
        // work usually DID happen — the agent just yielded without writing it
        // up, and the user is otherwise left looking at a stopped screen with
        // no idea anything is missing. Silent when phase was never stamped.
        const narrated =
          threadId !== null &&
          turn?.status === "completed" &&
          turnSawCommentary.has(threadId) &&
          !turnSawFinalAnswer.has(threadId);
        if (threadId) {
          turnSawCommentary.delete(threadId);
          turnSawFinalAnswer.delete(threadId);
        }
        if (!paneId) break;
        panes[paneId].turnId = null;
        send("chat:turn-completed", {
          paneId,
          narrated,
          status: turn?.status ?? "completed",
          usage: turn?.usage ?? null,
          // A failed turn is invisible without this — surface the cause.
          error: turn?.error
            ? [turn.error.message, turn.error.additionalDetails].filter(Boolean).join(" — ")
            : null,
        });
        break;
      }
    }
  });

  // MCP server lifecycle. Purely informational — the panel reflects it, and a
  // server that fails to start is otherwise invisible: its tools simply never
  // appear, with nothing saying why.
  engine.on("notification", (msg: { method: string; params?: Record<string, unknown> }) => {
    if (msg.method === "mcpServer/oauthLogin/completed") {
      const p = msg.params ?? {};
      send("mcp:login-done", {
        name: typeof p.name === "string" ? p.name : "",
        success: p.success === true,
        error: typeof p.error === "string" ? p.error : null,
      });
      return;
    }
    if (msg.method !== "mcpServer/startupStatus/updated") return;
    const p = msg.params ?? {};
    send("mcp:status", {
      name: typeof p.name === "string" ? p.name : "(unknown)",
      status: typeof p.status === "string" ? p.status : "unknown",
      error: typeof p.error === "string" ? p.error : null,
      failureReason: typeof p.failureReason === "string" ? p.failureReason : null,
    });
  });

  // Scheduled runs. Their threads own no pane, so the main event switch above
  // routes none of their traffic anywhere — this listener is the whole of it.
  // Kept separate rather than folded into that switch: a scheduled thread has
  // no pane, no transcript and no approval cards, and every branch in there
  // begins by resolving one.
  engine.on("notification", (msg: { method: string; params?: Record<string, unknown> }) => {
    const params = msg.params ?? {};
    const threadId = typeof params.threadId === "string" ? params.threadId : null;
    if (!threadId) return;
    const run = scheduledRuns.get(threadId);
    if (!run) return;
    if (msg.method === "item/agentMessage/delta") {
      run.text += (params.delta as string) ?? "";
      return;
    }
    // Take the finished message from the item itself. Deltas alone were not
    // enough: a run whose STATUS line was plainly in the transcript settled
    // with empty text, so the status went unparsed and the row read
    // "finished" — the engine does not always stream a message it delivers
    // whole. The LAST final_answer wins; commentary is narration, and a
    // multi-message turn ends on the answer.
    if (msg.method === "item/completed") {
      const it = params.item as { type?: string; text?: string; phase?: string | null } | undefined;
      if (it?.type === "agentMessage" && typeof it.text === "string" && it.text.trim()) {
        if (it.phase === "final_answer" || !run.finalText) run.finalText = it.text;
      }
      return;
    }
    if (msg.method === "turn/completed") {
      const turn = params.turn as
        | { status?: string; error?: { message?: string; additionalDetails?: string | null } | null }
        | undefined;
      const status: RunStatus =
        turn?.status === "failed" ? "failed" : turn?.status === "interrupted" ? "interrupted" : "completed";
      const error = turn?.error
        ? [turn.error.message, turn.error.additionalDetails].filter(Boolean).join(" — ") || "unknown error"
        : null;
      // Prefer the delivered final message; fall back to the streamed buffer.
      run.settle({ status, error, text: run.finalText || run.text });
    }
  });

  engine.on(
    "server-request",
    (msg: { id: number | string; method: string; params?: Record<string, unknown> }) => {
      const params = msg.params ?? {};
      if (typeof params.threadId === "string") {
        const binding = cloudBindings.read(params.threadId);
        if (binding && binding.state !== "local") {
          engine.respond(msg.id, { contentItems: [{ type:"inputText", text:"Conversation execution is remote or paused for handoff" }], success:false, decision:"decline" });
          return;
        }
      }
      // Route an approval to the owning pane, or hold it if the thread is
      // backgrounded — the engine waits on the request, and it replays when
      // the conversation is reopened. Auto-declining here would silently
      // reject work the user asked for.
      function deliverApproval(payload: Record<string, unknown>): void {
        // An app-only signal. Rollouts carry no record that the user was ever
        // asked, so the sidecar's approval_decline weight is unreachable from
        // replayed history — these two events are the app's unique
        // contribution to the corpus.
        observeLearning(
          "approval_requested",
          typeof params.threadId === "string" ? params.threadId : null,
          String(payload.command ?? "approval"),
          { kind: String(payload.kind ?? "command") },
        );
        // A sub-agent's approval must surface in its PARENT's pane — the sub
        // thread never owns a pane, so without this reroute the request
        // would sit in heldApprovals forever and the spawn would hang.
        const sub = typeof params.threadId === "string" ? subAgents.get(params.threadId) : undefined;
        const targetThread = sub ? sub.parent : params.threadId;
        const tagged = sub ? { ...payload, agentName: sub.name } : payload;
        const paneId = paneForThread(targetThread);
        if (paneId) {
          send("chat:approval-request", { paneId, ...tagged });
        } else if (typeof targetThread === "string") {
          const held = heldApprovals.get(targetThread) ?? [];
          held.push(tagged);
          heldApprovals.set(targetThread, held);
        } else {
          send("chat:approval-request", { paneId: "main", ...tagged });
        }
      }
      const approvalThread = typeof params.threadId === "string" ? params.threadId : null;
      if (msg.method === "item/tool/requestUserInput") {
        const fields = agentInputFields(params.questions);
        if (!fields) {
          engine.respond(msg.id, { answers: {} });
          return;
        }
        const request: UserInputRequest = {
          requestId: `input_${APPROVAL_BOOT}_${nextUserInput++}`,
          title: "The agent has a question",
          source: "codex",
          fields,
        };
        deliverUserInput(request, { kind: "codex", rpcId: msg.id, threadId: approvalThread, request });
        return;
      }
      if (msg.method === "item/commandExecution/requestApproval") {
        const requestId = `apr_${APPROVAL_BOOT}_${nextEngineApproval++}`;
        pendingApprovals.set(requestId, { kind: "engine", rpcId: msg.id, threadId: approvalThread });
        deliverApproval({
          requestId,
          kind: "command",
          // itemId ties the request to its commandExecution item so the
          // renderer can put the buttons ON the command card.
          itemId: (params.itemId as string) ?? null,
          command: (params.command as string) ?? "(unknown command)",
          cwd: (params.cwd as string) ?? null,
          reason: (params.reason as string) ?? null,
        });
        return;
      }
      if (msg.method === "item/fileChange/requestApproval") {
        const requestId = `apr_${APPROVAL_BOOT}_${nextEngineApproval++}`;
        pendingApprovals.set(requestId, { kind: "engine", rpcId: msg.id, threadId: approvalThread });
        deliverApproval({
          requestId,
          kind: "fileChange",
          // Lands on the fileChange item's card (same itemId), which
          // already names the files being changed.
          itemId: (params.itemId as string) ?? null,
          command: "Apply file changes",
          cwd: null,
          reason: (params.reason as string) ?? null,
          // The write root the agent wants access to (e.g. ~/Desktop).
          grantRoot: (params.grantRoot as string) ?? null,
        });
        return;
      }
      // Dynamic tool calls (the agent browser): run the CLI and answer
      // with its output. Errors return success:false so the model can
      // adapt instead of the turn dying.
      if (msg.method === "item/tool/call") {
        const tool = String((params as { tool?: unknown }).tool ?? "");
        const args = (params as { arguments?: unknown }).arguments;
        // Three families now, dispatched by prefix rather than by assuming
        // the browser owns every dynamic tool.
        const seq = ++toolSeq;
        const startedAt = Date.now();
        const shape = payloadOf(tool, args);
        // The whole dispatch runs inside the scope, so every bridge call it
        // makes — one for a press, a dozen for a batch — files itself under
        // this tool call rather than under whichever thread happened to be
        // running at the same moment.
        const quietWrites: { id: number | null; role: string | null }[] = [];
        const call = inToolCall.run({ seq, thread: approvalThread, quiet: quietWrites }, () =>
          tool === "ask_user"
          ? handleAskUser(args, approvalThread)
          : tool.startsWith("schedule_")
          ? handleScheduleToolCall(tool, args, approvalThread)
          : tool.startsWith("checkpoint_")
            ? handleCheckpointToolCall(tool, args, approvalThread)
          : tool.startsWith("image_")
            ? handleImageToolCall(tool, args, approvalThread)
          : tool.startsWith("memory_")
            ? handleMemoryToolCall(tool, args, approvalThread)
            : routesToAx(tool)
              ? handleAxCall(tool, args, approvalThread)
            : tool.startsWith("computer_")
              ? handleComputerUseCall(tool, args, approvalThread)
              : handleAgentBrowserCall(tool, args, approvalThread),
        );
        // The first desktop call of a conversation carries the computer-use
        // skill. See skillPreamble: the model does open it on its own, but
        // reactively, mid-task, after it has already stalled.
        // A desktop call the outline was not used in is a call it drifts by.
        if (routesToAx(tool)) agePendingOutline(rootThreadOf(approvalThread), false);
        const skillRoot = rootThreadOf(approvalThread);
        const sendSkill = shouldSendSkill(tool, axSkillSent.has(skillRoot));
        void call
          .catch((err) => ({
            contentItems: [{ type: "inputText" as const, text: `tool crashed: ${String(err)}` }],
            success: false,
          }))
          .then((response) => {
            // The first tool result after a compaction carries the checkpoint
            // back: the summary kept the plan and dropped the numbers.
            const root = rootThreadOf(approvalThread);
            if (!checkpointReplayDue.has(root)) return response;
            checkpointReplayDue.delete(root);
            try {
              const file = checkpointFile(root);
              if (!existsSync(file)) return response;
              const md = readFileSync(file, "utf8");
              axLog(`checkpoint: replayed ${md.length} chars after compaction (${tool})`);
              return prependSkill(response, checkpointPreamble(md));
            } catch {
              return response;
            }
          })
          .then((response) => {
            if (!sendSkill) return response;
            const text = computerUseSkillText();
            const preamble = text ? skillPreamble(text, join(bundledSkillsDir(), "computer-use")) : null;
            if (!preamble) return response;
            axSkillSent.add(skillRoot);
            axLog(`sent the computer-use skill with the first desktop call (${tool})`);
            return appendSkill(response, preamble);
          })
          .then((response) => {
            // Recorded after the skill and checkpoint passes so ms is the
            // whole cost of answering the call, which is what a per-binding
            // budget would have to clear.
            const text = response.contentItems
              .map((c) => (typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
              .join("\n");
            const ok = response.success !== false;
            const rec: ToolRecord & { seq: number } = {
              ...metricNow(approvalThread),
              kind: "tool",
              turn: approvalThread ? (runningTurns.get(approvalThread) ?? null) : null,
              tool,
              app: appOfStep(tool, (args && typeof args === "object" ? args : {}) as Record<string, unknown>),
              verb: shape.verb,
              size: shape.size,
              unit: shape.unit,
              parts: shape.parts,
              ms: Date.now() - startedAt,
              ok,
              // What ambiguity looks like before anything resolves an element
              // by label: the app took the action and the tree did not move.
              noChange: ok && text.includes(ACTION_NO_CHANGE_SENTENCE),
              ...(quietWrites.length ? { quietWrites } : {}),
              // The tool layer has prose, not a code — the classified reason
              // lives on the driver record underneath it, which has both.
              failure: ok ? null : classifyFailure(null, text),
              seq,
            };
            metrics.record(rec);
            return response;
          })
          .then((response) => engine.respond(msg.id, response));
        return;
      }
      // MCP tool calls. codex gates each one behind an elicitation request,
      // and until this branch existed the generic decline below answered it
      // with the wrong shape — so every MCP tool call failed as "user
      // rejected MCP tool call".
      if (msg.method === "mcpServer/elicitation/request") {
        const meta = (params._meta ?? {}) as Record<string, unknown>;
        const server = typeof params.serverName === "string" ? params.serverName : "an MCP server";
        // Tool approvals and MCP forms share a method but not a response shape.
        if (meta.codex_approval_kind === undefined) {
          const fields = params.mode === "form" ? mcpInputFields(params.requestedSchema) : null;
          if (!fields) {
            console.warn("[app] declining unsupported MCP elicitation from", server);
            engine.respond(msg.id, { action: "decline" });
            return;
          }
          const request: UserInputRequest = {
            requestId: `input_${APPROVAL_BOOT}_${nextUserInput++}`,
            title: typeof params.message === "string" ? params.message.slice(0, 500) : `${server} asks for input`,
            source: "mcp",
            sourceName: server,
            fields,
          };
          deliverUserInput(request, { kind: "mcp", rpcId: msg.id, threadId: approvalThread, request });
          return;
        }
        const requestId = `apr_${APPROVAL_BOOT}_${nextEngineApproval++}`;
        pendingApprovals.set(requestId, { kind: "elicitation", rpcId: msg.id, threadId: approvalThread });
        deliverApproval({
          requestId,
          kind: "mcpTool",
          // Deliberately NOT attached to the in-flight mcpToolCall card: the
          // request carries no item id, and inferring "the most recent one"
          // is precisely how an approval lands on the wrong card (fixed in
          // 1.2.3, twice). A standalone card costs one row and cannot
          // mis-answer.
          itemId: null,
          command: `${server} tool call`,
          cwd: null,
          reason: typeof meta.tool_description === "string" ? meta.tool_description : null,
          // codex writes the question itself — "Allow the X MCP server to run
          // tool \"y\"?" — and it is the only place the tool's name appears.
          // Re-deriving it here would just drift from the engine.
          message: typeof params.message === "string" ? params.message : null,
        });
        return;
      }
      // Anything we don't render yet (user-input tools, permissions):
      // declining beats hanging the turn on a question nobody can see.
      console.warn("[app] declining unhandled server request:", msg.method);
      engine.respond(msg.id, { decision: "decline" });
    },
  );
}

// ── Where file dialogs open ─────────────────────────────────────────────
// A picker that always starts from the same place makes the user re-walk the
// same tree every time. macOS remembers per-app, not per-purpose, so
// "Attach a file" and "Open a project" fought over one position; keying the
// memory by purpose lets each reopen where that particular job left off.
//
// Deliberately NOT falling back to mainCwd for the project pickers: the whole
// point of opening a project is that you are leaving the current one.

type DialogKey = "project" | "projectLocation" | "attach" | "skills";

function dialogDirsFile(): string {
  return join(app.getPath("userData"), "dialog-dirs.json");
}

function loadDialogDirs(): Partial<Record<DialogKey, string>> {
  try {
    const parsed = JSON.parse(readFileSync(dialogDirsFile(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** The remembered directory, or undefined — a folder that has since been
 *  moved or deleted must not be handed to the dialog, which would either
 *  error or silently ignore it. */
function lastDialogDir(key: DialogKey): string | undefined {
  const dir = loadDialogDirs()[key];
  if (!dir) return undefined;
  try {
    return statSync(dir).isDirectory() ? dir : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remember where a pick happened.
 *
 * `asParent` is the difference between "choose a thing" and "choose a place".
 * Picking the project /Work/unbiased-app should reopen at /Work, listing its
 * siblings — reopening *inside* the project you just chose is never what you
 * want next. Picking a location to create in is already the place, so it is
 * stored as-is.
 */
function rememberDialogDir(key: DialogKey, chosen: string, asParent = true): void {
  try {
    const dir = asParent ? dirname(chosen) : chosen;
    if (!statSync(dir).isDirectory()) return;
    writeFileSync(dialogDirsFile(), JSON.stringify({ ...loadDialogDirs(), [key]: dir }, null, 2) + "\n");
  } catch {
    // Best effort — a picker that forgets is a small annoyance, not a failure.
  }
}

// ── Scheduled tasks ─────────────────────────────────────────────────────
// The clock. `scheduler.ts` owns the records and the calendar arithmetic;
// this half owns the engine.
//
// A scheduled run is an ordinary thread and an ordinary turn — the same path
// a typed message takes — with two deliberate differences:
//
//   approvalPolicy: "never" + sandbox: "read-only"
//
// Nobody is watching at 8am. Under the interactive "ask" policy
// (`on-request`) an escalation would raise an approval card into an empty
// room and the turn would block on it until the app quit. `never` means the
// engine stops asking: reads run, anything needing escalation fails and the
// model adapts or reports. It is the one place in this app that deliberately
// runs a turn no human is going to answer for.

/** Marks a thread as a scheduled run. Scheduled runs are output you review
 *  from the Scheduled page, not conversations you are holding, so they stay
 *  out of the sidebar — the same treatment sub-agent threads get. */
const SCHEDULED_THREAD_SOURCE = "unbiased_scheduled_task";

function tasksDir(): string {
  return app.getPath("userData");
}

/** "Weekdays at 8:00 AM" — the same sentence the list shows, so the approval
 *  card and the row the user lands on describe the schedule identically. */
function describeSchedule(s: ScheduleSpec): string {
  const clock = (time: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m) return time;
    const h = Number(m[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
  };
  const names: Record<string, string> = {
    MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun",
  };
  switch (s.type) {
    case "hourly":
      return s.intervalHours === 1 ? "Every hour" : `Every ${s.intervalHours} hours`;
    case "daily":
      return `Daily at ${clock(s.time)}`;
    case "weekdays":
      return `Weekdays at ${clock(s.time)}`;
    case "weekly":
      return `${s.days.map((d) => names[d] ?? d).join(", ")} at ${clock(s.time)}`;
  }
}

/**
 * The `schedule_create` dynamic tool.
 *
 * Nothing is written before the human says yes. The card carries the whole
 * proposal — name, cadence, working directory and the verbatim prompt — because
 * the prompt is the part that actually matters and the part the user never
 * wrote: approving a task means approving text the model composed, which will
 * run unattended on a schedule. Summarising it would defeat the point.
 */
async function handleScheduleToolCall(
  tool: string,
  rawArgs: unknown,
  threadId: string | null,
): Promise<DynamicToolResponse> {
  const text = (t: string, ok: boolean): DynamicToolResponse => ({
    contentItems: [{ type: "inputText", text: t }],
    success: ok,
  });
  if (tool !== "schedule_create") return text(`Unknown scheduling tool ${tool}.`, false);

  const a = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const name = typeof a.name === "string" ? a.name.trim() : "";
  const prompt = typeof a.prompt === "string" ? a.prompt.trim() : "";
  if (!name) return text("A name is required.", false);
  if (name.length > MAX_NAME_CHARS) return text(`Keep the name under ${MAX_NAME_CHARS} characters.`, false);
  if (!prompt) return text("A prompt is required — say what each run should do.", false);
  if (prompt.length > MAX_PROMPT_CHARS) {
    return text(`Keep the instructions under ${MAX_PROMPT_CHARS} characters.`, false);
  }

  const repeat = typeof a.repeat === "string" ? a.repeat : "";
  const raw =
    repeat === "hourly"
      ? { type: "hourly", intervalHours: a.intervalHours }
      : repeat === "weekly"
        ? { type: "weekly", days: a.days, time: a.time }
        : { type: repeat, time: a.time };
  const checked = validateSchedule(raw);
  if ("error" in checked) return text(`${checked.error} (repeat was ${JSON.stringify(repeat)})`, false);

  const existing = readTasks();
  if (existing.length >= MAX_TASKS) return text(`The user is at the limit of ${MAX_TASKS} scheduled tasks.`, false);

  // An explicit path wins over the conversation's own, so "every morning,
  // summarise what I did in ~/work/api" targets that repo rather than whatever
  // project the chat happens to sit in. Checked here rather than at run time:
  // a typo caught now is a sentence the model can fix, while the same typo
  // found at 9am is a silent fallback to the wrong directory.
  const asked = typeof a.projectPath === "string" ? a.projectPath.trim() : "";
  if (asked) {
    if (!isAbsolute(asked)) return text(`projectPath must be an absolute path (got ${JSON.stringify(asked)}).`, false);
    if (!existsSync(asked)) return text(`No such directory: ${asked}`, false);
    if (!statSync(asked).isDirectory()) return text(`${asked} is a file, not a directory.`, false);
  }
  // The run inherits the conversation's directory unless one was named, so
  // the card names whichever it will actually use.
  const cwd = asked || mainCwd || defaultChatDir();
  const cadence = describeSchedule(checked.schedule);
  const decision = await requestLocalApproval(
    threadId,
    `Schedule "${name}" — ${cadence}`,
    [
      `Runs: ${cadence}`,
      `In: ${cwd}`,
      "Access: read-only files, and it never stops to ask while running.",
      "It can use the signed-in Agent browser as you — so it can read and act on",
      "sites you are logged into.",
      "",
      "It will run this each time:",
      prompt,
    ].join("\n"),
  );
  if (decision === "decline") {
    return text("The user declined the scheduled task. Do not create it, and do not offer again unless asked.", false);
  }

  const now = new Date().toISOString();
  const task: ScheduledTask = {
    key: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    prompt,
    schedule: checked.schedule,
    enabled: true,
    // The scratch directory is not a project. Recording it as one is what
    // made the form announce a plausible local project path for a task that
    // never touches the filesystem — a real-looking path for a detail that
    // does not apply.
    projectPath: asked || (mainCwd && mainCwd !== defaultChatDir() ? mainCwd : null),
    createdAt: now,
    cursorAt: now,
    lastRunAt: null,
    lastStatus: null,
    lastVerdict: null,
    lastVerdictNote: null,
    lastError: null,
    lastThreadId: null,
    missedAt: null,
  };
  const next = [...existing, task];
  writeTasks(next);
  send("scheduled:updated", { tasks: decorate(next) });

  // A row in the transcript with a link through to the task itself — the user
  // approved a proposal, so the result should be somewhere they can go and see,
  // not just a sentence the model reports back.
  const paneId = paneForThread(rootThreadOf(threadId)) ?? "main";
  send("chat:scheduled-created", { paneId, key: task.key, name, cadence });

  const due = dueAt(task);
  return text(
    `Created and armed "${name}" — ${cadence}. First run ${due.toLocaleString()}. ` +
      "It is listed under Scheduled in the sidebar, where the user can pause, edit or run it now.",
    true,
  );
}

// ── Memory tools (model-initiated) ──────────────────────────────────────
/** image_outline: the main shape in a picture as a click path. Read-only, so
 *  no approval; pure geometry over the decoded bitmap, see image-outline.ts.
 *  Files the decoder cannot read are converted the way attachments are. */
async function handleImageToolCall(tool: string, rawArgs: unknown, threadId: string | null): Promise<DynamicToolResponse> {
  const text = (t: string, ok: boolean): DynamicToolResponse => ({ contentItems: [{ type: "inputText", text: t }], success: ok });
  if (tool !== "image_outline") return text(`Unknown tool ${tool}`, false);
  const a = (rawArgs ?? {}) as { path?: unknown; max_points?: unknown; fit?: unknown };
  const path = typeof a.path === "string" ? a.path.trim() : "";
  if (!path || !isAbsolute(path)) return text("path is required: the absolute path of the image file.", false);
  if (!existsSync(path)) return text(`No file at ${path}.`, false);
  let img = nativeImage.createFromPath(path);
  if (img.isEmpty() && looksLikeImage(path)) {
    const dir = join(app.getPath("temp"), "unbiased-converted");
    const out = convertedImagePath(path, dir);
    try {
      if (!existsSync(out) || statSync(out).size === 0) {
        mkdirSync(dir, { recursive: true });
        execFileSync("/usr/bin/sips", sipsArgs(path, out), { stdio: "ignore", timeout: 15_000 });
      }
      img = nativeImage.createFromPath(out);
    } catch {
      // falls through to the empty check
    }
  }
  if (img.isEmpty()) return text(`${path} could not be decoded as an image.`, false);
  // Enough pixels for three-decimal fractions; more only costs time.
  const size = img.getSize();
  const longest = Math.max(size.width, size.height);
  if (longest > 1024) img = img.resize(size.width >= size.height ? { width: 1024 } : { height: 1024 });
  const { width, height } = img.getSize();
  const fit = a.fit === "shape" ? "shape" : "image";
  const maxPoints = typeof a.max_points === "number" && Number.isFinite(a.max_points) ? Math.round(a.max_points) : undefined;
  const result = outlineOf({ width, height, data: img.toBitmap() }, { maxPoints, fit });
  if ("error" in result) return text(`Nothing to trace in ${path}: ${result.error}.`, false);
  const name = path.split("/").pop() ?? path;
  axLog(`image_outline ${name}: ${result.points.length} points, ${result.color}, fit ${fit}`);
  // Held until it is drawn, so it can be brought back if the run wanders. See
  // outlineReminder for the run that measured one and never used it.
  pendingOutline.set(rootThreadOf(threadId), { name, path, points: result.points.length, color: result.color, callsSince: 0 });
  return text(renderOutline(name, result), true);
}

/** checkpoint_save: the model's half of the working memory. Validated (no
 *  trees, no images, bounded), then written together with the app's ledger.
 *  Allowed in plan mode: it is the agent's own notes about the conversation,
 *  and losing them at a compaction is worse than a file under ./memories. */
async function handleCheckpointToolCall(tool: string, rawArgs: unknown, threadId: string | null): Promise<DynamicToolResponse> {
  const text = (t: string, ok: boolean): DynamicToolResponse => ({ contentItems: [{ type: "inputText", text: t }], success: ok });
  if (tool !== "checkpoint_save") return text(`Unknown tool ${tool}`, false);
  const notes = (rawArgs as { notes?: unknown } | null)?.notes;
  if (typeof notes !== "string") return text("notes is required: the decisions and measured facts to keep.", false);
  const v = validateCheckpointNotes(notes);
  if (!v.ok) return text(v.error, false);
  const root = rootThreadOf(threadId);
  const c = checkpointCycle(root);
  c.notes = notes.trim();
  c.savedThisCycle = true;
  try {
    const file = writeCheckpoint(root);
    const facts = checkpointLedger.get(root)?.length ?? 0;
    axLog(`checkpoint: saved ${c.notes.length} chars of notes + ${facts} facts to ${file}`);
    return text(`Saved working memory to ${file} (${c.notes.length} characters of notes, ${facts} recorded facts). It is handed back to you automatically after the next summary.`, true);
  } catch (err) {
    return text(`Could not write the checkpoint: ${String(err)}`, false);
  }
}

async function handleMemoryToolCall(
  tool: string,
  rawArgs: unknown,
  threadId: string | null,
): Promise<DynamicToolResponse> {
  const text = (t: string, ok: boolean): DynamicToolResponse => ({
    contentItems: [{ type: "inputText", text: t }],
    success: ok,
  });
  const dir = memoryDirForThread(threadId);
  // Plan mode promises a read-only turn and enforces it with a hard sandbox
  // override — but these tools run app-side, outside that sandbox, so the
  // promise is only as good as this check. Refusing in prose (rather than
  // withholding the tools) because tools are declared per THREAD while plan
  // mode toggles per TURN: there is nothing to withdraw mid-conversation.
  if (planMode) {
    return text(
      "Plan mode is read-only, so memory cannot be changed right now. Say what you would save and " +
        "the user can turn plan mode off if they want it kept.",
      false,
    );
  }
  if (!dir) return text("This conversation has no memory store yet.", false);

  if (tool === "memory_forget") {
    const rawName = (rawArgs as Record<string, unknown>)?.name;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    // The one destructive operation in the feature: no trash, no undo, and
    // the note may be one another conversation relies on. It is also the
    // half a "Saved memory" row cannot cover after the fact — so it asks
    // first, the way schedule_create does.
    const decision = await requestLocalApproval(
      threadId,
      `Forget memory "${name}"`,
      [
        `Deletes ${join(dir, `${name}.md`)}`,
        "",
        "This memory store will no longer contain it. This cannot be undone.",
      ].join("\n"),
    );
    if (decision === "decline") {
      return text("The user declined. Keep the memory and do not offer to remove it again unless asked.", false);
    }
    const r = deleteMemoryNote(dir, name);
    if (!("error" in r)) {
      // The negative label the sidecar has none of: a human said this belief
      // was wrong. Refuting by name is best-effort — the lesson id is the
      // sidecar's, and only lessons proposed AS memories will match — so a
      // miss is an unknown_lesson result, not a failure.
      learning?.refuteLesson(`memory:${name}`, "user asked to forget the memory this became");
      observeLearning("assistant_message", threadId, `forgot memory ${name}`, { memoryForgotten: name });
    }
    return "error" in r ? text(r.error, false) : text(`Forgot "${name}". It will not appear in future conversations.`, true);
  }
  if (tool !== "memory_save") return text(`Unknown memory tool ${tool}.`, false);

  const checked = validateMemory(rawArgs);
  if ("error" in checked) return text(checked.error, false);
  // Redact before persisting, not just at display: a leaked secret in a note
  // would otherwise round-trip into every future thread's instructions. The
  // display boundary (send/redactSecrets) cannot catch it later because the
  // engine reads the file straight from disk.
  const note = redactSecrets({
    ...checked.note,
    originThreadId: threadId ? rootThreadOf(threadId) : null,
    modified: new Date().toISOString(),
  });
  const saved = saveMemoryNote(dir, note);
  if ("error" in saved) return text(saved.error, false);

  // A visible row in the transcript: no approval gate on saves, so the write
  // must at least be seen where it happened. Delivered ONLY to the pane that
  // owns this thread — the `?? "main"` fallback the schedule handler uses is
  // wrong here, because a thread with no pane (a backgrounded conversation)
  // would drop its row into whatever chat happens to be on screen, and the
  // main pane persists its transcript, so the foreign row would be saved
  // into that unrelated conversation for good.
  // A human-validated label, and free: the user let this stand. The corpus
  // has almost no strong signal of its own, so a save is worth recording.
  observeLearning("assistant_message", threadId, `saved memory ${note.name}: ${note.description}`, {
    memorySaved: note.name,
  });
  const paneId = paneForThread(rootThreadOf(threadId));
  if (paneId) {
    // Flag saves that came from a SUB-AGENT. They are routed to the parent's
    // pane but belong to no turn of that conversation, and a sub-agent
    // outlives the turn that spawned it — so the renderer must not splice
    // the receipt onto whatever answer happens to be last, which would
    // attribute the write to a finished turn that never made it.
    const fromSubAgent = !!(threadId && subAgents.has(threadId));
    send("chat:memory-saved", {
      paneId,
      name: note.name,
      description: note.description,
      path: saved.path,
      fromSubAgent,
    });
  }

  return text(
    `Saved "${note.name}" to this project's memory (${saved.path}). Future conversations in this ` +
      "project will see its description in their index.",
    true,
  );
}

const SCHEDULE_TICK_MS = 30_000;
/** A scheduled turn that has not finished in this long is abandoned. The
 *  engine client has no per-request timeout, so without a cap here a wedged
 *  run would hold its slot until the app quit. */
const RUN_TIMEOUT_MS = 10 * 60_000;

let scheduleTimer: NodeJS.Timeout | null = null;
/** Runs in flight, by engine threadId, so the notification listener below can
 *  accumulate their output without touching the main event switch. */
/** finalText: the last delivered agentMessage (the answer). text: the streamed
 *  accumulation, kept as a fallback for engines/turns that only stream. */
const scheduledRuns = new Map<
  string,
  {
    key: string;
    text: string;
    finalText: string;
    settle: (r: { status: RunStatus; error: string | null; text: string }) => void;
  }
>();
/** Guards against a slow run overlapping its own next tick — and now also
 *  carries WHAT is running, so the UI can open the live conversation and stop
 *  it. Before this, a run in flight was a boolean: you could see that
 *  something was happening and do nothing about it. */
const runningTaskKeys = new Map<string, { threadId: string | null; turnId: string | null }>();

function readTasks(): ScheduledTask[] {
  // Older tasks stored the scratch directory as their project, because a plain
  // chat's cwd IS the scratch directory. Normalise on read rather than
  // migrating the file: the answer is derived, so it stays correct if the
  // scratch location ever moves.
  const scratch = defaultChatDir();
  return loadTasks(tasksDir()).map((t) => (t.projectPath === scratch ? { ...t, projectPath: null } : t));
}

function writeTasks(tasks: ScheduledTask[]): void {
  saveTasks(tasksDir(), tasks);
}

/** Patch one task in place on disk and tell the renderer. */
function updateTask(key: string, patch: Partial<ScheduledTask>): ScheduledTask[] {
  const tasks = readTasks().map((t) => (t.key === key ? { ...t, ...patch } : t));
  writeTasks(tasks);
  send("scheduled:updated", { tasks: decorate(tasks) });
  return tasks;
}

/** Add the derived fields the renderer shows but should not compute: the next
 *  firing, and whether a run is in flight right now. */
function decorate(tasks: ScheduledTask[]): unknown[] {
  return tasks.map((t) => ({
    ...t,
    nextDueAt: t.enabled ? dueAt(t).toISOString() : null,
    running: runningTaskKeys.has(t.key),
    // The conversation this run is happening in, while it is happening.
    runningThreadId: runningTaskKeys.get(t.key)?.threadId ?? null,
  }));
}

/**
 * Run one task now. Resolves with the assistant's reply, or with the failure —
 * a scheduled run never throws at its caller, because both callers (the tick
 * and the Run now button) only want to record what happened.
 */
async function runScheduledTask(
  task: ScheduledTask,
  trigger: "schedule" | "manual",
): Promise<{ status: RunStatus; error: string | null; text: string }> {
  if (runningTaskKeys.has(task.key)) {
    return { status: "failed", error: "already running", text: "" };
  }
  runningTaskKeys.set(task.key, { threadId: null, turnId: null });
  petStarted(`scheduled:${task.key}`);
  send("scheduled:run-state", { key: task.key, running: true });
  let threadId: string | null = null;
  let petOutcome: "completed" | "failed" | "interrupted" = "failed";
  try {
    const cwd = task.projectPath && existsSync(task.projectPath) ? task.projectPath : defaultChatDir();
    // Browser tools, but NOT schedule_create. Withholding every dynamic tool
    // did make self-scheduling structurally impossible, and it also banned the
    // browser — which is the whole point of most scheduled work (watch a page,
    // update a status). Excluding just the scheduling tool keeps the property
    // that matters and returns the capability that was never meant to go.
    const started = (await engine.request("thread/start", {
      approvalPolicy: "never",
      sandbox: "read-only",
      cwd,
      // The run READS memory (its index rides these instructions) but cannot
      // WRITE it. Giving an unattended run memory tools looked right — runs
      // share no conversation, so a note is their only way to tell the next
      // run — but it hands a context that never asks for approval, that
      // browses attacker-controlled pages with pre-granted access (see the
      // grants below), and that nobody is watching, a channel that persists
      // into the developer instructions of EVERY future conversation in this
      // project. That is durable prompt injection, and no amount of
      // after-the-fact visibility fixes it: there is no one there to see it.
      developerInstructions: developerInstructionsFor(cwd),
      dynamicTools: await agentBrowserTools(),
      // Tag it so the sidebar can leave it out. threadSource is a free-form
      // client string the engine hands straight back in thread/list, which
      // beats keeping our own ledger of run ids: the answer travels with the
      // thread, so it stays right for runs from previous app versions and
      // needs no pruning.
      threadSource: SCHEDULED_THREAD_SOURCE,
      // A scheduled run has no one to switch a server on for it, and run 9
      // measured what the default set costs: ~35k tokens of schemas before
      // the first word. A run that needs a server is a later feature.
      config: mcpConfigOverride(overridableServerNames(readMcpConfig().servers), new Set()),
    })) as { thread: { id: string } };
    threadId = started.thread.id;
    threadCwds.set(threadId, cwd); // memory_save from this run targets ITS project
    runningTaskKeys.set(task.key, { threadId, turnId: null });
    // Push the live thread out immediately, so "Open run" works from the
    // moment the run starts rather than only once it has finished.
    send("scheduled:updated", { tasks: decorate(readTasks()) });

    // Pre-authorise the browser for this run. ensureBrowserAllowed would
    // otherwise raise a permission card into a conversation with no pane, and
    // an unattended run has nobody to answer it — the request would sit in
    // heldApprovals until the 10-minute cap killed the turn. The consent is
    // real, it just happened earlier: creating the task showed the user a card
    // carrying the verbatim prompt, and these tasks say "log into my Slack" in
    // so many words.
    browserConnectGrants.add(threadId);
    browserNetGrants.add(threadId);

    const settled = new Promise<{ status: RunStatus; error: string | null; text: string }>((resolve) => {
      scheduledRuns.set(threadId!, { key: task.key, text: "", finalText: "", settle: resolve });
    });
    // `timedOut` rather than matching the message text: the interrupt below
    // keys off this, and a reworded error would silently stop it firing.
    const timeout = new Promise<{ status: RunStatus; error: string | null; text: string; timedOut?: boolean }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            status: "failed",
            error: `timed out after ${RUN_TIMEOUT_MS / 60_000} minutes`,
            text: "",
            timedOut: true,
          }),
        RUN_TIMEOUT_MS,
      ),
    );

    const startedTurn = (await engine.request("turn/start", {
      threadId,
      // The contract rides along at run time and is never stored, so the
      // prompt the user wrote (and tunes) stays exactly theirs.
      input: [{ type: "text", text: task.prompt + VERDICT_CONTRACT }],
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
    })) as { turn?: { id?: string } };
    // turn/interrupt requires BOTH ids, so a stop button is impossible
    // without keeping this.
    runningTaskKeys.set(task.key, { threadId, turnId: startedTurn.turn?.id ?? null });

    const outcome = await Promise.race([settled, timeout]);
    // A timeout that only settles OUR promise is not a limit — it stops the
    // app watching while the agent keeps going. Observed: a run recorded as
    // failed at the ten-minute cap carried on driving the user's signed-in
    // Slack for minutes afterwards, invisible, because the bookkeeping and
    // the engine had come apart. The turn has to actually be interrupted.
    if ((outcome as { timedOut?: boolean }).timedOut) {
      const live = runningTaskKeys.get(task.key);
      if (live?.threadId && live.turnId) {
        try {
          await engine.request("turn/interrupt", { threadId: live.threadId, turnId: live.turnId });
          console.log(`[scheduled] interrupted "${task.name}" at the ${RUN_TIMEOUT_MS / 60_000}-minute cap`);
        } catch (err) {
          // Worth saying loudly: the cap has failed to bite and something is
          // still running with the user's sessions.
          console.error(`[scheduled] could not interrupt "${task.name}" after timeout:`, err);
        }
      }
    }
    const now = new Date().toISOString();
    // Only a completed turn can carry a meaningful verdict; a failure or an
    // interrupt is already the outcome.
    const verdict = outcome.status === "completed" ? parseRunVerdict(outcome.text) : { verdict: null, note: null };
    updateTask(task.key, {
      cursorAt: now,
      lastRunAt: now,
      lastStatus: outcome.status,
      lastVerdict: verdict.verdict,
      lastVerdictNote: verdict.note,
      lastError: outcome.error,
      lastThreadId: threadId,
      missedAt: null,
    });
    console.log(
      `[scheduled] ${trigger} run of "${task.name}" ${outcome.status}` +
        (verdict.verdict ? ` (agent reported: ${verdict.verdict}${verdict.note ? ` - ${verdict.note}` : ""})` : ""),
    );
    if (trigger === "schedule") notifyScheduledRun(task, outcome, threadId);
    petOutcome = outcome.status;
    return outcome;
  } catch (err) {
    const now = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    updateTask(task.key, {
      cursorAt: now,
      lastRunAt: now,
      lastStatus: "failed",
      lastVerdict: null,
      lastVerdictNote: null,
      lastError: message,
      lastThreadId: threadId,
      missedAt: null,
    });
    return { status: "failed", error: message, text: "" };
  } finally {
    if (threadId) {
      scheduledRuns.delete(threadId);
      // Scoped to the run, not the session: a task's grant must not outlive it.
      browserConnectGrants.delete(threadId);
      browserNetGrants.delete(threadId);
    }
    runningTaskKeys.delete(task.key);
    petFinished(`scheduled:${task.key}`, petOutcome);
    send("scheduled:run-state", { key: task.key, running: false });
  }
}

/** Tell the user a scheduled run finished. Without this the result only
 *  exists inside the app: a run that fires while they are in another window
 *  leaves no trace they would notice, which for the "have it ready before I
 *  sit down" tasks these exist for is the difference between the feature
 *  landing and not. Manual Run now is deliberately silent — they are already
 *  looking at it. Clicking through opens the run itself. */
function notifyScheduledRun(task: ScheduledTask, outcome: { status: RunStatus; error: string | null; text: string }, threadId: string | null): void {
  if (!Notification.isSupported()) return;
  const summary = outcome.text.replace(/\s+/g, " ").trim();
  const reported = outcome.status === "completed" ? parseRunVerdict(outcome.text) : { verdict: null, note: null };
  const body =
    outcome.status === "completed"
      ? (reported.verdict === "failed" ? `Didn't finish the job: ${reported.note ?? "see the run"}. ` : "") +
          (summary.slice(0, 180) || "Finished with nothing to report.")
      : `${outcome.status === "interrupted" ? "Stopped" : "Failed"}${outcome.error ? `: ${outcome.error}` : ""}`;
  const n = new Notification({ title: task.name, body, silent: false });
  n.on("click", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    if (threadId) send("scheduled:open-run", { threadId });
  });
  n.show();
}

/**
 * Anything that came due while the app was closed runs now, one at a time.
 *
 * This used to only MARK them missed, on the reasoning that three days
 * offline should not cost three turns the moment the window opens. That
 * reasoning was wrong about what these tasks are: a morning brief exists so
 * the answer is waiting, and a row saying "Missed — Run now" just moves the
 * work to the moment the user sits down, which is exactly what they wanted to
 * avoid. Note that a backlog is bounded by TASKS, not by slots — a daily task
 * missed for a week runs once, against today's state, because the prompt is
 * standing instructions and the answer it wants is about now.
 *
 * Sequential on purpose: firing every missed task at once would put N engine
 * threads in flight against a gateway that bills per call, at the least
 * convenient moment (launch). missedAt stays set until the run settles, so
 * the row reads "Missed" while it is catching up rather than looking idle.
 */
async function catchUpMissed(): Promise<void> {
  const now = new Date();
  const due = readTasks().filter((t) => isDue(t, now));
  if (due.length === 0) return;
  const marked = readTasks().map((t) =>
    due.some((d) => d.key === t.key) ? { ...t, cursorAt: now.toISOString(), missedAt: dueAt(t).toISOString() } : t,
  );
  writeTasks(marked);
  send("scheduled:updated", { tasks: decorate(marked) });
  for (const task of due) {
    if (runningTaskKeys.has(task.key)) continue;
    console.log(`[scheduled] "${task.name}" was due while closed — running it now`);
    await runScheduledTask(task, "schedule");
  }
}

function scheduleTick(): void {
  const now = new Date();
  for (const task of readTasks()) {
    if (!isDue(task, now) || runningTaskKeys.has(task.key)) continue;
    void runScheduledTask(task, "schedule");
  }
}

/** Called once the engine is connected — there is nothing to run a task with
 *  before that, and the engine only starts after sign-in. */
function startScheduler(): void {
  if (scheduleTimer) return;
  void catchUpMissed();
  scheduleTimer = setInterval(scheduleTick, SCHEDULE_TICK_MS);
  // Anything due in the seconds between launch and the first tick.
  scheduleTick();
}

function stopScheduler(): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = null;
}

let engineWired = false;
/** One running proxy per secret-bearing connector, keyed by name. */
const secretProxies = new Map<string, { server: HttpServer; fingerprint: string }>();

/**
 * Reconcile the secret proxies with the config. Runs before every engine
 * start because the plugin files codex is about to read point at these ports
 * — a proxy that comes up after codex dials is a connection refused, and one
 * left running for a removed connector keeps a dead secret in memory.
 */
async function syncSecretProxies(): Promise<void> {
  let servers: { name?: string; url?: string; oauthClientId?: string; oauthClientSecret?: string; enabled?: boolean }[] = [];
  try {
    const raw = JSON.parse(readFileSync(join(app.getPath("home"), ".unbiased", "mcp-servers.json"), "utf8")) as {
      servers?: typeof servers;
    };
    servers = raw.servers ?? [];
  } catch {
    servers = [];
  }
  const wanted = new Map<string, SecretConnector>();
  for (const sv of servers) {
    if (!sv.name || !sv.url || !sv.oauthClientId || !sv.oauthClientSecret) continue;
    if (sv.enabled === false) continue;
    wanted.set(sv.name, { name: sv.name, upstreamUrl: sv.url, clientId: sv.oauthClientId, clientSecret: sv.oauthClientSecret });
  }
  for (const [name, live] of secretProxies) {
    const want = wanted.get(name);
    const fingerprint = want ? `${want.upstreamUrl}|${want.clientId}|${want.clientSecret}` : "";
    if (!want || live.fingerprint !== fingerprint) {
      live.server.close();
      secretProxies.delete(name);
    }
  }
  for (const [name, want] of wanted) {
    if (secretProxies.has(name)) continue;
    try {
      const server = await startSecretProxy(want, {
        // Status and grant type only — never the form body, which carries the
        // authorization code, the refresh token and the secret itself.
        log: (msg) => console.log(`[oauth-proxy:${name}] ${msg}`),
      });
      secretProxies.set(name, { server, fingerprint: `${want.upstreamUrl}|${want.clientId}|${want.clientSecret}` });
    } catch (err) {
      console.error(`[oauth-proxy] could not start for ${name}:`, err);
    }
  }
}

async function startEngine(): Promise<void> {
  await syncSecretProxies();
  // Fire-and-forget: the page refreshes on open anyway, and nothing about
  // starting the engine should wait on GitHub.
  void refreshCatalogueAtStartup();
  const engineDir = resolveEngineDir({
    override: process.env.UNBIASED_ENGINE_DIR,
    isPackaged: productionBuild(),
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
  const bin = join(engineDir, "unbiased-app-engine");
  if (!existsSync(bin)) {
    pushStatus({
      state: "exited",
      code: null,
      detail: `engine bundle not found at ${engineDir} — run \`make bundle\` in unbiased-app-engine`,
    });
    return;
  }
  // The engine refuses to start without a key; gate here so the renderer's
  // login screen shows instead of a cryptic "no API key" exit.
  const stored = readStoredKey();
  if (!stored) {
    pushStatus({ state: "exited", code: null, detail: "not signed in" });
    return;
  }

  // Listeners attach once; a re-login stops the old process and starts fresh.
  if (!engineWired) {
    engine.on("status", pushStatus);
    wireNotifications();
    engineWired = true;
  }
  engine.stop();
  turnEnvironments.reset();
  resetSubAgentState();
  engine.start(bin, {
    UNBIASED_API_KEY: stored.key,
    UNBIASED_JEV_URL: process.env.UNBIASED_JEV_URL?.trim() || "https://api.unbiased.ai/v1/systemone",
  });

  const result = await engine.handshake(app.getVersion());
  try {
    connectAgentInstructions(homedir(), result.codexHome);
  } catch (error) {
    engine.stop();
    throw error;
  }
  // extraRoots is session state, so it has to be re-sent after every engine
  // start. It cannot live in the Go supervisor: that process execs itself away
  // before any JSON-RPC happens.
  try {
    await engine.request("skills/extraRoots/set", { extraRoots: skillRoots() });
  } catch (err) {
    // Not fatal — project skills still work, and the panel reports the gap.
    console.error("[skills] extraRoots/set failed:", err);
  }
  pushStatus({
    state: "connected",
    userAgent: result.userAgent,
    engineVersion: engineVersionFromUserAgent(result.userAgent),
    codexHome: result.codexHome,
  });
  // Only now is there something to run a task WITH. Idempotent, so a
  // re-login after a sign-out simply resumes the existing timer.
  startScheduler();
  // After the engine, and never blocking it: an absent or broken sidecar
  // leaves the app exactly as it was.
  void startLearning();
  // Before the bridge, so the bridge's own hello is the first thing recorded.
  startMetrics();
  // Same footing as the sidecar: absent or broken, the app is exactly as it was.
  void startAxBridge();
}

const interactiveVisuals = new Map<string, string>();
function registeredInteractiveVisualId(rawUrl: string): string | null {
  const id = interactiveVisualId(rawUrl);
  return id && interactiveVisuals.has(id) ? id : null;
}
protocol.registerSchemesAsPrivileged([{ scheme: INTERACTIVE_VISUAL_SCHEME, privileges: { standard: true, secure: true } }]);

app.whenReady().then(async () => {
  await browserRuntime.ready().catch(error => console.warn("[browser-runtime]", error));
  try {
    sideChatRecents = new SideChatRecents(parseSideChatRecords(JSON.parse(readFileSync(sideChatRecentsFile(), "utf8"))));
    saveSideChatRecents();
  } catch (error) {
    if (existsSync(sideChatRecentsFile())) console.warn("[side-chat] could not load recovery index:", error);
  }
  for (const record of sideChatRecents.all()) {
    threadCwds.set(record.threadId, record.cwd);
    conversationLineage.register(record.threadId, record.parentThreadId);
  }
  void pruneSideChatRecents();
  app.on("before-quit", resetSidePanes);
  const sideChatHeartbeat = setInterval(() => {
    if (sideChatRecents.touchOpen()) saveSideChatRecents();
  }, 60_000);
  app.on("will-quit", () => clearInterval(sideChatHeartbeat));
  try {
    const saved = JSON.parse(readFileSync(petPreferencesFile(), "utf8")) as Partial<PetPreferences> & { folder?: string };
    petPreferences = {
      visible: saved.visible !== false,
      ...(typeof saved.x === "number" && Number.isFinite(saved.x) ? { x: saved.x } : {}),
      ...(typeof saved.y === "number" && Number.isFinite(saved.y) ? { y: saved.y } : {}),
      selection: savedPalSelection(saved),
      scale: petScale(saved.scale),
    };
  } catch {
    petPreferences = { visible: true };
  }
  ipcMain.on("pet:ready", (event) => {
    if (event.sender !== petWin?.webContents) return;
    updatePet();
    petReadiness?.rendered();
  });
  ipcMain.on("pet:visible-chats", (event, payload: unknown) => {
    if (event.sender !== win?.webContents || !payload || typeof payload !== "object") return;
    const { threadIds, paneIds } = payload as { threadIds?: unknown; paneIds?: unknown };
    if (!Array.isArray(threadIds) || !Array.isArray(paneIds) || threadIds.length > 8 || paneIds.length > 2) return;
    if (!threadIds.every((id) => typeof id === "string" && id.length > 0 && id.length < 128) ||
        !paneIds.every((id) => typeof id === "string" && /^side:[a-zA-Z0-9_-]{1,32}$/.test(id))) return;
    visiblePetThreadIds = new Set(threadIds);
    visiblePetPaneIds = new Set(paneIds);
    clearVisiblePetNotices();
  });
  ipcMain.on("pet:menu", (event) => {
    if (event.sender === petWin?.webContents) showPetMenu();
  });
  ipcMain.on("pet:notice-dismiss", (event, id: unknown) => {
    if (event.sender !== petNoticeWin?.webContents || !Number.isSafeInteger(id)) return;
    petNotices = petNotices.filter((notice) => notice.id !== id);
    updatePetNoticeWindow();
    schedulePetNoticeExpiry();
  });
  ipcMain.on("pet:notice-open", (event, id: unknown) => {
    if (event.sender !== petNoticeWin?.webContents || !Number.isSafeInteger(id) || !win || win.isDestroyed()) return;
    const selected = petNotices.find((notice) => notice.id === id);
    if (!selected) return;
    petNotices = petNotices.filter((notice) => notice.id !== id);
    updatePetNoticeWindow();
    schedulePetNoticeExpiry();
    activateMainWindowFromPal(win, () => {
      if (process.platform === "darwin") app.focus({ steal: true });
    });
    const sideRecord = sideChatRecents.forThread(selected.threadId);
    send("pet:notice-open-thread", sideRecord
      ? { threadId: sideRecord.parentThreadId, sidePaneId: sideRecord.paneId }
      : { threadId: selected.threadId });
  });
  ipcMain.handle("pals:get", (event) => event.sender === win?.webContents ? palsSettings() : null);
  ipcMain.handle("pals:select", (event, id: unknown) =>
    event.sender === win?.webContents && typeof id === "string" ? selectPal(id) : { ok: false, settings: palsSettings() });
  ipcMain.handle("pals:visible", (event, visible: unknown) => {
    if (event.sender !== win?.webContents || typeof visible !== "boolean") return palsSettings();
    if (visible) createPetWindow(); else hidePet();
    return palsSettings();
  });
  ipcMain.handle("pals:scale", (event, scale: unknown) => {
    if (event.sender === win?.webContents && PET_SCALES.includes(scale as PetScale)) setPetScale(scale as PetScale);
    return palsSettings();
  });
  protocol.handle(INTERACTIVE_VISUAL_SCHEME, (request) => {
    if (request.method === "GET" && isInteractiveVisualPreviewUrl(request.url)) {
      const nonce = randomBytes(16).toString("base64");
      return new Response(interactiveVisualPreviewDocument(nonce), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": interactiveVisualPreviewCsp(nonce),
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      });
    }
    const id = registeredInteractiveVisualId(request.url);
    const source = request.method === "GET" && id ? interactiveVisuals.get(id) : null;
    if (!source) return new Response("Not found", { status: 404 });
    return new Response(interactiveVisualDocument(source), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": INTERACTIVE_VISUAL_CSP,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  });
  ipcMain.handle("visual:register", (event, source: unknown) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame ||
        !isInteractiveVisualSource(source)) return null;
    const id = randomUUID();
    interactiveVisuals.set(id, source);
    if (interactiveVisuals.size > 32) interactiveVisuals.delete(interactiveVisuals.keys().next().value!);
    return `${INTERACTIVE_VISUAL_SCHEME}://view/${id}`;
  });
  try {
    const migrated = migrateLegacyPlainMemory(memoryRoot(), defaultChatDir());
    if (migrated.copied || migrated.unassigned || migrated.conflicts) {
      console.log(`[memory] scoped old plain-chat notes: ${JSON.stringify(migrated)}`);
    }
  } catch (error) {
    console.warn("[memory] could not scope old plain-chat notes:", error);
  }
  ipcMain.handle("cloud:status", async () => {
    const key = readStoredKey()?.key ?? "";
    const auth = readJson<SignIn | null>(signInFile(),null);
    const eligible = cloudEligible(auth,key);
    return { eligible, available:false, reason: eligible ? "Cloud connection is awaiting the Relay handoff and environment APIs." : "Use platform browser sign-in to become eligible for cloud connection.", binding:panes.main.threadId ? cloudBindings.read(panes.main.threadId) : null };
  });
  ipcMain.handle("cloud:preflight", async () => {
    const owner = await verifiedOwner();
    const auth = readJson<SignIn | null>(signInFile(),null);
    if (!cloudEligible(auth,readStoredKey()?.key ?? "") || !auth?.owner || !sameOwner(owner,auth.owner)) throw new Error("Platform browser sign-in required");
    const thread = panes.main.threadId;
    if (!thread) throw new Error("Start a conversation first");
    const membership = projectMembership(thread, mainCwd ?? undefined);
    const project = loadProjects().find(p => p.id === membership.projectId);
    if (!project) throw new Error("Choose an unambiguous project before preparing repositories");
    const worktree=mainCwd ? loadWorktrees()[mainCwd] : undefined;
    if (worktree && mainCwd && !worktree.checkoutId) {
      const all=loadWorktrees(); all[mainCwd]={...worktree,checkoutId:randomUUID()};atomicJson(worktreesFile(),all);worktree.checkoutId=all[mainCwd].checkoutId;
    }
    const handoffProject=worktree && mainCwd ? {...project,sources:project.sources.map(source=>source.path===worktree.project ? {...source,path:mainCwd!,checkoutId:worktree.checkoutId!} : source)} : project;
    return { repositories:await gitPreflight(handoffProject), available:false, reason:"Relay handoff/environment endpoints are not connected; no files were uploaded." };
  });
  ipcMain.handle("environment:read", async (_e,scope: SettingsScope) => environmentStore.read(await verifiedOwner(),validateScope(scope)));
  ipcMain.handle("environment:resolve", async (_e,input:SettingsScope) => {
    const owner=await verifiedOwner();const target=validateScope(input);
    const scopes:SettingsScope[]=[{kind:"global"}];
    if (target.kind !== "global" && target.projectId) scopes.push({kind:"project",projectId:target.projectId});
    if (target.kind === "conversation") scopes.push(target);
    const layers=scopes.map(scope=>environmentStore.read(owner,scope)).filter((m):m is EnvironmentManifest=>m!==null);
    return layers.length ? resolveEnvironment(layers,target) : null;
  });
  ipcMain.handle("environment:write", async (_e,p: { manifest:EnvironmentManifest; expectedRevision:number }) => {
    const owner=await verifiedOwner(); if (!sameOwner(owner,p.manifest.owner)) throw new Error("Owner mismatch");
    const scope=validateScope(p.manifest.scope);
    if (scope.kind === "conversation") {
      const binding=cloudBindings.read(scope.conversationId);
      if (binding && binding.state !== "local") { await conversationRouter.environment(scope.conversationId,p.manifest,p.expectedRevision); return {ok:true}; }
    }
    if (cloudBindings.affected(owner,scope).length) throw new Error("REMOTE_ENVIRONMENT_CAS_REQUIRED: shared scope affects cloud-bound conversations; no local-only write was made");
    // Project/global remote synchronization needs Relay CAS; never acknowledge only a local write.
    const saved=environmentStore.write(p.manifest,p.expectedRevision);
    return {ok:true,manifest:saved,activation:"next-turn-policy-only",note:"Scoped skill activation and connector creation require a verified engine adapter; availability never enables tools."};
  });
  ipcMain.handle("environment:install-skill", async (_e,p: {scope:SettingsScope;path:string;name:string;expectedRevision:number}) => {
    const owner=await verifiedOwner();const scope=validateScope(p.scope);
    if (scope.kind === "conversation" && cloudBindings.read(scope.conversationId)?.state !== undefined && cloudBindings.read(scope.conversationId)?.state !== "local") throw new Error("Remote environment adapter required");
    if (cloudBindings.affected(owner,scope).length) throw new Error("REMOTE_ENVIRONMENT_CAS_REQUIRED");
    return installScopedSkill(join(app.getPath("userData"),"environment-artifacts"),environmentStore,owner,scope,p.path,p.name,p.expectedRevision);
  });
  ipcMain.handle("environment:export-connectors", async (_e,p:{names:string[];scope:SettingsScope}) => {
    await verifiedOwner();const scope=validateScope(p.scope);
    if (!Array.isArray(p.names) || p.names.length>100) throw new Error("Choose at most 100 connector names");
    const config=readMcpConfig();if(config.error)throw new Error(config.error);
    return p.names.map(name=>{
      const raw=config.servers.find(server=>server.name===name);if(!raw)throw new Error(`Unknown connector ${name}`);
      try {return exportConnector(raw,name,scope)}catch(error){throw new Error(`${name}: ${String(error)}. Keep this connector local or register a safe portable definition and opaque credential reference.`)}
    });
  });
  ipcMain.handle("environment:target", async () => {
    const owner=await verifiedOwner();const thread=panes.main.threadId;
    const membership=thread ? projectMembership(thread,mainCwd ?? undefined) : null;
    return {owner,conversationId:thread,projectId:membership?.projectId ?? null,projectResolution:membership?.resolution ?? "regular",projects:loadProjects().map(p=>({id:p.id,name:p.name}))};
  });

  ipcMain.handle("engine:status", () => lastStatus);

  // ── Auth IPC ────────────────────────────────────────────────────────
  // Presence + source of the stored key (no network). keyName is the
  // credentials-file label if we wrote one; env keys are opaque.
  // ── Update IPC ──────────────────────────────────────────────────────
  ipcMain.handle("update:check", async () => (await checkForUpdate()) ?? { none: true });
  ipcMain.handle("update:pending", () => ({
    // While a silent download is in flight the renderer is told nothing: a
    // Download button that appears and then rewrites itself to Restart is
    // worse than no banner at all.
    update: stagedUpdate || !updatePrefs().autoDownload ? pendingUpdate : null,
    staged: stagedUpdate ? { version: stagedUpdate.version } : null,
  }));

  ipcMain.handle("changelog:releases", () => ({ releases: loadReleaseNotes() }));

  ipcMain.handle("update:prefs", () => ({
    autoDownload: updatePrefs().autoDownload,
    version: app.getVersion(),
    lastCheckedAt: lastUpdateCheck || null,
  }));
  ipcMain.handle("agent-style:get", () => agentStylePrefs());
  ipcMain.handle("agent-style:set", (_e, value: unknown) => saveAgentStylePrefs(value));
  registerAgentInstructionsIpc(ipcMain, homedir());
  ipcMain.handle("update:set-prefs", (_e, p: { autoDownload: boolean }) => {
    setUpdatePrefs({ autoDownload: !!p.autoDownload });
    // Turning it on mid-session should act now, not in six hours.
    if (p.autoDownload && pendingUpdate && !stagedUpdate && !updateInstalling) {
      // Capture: pendingUpdate is module state and a 6h check could swap it
      // mid-download; the announcement must name what was actually staged.
      const toStage = pendingUpdate;
      silentInstall = true;
      void installUpdate(toStage).then(() => {
        silentInstall = false;
        send("update:available", toStage); // same invisibility fix as above
      });
    }
    return { ok: true };
  });
  ipcMain.handle("update:download", async () => {
    if (!pendingUpdate) return { ok: false, error: "no update available" };
    return installUpdate(pendingUpdate);
  });
  ipcMain.handle("update:apply", () => applyUpdate());

  ipcMain.handle("auth:status", () => {
    const stored = readStoredKey();
    return { hasKey: !!stored, source: stored?.source ?? null, browserSignIn: !!OAUTH_CLIENT_ID };
  });

  // Validate a key (or the stored one) against the platform. Pure check —
  // no persistence, no engine start.
  ipcMain.handle("auth:validate", async (_e, key?: string) => {
    const k = (key ?? readStoredKey()?.key ?? "").trim();
    if (!k) return { ok: false, error: "No API key to validate." };
    return whoamiValidate(k);
  });

  // Validate, persist (unless the key comes from the environment), then
  // (re)start the engine with it. Returns the whoami identity. The one path
  // to a signed-in engine, whether the key was pasted or issued by the browser flow.
  async function completeSignIn(key: string, provenance: "platform_device" | "api_key" = "api_key"): Promise<WhoamiResult> {
    const who = await whoamiValidate(key);
    if (!who.ok) return who;
    // Only persist a user-entered key; an env key is the environment's to own.
    if (key !== process.env.UNBIASED_API_KEY?.trim()) {
      try {
        mkdirSync(join(app.getPath("home"), ".unbiased"), { recursive: true });
        writeFileSync(credentialsPath(), JSON.stringify({ apiKey: key }, null, 2), { mode: 0o600 });
      } catch (err) {
        return { ok: false, error: `Couldn't save credentials: ${String(err)}` };
      }
    }
    scopedIdentity.clear();
    const owner=who.user?.id && who.organization?.id && who.accessStatus === "granted" ? {organizationId:who.organization.id,memberId:who.user.id} : null;
    if(owner)scopedIdentity.remember(key,owner);
    atomicJson(signInFile(), { provenance, keyFingerprint:keyFingerprint(key),owner } satisfies SignIn);
    resetKnownSecrets();
    startEngine().catch((err) => pushStatus({ state: "exited", code: null, detail: String(err) }));
    return who;
  }

  ipcMain.handle("auth:login", async (_e, payload: { key?: string }) => {
    const key = (payload?.key ?? process.env.UNBIASED_API_KEY?.trim() ?? readStoredKey()?.key ?? "").trim();
    if (!key) return { ok: false, error: "No API key provided." };
    return completeSignIn(key);
  });

  // ── Browser sign-in ─────────────────────────────────────────────────
  // The platform's device authorization flow (src/main/device-auth.ts): ask
  // for a code, open the person's own browser on the platform to confirm it,
  // poll until the platform hands back a freshly minted key, then sign in
  // with that key exactly as if it had been pasted. One flow at a time —
  // starting another cancels the previous poll, so two loops never race to
  // write credentials.
  let deviceFlow: { controller: AbortController; result: Promise<WhoamiResult> } | null = null;

  ipcMain.handle("auth:device-start", async () => {
    if (!OAUTH_CLIENT_ID) return { ok: false, error: "Browser sign-in isn't available in this build." };
    deviceFlow?.controller.abort();
    const controller = new AbortController();
    const started = await requestDeviceAuthorization({
      baseUrl: PLATFORM_BASE,
      clientId: OAUTH_CLIENT_ID,
      // Display-only on the platform; it seeds the workload name when the
      // person picks "new workload" there.
      deviceName: hostname().replace(/\.local$/, ""),
      signal: controller.signal,
    });
    if (!started.ok) return started;
    const { grant } = started;
    void shell.openExternal(grant.verificationUriComplete);
    const result = pollDeviceToken({
      baseUrl: PLATFORM_BASE,
      clientId: OAUTH_CLIENT_ID,
      grant,
      signal: controller.signal,
    }).then((token) => (token.ok ? completeSignIn(token.accessToken, "platform_device") : token));
    deviceFlow = { controller, result };
    return {
      ok: true,
      userCode: grant.userCode,
      verificationUri: grant.verificationUri,
      verificationUriComplete: grant.verificationUriComplete,
      expiresIn: grant.expiresIn,
    };
  });

  // Settles when the flow ends: signed in, declined, expired, or canceled.
  ipcMain.handle("auth:device-wait", async () => {
    const flow = deviceFlow;
    if (!flow) return { ok: false, error: "No browser sign-in is in progress." };
    const who = await flow.result;
    if (deviceFlow === flow) deviceFlow = null;
    return who;
  });

  ipcMain.handle("auth:device-cancel", () => {
    deviceFlow?.controller.abort();
    return { ok: true };
  });

  // Sign out: stop the engine and remove the stored credentials file. An
  // env-provided key can't be removed by us — report that so the UI can say so.
  ipcMain.handle("auth:logout", (_e, opts?: { removeKey?: boolean }) => {
    engine.stop();
    // Without this the timer keeps firing against a dead engine, turning
    // every scheduled task into a "engine not running" failure row.
    stopScheduler();
    scopedIdentity.clear();
    rmSync(signInFile(),{force:true});
    pushStatus({ state: "exited", code: null, detail: "signed out" });
    const envKey = !!process.env.UNBIASED_API_KEY?.trim();
    // Removing the stored key is now the user's choice (Settings → Account):
    // keeping it makes the next sign-in a one-click "Continue".
    if (opts?.removeKey !== false) {
      try {
        rmSync(credentialsPath(), { force: true });
      } catch {
        // nothing to remove
      }
    }
    resetKnownSecrets();
    return { ok: true, envKeyRemains: envKey };
  });

  ipcMain.handle("chat:commands", async (_e, paneId: PaneId) => {
    const threadId = panes[paneId]?.threadId;
    const cwd = (threadId ? threadCwds.get(threadId) : null) ?? (paneId === "main" ? pendingCwd ?? defaultChatDir() : mainCwd ?? pendingCwd ?? defaultChatDir());
    try { return { commands: await listSlashCommands((method, params) => engine.request(method, params), cwd, bundledSkillsDir()), error: null }; }
    catch (error) { return { commands: [], error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("chat:send", async (_e, payload: {
    paneId: PaneId;
    text: string;
    attachments?: { name: string; path: string; kind?: "image" }[];
    computer?: boolean;
    visualize?: boolean;
    skillPath?: string;
    commandText?: string;
  }) => {
    const { paneId, text, attachments, computer, visualize } = payload;
    for (const attachment of attachments ?? []) {
      if (!isAbsolute(attachment.path)) throw new Error(`Invalid attachment path: ${attachment.name}`);
      const info = statSync(attachment.path);
      if (info.isFile()) {
        const error = attachmentSizeError(attachment.name, info.size, attachment.kind === "image" ? "image" : "file");
        if (error) throw new Error(error);
      }
    }
    const authScope = readJson<SignIn | null>(signInFile(),null);
    if (authScope?.owner && authScope.keyFingerprint === keyFingerprint(readStoredKey()?.key ?? "")) await verifiedOwner();

    const pane = ensurePane(paneId);
    const commandSourceCwd = !pane.threadId && paneId === "main" ? pendingCwd : null;
    let created = false;
    if (!pane.threadId) {
      let started: { thread: { id: string } };
      const sideParentId = paneId.startsWith("side:") ? panes.main.threadId : null;
      let startedCwd: string;
      const selectedProjectId = sideParentId ? threadProject(sideParentId, mainCwd)?.id ?? null : pendingProjectId;
      if (paneId.startsWith("side")) {
        const parentId = sideParentId;
        if (!parentId) throw new Error("Start a main chat before using a side chat");
        const sideCwd = mainCwd ?? pendingCwd ?? defaultChatDir();
        startedCwd = sideCwd;
        const activeTurnId = parentId ? panes.main.turnId ?? runningTurns.get(parentId) ?? null : null;
        let lastFinishedTurnId: string | null = null;
        if (parentId && activeTurnId) {
          try {
            const read = await engine.request("thread/read", { threadId: parentId, includeTurns: true }) as {
              thread: { turns?: { id: string; status: string }[] };
            };
            lastFinishedTurnId = lastFinishedTurnBeforeActive(read.thread.turns ?? [], activeTurnId);
          } catch (error) {
            console.warn("[side-chat] could not read a finished parent turn:", error);
          }
        }
        // Fork through the last finished turn, never the parent's active task.
        // With no safe boundary, start a fresh thread in the same directory.
        const target = sideChatStartTarget(
          parentId,
          Boolean(activeTurnId),
          sideCwd,
          lastFinishedTurnId,
        );
        started = (await engine.request(target.method, {
          ...target.params,
          ...threadPolicy(),
          dynamicTools: await threadDynamicTools(),
          developerInstructions: `${developerInstructionsFor(sideCwd, parentId)}\n\n` +
            "This is a side chat. Inherited parent history is background context, not an active task. " +
            "Follow this side chat's current request; do not continue parent work unless the user explicitly asks.",
          experimentalRawEvents: true,
          // A side chat keeps its parent's MCP selection even when its turn
          // must start independently of the parent's in-progress task.
          config: mcpOverrideFor(parentId),
        })) as { thread: { id: string } };
      } else {
        // Explicit default when no project is chosen — left implicit, the
        // engine falls back to its own process cwd (wherever the app
        // launched from) and the chat wrongly files under that project.
        let cwd = pendingCwd ?? defaultChatDir();
        if (pendingCwd && workMode === "worktree") {
          const wt = await createWorktree(pendingCwd, text);
          if (wt) cwd = wt;
        } else if (pendingCwd && typeof workMode === "object") {
          // A previously created worktree — validate it still exists and
          // belongs to this project before trusting it.
          const info = loadWorktrees()[workMode.existing];
          if (info && info.project === pendingCwd && existsSync(workMode.existing)) {
            cwd = workMode.existing;
          }
        }
        started = (await engine.request("thread/start", {
          ...threadPolicy(),
          cwd,
          // Model-driven browser automation (agent-browser CLI), when
          // installed — the calls come back as item/tool/call requests.
          dynamicTools: await threadDynamicTools(),
          developerInstructions: developerInstructionsFor(cwd, null, selectedProjectId),
          // Raw response items feed the sub-agent viewer (task text + spawn
          // instructions). Sub-threads inherit this from their parent.
          experimentalRawEvents: true,
          config: mcpOverrideFor(null),
        })) as { thread: { id: string }; cwd?: string };
        mainCwd = (started as { cwd?: string }).cwd ?? cwd;
        startedCwd = mainCwd;
      }
      if (panes[paneId] !== pane) {
        void engine.request("thread/delete", { threadId: started.thread.id }).catch(() => undefined);
        throw new Error("This side chat was closed while starting");
      }
      projectStore().assign(started.thread.id, selectedProjectId);
      pane.threadId = started.thread.id;
      if (paneId.startsWith("side:") && sideParentId) {
        threadMcp.set(started.thread.id, new Set(enabledMcpFor(sideParentId)));
        saveThreadMcp();
        sideChatRecents.register({
          paneId,
          threadId: started.thread.id,
          parentThreadId: sideParentId,
          cwd: startedCwd,
          baselineTurns: 0,
          title: text.trim().slice(0, 100) || "Side chat",
        });
        saveSideChatRecents();
        let baselineTurns = 0;
        try {
          const initial = await engine.request("thread/read", { threadId: started.thread.id, includeTurns: true }) as { thread: WireThread };
          baselineTurns = initial.thread.turns?.length ?? 0;
        } catch (error) {
          console.warn("[side-chat] could not mark inherited turns:", error);
        }
        sideChatRecents.setBaselineTurns(paneId, baselineTurns);
        saveSideChatRecents();
        if (panes[paneId] !== pane) throw new Error("This side chat was closed while starting");
      }
      const parent = sideParentId;
      const membership = parent ? projectMembership(parent, startedCwd) : projectMembership(started.thread.id, startedCwd);
      if (parent) { conversationLineage.register(started.thread.id,parent); projectStore().assign(started.thread.id, membership.projectId); }

      // The choice made in the composer before the first message belongs to
      // the thread that message created.
      if (paneId === "main" && pendingNewThreadMcp) {
        if (pendingNewThreadMcp.length) threadMcp.set(started.thread.id, new Set(pendingNewThreadMcp));
        pendingNewThreadMcp = null;
        saveThreadMcp();
      }
      // Record the directory used by this thread so memory and turn policy
      // remain scoped to its project, including a scratch side chat.
      threadCwds.set(started.thread.id, startedCwd);
      if (paneId === "main") {
        const projectContext = configuredProjectContext(threadCwds.get(started.thread.id) ?? null, started.thread.id);
        if (projectContext) projectContextSeen.set(started.thread.id, projectContext);
      }
      // The scope-bearing event, using the SAME resolution memory uses: a
      // worktree belongs to its parent project. The sidecar cannot derive
      // this — cwd cannot tell /a/api from /b/api, and it has no worktree
      // knowledge at all — so the app declares it.
      if (learning?.isReady) {
        const at = mainCwd ?? defaultChatDir();
        learning.observe(
          buildTaskMeta({
            threadId: started.thread.id,
            cwd: at,
            projectKey: loadWorktrees()[at]?.project ?? at,
          }),
        );
      }
      threadAccessModes.set(started.thread.id, accessMode);
      created = true;
    }
    // Mentions preserve attachment metadata in thread history, but local
    // paths in mentions do not reach the model. Supply readable files (or an
    // explicit path to inspect) as text; images remain actual image input.
    const turnCwd = (pane.threadId ? threadCwds.get(pane.threadId) : null) ?? mainCwd;
    if (payload.commandText !== undefined && typeof payload.commandText !== "string") throw new Error("Invalid skill command.");
    if (payload.skillPath !== undefined && typeof payload.skillPath !== "string") throw new Error("Invalid skill selection.");
    const worktreeSource = created && turnCwd && commandSourceCwd && loadWorktrees()[turnCwd]?.project === commandSourceCwd ? commandSourceCwd : undefined;
    const selectedSkill = await resolveSlashSkill((method, params) => engine.request(method, params), turnCwd, bundledSkillsDir(), payload.commandText ?? text, payload.skillPath, worktreeSource);
    const projectContext = configuredProjectContext(turnCwd, pane.threadId);
    const needsProjectContext = !!projectContext && !!pane.threadId && projectContextSeen.get(pane.threadId) !== projectContext;
    const input: Record<string, unknown>[] = [{ type: "text", text }];
    if (selectedSkill) input.push(selectedSkill);
    if (needsProjectContext) input.unshift({ type: "text", text: `App project context:\n${projectContext}` });
    const attachmentContext = fileAttachmentContext(attachments ?? []);
    if (attachmentContext) input.push({ type: "text", text: attachmentContext });
    for (const a of attachments ?? []) {
      if (a.kind === "image") {
        input.push({ type: "localImage", path: a.path });
      } else {
        input.push({ type: "mention", name: a.name, path: a.path });
      }
    }
    if (computer) input.unshift({ type: "text", text: COMPUTER_DIRECTIVE });
    if (visualize) input.unshift({ type: "text", text: VISUALIZE_DIRECTIVE });
    if (planMode) input.unshift({ type: "text", text: PLAN_DIRECTIVE });
    pinTurnEnvironment(pane.threadId!);
    let turnAccepted = false;
    try {
    const result = (await engine.request("turn/start", {
      threadId: pane.threadId,
      input,
      // Turn-level overrides apply "this turn and subsequent turns", so a
      // mode switched mid-conversation takes effect immediately. Plan mode
      // hard-forces read-only regardless of the access mode.
      approvalPolicy: planMode ? "on-request" : threadPolicy().approvalPolicy,
      sandboxPolicy: planMode ? { type: "readOnly" } : turnSandbox(turnCwd),
    })) as { turn?: { id?: string } };
    if (paneId.startsWith("side:") && panes[paneId] !== pane) {
      if (result.turn?.id) void engine.request("turn/interrupt", { threadId: pane.threadId, turnId: result.turn.id }).catch(() => undefined);
      throw new Error("This side chat was closed while starting");
    }
    if (result.turn?.id) pane.turnId = result.turn.id;
    if (result.turn?.id && needsProjectContext && pane.threadId && projectContext) {
      projectContextSeen.set(pane.threadId, projectContext);
    }
    turnAccepted = true;

    return { turnId: pane.turnId, threadId: pane.threadId, created };
    } finally { if (!turnAccepted) turnEnvironments.end(pane.threadId!); }
  });

  // Client-side transcript cache: the engine's history omits things only
  // the renderer knows (failed-turn errors, annotation cards, thumbnails),
  // so the rendered entries persist per thread and win on resume when
  // richer than what the engine returns.
  const transcriptsDir = () => {
    const dir = join(app.getPath("userData"), "transcripts");
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  const transcriptFile = (threadId: string) =>
    join(transcriptsDir(), `${threadId.replace(/[^\w.-]/g, "_")}.json`);

  interface ReplayRow extends TranscriptRow<ReplayRow> { [key: string]: unknown }
  const transcriptSessions = new Map<string, { threadId: string; entries: ReplayRow[] }>();
  const multiTranscriptSessions = new Map<string, string>();
  let mainTranscriptSession: string | null = null;
  let mainOpenSequence = 0;
  const pendingTranscriptWrites = new Map<string, Promise<void>>();
  const readCachedTranscript = async (threadId: string): Promise<ReplayRow[] | null> => {
    try {
      const raw = JSON.parse(await readFileAsync(transcriptFile(threadId), "utf8")) as { cacheVersion?: number; entries?: unknown };
      return raw?.cacheVersion === TRANSCRIPT_CACHE_VERSION && Array.isArray(raw.entries)
        ? raw.entries as ReplayRow[]
        : null;
    } catch {
      return null;
    }
  };
  const openTranscriptSession = async (threadId: string, history: unknown[], names: Record<string, string>, runningTurnStart: number | null) => {
    await pendingTranscriptWrites.get(threadId)?.catch(() => {});
    const replay = history as ReplayRow[];
    const preferred = chooseTranscript(replay, await readCachedTranscript(threadId));
    const alignedTurnStart = alignRunningTurnStart(replay, preferred, runningTurnStart);
    const chosen = retitleTranscript(preferred, names);
    // The cache may predate redaction. Never retain its raw prefix in a
    // session: a later partial save would otherwise persist it again.
    const safeEntries = redactSecrets(chosen);
    const sessionId = randomUUID();
    transcriptSessions.set(sessionId, { threadId, entries: safeEntries });
    return {
      sessionId,
      ...initialTranscriptPage(safeEntries, alignedTurnStart),
    };
  };

  ipcMain.handle("transcript:save", async (_e, p: { threadId: string; entries: unknown; sessionId?: string; offset?: number }) => {
    try {
      let entries = p.entries;
      if (p.sessionId) {
        const session = transcriptSessions.get(p.sessionId);
        if (!session || session.threadId !== p.threadId || !Array.isArray(p.entries)) {
          return { ok: false };
        }
        if (!replaceTranscriptTail(session.entries, p.offset!, p.entries as ReplayRow[])) return { ok: false };
        entries = session.entries;
      }
      // Stamped, so a cache written by a build that BUILT entries differently
      // can be told apart from one this build would produce.
      const previous = pendingTranscriptWrites.get(p.threadId);
      const write = (async () => {
        await previous?.catch(() => {});
        const file = transcriptFile(p.threadId);
        const temp = `${file}.tmp`;
        await writeFileAsync(temp, JSON.stringify({ cacheVersion: TRANSCRIPT_CACHE_VERSION, entries }));
        await renameFileAsync(temp, file);
      })();
      pendingTranscriptWrites.set(p.threadId, write);
      try {
        await write;
      } finally {
        if (pendingTranscriptWrites.get(p.threadId) === write) pendingTranscriptWrites.delete(p.threadId);
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle("transcript:load", async (_e, threadId: string) => {
    // Caches written before redaction existed may hold raw values.
    return redactSecrets({ entries: await readCachedTranscript(threadId) });
  });

  ipcMain.handle("usage:context", (_e, threadId: string) => {
    return { usage: currentCtxUsage(threadId) };
  });

  ipcMain.handle("usage:billing", () => readBilling());

  // ── Scheduled tasks IPC ─────────────────────────────────────────────

  ipcMain.handle("scheduled:list", () => ({
    tasks: decorate(readTasks()),
    // The panel says so plainly rather than letting tasks look armed while
    // nothing can actually run them.
    engineReady: lastStatus.state === "connected",
  }));

  ipcMain.handle(
    "scheduled:save",
    (
      _e,
      p: { key?: string | null; name: string; prompt: string; schedule: unknown; projectPath?: string | null },
    ) => {
      const name = (p.name ?? "").trim();
      const prompt = (p.prompt ?? "").trim();
      if (!name) return { ok: false, error: "Give the task a name." };
      if (name.length > MAX_NAME_CHARS) return { ok: false, error: `Keep the name under ${MAX_NAME_CHARS} characters.` };
      if (!prompt) return { ok: false, error: "Say what the task should do." };
      if (prompt.length > MAX_PROMPT_CHARS) {
        return { ok: false, error: `Keep the instructions under ${MAX_PROMPT_CHARS} characters.` };
      }
      const checked = validateSchedule(p.schedule);
      if ("error" in checked) return { ok: false, error: checked.error };

      const tasks = readTasks();
      const existing = p.key ? tasks.find((t) => t.key === p.key) : undefined;
      if (!existing && tasks.length >= MAX_TASKS) {
        return { ok: false, error: `That's the limit of ${MAX_TASKS} scheduled tasks.` };
      }
      const projectPath = typeof p.projectPath === "string" && p.projectPath ? p.projectPath : null;
      let next: ScheduledTask[];
      if (existing) {
        // Editing the schedule re-bases the cursor: leaving it where it was
        // means a task moved from 8am to 9am can look overdue the moment it
        // is saved, and fire immediately.
        const rescheduled = JSON.stringify(existing.schedule) !== JSON.stringify(checked.schedule);
        next = tasks.map((t) =>
          t.key === existing.key
            ? {
                ...t,
                name,
                prompt,
                schedule: checked.schedule,
                projectPath,
                ...(rescheduled ? { cursorAt: new Date().toISOString(), missedAt: null } : {}),
              }
            : t,
        );
      } else {
        const now = new Date().toISOString();
        next = [
          ...tasks,
          {
            key: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            prompt,
            schedule: checked.schedule,
            enabled: true,
            projectPath,
            createdAt: now,
            cursorAt: now,
            lastRunAt: null,
            lastStatus: null,
            lastVerdict: null,
            lastVerdictNote: null,
            lastError: null,
            lastThreadId: null,
            missedAt: null,
          },
        ];
      }
      writeTasks(next);
      const decorated = decorate(next);
      send("scheduled:updated", { tasks: decorated });
      return { ok: true, tasks: decorated };
    },
  );

  ipcMain.handle("scheduled:set-enabled", (_e, p: { key: string; enabled: boolean }) => {
    // Re-arming re-bases the cursor too — a task disabled for a week should
    // not fire the instant it is switched back on.
    const patch: Partial<ScheduledTask> = p.enabled
      ? { enabled: true, cursorAt: new Date().toISOString(), missedAt: null }
      : { enabled: false };
    const tasks = updateTask(p.key, patch);
    return { ok: true, tasks: decorate(tasks) };
  });

  ipcMain.handle("scheduled:delete", (_e, key: string) => {
    const next = readTasks().filter((t) => t.key !== key);
    writeTasks(next);
    const decorated = decorate(next);
    send("scheduled:updated", { tasks: decorated });
    return { ok: true, tasks: decorated };
  });

  /**
   * Rewrite a task's prompt with the model, grounded in screenshots.
   *
   * Exists because of a measured failure, not as a nicety: the Slack task
   * flailed for ten minutes — seventy-plus blind keypresses — because its
   * prompt said "set your status" without knowing what that UI looks like.
   * Screenshots turned into exact labels and stop rules are the repair.
   *
   * Design rules, each load-bearing:
   *  - AUGMENT, never replace. Wholesale rewrites drop the constraints the
   *    user tuned by hand (required phrases, tone). The instructions demand
   *    the user's intent and exact required wording survive verbatim.
   *  - Proposed, never applied. This returns text; the form shows old vs new
   *    and the user accepts or discards. A prompt that runs unattended for
   *    months must never change to something nobody read.
   *  - Ephemeral thread. Tuning is authoring-time tooling — it must not
   *    leave a conversation in the sidebar or survive a restart.
   *  - Interrupt on timeout, learned the hard way: a cap that only stops the
   *    app watching leaves the engine running invisibly.
   */
  ipcMain.handle(
    "scheduled:tune",
    async (_e, payload: { prompt?: string; note?: string; images?: string[] }) => {
      const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
      const note = typeof payload?.note === "string" ? payload.note.trim() : "";
      const images = Array.isArray(payload?.images) ? payload.images.filter((x): x is string => typeof x === "string") : [];
      if (!prompt) return { ok: false, error: "There is no prompt to improve yet — write a draft first." };
      if (images.length === 0 && !note) {
        return { ok: false, error: "Add a screenshot or a note — something for Pareto to work from." };
      }
      if (images.length > 4) return { ok: false, error: "Four screenshots at most — pick the ones that show the exact screens involved." };
      for (const img of images) {
        if (!isAbsolute(img) || !existsSync(img) || !statSync(img).isFile()) {
          return { ok: false, error: `Not a readable image file: ${img}` };
        }
        if (!/\.(png|jpe?g|gif|webp)$/i.test(img)) {
          return { ok: false, error: `${img} is not an image (png, jpg, gif or webp).` };
        }
      }

      const instructions = [
        "You are refining the standing instructions for a scheduled, unattended agent run. The",
        "current instructions are below, along with screenshots of the exact interface the run",
        "works in" + (note ? " and a note from the user" : "") + ".",
        "",
        "Rewrite the instructions so a fresh agent with NO memory of this conversation can follow",
        "them mechanically. Rules, all of them binding:",
        "- AUGMENT rather than replace: keep the user's intent, tone and every required phrase or",
        "  constraint from the current instructions verbatim. You are adding precision, not voice.",
        "- Ground every UI step in what the screenshots actually show: name the exact visible",
        "  labels, buttons and menus. Never invent an element that is not in a screenshot.",
        "- Make it self-contained: each run remembers nothing from previous runs.",
        "- State what success looks like, concretely, so the run knows when it is done.",
        "- State when to give up: if a step has not worked after three attempts, stop and report",
        "  what was on screen instead of trying variations. This rule must appear in the rewrite.",
        "- Plain text only. No markdown headings.",
        `- HARD LENGTH BUDGET: the rewritten instructions must be under ${MAX_PROMPT_CHARS} characters`,
        "  in total. Precision beats coverage: fold repeated caveats into one rule, and spend the",
        "  budget on the exact labels and stop conditions rather than restating the same warning",
        "  per step.",
        "",
        "Reply with ONLY the rewritten instructions between the markers, nothing else:",
        "<<<PROMPT",
        "(rewritten instructions here)",
        "PROMPT>>>",
        "",
        "Current instructions:",
        "---",
        prompt,
        "---",
        note ? `User's note: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      let threadId: string | null = null;
      try {
        const started = (await engine.request("thread/start", {
          // Ephemeral: authoring-time tooling, not a conversation — it must
          // not appear in the sidebar or persist a rollout.
          ephemeral: true,
          approvalPolicy: "never",
          sandbox: "read-only",
          cwd: defaultChatDir(),
          threadSource: "unbiased_prompt_tuner",
          config: mcpConfigOverride(overridableServerNames(readMcpConfig().servers), new Set()),
        })) as { thread: { id: string } };
        threadId = started.thread.id;

        const TUNE_TIMEOUT_MS = 3 * 60_000;
        const runTurn = async (input: unknown[]): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
          const settled = new Promise<{ status: RunStatus; error: string | null; text: string }>((resolve) => {
            scheduledRuns.set(threadId!, { key: `tune:${threadId}`, text: "", finalText: "", settle: resolve });
          });
          const timeout = new Promise<{ status: RunStatus; error: string | null; text: string; timedOut?: boolean }>(
            (resolve) => setTimeout(() => resolve({ status: "failed", error: "timed out", text: "", timedOut: true }), TUNE_TIMEOUT_MS),
          );
          const startedTurn = (await engine.request("turn/start", {
            threadId,
            input,
            approvalPolicy: "never",
            sandboxPolicy: { type: "readOnly" },
          })) as { turn?: { id?: string } };
          const outcome = await Promise.race([settled, timeout]);
          if ((outcome as { timedOut?: boolean }).timedOut && startedTurn.turn?.id) {
            await engine.request("turn/interrupt", { threadId: threadId!, turnId: startedTurn.turn.id }).catch(() => undefined);
            return { ok: false, error: "Pareto took too long — try again with fewer screenshots." };
          }
          if (outcome.status !== "completed") return { ok: false, error: outcome.error ?? "The rewrite did not finish." };
          return { ok: true, text: outcome.text };
        };
        const extract = (raw: string): string => {
          // The markers make extraction unambiguous; a reply without them is
          // treated as the whole answer rather than discarded, since a model
          // that ignored the framing may still have written a usable prompt.
          const m = raw.match(/<<<PROMPT\s*([\s\S]*?)\s*PROMPT>>>/);
          return (m ? m[1] : raw).trim();
        };

        const first = await runTurn([
          { type: "text", text: instructions },
          ...images.map((path) => ({ type: "localImage", path })),
        ]);
        if (!first.ok) return first;
        let proposal = extract(first.text);
        if (!proposal) return { ok: false, error: "Pareto returned nothing usable." };
        if (proposal.length > MAX_PROMPT_CHARS) {
          // One automatic compression pass on the same thread rather than an
          // error. The old behaviour told the user "try asking for something
          // tighter" — through a UI with no way to ask. The model wrote the
          // oversized draft; the model can shorten it, and the thread still
          // holds the screenshots and rules it wrote it from.
          const second = await runTurn([
            {
              type: "text",
              text:
                `Your rewrite is ${proposal.length} characters; the hard limit is ${MAX_PROMPT_CHARS}. ` +
                "Compress it to fit: merge repeated caveats into single rules, keep every exact UI label, " +
                "the required phrases, the success definition and the stop-after-three-attempts rule. " +
                "Reply with ONLY the compressed instructions between the same <<<PROMPT and PROMPT>>> markers.",
            },
          ]);
          if (second.ok) {
            const compressed = extract(second.text);
            if (compressed) proposal = compressed;
          }
        }
        if (proposal.length > MAX_PROMPT_CHARS) {
          return {
            ok: false,
            error: `Even compressed, the rewrite is ${proposal.length} characters against a limit of ${MAX_PROMPT_CHARS}. Trim the current instructions first, or tune one section at a time.`,
          };
        }
        return { ok: true, proposal };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        if (threadId) scheduledRuns.delete(threadId);
      }
    },
  );

  ipcMain.handle("scheduled:stop", async (_e, key: string) => {
    const live = runningTaskKeys.get(key);
    if (!live?.threadId || !live.turnId) {
      // Between thread/start and turn/start there is a window with no turn to
      // interrupt. Say so rather than reporting a stop that did not happen.
      return { ok: false, error: live ? "The run has not started its turn yet — try again in a moment." : "That task is not running." };
    }
    try {
      await engine.request("turn/interrupt", { threadId: live.threadId, turnId: live.turnId });
      // The engine answers with turn/completed status "interrupted", which the
      // scheduled-run listener settles — so the run records itself as
      // interrupted through the normal path. Nothing to unwind here.
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("scheduled:run-now", async (_e, key: string) => {
    const task = readTasks().find((t) => t.key === key);
    if (!task) return { ok: false, error: "That task no longer exists." };
    if (lastStatus.state !== "connected") return { ok: false, error: "Sign in first — the engine isn't running." };
    const outcome = await runScheduledTask(task, "manual");
    return { ok: outcome.status === "completed", ...outcome };
  });

  // The run's transcript is a real thread; opening it is the existing
  // threads:open path, so the panel only needs the id.
  ipcMain.handle("scheduled:last-run", (_e, key: string) => {
    const task = readTasks().find((t) => t.key === key);
    if (!task) return { threadId: null };
    return { threadId: task.lastThreadId, status: task.lastStatus, error: task.lastError, at: task.lastRunAt };
  });


  // ── Resource + storage stats (Settings → Resources) ─────────────────
  // Live process metrics: Chromium's own processes via getAppMetrics(),
  // plus the children WE spawn (engine, terminal shells), which Chromium
  // doesn't track — measured with one `ps` call.
  ipcMain.handle("stats:resources", async () => {
    const procs = app.getAppMetrics().map((m) => ({
      pid: m.pid,
      kind: m.type, // Browser | Tab | GPU | Utility …
      memMB: (m.memory?.workingSetSize ?? 0) / 1024,
      cpu: m.cpu?.percentCPUUsage ?? 0,
    }));
    const extras: { pid: number; kind: string }[] = [];
    if (engine.pid) extras.push({ pid: engine.pid, kind: "engine" });
    for (const pty of ptys.values()) extras.push({ pid: pty.pid, kind: "terminal" });
    const extraProcs: { pid: number; kind: string; memMB: number; cpu: number }[] = [];
    if (extras.length) {
      try {
        const out = await new Promise<string>((resolve, reject) =>
          execFile(
            "ps",
            ["-o", "pid=,rss=,pcpu=", "-p", extras.map((e) => e.pid).join(",")],
            (err, stdout) => (err ? reject(err) : resolve(stdout)),
          ),
        );
        for (const line of out.trim().split("\n")) {
          const [pid, rss, pcpu] = line.trim().split(/\s+/);
          const kind = extras.find((e) => e.pid === Number(pid))?.kind;
          if (kind) extraProcs.push({ pid: Number(pid), kind, memMB: Number(rss) / 1024, cpu: Number(pcpu) });
        }
      } catch {
        // some pid exited between listing and ps — fine, report what we have
      }
    }
    return { procs: [...procs, ...extraProcs] };
  });

  // What each conversation costs on disk: the engine's append-only rollout
  // (filename embeds the thread id) + our transcript cache. Worktrees and
  // the engine home measured with `du`.
  ipcMain.handle("stats:storage", async () => {
    const engineHome =
      lastStatus.state === "connected"
        ? lastStatus.codexHome
        : join(app.getPath("home"), ".unbiased", "app-engine", "home");
    const threads: Record<
      string,
      {
        rolloutBytes: number;
        transcriptBytes: number;
        mtime: number;
        agent?: { nickname: string | null; task: string; parent: string | null };
      }
    > = {};
    const entry = (id: string) => (threads[id] ??= { rolloutBytes: 0, transcriptBytes: 0, mtime: 0 });
    // A sub-agent's rollout opens with a session_meta line naming its
    // nickname, agent path, and parent thread — enough to label the row
    // like a conversation instead of a bare thread id.
    const agentMeta = (file: string): { nickname: string | null; task: string; parent: string | null } | null => {
      try {
        const fd = openSync(file, "r");
        const buf = Buffer.alloc(65536);
        const n = readSync(fd, buf, 0, buf.length, 0);
        closeSync(fd);
        const firstLine = buf.toString("utf8", 0, n).split("\n")[0];
        const meta = JSON.parse(firstLine) as {
          payload?: { agent_path?: string; agent_nickname?: string; parent_thread_id?: string };
        };
        const path = meta.payload?.agent_path;
        if (!path) return null;
        return {
          nickname: meta.payload?.agent_nickname ?? null,
          task: path.split("/").filter(Boolean).pop() ?? path,
          parent: meta.payload?.parent_thread_id ?? null,
        };
      } catch {
        return null; // meta line longer than the probe, or not a sub-agent
      }
    };
    const walkSessions = (dir: string): void => {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const n of names) {
        const p = join(dir, n);
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) walkSessions(p);
        else {
          const m = n.match(/^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
          if (m) {
            const e = entry(m[1]);
            e.rolloutBytes += st.size;
            e.mtime = Math.max(e.mtime, st.mtimeMs);
            if (!e.agent) e.agent = agentMeta(p) ?? undefined;
          }
        }
      }
    };
    walkSessions(join(engineHome, "sessions"));
    try {
      for (const n of readdirSync(transcriptsDir())) {
        if (!n.endsWith(".json")) continue;
        try {
          entry(n.slice(0, -5)).transcriptBytes = statSync(join(transcriptsDir(), n)).size;
        } catch {
          // race with deletion
        }
      }
    } catch {
      // no transcripts yet
    }
    const duKB = (dir: string): Promise<number> =>
      new Promise((resolve) =>
        execFile("du", ["-sk", dir], (err, stdout) => resolve(err ? 0 : Number(stdout.split(/\s+/)[0]) || 0)),
      );
    const wtMap = loadWorktrees();
    const worktrees = await Promise.all(
      Object.entries(wtMap)
        .filter(([dir]) => existsSync(dir))
        .map(async ([dir, info]) => ({ dir, project: info.project, branch: info.branch, kb: await duKB(dir) })),
    );
    const engineHomeKB = await duKB(engineHome);
    return { threads, worktrees, engineHomeKB };
  });

  ipcMain.handle("planmode:set", (_e, on: boolean) => {
    planMode = !!on;
    return { planMode };
  });

  ipcMain.handle("workmode:set", (_e, p: { mode: string; dir?: string }) => {
    if (p.mode === "local" || p.mode === "worktree") workMode = p.mode;
    else if (p.mode === "existing" && p.dir) workMode = { existing: p.dir };
    return { ok: true };
  });

  // Delete a conversation worktree: git removes it from the parent repo's
  // bookkeeping (force — agent work in it is disposable by definition once
  // the user deletes it), falling back to a plain rm if the repo is gone.
  ipcMain.handle("worktrees:remove", async (_e, dir: string) => {
    const map = loadWorktrees();
    const info = map[dir];
    if (info) {
      const removed = await new Promise<boolean>((resolve) => {
        execFile(
          "git",
          ["-C", info.project, "worktree", "remove", "--force", dir],
          { timeout: 30000 },
          (error) => resolve(!error),
        );
      });
      if (!removed) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      }
      delete map[dir];
      writeFileSync(worktreesFile(), JSON.stringify(map, null, 2) + "\n");
    } else {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
    return { ok: true };
  });

  // Worktrees previously created for a project (and still on disk).
  ipcMain.handle("worktrees:list", (_e, project: string) => {
    const map = loadWorktrees();
    const worktrees = Object.entries(map)
      .filter(([dir, info]) => info.project === project && existsSync(dir))
      .map(([dir, info]) => ({ dir, branch: info.branch }));
    return { worktrees };
  });

  // What the ACTIVE main conversation is actually working in.
  ipcMain.handle("conversation:info", () => {
    const wt = mainCwd ? loadWorktrees()[mainCwd] : undefined;
    return {
      cwd: mainCwd,
      isWorktree: !!wt,
      project: wt?.project ?? null,
      branch: wt?.branch ?? null,
    };
  });

  ipcMain.handle("policy:set-mode", (_e, mode: string) => {
    if (mode === "ask" || mode === "auto" || mode === "full") accessMode = mode;
    // The engine's own approvalPolicy is fixed at thread/start and cannot
    // follow, but this app's local cards can and should: a user who sets Full
    // access mid-conversation means it now, not in the next conversation.
    // Clearing session grants with it, so tightening the mode really tightens.
    if (accessMode === "ask") {
      axGrants.clear();
      browserNetGrants.clear();
      browserConnectGrants.clear();
    }
    return { mode: accessMode };
  });

  ipcMain.handle("chat:interrupt", async (_e, paneId: PaneId) => {
    const pane = ensurePane(paneId);
    // The per-thread record covers a conversation reopened mid-turn,
    // where the pane's own turnId may not have been set by turn/started.
    const turnId = pane.turnId ?? (pane.threadId ? runningTurns.get(pane.threadId) : null);
    if (!pane.threadId || !turnId) return { interrupted: false };
    await engine.request("turn/interrupt", { threadId: pane.threadId, turnId });
    // Stop means stop: sub-agents run in their own sessions, so without a
    // cascade they keep working (and a sub blocked on an approval would
    // wait forever). Queued corrections still reach them — the engine
    // starts a fresh turn for pending mail after an interrupt.
    for (const [subId, info] of subAgents) {
      if (info.parent !== pane.threadId) continue;
      const subTurn = runningTurns.get(subId);
      if (!subTurn) continue;
      try {
        await engine.request("turn/interrupt", { threadId: subId, turnId: subTurn });
      } catch {
        // sub turn may have just ended on its own
      }
    }
    return { interrupted: true };
  });

  // Manually summarize the conversation's history. Useful when a very
  // tool-dense conversation starts returning empty completions: replacing
  // the verbatim tool-call log with a summary cuts the density that trips
  // the gateway's cascade. Emits a contextCompaction item on completion,
  // which the renderer already renders as a divider.
  ipcMain.handle("chat:compact", async (_e, paneId: PaneId) => {
    const pane = ensurePane(paneId);
    if (!pane.threadId) return { ok: false, error: "no conversation" };
    const threadId = pane.threadId;
    if (compactingThreads.has(threadId)) return { ok: true };
    updateThreadCompaction(threadId, "started");
    try {
      await engine.request("thread/compact/start", { threadId });
      return { ok: true };
    } catch (err) {
      updateThreadCompaction(threadId, "failed");
      return { ok: false, error: String(err) };
    }
  });

  // Which approvals are actually still answerable. A card restored from the
  // transcript looks identical to a live one, so the renderer has to ask —
  // otherwise a request whose turn died with the app still shows Allow/Deny.
  // ---- MCP servers -------------------------------------------------------
  // Mirrors internal/engine/mcp.go. Kept in sync by hand and deliberately
  // NOT authoritative: the engine revalidates before writing config.toml.
  // This copy exists only so the form can refuse a bad server immediately
  // instead of after an engine restart.
  /** Persist the server list. Shared by the save handler and the OAuth
   *  registration path, which must not lose the file it just read. */
  function writeMcpConfig(servers: UserMcpServer[]): boolean {
    try {
      const tmp = `${mcpConfigPath()}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ servers }, null, 2), { mode: 0o600 });
      renameSync(tmp, mcpConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  const MCP_NAME_RE = /^[A-Za-z0-9_-]+$/;
  const MCP_NAME_MAX = 24;
  function validateMcpServer(srv: UserMcpServer): string | null {
    if (!srv.name || !MCP_NAME_RE.test(srv.name)) {
      return "Name can use only letters, digits, underscores and hyphens.";
    }
    if (srv.name.length > MCP_NAME_MAX) {
      return `Name must be ${MCP_NAME_MAX} characters or fewer, so its tool names stay within the gateway's limit.`;
    }
    const hasCmd = !!srv.command, hasUrl = !!srv.url;
    if (hasCmd && hasUrl) return "Give a command or a URL, not both.";
    if (!hasCmd && !hasUrl) return "Give a command (local) or an https URL (remote).";
    if (hasUrl) {
      // Mirrors isLoopbackHost in internal/engine/mcp.go. Plaintext is refused
      // for a network hop, but a loopback server never leaves the machine —
      // and locally-run servers are the common case (Figma's Dev Mode server
      // is http://127.0.0.1:3845/mcp). Loopback only: 192.168/10./169.254 are
      // real hops and stay refused.
      let u: URL;
      try {
        u = new URL(srv.url!);
      } catch {
        return "That is not a valid URL.";
      }
      // new URL() keeps IPv6 literals bracketed; strip them before parsing.
      // Lowercased to match the engine, whose url.Parse preserves host case —
      // "LocalHost" passed here and was then refused there, so the app could
      // save a config that stopped the engine from booting.
      const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      const loopback = host === "localhost" || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
      if (u.protocol === "http:" && !loopback) {
        return "http is allowed only for a server on this machine (localhost). Use https for anything else.";
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return "The URL must start with https://, or http:// for a server on this machine.";
      }
    }
    for (const [k, v] of Object.entries(srv.env ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return `"${k}" is not a valid environment variable name.`;
      if (k === "UNBIASED_API_KEY" || k === "CODEX_HOME") return `${k} is reserved and cannot be set.`;
      if (/["\\]|[\u0000-\u001f]/.test(v)) return `The value for ${k} contains a character that is not allowed.`;
    }
    for (const v of [srv.command ?? "", srv.url ?? "", ...(srv.args ?? [])]) {
      if (/["\\]|[\u0000-\u001f]/.test(v)) return "Commands and arguments cannot contain quotes or backslashes.";
    }
    // The engine refuses these too. Without them here, a value that arrived
    // from a hand-edited file round-tripped through this save and then stopped
    // the engine from starting.
    for (const [field, n] of [["Startup timeout", srv.startupTimeoutSec], ["Tool timeout", srv.toolTimeoutSec]] as const) {
      if (n === undefined || n === null) continue;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return `${field} must be a positive number of seconds.`;
    }
    for (const t of srv.enabledTools ?? []) {
      if (typeof t !== "string" || !MCP_NAME_RE.test(t)) {
        return `Tool name "${String(t)}" can use only letters, digits, underscores and hyphens.`;
      }
    }
    return null;
  }
  /**
   * Trim an MCP icon's transparent padding.
   *
   * Servers ship icons on generous canvases: Figma's is 128x160 with a 52x76
   * mark centred in it, so only 41% of the width is ink. Rendered at any size
   * the glyph looks shrunken and mis-centred, because the box being centred is
   * mostly nothing. Every attempt to fix that by growing the container just
   * grows the padding with it.
   *
   * Cropping to the alpha bounding box makes the icon fill the space it is
   * given, and makes servers with different padding conventions render at the
   * same visual weight. Cached by source, since the list is re-fetched every
   * time the panel opens and the bitmap never changes.
   */
  const iconTrimCache = new Map<string, string>();
  function trimIcon(src: string): string {
    const cached = iconTrimCache.get(src);
    if (cached) return cached;
    let out = src;
    try {
      const img = nativeImage.createFromDataURL(src);
      const { width, height } = img.getSize();
      if (width > 0 && height > 0) {
        const bmp = img.toBitmap(); // BGRA, row-major
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (bmp[(y * width + x) * 4 + 3] <= 8) continue; // transparent
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        // Only worth doing when there is real padding to remove; a 1-2px
        // margin is not worth re-encoding, and an empty image must not crop
        // to nothing.
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        if (maxX >= 0 && (w < width * 0.9 || h < height * 0.9)) {
          out = img.crop({ x: minX, y: minY, width: w, height: h }).toDataURL();
        }
      }
    } catch {
      // An icon we cannot decode is passed through untouched; the renderer
      // filters what it will actually display anyway.
    }
    iconTrimCache.set(src, out);
    return out;
  }

  ipcMain.handle("mcp:thread-get", (_e, threadId: string | null) => {
    const cfg = readMcpConfig();
    const automatic = connectedConnectors(cfg.servers);
    const automaticNames = new Set(automatic);
    return {
      // Only servers that can actually be switched: a secret-bearing one is a
      // managed plugin; catalogue connectors are available in every chat.
      configured: overridableServerNames(cfg.servers).filter((name) => !automaticNames.has(name)),
      enabled: enabledMcpFor(threadId).filter((name) => !automaticNames.has(name)),
      automatic,
      pending: threadId ? mcpApplyPending.has(threadId) : false,
      running: threadId ? runningTurns.has(threadId) : false,
    };
  });

  ipcMain.handle("mcp:thread-set", async (_e, payload: { threadId: string | null; enabled: string[] }) => {
    const names = [...new Set(payload.enabled.filter((nm) => typeof nm === "string"))];
    const decision = mcpApplyDecision({
      threadId: payload.threadId,
      running: payload.threadId ? runningTurns.has(payload.threadId) : false,
    });
    // No thread yet: the composer's choice is held and consumed by the
    // thread/start the first message makes.
    if (decision === "pending-new-thread") {
      pendingNewThreadMcp = names;
      send("mcp:thread-applied", { threadId: null, enabled: names, status: "pending-new-thread" });
      return { status: "pending-new-thread" as const };
    }
    const threadId = payload.threadId as string;
    const root = rootThreadOf(threadId);
    if (names.length) threadMcp.set(root, new Set(names));
    else threadMcp.delete(root);
    saveThreadMcp();
    if (decision === "queue") {
      mcpApplyPending.add(threadId);
      send("mcp:thread-applied", { threadId, enabled: names, status: "queued" });
      return { status: "queued" as const };
    }
    try {
      await applyThreadMcp(threadId);
      return { status: "applied" as const };
    } catch (err) {
      // "no rollout found": a thread that has not completed a turn cannot be
      // resumed. The set is saved; it applies on the next load.
      send("mcp:thread-applied", { threadId, enabled: names, status: "saved", error: String(err) });
      return { status: "saved" as const, error: String(err) };
    }
  });

  ipcMain.handle("mcp:list", async () => {
    const cfg = readMcpConfig();
    let connected: unknown[] = [];
    let error: string | null = null;
    try {
      const res = (await engine.request("mcpServerStatus/list", {})) as { data?: unknown[] };
      connected = (Array.isArray(res?.data) ? res.data : []).map((srv) => {
        const s = srv as { serverInfo?: { icons?: { src?: unknown }[] | null } | null };
        const icons = s?.serverInfo?.icons;
        if (!Array.isArray(icons) || icons.length === 0) return srv;
        return {
          ...s,
          serverInfo: {
            ...s.serverInfo,
            icons: icons.map((ic) =>
              typeof ic?.src === "string" && ic.src.startsWith("data:image/")
                ? { ...ic, src: trimIcon(ic.src) }
                : ic,
            ),
          },
        };
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    // configError is reported separately from `error`: one means "the engine
    // did not answer", the other "your file is broken" — and only the second
    // must block saving.
    return { connected, configured: cfg.servers, error, configError: cfg.error };
  });
  /** Must match mcp_oauth_callback_port in the engine's config template. */
  const MCP_CALLBACK_PORT = 45999;

  /**
   * The redirect URI codex will use for a given MCP server.
   *
   * Measured rather than assumed: the path is base64url of the first nine
   * bytes of sha256(serverUrl), which reproduced codex's own value exactly for
   * two unrelated URLs, and the same URL under two different server NAMES gave
   * a byte-identical path — so it keys off the URL alone. The port half comes
   * from mcp_oauth_callback_port, which the engine pins for this reason.
   *
   * This has to be exact. A registration declaring any other redirect URI is
   * rejected at the authorize step, and the failure surfaces as an opaque
   * provider error rather than anything naming the mismatch.
   */
  function mcpRedirectUri(serverUrl: string): string {
    // Hashed AFTER URL normalization, because that is what codex hashes: its
    // Rust Url type always renders an empty path as "/", so a pathless server
    // like https://mcp.stripe.com becomes https://mcp.stripe.com/ before the
    // digest. Hashing the raw string registered a callback the provider then
    // rejected at authorize time as "not registered" — measured on Stripe,
    // where the failing redirect matched the normalized form exactly. URLs
    // with a real path (Slack's /mcp) are unchanged by this, which is why
    // they worked and hid the bug.
    const normalized = new URL(serverUrl).toString();
    const digest = createHash("sha256").update(normalized).digest().subarray(0, 9);
    const path = digest.toString("base64url");
    return `http://127.0.0.1:${MCP_CALLBACK_PORT}/callback/${path}`;
  }

  /** One hop of OAuth metadata discovery. Returns null rather than throwing:
   *  a provider that does not serve a document is a normal outcome here, not
   *  an error worth surfacing. */
  async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Find a provider's dynamic-registration endpoint, following RFC 9728 then
   * RFC 8414. The MCP server advertises its authorization server; that server
   * advertises where clients register.
   */
  async function discoverRegistrationEndpoint(
    serverUrl: string,
  ): Promise<{ endpoint: string; scopes: string[] } | null> {
    const prm = await discoverProtectedResourceMetadata(serverUrl);
    const scopes = protectedResourceScopes(prm);
    const servers = Array.isArray(prm?.authorization_servers) ? (prm!.authorization_servers as unknown[]) : [];
    const u = new URL(serverUrl);
    const issuer = typeof servers[0] === "string" ? (servers[0] as string) : u.origin;
    const iss = new URL(issuer);
    const meta =
      (await fetchJson(`${iss.origin}/.well-known/oauth-authorization-server${iss.pathname === "/" ? "" : iss.pathname}`)) ??
      (await fetchJson(`${iss.origin}/.well-known/oauth-authorization-server`)) ??
      (await fetchJson(`${iss.origin}/.well-known/openid-configuration`));
    const endpoint = meta?.registration_endpoint;
    if (typeof endpoint !== "string" || !endpoint) return null;
    // Credentials are about to be created here, so the hop must be protected.
    // Loopback is allowed because a server on this machine never leaves it.
    const e = new URL(endpoint);
    const loopback = e.hostname === "localhost" || e.hostname === "127.0.0.1" || e.hostname === "::1";
    if (e.protocol !== "https:" && !loopback) return null;
    return { endpoint, scopes };
  }

  async function discoverProtectedResourceMetadata(serverUrl: string): Promise<Record<string, unknown> | null> {
    const u = new URL(serverUrl);
    // RFC 9728 puts the resource's path AFTER the well-known segment; the
    // bare form is the fallback, and providers differ on which they serve.
    return (await fetchJson(`${u.origin}/.well-known/oauth-protected-resource${u.pathname}`)) ??
      (await fetchJson(`${u.origin}/.well-known/oauth-protected-resource`));
  }

  /**
   * Register US with the provider, as us.
   *
   * This is the whole point: codex's own dynamic registration sends
   * client_name "Codex" and no logo at all, and neither is configurable. By
   * registering first we choose both, and hand codex only the resulting
   * client_id — at which point it skips its own registration entirely and runs
   * the authorization against our client. Nothing is intercepted or spoofed;
   * this is the provider's documented endpoint, and we are the client.
   */
  async function registerOAuthClient(serverUrl: string): Promise<{ clientId: string; scopes: string[] } | { error: string }> {
    const firstParty = firstPartyMcpRegistration(serverUrl);
    if (firstParty) return firstParty;
    const discovered = await discoverRegistrationEndpoint(serverUrl);
    if (!discovered) return { error: "This server does not offer dynamic client registration." };
    const { endpoint } = discovered;
    const redirectUri = mcpRedirectUri(serverUrl);
    const attempt = async (scope: string | null) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          client_name: "Unbiased",
          client_uri: "https://unbiased.ai",
          // The site's 1024x1024 app icon, verified to resolve. A guessed
          // /icon.png 404'd, and a logo_uri the provider cannot fetch renders
          // as a broken-image placeholder on the consent screen — worse than
          // sending none, because it looks like the app is malfunctioning at
          // the exact moment it is asking to be trusted. The og image is a
          // 1200x630 banner and the wrong shape for this.
          logo_uri: "https://unbiased.ai/assets/unbiased-icon.png",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          // Native app, no secret to keep — the flow is PKCE-protected, and
          // this matches what codex asks for so the client it receives is the
          // shape it expects.
          token_endpoint_auth_method: "none",
          application_type: "native",
          ...(scope ? { scope } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return { res, body };
    };
    // Scope negotiation, widest first. Providers disagree fatally in BOTH
    // directions: Hydra-style registrars (Higgsfield) refuse an AUTHORIZE for
    // any scope the client was not registered with, so registering without
    // scopes bricks the sign-in — while Stripe's registrar refuses the
    // REGISTRATION itself for scopes it does not support ("Not supported:
    // openid, profile, email, offline_access"). So: try the provider's
    // advertised set plus the OIDC quartet; on a scope complaint fall back to
    // the advertised set alone; then to no scope field at all, which is the
    // pre-negotiation behaviour that Stripe accepted.
    const wide = [...new Set([...discovered.scopes, "openid", "profile", "email", "offline_access"])].join(" ");
    const advertised = discovered.scopes.join(" ");
    const ladder = [...new Set([wide || null, advertised || null, null])];
    try {
      let lastDetail = "";
      for (const scope of ladder) {
        const { res, body } = await attempt(scope);
        if (res.ok) {
          const clientId = typeof body?.client_id === "string" ? body.client_id : "";
          if (!clientId) return { error: "The provider returned no client_id." };
          return { clientId, scopes: discovered.scopes };
        }
        lastDetail = typeof body?.error_description === "string" ? body.error_description : `HTTP ${res.status}`;
        const scopeComplaint = /scope|not supported/i.test(
          `${body?.error ?? ""} ${body?.error_description ?? ""}`,
        );
        if (!scopeComplaint) break; // a different failure — narrowing scopes will not help
      }
      return { error: `The provider refused the registration (${lastDetail}).` };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Sign in to an MCP server that wants OAuth.
   *
   * The engine has done this all along — codex implements the full OAuth 2.1
   * flow with dynamic client registration, keyring storage and refresh — and
   * the app simply never called it. What the user got instead was the
   * engine's own not-logged-in error, which ends "Run `codex mcp login
   * <name>`": a CLI this product does not ship, against a CODEX_HOME this
   * product does not use. The model relayed that faithfully because it was
   * the only instruction anyone had given it.
   *
   * The authorization URL opens in the user's normal browser, not the Agent
   * browser: they are signing in as themselves, and the callback comes back
   * to a loopback port the engine is already listening on.
   */
  /**
   * The bundled connector catalogue.
   *
   * Read from the engine's own plugin directory rather than hardcoded here:
   * the names, descriptions, categories and logos are already shipped with the
   * pinned binary, and a hand-kept copy would drift the first time it moved.
   *
   * Filtered to remote servers with NO oauth block of their own. That is the
   * exact set that supports on-the-spot registration, which is what lets us
   * register as Unbiased instead of letting codex register as "Codex". The
   * ones carrying a baked-in client_id (Slack) or an unsubstituted placeholder
   * (the Google set, Airtable, Shopify, Zoom) are deliberately left out — they
   * would either show someone else's name on the consent screen or fail
   * outright, and a catalogue entry that cannot work is worse than no entry.
   */
  /**
   * Connectors kept out of the catalogue because they cannot complete a
   * sign-in here.
   *
   * The rule this enforces: an entry that cannot work is worse than no entry.
   * A card that fails only after the user clicks Connect spends their trust to
   * teach them the feature is unreliable.
   *
   * Measured, not assumed — every server in the catalogue was probed for an
   * RFC 8414 registration_endpoint on 2026-08-27, and github is the sole
   * member. Re-run that probe before adding or removing anything here; the
   * providers can change their minds.
   */
  const CONNECTORS_WITHOUT_REGISTRATION: Record<string, string> = {
    // api.githubcopilot.com publishes authorization-server metadata but no
    // registration_endpoint, and codex's own fallback fails the same way
    // ("Dynamic client registration not supported"). It needs an OAuth
    // application registered by hand, so it belongs here until someone does
    // that and supplies its client id.
    github: "GitHub does not offer automatic sign-up",
    // Removed at the user's request after its provider rejected codex's scope
    // request. Possibly fixable now that registration negotiates scopes —
    // delete this line to let it back into the catalogue and find out.
    higgsfield: "Higgsfield's OAuth rejects the engine's scope request",
    // Gmail's MCP endpoint is gated behind Google's Workspace Developer
    // Preview Program: after a fully successful OAuth sign-in (proxied
    // authorize + secret-injected token exchange, both confirmed working), the
    // first tool call still answers "requires that your Google Cloud project
    // is enrolled". Enrollment is per-project, accepts Workspace accounts
    // only, and preview terms are pre-GA. Everything the connector needs on
    // OUR side works; the gate is entirely Google's, so the card would only
    // spend the user's trust. Delete this line once the API reaches GA.
    gmail: "Gmail's API is limited to Google's Workspace Developer Preview",
    // Removed with Gmail. Same provider, same preview-gated MCP endpoints, and
    // the same per-project enrollment that accepts Workspace accounts only —
    // so the setup cost lands on every user for a connector that may refuse
    // them at the first tool call. The engine's managed-plugin path and the
    // app's secret-injecting proxy stay in place and tested: re-listing these
    // is deleting two lines, once Google's APIs are generally available.
    "google-calendar": "Google Calendar's MCP API is preview-gated",
    "google-drive": "Google Drive's MCP API is preview-gated",
  };

  /**
   * Connectors that work only with an OAuth application the user registers
   * themselves — the provider offers no on-the-spot sign-up, and the client
   * id the bundle ships belongs to someone else. Slack's is OpenAI's: use it
   * and the consent screen says "ChatGPT (Local)" is requesting access to
   * your workspace (measured). These appear in the catalogue as
   * setup-required rather than being hidden, because "register an app and
   * paste its id" is a real path the detail page already supports — hiding
   * the entry just made the path undiscoverable.
   */
  const CONNECTORS_BRING_YOUR_OWN: Record<string, { secret?: boolean }> = {
    slack: {},
    // `secret: true` routes a connector through the engine's managed-plugin
    // path and the app's secret-injecting proxy — built and tested for the
    // Google trio, which is currently not offered (see the map above). The
    // machinery is provider-agnostic and stays ready for the next provider
    // whose token exchange demands a client secret.
  };

  function connectorCatalogueDir(): string {
    return join(app.getPath("home"), ".unbiased", "app-engine", "home", ".tmp", "plugins", "plugins");
  }

  /** Load a logo the manifest names outright, e.g. "./assets/logo.png".
   *  Kept inside the plugin directory: a path escaping it is a malformed
   *  manifest, not a file to go and read. */
  function connectorIconAt(dir: string, rel: string): string | null {
    const full = join(dir, rel.replace(/^\.\//, ""));
    if (!full.startsWith(dir)) return null;
    try {
      if (!statSync(full).isFile()) return null;
      const b64 = readFileSync(full).toString("base64");
      const mime = full.endsWith(".svg") ? "image/svg+xml" : "image/png";
      const src = `data:${mime};base64,${b64}`;
      return mime === "image/png" ? trimIcon(src) : src;
    } catch {
      return null;
    }
  }

  /** A connector's logo, inlined so the renderer needs no file access. Prefers
   *  a full-colour raster over the small monochrome marks, which are drawn for
   *  a composer chip rather than a card. */
  function connectorIcon(dir: string, name: string): string | null {
    const assets = join(dir, "assets");
    const prefer = [`${name}.png`, "logo.png", "app-icon.png", `${name}.svg`, "logo.svg"];
    for (const file of prefer) {
      const full = join(assets, file);
      try {
        if (!statSync(full).isFile()) continue;
        const b64 = readFileSync(full).toString("base64");
        const mime = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
        const src = `data:${mime};base64,${b64}`;
        return mime === "image/png" ? trimIcon(src) : src;
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  }

  type Connector = {
    name: string;
    url: string;
    displayName: string;
    description: string;
    longDescription: string;
    developer: string | null;
    version: string | null;
    category: string;
    capabilities: string[];
    prompts: string[];
    brandColor: string | null;
    websiteUrl: string | null;
    privacyUrl: string | null;
    termsUrl: string | null;
    supportUrl: string | null;
    icon: string | null;
    enabled: boolean;
    /** What a hand-registered OAuth app must declare as its callback. Shown
     *  rather than explained: it is unguessable, and one wrong character fails
     *  at the authorize step with an error naming nothing useful. */
    redirectUri: string;
    /** The provider offers no automatic sign-up and the shipped client id is
     *  someone else's — connecting requires the user's own registered app. */
    requiresClientId: boolean;
    /** The provider's token exchange demands a client secret too (Google). */
    requiresSecret: boolean;
    /** Listed, but not connectable yet — the provider-side app is not ready. */
    comingSoon: boolean;
    /** Provider-specific setup guidance, from the catalogue. */
    setupNote: string | null;
    scopes: string[];
    /** A client id already configured for this connector, so the field shows
     *  what is in effect rather than an empty box next to a working setup. */
    clientId: string | null;
  };

  /**
   * These entries are written for codex, and six of the sixteen say so in
   * their own copy — "Manage issues, projects, and team workflows in Linear
   * from Codex." Shipping that verbatim would reintroduce, in our own UI, the
   * exact identity leak the OAuth work was about. The catalogue is read at
   * runtime so it cannot be corrected at the source.
   */
  function deCodex(text: string): string {
    return text.replace(/\bCodex\b/g, "Pareto");
  }

  function str(o: Record<string, unknown>, key: string): string | null {
    const v = o[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }

  /** Where the last verified catalogue is kept, so the Connectors page works
   *  offline and on first launch after an update. */
  function cataloguePath(): string {
    return join(app.getPath("home"), ".unbiased", "connector-catalogue.json");
  }

  let catalogueCache: Catalogue | null = null;
  // Exposed to startEngine, which lives outside this scope.
  refreshCatalogueAtStartup = () => void refreshCatalogue();
  let catalogueLoaded = false;
  let catalogueRefreshing: Promise<void> | null = null;

  function loadCachedCatalogue(): Catalogue | null {
    if (catalogueLoaded) return catalogueCache;
    catalogueLoaded = true;
    try {
      const raw = JSON.parse(readFileSync(cataloguePath(), "utf8")) as {
        payload?: string;
        etag?: string | null;
        cacheVersion?: number;
      };
      // Discard a cache written by a build that parsed fewer fields than this
      // one. Otherwise its next revalidation is a 304, the stale copy stands,
      // and the new field stays invisible until the publisher happens to
      // change something.
      if (raw?.cacheVersion !== CATALOGUE_CACHE_VERSION) return (catalogueCache = null);
      // The cache stores the VERIFIED payload text and re-parses it, rather
      // than storing parsed objects: one parser, one set of rules, and a build
      // that learns a new field recovers it from the original bytes.
      if (typeof raw?.payload === "string") {
        catalogueCache = parseCatalogue(raw.payload, typeof raw.etag === "string" ? raw.etag : null, new Date().toISOString());
      }
    } catch {
      catalogueCache = null;
    }
    return catalogueCache;
  }

  /**
   * Refresh from the catalogue repo. Never throws and never blocks the caller
   * on a slow network: a failure leaves the previous copy in place, which is
   * the whole point — a bad publish or an offline morning degrades to
   * yesterday's list, not to an empty page.
   */
  async function refreshCatalogue(): Promise<void> {
    if (catalogueRefreshing) return catalogueRefreshing;
    catalogueRefreshing = (async () => {
      const current = loadCachedCatalogue();
      // `current` arms the rollback check: a genuinely-signed but OLDER payload
      // is refused rather than accepted, so whoever can write the bucket
      // cannot quietly reinstate a withdrawn connector.
      const res = await fetchCatalogueFromAnyHost(current?.etag ?? null, { current });
      if (!res.ok) {
        if (res.reason === "rollback")
          console.warn(
            `[connectors] REFUSED an older catalogue than the one cached (${current?.publishedAt}) — keeping the cached copy`,
          );
        else if (res.reason !== "unchanged") console.log(`[connectors] catalogue refresh skipped: ${res.reason}`);
        return;
      }
      const changed = current?.publishedAt !== res.catalogue.publishedAt;
      catalogueCache = res.catalogue;
      catalogueLoaded = true;
      // Only when it actually differs: a push on every refresh would reload
      // the page's list for nothing several times a session.
      if (changed) send("connectors:changed", { publishedAt: res.catalogue.publishedAt });
      try {
        writeFileSync(
          cataloguePath(),
          // The payload verbatim — re-serialising the parsed form is what made
          // a new field unrecoverable from an existing cache.
          JSON.stringify({
            cacheVersion: CATALOGUE_CACHE_VERSION,
            payload: res.catalogue.raw,
            etag: res.catalogue.etag,
          }),
          { mode: 0o600 },
        );
      } catch (err) {
        console.log(`[connectors] could not cache the catalogue: ${String(err)}`);
      }
      console.log(
        `[connectors] catalogue updated: ${res.catalogue.connectors.length} entries, published ${res.catalogue.publishedAt}`,
      );
    })().finally(() => {
      catalogueRefreshing = null;
    });
    return catalogueRefreshing;
  }

  /** A published entry, in the shape the rest of the app already speaks. */
  function connectorFromCatalogue(e: CatalogueEntry): Connector {
    return {
      name: e.name,
      url: e.url,
      displayName: e.displayName,
      description: e.description,
      longDescription: e.longDescription,
      developer: e.developer,
      version: null,
      category: e.category,
      capabilities: e.capabilities,
      prompts: e.prompts,
      brandColor: e.brandColor,
      websiteUrl: e.websiteUrl,
      privacyUrl: e.privacyUrl,
      termsUrl: e.termsUrl,
      supportUrl: e.supportUrl,
      icon: e.icon,
      redirectUri: mcpRedirectUri(e.url),
      clientId: null,
      enabled: true,
      requiresClientId: e.requiresClientId,
      requiresSecret: e.requiresSecret,
      comingSoon: e.comingSoon,
      setupNote: e.setupNote,
      scopes: e.scopes,
    };
  }

  /**
   * The connector list. Published catalogue first, the engine's bundled
   * manifests as the fallback — so a fresh install with no network still has a
   * usable page, and adding a connector no longer needs an app release.
   */
  function readConnectorCatalogue(): Connector[] {
    const remote = loadCachedCatalogue();
    if (remote) {
      // `unavailable` entries stay documented in the catalogue but are not
      // offered: a card that cannot work spends the user's trust.
      return remote.connectors.filter((e) => !e.unavailable).map(connectorFromCatalogue);
    }
    return readBundledCatalogue();
  }

  connectorCatalogueForMcp = readConnectorCatalogue;

  function readBundledCatalogue(): Connector[] {
    const root = connectorCatalogueDir();
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      return [];
    }
    const out: Connector[] = [];
    for (const entry of entries.sort()) {
      const dir = join(root, entry);
      let mcp: { mcpServers?: Record<string, Record<string, unknown>> };
      try {
        mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
      } catch {
        continue;
      }
      for (const [name, srv] of Object.entries(mcp.mcpServers ?? {})) {
        if (srv?.type !== "http" || typeof srv?.url !== "string") continue;
        // A shipped oauth block is either a third party's client id or an
        // unsubstituted placeholder — never ours to claim. Deliberately
        // DROPPED even for the bring-your-own entries below: the user's own
        // registration is the only identity these may use.
        if (srv.oauth && !CONNECTORS_BRING_YOUR_OWN[name]) continue;
        if (CONNECTORS_WITHOUT_REGISTRATION[name]) continue;
        if (!MCP_NAME_RE.test(name) || name.length > MCP_NAME_MAX) continue;
        let iface: Record<string, unknown> = {};
        let manifestVersion: string | null = null;
        try {
          const manifest = JSON.parse(readFileSync(join(dir, ".codex-plugin", "plugin.json"), "utf8")) as Record<string, unknown>;
          iface = (manifest.interface ?? {}) as Record<string, unknown>;
          manifestVersion = typeof manifest.version === "string" ? manifest.version : null;
        } catch {
          /* metadata is a nicety; the server is the substance */
        }
        // The manifest spells these with a capital URL — websiteURL, not
        // websiteUrl. Reading the lowercase form returned null for all
        // sixteen, silently, which is exactly how a link section ends up
        // empty and nobody notices.
        const prompts = Array.isArray(iface.defaultPrompt)
          ? (iface.defaultPrompt as unknown[]).filter((x): x is string => typeof x === "string").map(deCodex)
          : [];
        const logo = str(iface, "logo");
        out.push({
          name,
          url: srv.url,
          displayName: str(iface, "displayName") ?? entry,
          description: deCodex(str(iface, "shortDescription") ?? ""),
          longDescription: deCodex(str(iface, "longDescription") ?? ""),
          developer: str(iface, "developerName"),
          version: manifestVersion,
          category: str(iface, "category") ?? "Other",
          capabilities: Array.isArray(iface.capabilities)
            ? (iface.capabilities as unknown[]).filter((x): x is string => typeof x === "string")
            : [],
          prompts,
          brandColor: str(iface, "brandColor"),
          websiteUrl: str(iface, "websiteURL"),
          privacyUrl: str(iface, "privacyPolicyURL"),
          termsUrl: str(iface, "termsOfServiceURL"),
          supportUrl: str(iface, "supportURL"),
          // The manifest's own logo path wins; the filename guesses are only
          // for the entries that declare none.
          icon: (logo ? connectorIconAt(dir, logo) : null) ?? connectorIcon(dir, entry),
          redirectUri: mcpRedirectUri(srv.url),
          clientId: null,
          enabled: true,
          requiresClientId: !!CONNECTORS_BRING_YOUR_OWN[name],
          requiresSecret: !!CONNECTORS_BRING_YOUR_OWN[name]?.secret,
          // Only the published catalogue carries this; the bundled fallback
          // is a last resort and offers everything it knows.
          comingSoon: false,
          setupNote: null,
          // The bundled manifest's scope list travels with the connector so a
          // saved registration asks Google for exactly what the server needs.
          scopes: Array.isArray(srv.scopes)
            ? (srv.scopes as unknown[]).filter((x): x is string => typeof x === "string")
            : [],
        });
      }
    }
    return out;
  }

  ipcMain.handle("connectors:list", async () => {
    // Opening the page is the natural moment to pick up a newly published
    // connector — but NOT at the cost of making the page wait on the network.
    // Awaiting this put a "Loading…" in front of the user on every visit, for
    // as long as the fetch took. The cached catalogue is what renders; the
    // refresh runs behind it and announces itself if anything changed.
    void refreshCatalogue();
    await wakeManagedPlugins();
    const catalogue = readConnectorCatalogue();
    const configured = readMcpConfig().servers;
    let status: Record<string, string> = {};
    try {
      // Bounded: this is the last thing between the user and the page, and an
      // engine busy probing a dead server should cost a missing "Connected"
      // badge for a moment, not a page that will not paint.
      const res = (await Promise.race([
        engine.request("mcpServerStatus/list", {}),
        new Promise((resolve) => setTimeout(() => resolve({ data: [] }), 2_500)),
      ])) as { data?: { name?: string; authStatus?: string }[] };
      for (const srv of res?.data ?? []) {
        if (typeof srv?.name === "string") status[srv.name] = typeof srv.authStatus === "string" ? srv.authStatus : "unknown";
      }
    } catch {
      status = {};
    }
    return {
      connectors: catalogue.map((c) => ({
        ...c,
        added: configured.some((sv) => sv.name === c.name),
        authStatus: status[c.name] ?? null,
        clientId: configured.find((sv) => sv.name === c.name)?.oauthClientId ?? null,
        enabled: configured.find((sv) => sv.name === c.name)?.enabled !== false,
      })),
    };
  });

  /**
   * Add a connector and sign in, in one motion.
   *
   * Registering our OAuth client BEFORE the restart is what makes this one
   * restart rather than two: config.toml is rendered from mcp-servers.json at
   * engine start, so the server entry and its client_id have to be on disk
   * together before we bounce it.
   */
  ipcMain.handle("connectors:connect", async (_e, name: string) => {
    const connector = readConnectorCatalogue().find((c) => c.name === name);
    if (!connector) return { ok: false, error: "That connector is not in the catalogue." };
    if (connector.requiresClientId) {
      // No silent fallback here: with no registration endpoint, proceeding
      // means codex registers nothing and the flow either fails or runs on a
      // third party's identity. The detail page carries the setup.
      return {
        ok: false,
        error: `${connector.displayName} needs an OAuth app of your own — open its page, register one with the callback shown there, and paste its client ID.`,
      };
    }
    if (runningTurns.size > 0) return { ok: false, error: "Finish the running turn first — connecting restarts the engine." };
    const cfg = readMcpConfig();
    if (cfg.error) return { ok: false, error: cfg.error };
    if (cfg.servers.some((sv) => sv.name === name)) return { ok: false, error: `${connector.displayName} is already added.` };

    if (connector.comingSoon)
      return { ok: false, error: `${connector.displayName} isn't available yet.` };
    const reg = await registerOAuthClient(connector.url);
    if (!("clientId" in reg)) {
      // No silent Codex-branded fallback. It was originally "a working
      // sign-in beats blocking on branding" — in practice the user met a
      // consent screen naming another product, with no hint why, twice. A
      // named failure they can retry beats a surprise they cannot explain.
      return { ok: false, error: `Could not register Unbiased with ${connector.displayName}: ${reg.error}` };
    }
    const entry: UserMcpServer = {
      name: connector.name,
      url: connector.url,
      oauthClientId: reg.clientId,
      ...(inferredOAuthScopes(undefined, reg.scopes) ? { scopes: reg.scopes } : {}),
    };
    if (!writeMcpConfig([...cfg.servers, entry])) return { ok: false, error: "Could not save the server list." };
    try {
      await startEngine();
    } catch (err) {
      return { ok: false, error: `Added, but the engine did not restart: ${String(err)}` };
    }
    try {
      const res = (await engine.request("mcpServer/oauth/login", { name })) as { authorizationUrl?: string };
      const url = typeof res?.authorizationUrl === "string" ? res.authorizationUrl : "";
      if (!url) return { ok: true, branded: "clientId" in reg, signIn: false };
      await shell.openExternal(url);
      return { ok: true, branded: "clientId" in reg, signIn: true };
    } catch (err) {
      // Added and connected, just not signed in — the MCP panel's Sign in
      // button can finish the job, so this is not a failure of the add.
      return {
        ok: true,
        branded: "clientId" in reg,
        signIn: false,
        error: friendlyMcpError(err instanceof Error ? err.message : String(err), connector.displayName),
      };
    }
  });

  /**
   * Point a connector at an OAuth application the user registered themselves.
   *
   * The escape hatch for providers that do not offer automatic sign-up —
   * GitHub is the one in the current catalogue. Adds the server if it is not
   * there yet, so this works as a first action rather than requiring a failed
   * Connect first.
   */
  ipcMain.handle("connectors:set-client-id", async (_e, payload: { name: string; clientId: string; clientSecret?: string }) => {
    const name = typeof payload?.name === "string" ? payload.name : "";
    // Sanitize hard, because the Google console's credential table puts the
    // ID next to other cells: a drag-select copies "…apps.googleusercontent.com
    // Creation date" and the pasted client is silently invalid. No OAuth client
    // id or secret contains whitespace or zero-width characters, so cutting at
    // the first one is unambiguous and repairs the paste instead of failing an
    // hour later inside a token exchange.
    const clean = (v: unknown): string =>
      typeof v === "string" ? v.replace(/[\u200b-\u200d\ufeff]/g, "").trim().split(/\s/)[0] ?? "" : "";
    const clientId = clean(payload?.clientId);
    const clientSecret = clean(payload?.clientSecret);
    const connector = readConnectorCatalogue().find((c) => c.name === name);
    if (!connector) return { ok: false, error: "That connector is not in the catalogue." };
    // Written verbatim into config.toml, so it is held to the same rule as
    // every other value there.
    if (/["\\]|[\u0000-\u001f]/.test(clientId) || /["\\]|[\u0000-\u001f]/.test(clientSecret)) {
      return { ok: false, error: "A client ID or secret cannot contain quotes or backslashes." };
    }
    // No hard secret requirement any more. The pinned engine LOSES the secret
    // between authorize and token exchange (Google answered "client_secret is
    // missing" to a request our plugin config supplied one for — its stored
    // OAuth state has no secret field), so the Desktop-client route is dead
    // until the engine is fixed. An iOS-type Google client needs no secret at
    // all and rides the ordinary client-id path instead; leaving the field
    // empty selects that route.
    if (runningTurns.size > 0) return { ok: false, error: "Finish the running turn first — this restarts the engine." };
    const cfg = readMcpConfig();
    if (cfg.error) return { ok: false, error: cfg.error };
    const exists = cfg.servers.some((sv) => sv.name === name);
    // An empty value clears it, which is the way back to automatic sign-up.
    const fields = clientId
      ? {
          oauthClientId: clientId,
          ...(clientSecret ? { oauthClientSecret: clientSecret } : { oauthClientSecret: undefined }),
          ...(connector.scopes.length ? { scopes: connector.scopes } : {}),
        }
      : { oauthClientId: undefined, oauthClientSecret: undefined };
    const next = exists
      ? cfg.servers.map((sv) => (sv.name === name ? { ...sv, ...fields } : sv))
      : [...cfg.servers, { name, url: connector.url, ...fields }];
    if (!writeMcpConfig(next)) return { ok: false, error: "Could not save the server list." };
    try {
      await startEngine();
    } catch (err) {
      return { ok: false, error: `Saved, but the engine did not restart: ${String(err)}` };
    }
    return { ok: true };
  });

  /**
   * Switch a connector off without forgetting it.
   *
   * Off is NOT remove: removing discards the OAuth client the user approved in
   * a browser, and reconnecting mints a new one at the provider. Off just
   * leaves the server out of the engine's config.
   *
   * This is app-wide, not per-conversation. codex's thread/start does take a
   * free-form `config` object, but it accepted a deliberately nonsensical key
   * without complaint, so acceptance says nothing about whether an override is
   * applied — and shipping a per-chat switch that silently does nothing would
   * be worse than not having one.
   */
  ipcMain.handle("connectors:set-enabled", async (_e, payload: { name: string; enabled: boolean }) => {
    const name = typeof payload?.name === "string" ? payload.name : "";
    const enabled = payload?.enabled !== false;
    if (runningTurns.size > 0) return { ok: false, error: "Finish the running turn first — this restarts the engine." };
    const cfg = readMcpConfig();
    if (cfg.error) return { ok: false, error: cfg.error };
    if (!cfg.servers.some((sv) => sv.name === name)) return { ok: false, error: "That connector is not configured." };
    const next = cfg.servers.map((sv) => (sv.name === name ? { ...sv, enabled } : sv));
    if (!writeMcpConfig(next)) return { ok: false, error: "Could not save the server list." };
    try {
      await startEngine();
    } catch (err) {
      return { ok: false, error: `Saved, but the engine did not restart: ${String(err)}` };
    }
    return { ok: true };
  });

  ipcMain.handle("connectors:remove", async (_e, name: string) => {
    if (runningTurns.size > 0) return { ok: false, error: "Finish the running turn first — this restarts the engine." };
    const cfg = readMcpConfig();
    if (cfg.error) return { ok: false, error: cfg.error };
    if (!writeMcpConfig(cfg.servers.filter((sv) => sv.name !== name))) {
      return { ok: false, error: "Could not save the server list." };
    }
    try {
      await startEngine();
    } catch (err) {
      return { ok: false, error: `Removed, but the engine did not restart: ${String(err)}` };
    }
    return { ok: true };
  });

  /**
   * Turn an engine error into something a person can act on.
   *
   * The raw form reaches the UI as `rpc error: {"code":-32603,"message":...}`,
   * which is developer output wearing a user's clothes — and in the one case
   * that actually happens, it is also misleading. "Registration failed" reads
   * as a transient fault worth retrying; the truth is that the provider does
   * not offer sign-up at all, so retrying is exactly the wrong response.
   */
  function friendlyMcpError(raw: string, displayName: string): string {
    let message = raw;
    const json = raw.match(/\{.*\}/s);
    if (json) {
      try {
        const parsed = JSON.parse(json[0]) as { message?: unknown };
        if (typeof parsed.message === "string") message = parsed.message;
      } catch {
        /* keep the raw text */
      }
    }
    if (/dynamic client registration not supported/i.test(message)) {
      return `${displayName} does not support signing in automatically — it needs an OAuth application registered with them by hand. Until then it cannot be connected here.`;
    }
    if (/no access token was provided/i.test(message)) {
      return `${displayName} needs you to sign in before it will answer.`;
    }
    return message;
  }

  /**
   * Wake the plugin subsystem so managed-plugin servers exist.
   *
   * codex materializes marketplace plugins LAZILY: until something touches
   * the plugin registry, a connector riding the managed-plugin path (the
   * Google trio) has no MCP server at all, and signing in fails with "No MCP
   * server named 'gmail' found" — measured live, and plugin/list alone made
   * the server appear with its full tool set. Cheap and idempotent, so it is
   * safe to call before any operation that needs those servers.
   */
  async function wakeManagedPlugins(): Promise<void> {
    const hasManaged = readMcpConfig().servers.some((sv) => sv.oauthClientSecret);
    if (!hasManaged) return;
    await engine.request("plugin/list", {}).catch(() => undefined);
  }

  ipcMain.handle("mcp:login", async (_e, name: string) => {
    if (typeof name !== "string" || !name) return { ok: false, error: "No server named." };
    // Claim our own OAuth client before codex can register its own.
    //
    // Order matters and is not negotiable: codex only skips registration when
    // a client_id is already in config.toml, and config.toml is regenerated
    // from mcp-servers.json at engine START. So the id has to be stored and
    // the engine restarted BEFORE the login call, or codex registers itself as
    // "Codex" first and that is what the user sees.
    const cfg = readMcpConfig();
    const server = cfg.servers.find((sv) => sv.name === name);
    let registered: string | null = null;
    if (cfg.error) return { ok: false, error: cfg.error };
    if (server?.enabled === false) {
      return { ok: false, error: `${name} is turned off. Turn it on before signing in.` };
    }
    if (server?.url && !server.oauthClientId) {
      const reg = await registerOAuthClient(server.url);
      if ("clientId" in reg) {
        if (runningTurns.size > 0) return { ok: false, error: "Finish the running turn first — signing in restarts the engine." };
        const scopes = inferredOAuthScopes(server.scopes, reg.scopes);
        const next = cfg.servers.map((sv) => (sv.name === name ? {
          ...sv, oauthClientId: reg.clientId, ...(scopes ? { scopes } : {}),
        } : sv));
        const saved = writeMcpConfig(next);
        if (saved) {
          registered = reg.clientId;
          try {
            await startEngine();
          } catch (err) {
            return { ok: false, error: `Registered, but the engine did not restart: ${String(err)}` };
          }
        }
      }
      // A provider without dynamic registration, or one that refused, is not
      // a dead end: codex falls back to registering itself. The sign-in still
      // works; the consent screen just says Codex. Better to proceed and let
      // the user decide than to block on branding.
    } else if (server?.url && server.oauthClientId && !server.scopes?.length) {
      // A manual login may reach the authorization library without a resource challenge.
      // Pin its request to MCP resource scopes instead of every scope the issuer supports.
      const advertised = protectedResourceScopes(await discoverProtectedResourceMetadata(server.url));
      const scopes = inferredOAuthScopes(server.scopes, advertised);
      if (scopes) {
        if (runningTurns.size > 0) return { ok: false, error: "Finish the running turn first — signing in restarts the engine." };
        const next = cfg.servers.map((sv) => (sv.name === name ? { ...sv, scopes } : sv));
        if (!writeMcpConfig(next)) return { ok: false, error: "Could not save the server scopes." };
        try {
          await startEngine();
        } catch (err) {
          return { ok: false, error: `Saved scopes, but the engine did not restart: ${String(err)}` };
        }
      }
    }
    await wakeManagedPlugins();
    const attemptLogin = () =>
      engine.request("mcpServer/oauth/login", { name }) as Promise<{ authorizationUrl?: string }>;
    try {
      let res: { authorizationUrl?: string };
      try {
        res = await attemptLogin();
      } catch (err) {
        // The wake is asynchronous on the engine side too — one bounded
        // retry covers the window where the marketplace is still loading.
        if (!/no mcp server named/i.test(String(err))) throw err;
        await new Promise((r) => setTimeout(r, 1_500));
        await wakeManagedPlugins();
        res = await attemptLogin();
      }
      const url = typeof res?.authorizationUrl === "string" ? res.authorizationUrl : "";
      if (!url) return { ok: false, error: "The engine did not return a sign-in link." };
      await shell.openExternal(url);
      return { ok: true, registered: registered !== null };
    } catch (err) {
      const label = readConnectorCatalogue().find((c) => c.name === name)?.displayName ?? name;
      return { ok: false, error: friendlyMcpError(err instanceof Error ? err.message : String(err), label) };
    }
  });

  ipcMain.handle("mcp:save", (_e, payload: { servers: UserMcpServer[] }) => {
    const servers = Array.isArray(payload?.servers) ? payload.servers : [];
    // Writing over a file we could not read would discard servers the user
    // still has. Refuse, and say what to do about it.
    const existing = readMcpConfig();
    if (existing.error) return { ok: false, error: existing.error };
    const seen = new Set<string>();
    for (const srv of servers) {
      const problem = validateMcpServer(srv);
      if (problem) return { ok: false, error: problem };
      const key = srv.name.toLowerCase();
      if (seen.has(key)) return { ok: false, error: `More than one server is named "${srv.name}".` };
      seen.add(key);
    }
    try {
      const dir = join(app.getPath("home"), ".unbiased");
      mkdirSync(dir, { recursive: true });
      // Write-then-rename, the same discipline MaterializeHome uses on
      // config.toml: the engine reads this file at launch, and Save sits right
      // beside Restart engine, so a plain write's truncate-then-fill window is
      // long enough for the supervisor to read an empty file and refuse to
      // start. 0600 because the file can name variables holding credentials.
      const tmp = `${mcpConfigPath()}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ servers }, null, 2), { mode: 0o600 });
      renameSync(tmp, mcpConfigPath());
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true };
  });
  // Config is read by the supervisor at launch, so a change lands on the next
  // start. Restarting here rather than asking the user to quit the app.
  ipcMain.handle("mcp:apply", async () => {
    if (runningTurns.size > 0) return { ok: false, busy: true };
    // startEngine() already stops the current process and resets sub-agent
    // state; doing either here as well just kills the child twice.
    try {
      await startEngine();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true };
  });

  // ---- Skills ------------------------------------------------------------
  // ── Memory ──────────────────────────────────────────────────────────
  // The Environment popover's "Agent memory" section: notes in the
  // conversation or project store, with a flag for the ones this conversation
  // saved (matched on the originThreadId provenance stamp).
  ipcMain.handle("memory:list", (_e, threadId?: string | null) => {
    const tid = typeof threadId === "string" ? threadId : null;
    const dir = memoryDirForThread(tid);
    const root = tid ? rootThreadOf(tid) : null;
    return redactSecrets({
      dir: dir ?? "",
      memories: dir ? loadMemoryNotes(dir).map((n) => ({
        name: n.name,
        description: n.description,
        type: n.type,
        path: join(dir, `${n.name}.md`),
        thisThread: !!root && n.originThreadId === root,
      })) : [],
    });
  });

  const skillOwnership = new SkillOwnershipStore(join(app.getPath("userData"), "skill-ownership.json"));
  function skillProject(cwd: string | null, projectId?: string | null): ProjectRecord | null {
    if (!cwd) return null;
    const folder = loadWorktrees()[cwd]?.project ?? cwd;
    const projects = loadProjects();
    if (projectId) return projects.find(project => project.id === projectId && project.folders.includes(folder)) ?? null;
    const current = threadProject(panes.main.threadId, cwd);
    return current?.folders.includes(folder) ? current : null;
  }

  ipcMain.handle("skills:list", async (_e, payload?: { cwd?: string | null; projectId?: string | null }) => {
    // cwds drives the PROJECT tier. codex does not walk up parent directories,
    // so the path passed here must be the exact folder holding .codex/skills —
    // normally the conversation's cwd. Verified: a thread opened in
    // mono/packages/web sees nothing from mono/.codex/skills.
    const cwd = payload?.cwd?.trim() || mainCwd || null;
    try {
      const res = (await engine.request("skills/list", {
        cwds: cwd ? [cwd] : [],
        forceReload: true,
      })) as { data?: { cwd?: string; skills?: unknown[] }[] };
      const groups = Array.isArray(res?.data) ? res.data : [];
      // One cwd in, so one group out; flatten rather than make the renderer
      // handle a shape it never sees.
      const projects = loadProjects();
      const skills = groups.flatMap((g) => (Array.isArray(g.skills) ? g.skills : [])).map(raw => {
        const skill = raw as { path: string; scope: string };
        const ownership = skillOwnership.ownership(skill.path, projects, [globalSkillsDir(), bundledSkillsDir()], skill.scope);
        const project = ownership.scope === "project" ? projects.find(project => project.id === ownership.projectId) : null;
        return { ...skill, ownership, projectName: project?.name ?? null };
      });
      return {
        skills,
        cwd,
        roots: { bundled: bundledSkillsDir(), global: globalSkillsDir(), project: cwd ? join(cwd, ".codex", "skills") : null },
        error: null,
      };
    } catch (err) {
      return {
        skills: [],
        cwd,
        roots: { bundled: bundledSkillsDir(), global: globalSkillsDir(), project: cwd ? join(cwd, ".codex", "skills") : null },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  // Selector is by path, not name: two roots can hold the same name, and the
  // path is what the list already gave the renderer.
  ipcMain.handle("skills:set-enabled", async (_e, payload: { path: string; enabled: boolean }) => {
    if (!payload?.path || !isAbsolute(payload.path)) return { ok: false, error: "A skill path is required." };
    try {
      await engine.request("skills/config/write", { path: payload.path, enabled: !!payload.enabled });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  // Opens the folder holding a skill, or creates and opens a root.
  ipcMain.handle("skills:reveal", (_e, payload: { path: string; isDir?: boolean }) => {
    const target = payload?.path;
    if (!target || !isAbsolute(target)) return { ok: false };
    try {
      if (payload.isDir) mkdirSync(target, { recursive: true });
      shell.showItemInFolder(target);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ---- Limits --------------------------------------------------------------
  // A skill is prose plus, at most, a few helper scripts. These caps are
  // generous for that and hostile to everything else: a dropped node_modules,
  // a repo with its history, a zip bomb.
  //
  // The uncompressed cap is checked against the archive's OWN declared sizes
  // before a single byte is extracted. Checking after extraction is not a
  // check, it is a cleanup.
  const SKILL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB on disk, unpacked
  const SKILL_MAX_FILES = 1000;
  const SKILL_MAX_DOWNLOAD = 20 * 1024 * 1024; // 20 MB over the wire
  // GB matters: a rejected zip bomb reporting "1024.0 MB" reads like a bug.
  const humanBytes = (n: number) =>
    n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`;

  /** One staging directory at a time. Every zip validation and every fetch
   *  allocates one, and keeping only the newest stops rejected downloads
   *  accumulating for the life of the session. */
  function stageSkillDir(): string {
    for (const old of skillStages) {
      try {
        rmSync(old, { recursive: true, force: true });
      } catch {
        // under the OS temp dir either way
      }
      skillStages.delete(old);
    }
    const dir = mkdtempSync(join(tmpdir(), "unbiased-skill-"));
    skillStages.add(dir);
    return dir;
  }

  /** Walk a tree, refusing early rather than measuring something enormous in
   *  full. Symlinks are counted but not followed — a link out of the tree must
   *  not smuggle the whole disk past the cap. */
  function measureTree(root: string): { bytes: number; files: number; over: string | null } {
    let bytes = 0, files = 0;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop()!;
      let entries: import("node:fs").Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isSymbolicLink()) { files++; continue; }
        if (e.isDirectory()) { stack.push(full); continue; }
        files++;
        try {
          bytes += statSync(full).size;
        } catch {
          // unreadable entry; it still counts toward the file cap
        }
        if (files > SKILL_MAX_FILES) return { bytes, files, over: `More than ${SKILL_MAX_FILES} files. A skill should be a handful of documents, not a source tree.` };
        if (bytes > SKILL_MAX_BYTES) return { bytes, files, over: `Larger than ${humanBytes(SKILL_MAX_BYTES)} unpacked.` };
      }
    }
    return { bytes, files, over: null };
  }

  /** Read a zip's central directory: total unpacked size, entry count, and the
   *  entry names, so both the bomb check and the traversal check happen before
   *  extraction. */
  function inspectZip(zip: string): { bytes: number; files: number; error: string | null } {
    let listing: string, names: string;
    try {
      listing = execFileSync("/usr/bin/unzip", ["-Zl", zip], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      names = execFileSync("/usr/bin/unzip", ["-Z1", zip], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    } catch {
      return { bytes: 0, files: 0, error: "That does not look like a readable zip file." };
    }
    // "N files, M bytes uncompressed, ..." — the archive's own claim, and it is
    // the LAST line. Taking the first match let a crafted entry impersonate the
    // summary: a file named "2 files, 100 bytes uncompressed.txt" is printed
    // above the real total, so exec() read 100 bytes for a 209 MB archive and
    // both caps passed. Proven with a working zip; hence matchAll and the tail.
    const totals = [...listing.matchAll(/(\d+)\s+files?,\s+(\d+)\s+bytes uncompressed/g)];
    const tail = totals.length ? totals[totals.length - 1] : null;
    if (!tail) return { bytes: 0, files: 0, error: "Could not read the zip's contents listing." };
    const files = Number(tail[1]);
    const bytes = Number(tail[2]);
    if (files > SKILL_MAX_FILES) return { bytes, files, error: `That zip holds ${files} files; the limit is ${SKILL_MAX_FILES}.` };
    if (bytes > SKILL_MAX_BYTES) {
      return { bytes, files, error: `That zip unpacks to ${humanBytes(bytes)}; the limit is ${humanBytes(SKILL_MAX_BYTES)}.` };
    }
    for (const raw of names.split("\n")) {
      const entry = raw.trim();
      if (!entry) continue;
      if (entry.startsWith("/") || entry.includes("..")) {
        return { bytes, files, error: `That zip contains an unsafe path (${entry}).` };
      }
    }
    return { bytes, files, error: null };
  }

  /** Find the skill inside an unpacked archive.
   *
   *  A bounded breadth-first search rather than a walk down single-child
   *  wrappers: real repos nest. vercel-labs/skills unpacks to
   *  `skills-main/skills/find-skills/SKILL.md` — depth two below the repo root,
   *  with siblings at every level, which a single-child descent gives up on
   *  immediately. Anything holding one skill resolves; anything holding several
   *  gets named so the user can link one directly instead of us guessing. */
  function findSkillRoot(dir: string, wantName?: string): { root: string | null; choices: string[] } {
    const SEARCH_DEPTH = 5;
    const SKIP = new Set([".git", "node_modules", ".github", "__pycache__", "dist", "build"]);
    const hits: string[] = [];
    let queue: { dir: string; depth: number }[] = [{ dir, depth: 0 }];
    while (queue.length && hits.length < 25) {
      const next: typeof queue = [];
      for (const { dir: cur, depth } of queue) {
        if (existsSync(join(cur, "SKILL.md"))) { hits.push(cur); continue; } // a skill is a leaf
        if (depth >= SEARCH_DEPTH) continue;
        let entries: import("node:fs").Dirent[];
        try {
          entries = readdirSync(cur, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of entries) {
          if (!e.isDirectory() || SKIP.has(e.name)) continue;
          // Dot-directories are skipped EXCEPT the ones skill collections
          // actually use — openai/skills keeps its curated set in `.curated`.
          if (e.name.startsWith(".") && !/^\.(curated|experimental|codex)$/.test(e.name)) continue;
          next.push({ dir: join(cur, e.name), depth: depth + 1 });
        }
      }
      queue = next;
    }
    // A link that named a skill picks it out of a repo holding many — which is
    // the whole point of a registry link, and of a /tree/ link to one folder.
    if (wantName) {
      const named = hits.find((h) => h.split("/").filter(Boolean).pop() === wantName);
      if (named) return { root: named, choices: [] };
    }
    if (hits.length === 1) return { root: hits[0], choices: [] };
    if (hits.length > 1) return { root: null, choices: hits.map((h) => relative(dir, h)) };
    return { root: null, choices: [] };
  }

  // A skill directory is `<name>/SKILL.md` plus whatever else it needs. Only
  // the manifest is required, and its frontmatter is the contract.
  const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
  const SKILL_NAME_MAX = 64;
  type SkillSource = { kind: "folder" | "manifest"; manifest: string; name: string; description: string | null };

  /** Minimal frontmatter reader. A YAML dependency would be the only one in
   *  this app, for two scalar fields on the first lines of a file. */
  function readSkillFrontmatter(manifest: string): { name: string | null; description: string | null } {
    let text: string;
    try {
      text = readFileSync(manifest, "utf8").slice(0, 8192);
    } catch {
      return { name: null, description: null };
    }
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!m) return { name: null, description: null };
    const field = (key: string): string | null => {
      const hit = new RegExp(`^${key}:[ \t]*(.+?)[ \t]*$`, "m").exec(m[1]);
      if (!hit) return null;
      return hit[1].replace(/^["']|["']$/g, "").trim() || null;
    };
    return { name: field("name"), description: field("description") };
  }

  ipcMain.handle("skills:choose", async () => {
    if (!win) return { path: null };
    const res = await dialog.showOpenDialog(win, {
      // Either shape is legitimate: a whole skill folder, or a lone SKILL.md.
      properties: ["openFile", "openDirectory"],
      title: "Choose a skill folder or SKILL.md",
      buttonLabel: "Choose",
      defaultPath: lastDialogDir("skills") ?? mainCwd ?? undefined,
    });
    if (res.canceled || res.filePaths.length === 0) return { path: null };
    rememberDialogDir("skills", res.filePaths[0]);
    return { path: res.filePaths[0] };
  });

  /** Say yes or no BEFORE anything is copied, and say why in the no case. */
  /** The shared tail of every add path: a directory (or a lone manifest) that
   *  should be a skill. Also where the size cap lands for folders and drops. */
  function validateSkillDir(src: string, opts?: { fromArchive?: boolean }): Record<string, unknown> {
    const isDir = statSync(src).isDirectory();
    const manifest = isDir ? join(src, "SKILL.md") : src;
    if (!existsSync(manifest)) return { ok: false, error: "No SKILL.md found." };
    let measured: { bytes: number; files: number; over: string | null };
    if (isDir) {
      measured = measureTree(src);
      if (measured.over) return { ok: false, error: measured.over };
    } else {
      measured = { bytes: statSync(src).size, files: 1, over: null };
    }
    const { name, description } = readSkillFrontmatter(manifest);
    const folderName = (isDir ? src : join(src, "..")).split("/").filter(Boolean).pop() ?? "";
    const suggested = name ?? folderName;
    if (!suggested) return { ok: false, error: "Could not work out a name for this skill." };
    // Anything the agent might execute is worth naming before it is installed:
    // a skill is instructions, but it can ship scripts alongside them.
    const scripts: string[] = [];
    if (isDir) {
      const stack = [src];
      while (stack.length && scripts.length < 20) {
        const dir = stack.pop()!;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) { stack.push(full); continue; }
          if (/\.(sh|bash|zsh|py|rb|pl|js|mjs|cjs|ts)$/i.test(e.name)) scripts.push(relative(src, full));
        }
      }
    }
    return {
      ok: true,
      path: src,
      kind: isDir ? "folder" : "manifest",
      fromArchive: !!opts?.fromArchive,
      name: suggested,
      description,
      bytes: measured.bytes,
      files: measured.files,
      sizeLabel: humanBytes(measured.bytes),
      scripts,
      warning: description ? null : "This skill has no description, so Pareto has little to go on when deciding to use it.",
    };
  }

  ipcMain.handle("skills:validate", (_e, payload: { path?: string }) => {
    const src = payload?.path;
    if (!src || !isAbsolute(src)) return { ok: false, error: "Choose a folder or a SKILL.md file." };
    let isDir: boolean;
    try {
      isDir = statSync(src).isDirectory();
    } catch {
      return { ok: false, error: "That path could not be read." };
    }
    // A zip is staged and unpacked first, then validated like any folder — but
    // only after its own declared sizes clear the caps.
    if (!isDir && /\.zip$/i.test(src)) {
      const zip = inspectZip(src);
      if (zip.error) return { ok: false, error: zip.error };
      const stage = stageSkillDir();
      try {
        execFileSync("/usr/bin/unzip", ["-q", "-o", "-d", stage, src], { maxBuffer: 8 * 1024 * 1024 });
      } catch {
        return { ok: false, error: "That zip could not be unpacked." };
      }
      // The pre-check reads the archive's own claim about itself. Measure what
      // actually landed before going further, so a declaration that lies costs
      // one rejected extraction rather than the disk.
      const landed = measureTree(stage);
      if (landed.over) {
        rmSync(stage, { recursive: true, force: true });
        skillStages.delete(stage);
        return { ok: false, error: `That zip unpacked to more than it declared. ${landed.over}` };
      }
      const found = findSkillRoot(stage);
      if (!found.root) {
        return {
          ok: false,
          error: found.choices.length
            ? `That zip holds several skills (${found.choices.slice(0, 4).join(", ")}${found.choices.length > 4 ? ", …" : ""}). Unzip it and choose one folder.`
            : "No SKILL.md inside that zip.",
        };
      }
      return validateSkillDir(found.root, { fromArchive: true });
    }
    const manifest = isDir ? join(src, "SKILL.md") : src;
    if (!isDir && !/(^|\/)SKILL\.md$/.test(src)) {
      return { ok: false, error: "Choose a skill folder, a SKILL.md file, or a .zip." };
    }
    if (!existsSync(manifest)) {
      return { ok: false, error: "That folder has no SKILL.md at its top level, so nothing would read it." };
    }
    return validateSkillDir(src);
  });

  /** Work out what a pasted link actually points at. Deliberately narrow: the
   *  shapes people paste, and nothing clever. */
  function resolveSkillUrl(
    input: string,
  ): { downloads: string[]; kind: "zip" | "manifest"; subpath?: string; wantName?: string } | { error: string } {
    let u: URL;
    try {
      u = new URL(input.trim());
    } catch {
      return { error: "That is not a valid link." };
    }
    if (u.protocol !== "https:") return { error: "Only https links are supported." };
    const parts = u.pathname.split("/").filter(Boolean);

    // A registry page is HTML about a skill, not the skill. skills.sh encodes
    // everything needed in its path — /{owner}/{repo}/{skill} — so translate it
    // to the repo and remember which skill was asked for.
    if (/^(www\.)?skills\.sh$/.test(u.hostname)) {
      if (parts.length < 2) return { error: "Link a specific skill on skills.sh, not the index." };
      const [owner, repo, skill] = parts;
      return {
        downloads: [
          `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`,
          `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`,
        ],
        kind: "zip",
        wantName: skill,
      };
    }

    const gh = /^(www\.)?github\.com$/.test(u.hostname);
    if (gh && parts.length >= 2) {
      const [owner, repo, kind, ref, ...rest] = parts;
      const clean = repo.replace(/\.git$/, "");
      if (kind === "blob" && rest.length) {
        // A file link. Only a manifest is meaningful on its own.
        const raw = `https://raw.githubusercontent.com/${owner}/${clean}/${ref}/${rest.join("/")}`;
        if (!/SKILL\.md$/i.test(raw)) return { error: "Link a skill's folder, or its SKILL.md file." };
        return { downloads: [raw], kind: "manifest" };
      }
      if (kind === "tree") {
        return {
          downloads: [`https://github.com/${owner}/${clean}/archive/refs/heads/${ref}.zip`],
          kind: "zip",
          subpath: rest.join("/"),
          wantName: rest.length ? rest[rest.length - 1] : undefined,
        };
      }
      // Bare repo link: the default branch is not in the URL, so try the two
      // that cover nearly everything rather than spending an API call on it.
      return {
        downloads: [
          `https://github.com/${owner}/${clean}/archive/refs/heads/main.zip`,
          `https://github.com/${owner}/${clean}/archive/refs/heads/master.zip`,
        ],
        kind: "zip",
      };
    }
    if (/\.zip$/i.test(u.pathname)) return { downloads: [u.toString()], kind: "zip" };
    if (/SKILL\.md$/i.test(u.pathname)) return { downloads: [u.toString()], kind: "manifest" };
    // Naming the shape that was pasted beats restating the allowlist: the common
    // mistake is a page about a skill rather than the skill's files.
    return {
      error: `That looks like a web page rather than a skill's files. Link its GitHub repo or folder, a .zip, or a SKILL.md — ${u.hostname} is not a source this can download from.`,
    };
  }

  /** Stream to disk, refusing at the cap rather than after it. */
  async function downloadCapped(url: string, dest: string): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    if (!res.ok) return `The server answered ${res.status}.`;
    if (!res.url.startsWith("https://")) return "That link redirected to an insecure address.";
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > SKILL_MAX_DOWNLOAD) return `That download is ${humanBytes(declared)}; the limit is ${humanBytes(SKILL_MAX_DOWNLOAD)}.`;
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) return "Nothing came back from that link.";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SKILL_MAX_DOWNLOAD) {
        void reader.cancel();
        return `That download passed ${humanBytes(SKILL_MAX_DOWNLOAD)} and was stopped.`;
      }
      chunks.push(Buffer.from(value));
    }
    writeFileSync(dest, Buffer.concat(chunks));
    return null;
  }

  ipcMain.handle("skills:fetch", async (_e, payload: { url?: string }) => {
    const resolved = resolveSkillUrl(payload?.url ?? "");
    if ("error" in resolved) return { ok: false, error: resolved.error };
    const stage = stageSkillDir();
    const target = join(stage, resolved.kind === "zip" ? "download.zip" : "SKILL.md");
    let lastError: string | null = null;
    for (const url of resolved.downloads) {
      lastError = await downloadCapped(url, target);
      if (!lastError) break;
    }
    if (lastError) return { ok: false, error: lastError };

    if (resolved.kind === "manifest") {
      // A lone manifest: park it in its own folder so the shape matches.
      const dir = join(stage, "skill");
      mkdirSync(dir, { recursive: true });
      cpSync(target, join(dir, "SKILL.md"));
      return validateSkillDir(dir, { fromArchive: true });
    }

    const zip = inspectZip(target);
    if (zip.error) return { ok: false, error: zip.error };
    const out = join(stage, "unpacked");
    try {
      execFileSync("/usr/bin/unzip", ["-q", "-o", "-d", out, target], { maxBuffer: 8 * 1024 * 1024 });
    } catch {
      return { ok: false, error: "That archive could not be unpacked." };
    }
    const landed = measureTree(out);
    if (landed.over) return { ok: false, error: `That archive unpacked to more than it declared. ${landed.over}` };
    // A /tree/ link names a folder inside the repo; honour it before searching.
    let base = out;
    if (resolved.subpath) {
      const wrappers = readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory());
      const inner = wrappers.length === 1 ? join(out, wrappers[0].name) : out;
      const candidate = join(inner, resolved.subpath);
      if (existsSync(candidate)) base = candidate;
    }
    const found = findSkillRoot(base, resolved.wantName);
    if (!found.root) {
      return {
        ok: false,
        error: found.choices.length
          ? `That link holds several skills (${found.choices.slice(0, 4).join(", ")}${found.choices.length > 4 ? ", …" : ""}). Link one of them directly.`
          : resolved.wantName
            ? `No skill named "${resolved.wantName}" in that repository.`
            : "No SKILL.md found at that link.",
      };
    }
    return validateSkillDir(found.root, { fromArchive: true });
  });

  ipcMain.handle("skills:limits", () => ({
    maxBytes: SKILL_MAX_BYTES,
    maxFiles: SKILL_MAX_FILES,
    maxDownload: SKILL_MAX_DOWNLOAD,
    label: humanBytes(SKILL_MAX_BYTES),
  }));

  ipcMain.handle(
    "skills:install",
    (_e, payload: { path?: string; name?: string; scope?: "global" | "project"; cwd?: string | null; projectId?: string | null }) => {
      if (payload?.scope !== "project" && payload?.scope !== "global") return { ok: false, error: "Choose this project or everywhere." };
      const src = payload?.path;
      const name = (payload?.name ?? "").trim();
      if (!src || !isAbsolute(src)) return { ok: false, error: "Choose a folder or a SKILL.md file." };
      if (!SKILL_NAME_RE.test(name) || name.length > SKILL_NAME_MAX) {
        return { ok: false, error: "Use letters, digits, hyphens and underscores only, starting with a letter or digit." };
      }
      const project = payload.scope === "project" ? skillProject(payload.cwd ?? null, payload.projectId) : null;
      if (payload.scope === "project" && !project) return { ok: false, error: "Choose a project before adding a project skill." };
      const ownership = project ? { scope: "project" as const, projectId: project.id } : { scope: "global" as const };
      const root = project ? join(payload.cwd!, ".codex", "skills") : globalSkillsDir();
      try {
        const manifest = installOwnedSkill(src, root, name, ownership, skillOwnership);
        return { ok: true, path: manifest, root, ownership };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle("skills:remove", (_e, payload: { path?: string; cwd?: string | null }) => {
    const manifest = payload?.path;
    if (!manifest || !isAbsolute(manifest)) return { ok: false, error: "No skill given." };
    // Only ever inside a root WE manage. A skill from ~/.agents/skills or the
    // engine's own .system belongs to something else; deleting it from here
    // would be reaching into another tool's files.
    //
    // The cwd comes from the caller, matching skills:list and skills:install.
    // Reading mainCwd instead was wrong: a conversation running in a worktree
    // has a different mainCwd from the project the panel listed, so deleting a
    // project skill was refused as "outside the folders Unbiased manages".
    const projectCwd = payload?.cwd && isAbsolute(payload.cwd) ? payload.cwd : mainCwd;
    const owned = [globalSkillsDir(), ...(projectCwd ? [join(projectCwd, ".codex", "skills")] : [])];
    const dir = join(manifest, "..");
    if (!owned.some((root) => dir.startsWith(root + "/"))) {
      return { ok: false, error: "That skill lives outside the folders Unbiased manages." };
    }
    try {
      rmSync(dir, { recursive: true, force: true });
      skillOwnership.forget(manifest);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true };
  });

  ipcMain.handle("chat:live-approvals", () => ({ requestIds: [...pendingApprovals.keys()] }));
  ipcMain.handle("chat:live-user-inputs", () => ({ requestIds: [...pendingUserInputs.keys()] }));

  ipcMain.handle("chat:user-input-submit", (_e, payload: {
    requestId: string;
    action: "submit" | "cancel";
    values?: Record<string, UserInputValue>;
  }) => {
    const pending = pendingUserInputs.get(payload.requestId);
    if (!pending) return { ok: false, expired: true };
    if (payload.action !== "submit" && payload.action !== "cancel") return { ok: false, error: "Invalid action." };
    const checked = payload.action === "submit"
      ? validateUserInput(pending.request.fields, payload.values)
      : null;
    if (checked && !checked.ok) return { ok: false, error: checked.error };
    const values = checked?.ok ? checked.values : null;
    pendingUserInputs.delete(payload.requestId);
    if (pending.kind === "local") pending.settle(values);
    else if (pending.kind === "codex") engine.respond(pending.rpcId, codexInputResponse(pending.request.fields, values));
    else engine.respond(pending.rpcId, mcpInputResponse(values));
    return { ok: true };
  });

  ipcMain.handle("chat:approve", async (_e, payload: {
    requestId: string;
    threadId?: string;
    decision: "accept" | "acceptForSession" | "decline";
  }) => {
    if (payload.threadId && cloudBindings.read(payload.threadId)?.state === "cloud") {
      if (payload.decision === "acceptForSession") throw new Error("Cloud approval must be one-time");
      await conversationRouter.decide(payload.threadId,payload.requestId,payload.decision === "decline" ? "deny" : "approve");
      return {ok:true};
    }
    const pending = pendingApprovals.get(payload.requestId);
    // Nothing is waiting on this: the turn died, most often because the app
    // was quit while the card was up. Say so rather than returning a bare
    // false the caller can mistake for "sent".
    if (pending === undefined) return { ok: false, expired: true };
    observeLearning(
      "approval_decision",
      "threadId" in pending ? (pending.threadId as string | null) : null,
      `user ${payload.decision}`,
      { decision: payload.decision === "acceptForSession" ? "acceptForSession" : payload.decision },
    );
    pendingApprovals.delete(payload.requestId);
    // No engine item stands behind a synthesized card, so nothing would ever
    // flip it off "running" — resolve it here. Shared by local approvals and
    // MCP elicitations, both of which raise a card of their own.
    function settleSynthesizedCard(threadId: string | null, requestId: string, decision: ApprovalDecision): void {
      const sub = threadId ? subAgents.get(threadId) : undefined;
      const paneId = paneForThread(sub ? sub.parent : threadId);
      if (paneId) {
        send("chat:command", {
          paneId,
          phase: "completed",
          item: { id: requestId, status: decision === "decline" ? "declined" : "completed" },
        });
      }
    }
    if (pending.kind === "engine") {
      engine.respond(pending.rpcId, { decision: payload.decision });
    } else if (pending.kind === "elicitation") {
      // "acceptForSession" collapses to a plain accept: codex advertises
      // persistence options in the request (_meta.persist), but the shape for
      // choosing one is undocumented, and guessing at it risks a reply that
      // fails to deserialize — the exact failure this branch exists to fix.
      // The card still offers the choice; it just asks again next time.
      engine.respond(pending.rpcId, {
        action: payload.decision === "decline" ? "decline" : "accept",
        content: {},
      });
      settleSynthesizedCard(pending.threadId, payload.requestId, payload.decision);
    } else {
      pending.settle(payload.decision);
      settleSynthesizedCard(pending.threadId, payload.requestId, payload.decision);
    }
    return { ok: true };
  });

  ipcMain.handle("threads:list", async () => {
    const scheduledThreadIds = new Set(
      readTasks()
        .map((task) => task.lastThreadId)
        .filter((id): id is string => typeof id === "string"),
    );
    const sideThreadIds = new Set(sideChatRecents.all().map((record) => record.threadId));
    const threads = await listVisibleThreads(
      (cursor) => engine.request("thread/list", { limit: 100, ...(cursor ? { cursor } : {}) }) as Promise<{ data: WireThread[]; nextCursor?: string | null }>,
      (thread) => thread.threadSource !== SCHEDULED_THREAD_SOURCE && thread.threadSource !== SIDE_CHAT_THREAD_SOURCE &&
        !scheduledThreadIds.has(thread.id) && !sideThreadIds.has(thread.id),
    );
    const records = loadProjects();
    const projectMap = new Map(records.map((r) => [r.id, [] as ThreadSummary[]]));
    const worktrees = loadWorktrees();
    const recents: ThreadSummary[] = [];
    for (const t of threads) {
      petThreadTitles.set(t.id, threadTitle(t));
      const summary: ThreadSummary = { id: t.id, title: threadTitle(t), createdAt: t.createdAt, updatedAt: t.updatedAt };
      const membership = projectStore().membership(t.id, t.cwd, worktrees);
      Object.assign(summary, { projectId: membership.projectId, projectResolution: membership.resolution });
      const group = membership.projectId ? projectMap.get(membership.projectId) : undefined;
      if (group) group.push(summary);
      else recents.push(summary);
    }
    return {
      projects: records.map((r) => ({
        id: r.id,
        sources: r.sources,
        path: r.primary,
        name: r.name,
        icon: r.icon,
        color: r.color,
        folders: r.folders,
        legacyPreferencePath: r.legacyMemoryPath,
        threads: projectMap.get(r.id) ?? [],
      })),
      recents,
      // Threads with a live turn — seeds the sidebar activity indicators.
      running: [...runningTurns.keys()],
    };
  });

  ipcMain.handle("threads:search", async (_e, request: { query: string; threads: { id: string; updatedAt?: string | number }[]; includeSavedTranscripts?: boolean }) => {
    const query = typeof request?.query === "string" ? request.query.trim() : "";
    if (query.length < 2 || !Array.isArray(request?.threads)) return { results: [], failed: 0 };
    const threads = [...new Map(request.threads
      .filter((thread) => thread && typeof thread.id === "string" && thread.id.length < 128)
      .slice(0, 100)
      .map((thread) => [thread.id, thread] as const)).values()];
    const results: { id: string; snippet: string; title?: string }[] = [];
    let failed = 0;
    let next = 0;
    if (request.includeSavedTranscripts) {
      const dir = join(app.getPath("userData"), "transcripts");
      const names = await readdirAsync(dir).catch(() => [] as string[]);
      const savedIds = names
        .filter((name) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i.test(name))
        .map((name) => name.slice(0, -5))
        .filter((id) => !sideChatRecents.all().some((record) => record.threadId === id));
      let savedNext = 0;
      await Promise.all(Array.from({ length: Math.min(4, savedIds.length) }, async () => {
        while (savedNext < savedIds.length) {
          const id = savedIds[savedNext++];
          try {
            const messages = await searchableThreadMessages(id);
            const snippet = matchingMessageSnippet(messages, query);
            if (snippet) results.push({ id, snippet, title: messages[0]?.replace(/\s+/g, " ").trim().slice(0, 90) || "Conversation" });
          } catch {
            failed++;
          }
        }
      }));
    }
    const savedMatches = new Set(results.map((result) => result.id));
    await Promise.all(Array.from({ length: Math.min(3, threads.length) }, async () => {
      while (next < threads.length) {
        const thread = threads[next++];
        if (savedMatches.has(thread.id)) continue;
        try {
          const snippet = matchingMessageSnippet(await searchableThreadMessages(thread.id, thread.updatedAt), query);
          if (snippet) results.push({ id: thread.id, snippet });
        } catch {
          failed++;
        }
      }
    }));
    return { results: redactSecrets(results), failed };
  });

  // Archive every chat in a project (engine-side thread/archive — they
  // drop out of thread/list but survive for a future archived view).
  ipcMain.handle("project:archive-chats", async (_e, projectId: string) => {
    const sideThreadIds = new Set(sideChatRecents.all().map((record) => record.threadId));
    const threads = await listVisibleThreads(
      (cursor) => engine.request("thread/list", { limit: 100, ...(cursor ? { cursor } : {}) }) as Promise<{ data: WireThread[]; nextCursor?: string | null }>,
      (thread) => thread.threadSource !== SIDE_CHAT_THREAD_SOURCE && !sideThreadIds.has(thread.id),
      Number.MAX_SAFE_INTEGER,
    );
    if (!loadProjects().some((p) => p.id === projectId)) return { archived: 0 };
    const worktrees = loadWorktrees();
    const targets = threads.filter((t) => projectStore().projectFor(t.id, t.cwd ?? null, worktrees)?.id === projectId);
    for (const t of targets) {
      await engine.request("thread/archive", { threadId: t.id });
      if (panes.main.threadId === t.id) {
        panes.main.threadId = null;
        panes.main.turnId = null;
        resetSidePanes();
      }
    }
    return { archived: targets.length };
  });

  // Remove = forget the project in the app. Files and chats survive;
  // its chats regroup under Recents (see threads:list).
  ipcMain.handle("project:remove", (_e, projectId: string) => {
    saveProjects(loadProjects().filter((p) => p.id !== projectId));
    if (pendingProjectId === projectId) {
      pendingProjectId = null;
      pendingCwd = null;
      if (!panes.main.threadId) mainCwd = null;
    }
    return { ok: true };
  });

  // Edit only the selected project, even when its primary repository is shared.
  ipcMain.handle("project:update", (_e, p: { projectId: string; record: ProjectRecord }) => {
    const projects = loadProjects();
    const idx = projects.findIndex((r) => r.id === p.projectId);
    if (idx === -1) return { ok: false, error: "Project not found" };
    const rec = p.record;
    if (!rec.folders.length) return { ok: false, error: "A project needs at least one folder" };
    projects[idx] = projectRecord(rec, projects[idx]);
    saveProjects(projects);
    if (pendingProjectId === p.projectId && !panes.main.threadId) {
      pendingCwd = projects[idx].primary;
      mainCwd = projects[idx].primary;
    }
    return { ok: true, record: projects[idx] };
  });

  ipcMain.handle("project:reveal", (_e, path: string) => {
    void shell.openPath(path);
    return { ok: true };
  });

  // Rename lives in the ENGINE (thread/name/set) so the sidebar title —
  // which comes from thread/list — updates everywhere, including resumes.
  ipcMain.handle("threads:rename", async (_e, p: { threadId: string; name: string }) => {
    try {
      await engine.request("thread/name/set", { threadId: p.threadId, name: p.name });
      petThreadTitles.set(p.threadId, p.name);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("projects:resolve-membership", (_e, p: { threadId: string; projectId: string | null }) => {
    if (p.projectId !== null && !loadProjects().some(r => r.id === p.projectId)) throw new Error("Project not found");
    projectStore().assign(p.threadId, p.projectId);
    return { ok: true };
  });

  ipcMain.handle("threads:assign-project", (_e, p: { threadId: string; projectId: string }) => {
    if (!loadProjects().some((r) => r.id === p.projectId)) return { ok: false };
    projectStore().assign(p.threadId, p.projectId);
    return { ok: true };
  });

  // Create takes the same record the edit modal produces. With source
  // folders it just registers them; with none, an empty project is a fresh
  // directory named after the project in the home folder.
  ipcMain.handle(
    "project:create",
    (_e, p: { name: string; folders?: string[]; primary?: string; icon?: string; color?: string | null }) => {
      const name = p.name.trim();
      if (!name) return { path: null, name: null, error: "Project name is required" };
      const folders = (p.folders ?? []).filter(Boolean);
      let primary: string;
      if (folders.length > 0) {
        primary = p.primary && folders.includes(p.primary) ? p.primary : folders[0];
      } else {
        const safe = name.replace(/[/\\]/g, "-");
        // A project with no folder of its own belongs in the app's own
        // workspace, not loose in the home directory. Dropping it at ~/<Name>
        // scattered app-created folders among Documents, Downloads and the
        // rest, where nothing marks them as ours and nothing groups them
        // together. defaultChatDir() is the same ~/Unbiased the no-project
        // chats already use, and it falls back to home if it cannot be made,
        // so the old behaviour survives as the failure case rather than the
        // default one.
        primary = join(defaultChatDir(), safe);
        try {
          mkdirSync(primary, { recursive: true });
        } catch (err) {
          return { path: null, name: null, error: `Couldn't create ${primary}: ${String(err)}` };
        }
        folders.push(primary);
      }
      const projects = loadProjects();
      const id = randomUUID();
      projects.unshift(projectRecord({ id, name, folders, primary, icon: p.icon ?? "folder", color: p.color ?? null }));
      saveProjects(projects);
      pendingProjectId = id;
      pendingCwd = primary;
      mainCwd = primary;
      panes.main.threadId = null;
      panes.main.turnId = null;
      resetSidePanes();
      return { id, path: primary, name };
    },
  );

  ipcMain.handle("project:pick-location", async () => {
    if (!win) return { path: null };
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose where the project folder is created",
      buttonLabel: "Use this location",
      // First run opens in the app's workspace, matching where a project with
      // no chosen location is created. After that the last pick wins.
      defaultPath: lastDialogDir("projectLocation") ?? defaultChatDir(),
    });
    if (result.canceled || result.filePaths.length === 0) return { path: null };
    rememberDialogDir("projectLocation", result.filePaths[0], false);
    return { path: result.filePaths[0] };
  });

  ipcMain.handle("project:choose", async () => {
    if (!win) return { path: null, name: null };
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Choose a project folder",
      buttonLabel: "Open project",
      defaultPath: lastDialogDir("project"),
    });
    if (result.canceled || result.filePaths.length === 0) return { path: null, name: null };
    const path = result.filePaths[0];
    rememberDialogDir("project", path);
    const project = rememberProject(path);
    pendingProjectId = project.id;
    pendingCwd = project.primary;
    mainCwd = project.primary;
    panes.main.threadId = null;
    panes.main.turnId = null;
    resetSidePanes();
    return { id: project.id, path: project.primary, name: project.name };
  });

  ipcMain.handle("threads:create-multi", async (_e, options?: { projectId?: string | null; replaceId?: string; workMode?: "local" | "worktree" | "existing"; worktreeDir?: string }) => {
    const project = options?.projectId ? loadProjects().find((p) => p.id === options.projectId) : null;
    const projectPath = project?.primary ?? null;
    if (options?.projectId && (!projectPath || !existsSync(projectPath))) throw new Error("Project is no longer available");
    const selectedMode = options?.workMode ?? "local";
    if (selectedMode !== "local" && !projectPath) throw new Error("Choose a project first");
    const oldId = options?.replaceId;
    if (oldId) {
      const oldPane = panes[`multi:${oldId}`];
      if (!oldPane || oldPane.threadId !== oldId || oldPane.turnId || multiMountLeases.has(oldId)) {
        throw new Error("This chat has already started");
      }
    }
    let cwd = projectPath ?? defaultChatDir();
    if (selectedMode === "existing") {
      const dir = options?.worktreeDir;
      if (!dir || loadWorktrees()[dir]?.project !== projectPath || !existsSync(dir)) {
        throw new Error("Worktree is no longer available");
      }
      cwd = dir;
    } else if (selectedMode === "worktree") {
      const dir = await createWorktree(projectPath!);
      if (!dir) throw new Error("Could not create a worktree");
      cwd = dir;
    }
    const started = (await engine.request("thread/start", {
      ...threadPolicy(),
      cwd,
      dynamicTools: await threadDynamicTools(),
      developerInstructions: developerInstructionsFor(cwd, null, project?.id ?? null),
      experimentalRawEvents: true,
      config: mcpOverrideFor(null),
    })) as { thread: { id: string } };
    const id = started.thread.id;
    projectStore().assign(id, project?.id ?? null);
    threadCwds.set(id, cwd);
    threadAccessModes.set(id, accessMode);
    ensurePane(`multi:${id}`).threadId = id;
    if (oldId) {
      delete panes[`multi:${oldId}`];
      threadCwds.delete(oldId);
      threadAccessModes.delete(oldId);
    }
    return { id, cwd, branch: loadWorktrees()[cwd]?.branch ?? null };
  });

  ipcMain.handle("threads:mount", async (_e, id: string) => {
    const paneId = `multi:${id}`;
    const lease = randomUUID();
    multiMountLeases.set(id, lease);
    const running = runningTurns.has(id);
    const alreadyLoaded = running || compactingThreads.has(id) || paneForThread(id) !== null;
    const result = alreadyLoaded
      ? ((await engine.request("thread/read", { threadId: id, includeTurns: true })) as { thread: WireThread; cwd?: string })
      : ((await engine.request("thread/resume", await resumeParamsFor(id))) as { thread: WireThread; cwd?: string });
    const cwd = result.cwd ?? result.thread.cwd ?? null;
    if (cwd) threadCwds.set(id, cwd);
    const pane = ensurePane(paneId);
    if (multiMountLeases.get(id) !== lease) throw new Error("Mosaic tile was replaced while loading");
    pane.threadId = id;
    pane.turnId = runningTurns.get(id) ?? null;
    applyRolloutNicknames(id);
    const replay = threadToEntries(result.thread, { runningLastTurn: running });
    const previousSession = multiTranscriptSessions.get(id);
    if (previousSession) transcriptSessions.delete(previousSession);
    const page = await openTranscriptSession(id, replay.entries, Object.fromEntries(rolloutNicknames(id)), replay.runningTurnStart);
    if (multiMountLeases.get(id) !== lease) {
      transcriptSessions.delete(page.sessionId);
      throw new Error("Mosaic tile was replaced while loading");
    }
    multiTranscriptSessions.set(id, page.sessionId);
    const userInputs = [...pendingUserInputs.values()]
      .filter((pending) => pending.threadId && rootThreadOf(pending.threadId) === id)
      .map((pending) => pending.request);
    return redactSecrets({
      id,
      lease,
      entries: page.entries,
      offset: page.offset,
      total: page.total,
      sessionId: page.sessionId,
      runningTurnStart: page.runningTurnStart,
      runningTurnStartedAt: replay.runningTurnStartedAt,
      compacting: compactingThreads.has(id),
      running,
      streamText: bgStream.get(id) ?? "",
      approvals: heldApprovals.get(id) ?? [],
      userInputs,
      failure: heldErrors.get(id) ?? null,
      subAgentNames: Object.fromEntries(rolloutNicknames(id)),
    });
  });

  ipcMain.handle("threads:unmount", (_e, id: string, lease: string) => {
    if (multiMountLeases.get(id) === lease) {
      multiMountLeases.delete(id);
      delete panes[`multi:${id}`];
      const sessionId = multiTranscriptSessions.get(id);
      if (sessionId) transcriptSessions.delete(sessionId);
      multiTranscriptSessions.delete(id);
    }
    return { ok: true };
  });

  ipcMain.handle("threads:open", async (_e, id: string) => {
    const openSequence = ++mainOpenSequence;
    const running = runningTurns.has(id);
    // A thread with a live turn is already loaded in the engine —
    // thread/read returns its history without disturbing the turn;
    // re-resuming it is what thread/resume is NOT for.
    const result = (running || compactingThreads.has(id))
      ? ((await engine.request("thread/read", { threadId: id, includeTurns: true })) as {
          thread: WireThread;
          cwd?: string;
        })
      : ((await engine.request("thread/resume", await resumeParamsFor(id))) as {
          thread: WireThread;
          cwd?: string;
        });
    if (openSequence !== mainOpenSequence) return null;
    mainCwd = result.cwd ?? result.thread.cwd ?? null;
    if (mainCwd) threadCwds.set(id, mainCwd); // memory_save now targets the right project
    // An unanswered browser card on the conversation we are leaving would
    // otherwise block its tool call — and therefore its turn — forever.
    if (!panes.main.threadId || !panes[`multi:${panes.main.threadId}`]) settleLocalApprovals(panes.main.threadId);
    panes.main.threadId = id;
    panes.main.turnId = runningTurns.get(id) ?? null;
    // Closing the previous context retains its side chats for recovery.
    resetSidePanes();
    // Everything that happened while this thread was backgrounded: the
    // partial assistant stream, approval requests the agent is blocked
    // on, and a turn failure nobody saw. Held items are consumed here.
    // Nicknames from the rollout. Two jobs: seed pendingNicknames so a spawn
    // made AFTER this open is named correctly, and retitle sub-agents already
    // registered under their raw task name so existing rows stop reading
    // "app_bridge_routing". Both are needed — the first alone leaves the
    // transcript wrong, the second alone leaves the next spawn wrong.
    applyRolloutNicknames(id);
    const approvals = heldApprovals.get(id) ?? [];
    heldApprovals.delete(id);
    const userInputs = [...pendingUserInputs.values()]
      .filter((pending) => pending.threadId && rootThreadOf(pending.threadId) === id)
      .map((pending) => {
        const sub = pending.threadId ? subAgents.get(pending.threadId) : undefined;
        return sub ? { ...pending.request, agentName: sub.name } : pending.request;
      });
    const failure = heldErrors.get(id) ?? null;
    heldErrors.delete(id);
    const replay = threadToEntries(result.thread, { runningLastTurn: running });
    const page = await openTranscriptSession(id, replay.entries, Object.fromEntries(rolloutNicknames(id)), replay.runningTurnStart);
    if (openSequence !== mainOpenSequence) {
      transcriptSessions.delete(page.sessionId);
      return null;
    }
    if (mainTranscriptSession) transcriptSessions.delete(mainTranscriptSession);
    mainTranscriptSession = page.sessionId;
    // History replays raw engine content — same redaction as live events.
    return redactSecrets({
      id,
      entries: page.entries,
      offset: page.offset,
      total: page.total,
      sessionId: page.sessionId,
      runningTurnStart: page.runningTurnStart,
      runningTurnStartedAt: replay.runningTurnStartedAt,
      compacting: compactingThreads.has(id),
      // Carried WITH the transcript rather than pushed alongside it.
      // applyRolloutNicknames above sends a chat:subagent-renames event, but
      // that event loses a race it can never win: the renderer retitles the
      // entries it holds at that moment, and then this result replaces them
      // with the un-renamed replay. It went unnoticed while cached
      // transcripts already had the nicknames baked in; discarding stale
      // caches exposed it, and every reopened conversation showed raw task
      // names ("explore_main_process") instead of the engine's own ("Zeno").
      subAgentNames: Object.fromEntries(rolloutNicknames(id)),
      running,
      streamText: bgStream.get(id) ?? "",
      approvals,
      userInputs,
      failure,
    });
  });

  ipcMain.handle("threads:detach", (_e, projectId?: string) => {
    const project = projectId ? loadProjects().find((p) => p.id === projectId) : null;
    if (projectId && !project) throw new Error("Project is no longer available");
    const cwd = project?.primary;
    pendingProjectId = project?.id ?? null;
    ++mainOpenSequence;
    // Fresh main-chat view: the next send creates a new thread, in `cwd` if given.
    if (!panes.main.threadId || !panes[`multi:${panes.main.threadId}`]) settleLocalApprovals(panes.main.threadId);
    if (mainTranscriptSession) transcriptSessions.delete(mainTranscriptSession);
    mainTranscriptSession = null;
    panes.main.threadId = null;
    panes.main.turnId = null;
    resetSidePanes();
    pendingCwd = cwd ?? null;
    mainCwd = cwd ?? null;
    return { ok: true };
  });

  ipcMain.handle("threads:page", (_e, sessionId: string, before: number, limit = 80) => {
    const session = transcriptSessions.get(sessionId);
    if (!session || !Number.isSafeInteger(before) || !Number.isSafeInteger(limit)) return { entries: [], offset: 0, total: 0, expired: true };
    return redactSecrets({ ...transcriptPage(session.entries, before, limit), expired: false });
  });

  // Sub-agent roster for a (re)opened conversation — the live pushes only
  // reach a pane that already owns the thread.
  ipcMain.handle("subagents:list", (_e, parent: string) => ({ agents: subAgentsForParent(parent) }));

  // A sub-agent's transcript on demand: thread/read leaves its running turn
  // undisturbed, and the bgStream tail covers text still streaming.
  ipcMain.handle("subagents:transcript", async (_e, id: string) => {
    const info = subAgents.get(id);
    try {
      const result = (await engine.request("thread/read", { threadId: id, includeTurns: true })) as {
        thread: WireThread;
      };
      // The task/messages the agent was GIVEN aren't thread items — they
      // ride the inter-agent channel we capture from raw notifications.
      // Merge mail (as user bubbles) with the turns by time so the pane
      // reads as the two-sided conversation it actually is.
      // Rollout is the authoritative mail source (survives resume/restart);
      // live raw captures fill the gap before the rollout flushes.
      const mail = rolloutMail(id, info?.path ?? null);
      // Live captures fill the gap before the rollout flushes. Dedupe by
      // COUNT per text, not mere presence: the same text can legitimately be
      // sent twice, and each rollout copy accounts for one live capture.
      const rolloutCopies = new Map<string, number>();
      for (const r of mail) rolloutCopies.set(r.text, (rolloutCopies.get(r.text) ?? 0) + 1);
      for (const m of subAgentMail.get(id) ?? []) {
        const left = rolloutCopies.get(m.text) ?? 0;
        if (left > 0) rolloutCopies.set(m.text, left - 1);
        else mail.push(m);
      }
      // The sub-agent's thread FORKS the parent's visible history (user
      // prompts and the root's own replies), and thread/read returns those
      // turns as if they were the agent's. The agent-to-agent view starts at
      // the spawn — and the spawn moment IS the first mail's timestamp, so
      // anything earlier is forked parent history and dropped. The user
      // filter stays as a fallback for the no-mail case.
      // Only stamped mail anchors the spawn moment — a timestamp-less
      // rollout line would set spawnAt to 0 and disable the filter.
      const stamped = mail.filter((m) => m.at > 0);
      const spawnAt = stamped.length > 0 ? Math.min(...stamped.map((m) => Math.floor(m.at))) : null;
      const timeline: { t: number; mail: boolean; entries: unknown[] }[] = [];
      for (const turn of result.thread.turns ?? []) {
        const t = turn.startedAt ?? 0;
        // A turn without startedAt can't be classified — keep it rather
        // than silently dropping the agent's replies.
        //
        // The window matters. Mail is recorded milliseconds INTO the second
        // its turn starts and both sides are floored to seconds, so an
        // agent's own first turn can be stamped a tick BEFORE the task that
        // triggered it — a strict `t < spawnAt` then deletes the agent's
        // entire reply (observed: a two-agent spawn whose answers sat in the
        // rollout unseen). Forked parent history is older by minutes or
        // hours, so a couple of seconds of grace separates the two cleanly.
        //
        // Do NOT widen this to "keep everything when the filter finds
        // nothing": an agent that has not answered yet ALSO yields nothing,
        // and the pane would then show the parent's whole conversation in
        // the agent's voice.
        if (spawnAt !== null && turn.startedAt != null && t < spawnAt - SPAWN_GRACE_SECONDS) continue;
        const entries = threadToEntries({ ...result.thread, turns: [turn] }).entries.filter(
          (e) => (e as { kind?: string }).kind !== "user",
        );
        if (entries.length === 0) continue;
        // Nothing the agent did precedes its own spawn, so clamping only
        // lifts the tick-early turns — and the mail-first tie-break below
        // then keeps the prompt above the reply it triggered.
        timeline.push({ t: spawnAt !== null ? Math.max(t, spawnAt) : t, mail: false, entries });
      }
      for (const m of mail) {
        // Floor to seconds to match turn.startedAt's resolution — mail is
        // recorded milliseconds INTO the second its turn starts.
        timeline.push({ t: Math.floor(m.at), mail: true, entries: [{ kind: "user", text: m.text }] });
      }
      // Mail always PRECEDES the turn it triggers, so ties break mail-first.
      timeline.sort((a, b) => a.t - b.t || (a.mail === b.mail ? 0 : a.mail ? -1 : 1));
      return redactSecrets({
        entries: timeline.flatMap((x) => x.entries),
        running: runningTurns.has(id),
        streamText: bgStream.get(id) ?? "",
        name: info?.name ?? null,
        path: info?.path ?? null,
      });
    } catch (err) {
      return { entries: [], running: false, streamText: "", name: info?.name ?? null, path: info?.path ?? null, error: String(err) };
    }
  });

  ipcMain.handle("side:recent", () => {
    void pruneSideChatRecents();
    return sideChatRecents.recent();
  });

  ipcMain.handle("side:reopen", async (_e, paneId: string) => {
    if (sideChatReopens.has(paneId)) return { error: "Side chat is already reopening" };
    const record = sideChatRecents.get(paneId);
    if (!record || record.closedAt === null ||
        !sideChatRecents.recent().some((recent) => recent.paneId === paneId)) return { error: "Side chat is no longer available" };
    if (panes.main.threadId !== record.parentThreadId) return { error: "Open the original chat first" };
    sideChatReopens.add(paneId);
    threadCwds.set(record.threadId, record.cwd);
    try {
      await sideChatInterrupts.get(record.threadId);
      const result = await engine.request("thread/resume", await resumeParamsFor(record.threadId)) as { thread: WireThread };
      if (panes.main.threadId !== record.parentThreadId) return { error: "Original chat changed while restoring" };
      const replay = threadToEntries({ ...result.thread, turns: result.thread.turns?.slice(record.baselineTurns) });
      const page = await openTranscriptSession(record.threadId, replay.entries, {}, null);
      if (panes.main.threadId !== record.parentThreadId ||
          !sideChatRecents.reopen(paneId, record.parentThreadId)) {
        transcriptSessions.delete(page.sessionId);
        return { error: "Side chat is no longer available" };
      }
      panes[paneId] = { threadId: record.threadId, turnId: null };
      saveSideChatRecents();
      return { threadId: record.threadId, ...page };
    } catch (error) {
      console.warn("[side-chat] could not resume:", error);
      return { error: "Could not restore this side chat" };
    } finally {
      sideChatReopens.delete(paneId);
    }
  });

  ipcMain.handle("side:reset", (_e, paneId?: string) => {
    if (paneId) dropSidePane(paneId);
    else resetSidePanes();
    return { ok: true };
  });

  // Read-only file access for the viewer panel. Paths resolve against the
  // active conversation's cwd; output is capped and binary files refused.
  ipcMain.handle("file:read", (_e, rawPath: string) => {
    const base = mainCwd ?? pendingCwd ?? app.getPath("home");
    const fullPath = isAbsolute(rawPath) ? rawPath : join(base, rawPath);
    try {
      const info = statSync(fullPath);
      if (!info.isFile()) return { error: "Not a file", fullPath };
      if (info.size > 1_000_000) return { error: "File is larger than 1 MB", fullPath };
      const content = readFileSync(fullPath, "utf8");
      if (content.includes("\u0000")) return { error: "Binary file", fullPath };
      const rel = relative(base, fullPath);
      return { fullPath, relPath: rel.startsWith("..") ? fullPath : rel, content };
    } catch {
      return { error: `Could not open ${rawPath}`, fullPath };
    }
  });

  const fileActionPath = (rawPath: unknown): string => {
    if (typeof rawPath !== "string" || !rawPath) throw new Error("A local file path is required.");
    const base = mainCwd ?? pendingCwd ?? app.getPath("home");
    return localFileForAction(isAbsolute(rawPath) ? rawPath : join(base, rawPath));
  };

  ipcMain.handle("file:reveal", (_e, rawPath: unknown) => {
    try {
      shell.showItemInFolder(fileActionPath(rawPath));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: fileActionError(error) };
    }
  });

  ipcMain.handle("file:save-copy", async (_e, rawPath: unknown) => {
    try {
      const source = fileActionPath(rawPath);
      const options = {
        defaultPath: join(app.getPath("downloads"), basename(source)),
        buttonLabel: "Save Copy",
      };
      const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
      await saveLocalFileCopy(source, choice.filePath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: fileActionError(error) };
    }
  });

  // Existence probe for inline file chips: same resolution as file:read,
  // so a chip only renders as a link when clicking it would actually work.
  ipcMain.handle("file:exists", (_e, rawPath: string) => {
    const base = mainCwd ?? pendingCwd ?? app.getPath("home");
    const fullPath = isAbsolute(rawPath) ? rawPath : join(base, rawPath);
    try {
      return { exists: statSync(fullPath).isFile() };
    } catch {
      return { exists: false };
    }
  });

  /** A PNG copy of an image this app cannot decode, or null. See
   *  attachments.ts for what this cost when it was missing. Cheap and cached:
   *  the destination is derived from the source path, so a re-attach of the
   *  same file skips the subprocess. */
  function pngCopyOf(source: string): string | null {
    const dir = join(app.getPath("temp"), "unbiased-converted");
    const out = convertedImagePath(source, dir);
    try {
      if (existsSync(out) && statSync(out).size > 0) return out;
      mkdirSync(dir, { recursive: true });
      // Absolute path: this must be macOS's sips, not something earlier on a
      // PATH the app inherited.
      execFileSync("/usr/bin/sips", sipsArgs(source, out), { stdio: "ignore", timeout: 15_000 });
      return statSync(out).size > 0 ? out : null;
    } catch {
      // No sips, an unsupported format, or a corrupt file: the caller falls
      // back to attaching it as a plain file, which is what happened before.
      return null;
    }
  }

  /** One attachment record from a path — folder, image (thumbnailed, sent as
   *  localImage so the model sees pixels rather than binary in context), or a
   *  plain file. Shared by the picker and by drag-and-drop. */
  function describeAttachment(path: string): Record<string, unknown> {
    const name = path.split("/").filter(Boolean).pop() ?? path;
    try {
      if (statSync(path).isDirectory()) return { path, name, kind: "folder" };
    } catch {
      // fall through to the generic file card
    }
    if (looksLikeImage(path)) {
      const img = nativeImage.createFromPath(path);
      if (!img.isEmpty()) return { path, name, kind: "image", thumb: thumbDataUrl(img) };
      // The extension promised pixels and the decoder disagreed. Convert
      // rather than degrade to a file mention: measured 2026-09-09, that
      // silent degradation put NO image in the model's context and it drew a
      // logo from memory instead of saying the source had not arrived.
      // `name` stays the original so the card reads as the file the user
      // picked; only the path the engine reads is the converted copy.
      const png = pngCopyOf(path);
      if (png) {
        const converted = nativeImage.createFromPath(png);
        if (!converted.isEmpty()) {
          axLog(`attachment: converted ${name} to PNG for the model (this app cannot decode it directly)`);
          return { path: png, name, kind: "image", thumb: thumbDataUrl(converted) };
        }
      }
      axLog(`attachment: ${name} looks like an image but could not be decoded or converted; attaching as a file`);
    }
    return { path, name, kind: "file" };
  }

  function attachablePaths(paths: string[]): { attachments: Record<string, unknown>[]; errors: string[] } {
    const attachments: Record<string, unknown>[] = [];
    const errors: string[] = [];
    for (const path of paths) {
      try {
        const info = statSync(path);
        const error = info.isFile()
          ? attachmentSizeError(path.split("/").pop() ?? path, info.size, looksLikeImage(path) ? "image" : "file")
          : null;
        if (error) {
          errors.push(error);
          continue;
        }
        const attachment = describeAttachment(path);
        const finalPath = attachment.path;
        if (typeof finalPath === "string" && finalPath !== path) {
          const converted = statSync(finalPath);
          const convertedError = attachmentSizeError(attachment.name as string, converted.size, "image");
          if (convertedError) {
            errors.push(convertedError);
            continue;
          }
        }
        attachments.push(attachment);
      } catch {
        errors.push(`Could not attach ${path.split("/").pop() ?? path}.`);
      }
    }
    return { attachments, errors };
  }

  ipcMain.handle("attach:choose", async () => {
    if (!win) return { attachments: [] };
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "openDirectory", "multiSelections"],
      title: "Attach files or folders",
      buttonLabel: "Attach",
      defaultPath: lastDialogDir("attach") ?? mainCwd ?? undefined,
    });
    if (result.canceled) return { attachments: [] };
    if (result.filePaths[0]) rememberDialogDir("attach", result.filePaths[0]);
    return attachablePaths(result.filePaths);
  });

  // Drag-and-drop lands here. The renderer can resolve a dropped File to a
  // real path (webUtils) but cannot stat it or read an image off disk, so the
  // classification has to happen on this side — and it is the SAME
  // classification the picker uses, deliberately: a folder dragged in and a
  // folder chosen from the dialog should arrive as the same kind of thing.
  ipcMain.handle("attach:paths", (_e, p: { paths?: unknown }) => {
    const paths = Array.isArray(p?.paths) ? p.paths.filter((x): x is string => typeof x === "string") : [];
    // Only paths that exist. A drop can carry an item with no file behind it
    // (a dragged selection, a web image), and webUtils hands back "" for those.
    const real = paths.filter((path) => {
      if (!path || !isAbsolute(path)) return false;
      try {
        statSync(path);
        return true;
      } catch {
        return false;
      }
    });
    if (real[0]) rememberDialogDir("attach", real[0]);
    return attachablePaths(real);
  });

  ipcMain.handle("browser:open", (_e, p: { id: number; url?: string }) => {
    if (p.url && isStripeOnboardingPage(p.url, !app.isPackaged)) {
      void shell.openExternal(p.url);
      return { ok: true };
    }
    const view = ensureBrowserView(p.id);
    if (p.url) void view.webContents.loadURL(p.url);
    return { ok: true };
  });

  ipcMain.handle("browser:capture", async (_e, id: number) => {
    const wc = browserViews.get(id)?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    try {
      const image = await wc.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch {
      return null;
    }
  });

  ipcMain.handle("browser:bounds", (_e, p: { id: number; x: number; y: number; width: number; height: number }) => {
    // The renderer measures in its own CSS pixels; setBounds wants window
    // DIPs. They differ by the page zoom factor (Cmd+= / Cmd+-), so an
    // unzoomed conversion strands the view at the wrong spot and size.
    const z = win?.webContents.getZoomFactor() ?? 1;
    // A hidden renderer placeholder reports zero size. Keep the last usable
    // viewport so its page does not reflow while parked offscreen.
    if (!browserViews.has(p.id) && !browserVisibility.has(p.id)) return;
    const bounds = {
      x: Math.round(p.x * z),
      y: Math.round(p.y * z),
      width: Math.max(0, Math.round(p.width * z)),
      height: Math.max(0, Math.round(p.height * z)),
    };
    if (!bounds.width || !bounds.height) return;
    browserViewBounds.set(p.id, bounds);
    const view = browserViews.get(p.id);
    if (view) view.setBounds(browserVisibility.get(p.id) ? bounds : offscreenBrowserBounds(bounds));
  });

  ipcMain.handle("browser:visible", (_e, p: { id: number; visible: boolean }) => {
    browserVisibility.set(p.id, p.visible);
    const view = browserViews.get(p.id);
    if (view) setBrowserViewVisible(p.id, view, p.visible);
  });

  ipcMain.handle("browser:navigate", (_e, p: { id: number; url?: string; action?: "back" | "forward" | "reload" }) => {
    const wc = browserViews.get(p.id)?.webContents;
    if (!wc) return;
    if (p.url) {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(p.url) ? p.url : `https://${p.url}`;
      if (isStripeOnboardingPage(url, !app.isPackaged)) {
        void shell.openExternal(url);
        return;
      }
      void wc.loadURL(url);
    } else if (p.action === "back") {
      wc.navigationHistory.goBack();
    } else if (p.action === "forward") {
      wc.navigationHistory.goForward();
    } else if (p.action === "reload") {
      wc.reload();
    }
  });

  ipcMain.handle("browser:annotate-mode", (_e, id: number) => {
    void startAnnotatePicker(id);
    return { ok: true };
  });

  ipcMain.handle("browser:close", (_e, id: number) => {
    browserVisibility.delete(id);
    browserViewBounds.delete(id);
    const view = browserViews.get(id);
    if (view) {
      browserViews.delete(id);
      win?.contentView.removeChildView(view);
      view.webContents.close();
    }
  });

  // Integrated terminal: a real PTY running the user's shell, rooted at
  // the active conversation's cwd (the Codex/Claude-desktop contract —
  // the terminal sees the same files the agent works on).
  ipcMain.handle("term:create", (_e, opts: { cols?: number; rows?: number }) => {
    requireLocalConversation("term:create");
    const cwd = mainCwd ?? pendingCwd ?? app.getPath("home");
    const shell = process.env.SHELL || "/bin/zsh";
    const id = `pty_${nextPtyId++}`;
    const pty = ptySpawn(shell, [], {
      name: "xterm-256color",
      cwd,
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      env: process.env as Record<string, string>,
    });
    pty.onData((data) => send("term:data", { id, data }));
    pty.onExit(({ exitCode }) => {
      ptys.delete(id);
      send("term:exit", { id, exitCode });
    });
    ptys.set(id, pty);
    return { id, cwd, shell };
  });

  ipcMain.handle("term:write", (_e, p: { id: string; data: string }) => {
    requireLocalConversation("term:write");
    ptys.get(p.id)?.write(p.data);
  });

  ipcMain.handle("term:resize", (_e, p: { id: string; cols: number; rows: number }) => {
    ptys.get(p.id)?.resize(Math.max(2, Math.floor(p.cols)), Math.max(1, Math.floor(p.rows)));
  });

  ipcMain.handle("term:kill", (_e, id: string) => {
    ptys.get(id)?.kill();
    ptys.delete(id);
  });

  // One directory level for the workspace tree — the renderer expands
  // lazily, so huge folders (node_modules…) cost nothing until opened.
  // No path argument = the active conversation's root.
  ipcMain.handle("fs:list", (_e, rawDir?: string) => {
    const base = mainCwd ?? pendingCwd ?? app.getPath("home");
    const dir = rawDir ? (isAbsolute(rawDir) ? rawDir : join(base, rawDir)) : base;
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
        .map((d) => ({ name: d.name, dir: d.isDirectory() }))
        .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
      return { dir, entries };
    } catch {
      return { dir, entries: [], error: `Could not read ${dir}` };
    }
  });

  // Current branch of a project, for the composer's context strip.
  ipcMain.handle("git:branch", (_e, path: string) => {
    return new Promise((resolve) => {
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: path, timeout: 3000 }, (err, stdout) => {
        resolve({ branch: err ? null : stdout.trim() });
      });
    });
  });

  const runGit = (cwd: string, args: string[]) =>
    new Promise<{ out: string; err: string; code: number }>((resolve) => {
      execFile("git", args, { cwd, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({ out: stdout ?? "", err: stderr ?? "", code: error ? 1 : 0 });
      });
    });

  // Branch switcher data: local branches, the current one, and the dirty
  // working-tree files with +/- stats (drives the commit/discard modal).
  ipcMain.handle("git:branches", async (_e, path: string) => {
    const br = await runGit(path, ["branch", "--format=%(refname:short)", "--sort=-committerdate"]);
    if (br.code !== 0) return { error: "Not a git repository", branches: [], current: "", dirty: [] };
    const cur = await runGit(path, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = await runGit(path, ["status", "--porcelain"]);
    const numstat = await runGit(path, ["diff", "HEAD", "--numstat"]);
    const stats = new Map<string, { plus: number; minus: number }>();
    for (const line of numstat.out.split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (m) stats.set(m[3], { plus: m[1] === "-" ? 0 : Number(m[1]), minus: m[2] === "-" ? 0 : Number(m[2]) });
    }
    const dirty = status.out
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const raw = l.slice(3).trim();
        const file = raw.includes(" -> ") ? raw.split(" -> ")[1] : raw;
        const st = stats.get(file);
        return { file, plus: st?.plus ?? 0, minus: st?.minus ?? 0 };
      });
    return { branches: br.out.split("\n").filter(Boolean), current: cur.out.trim(), dirty };
  });

  ipcMain.handle("git:checkout", async (_e, p: { path: string; branch: string; create?: boolean }) => {
    requireLocalConversation("git:checkout");
    const r = await runGit(p.path, p.create ? ["checkout", "-b", p.branch] : ["checkout", p.branch]);
    return r.code === 0 ? { ok: true } : { ok: false, error: r.err.trim() || "Checkout failed" };
  });

  ipcMain.handle("git:commit-all", async (_e, p: { path: string; message: string }) => {
    requireLocalConversation("git:commit-all");
    const add = await runGit(p.path, ["add", "-A"]);
    if (add.code !== 0) return { ok: false, error: add.err.trim() };
    const commit = await runGit(p.path, ["commit", "-m", p.message]);
    return commit.code === 0
      ? { ok: true }
      : { ok: false, error: commit.err.trim() || commit.out.trim() || "Commit failed" };
  });

  // ---- Review pane: structured diffs + commit/push/PR actions ----

  type ReviewLine = { t: "a" | "d" | "c"; no: number; text: string };
  type ReviewHunk = { newStart: number; lines: ReviewLine[] };
  type ReviewFile = { path: string; plus: number; minus: number; hunks: ReviewHunk[] };

  function parseUnifiedDiff(text: string): ReviewFile[] {
    const files: ReviewFile[] = [];
    let cur: ReviewFile | null = null;
    let hunk: ReviewHunk | null = null;
    let pendingOld = "";
    let oldNo = 0;
    let newNo = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith("diff --git")) {
        cur = null;
        hunk = null;
        continue;
      }
      if (line.startsWith("--- ")) {
        pendingOld = line.slice(4).replace(/^a\//, "");
        continue;
      }
      if (line.startsWith("+++ ")) {
        const p = line.slice(4).replace(/^b\//, "");
        cur = { path: p === "/dev/null" ? pendingOld : p, plus: 0, minus: 0, hunks: [] };
        files.push(cur);
        hunk = null;
        continue;
      }
      if (!cur) continue;
      if (line.startsWith("@@")) {
        const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (!m) continue;
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
        hunk = { newStart: newNo, lines: [] };
        cur.hunks.push(hunk);
        continue;
      }
      if (!hunk) continue;
      if (line.startsWith("+")) {
        hunk.lines.push({ t: "a", no: newNo++, text: line.slice(1) });
        cur.plus++;
      } else if (line.startsWith("-")) {
        hunk.lines.push({ t: "d", no: oldNo++, text: line.slice(1) });
        cur.minus++;
      } else if (line.startsWith("\\")) {
        // "\ No newline at end of file" — not content
      } else {
        hunk.lines.push({ t: "c", no: newNo, text: line.slice(1) });
        oldNo++;
        newNo++;
      }
    }
    return files;
  }

  // Structured diff: "branch" = merge-base(origin main-ish)→working tree
  // (committed + uncommitted, like Codex's Branch view); "working" = HEAD→
  // working tree. Untracked files are synthesized as all-added.
  ipcMain.handle("review:diff", async (_e, p: { path: string; mode: "branch" | "working" }) => {
    const branch = (await runGit(p.path, ["rev-parse", "--abbrev-ref", "HEAD"])).out.trim();
    let baseLabel = "Working Tree";
    let diffArgs = ["diff", "HEAD"];
    if (p.mode === "branch") {
      let base = "";
      for (const ref of ["origin/main", "origin/master", "main", "master"]) {
        const mb = await runGit(p.path, ["merge-base", "HEAD", ref]);
        if (mb.code === 0 && mb.out.trim()) {
          base = mb.out.trim();
          baseLabel = ref;
          break;
        }
      }
      if (!base) return { error: "No base branch found (origin/main, main, …)", files: [], plus: 0, minus: 0, branch, baseLabel: "" };
      diffArgs = ["diff", base];
    }
    const diff = await runGit(p.path, diffArgs);
    if (diff.code !== 0) return { error: diff.err.trim() || "diff failed", files: [], plus: 0, minus: 0, branch, baseLabel };
    const files = parseUnifiedDiff(diff.out);
    // Untracked files appear in neither diff — synthesize them.
    const status = await runGit(p.path, ["status", "--porcelain"]);
    for (const line of status.out.split("\n")) {
      if (!line.startsWith("?? ")) continue;
      const rel = line.slice(3).trim();
      if (rel.endsWith("/")) continue;
      try {
        const content = readFileSync(join(p.path, rel), "utf8");
        if (content.includes("\u0000") || content.length > 400_000) continue;
        const lines = content.split("\n");
        if (lines[lines.length - 1] === "") lines.pop();
        files.push({
          path: rel,
          plus: lines.length,
          minus: 0,
          hunks: [{ newStart: 1, lines: lines.map((text, i) => ({ t: "a" as const, no: i + 1, text })) }],
        });
      } catch {
        // unreadable — skip
      }
    }
    const plus = files.reduce((n, f) => n + f.plus, 0);
    const minus = files.reduce((n, f) => n + f.minus, 0);
    return { files, plus, minus, branch, baseLabel };
  });

  ipcMain.handle("review:commit-push", async (_e, path: string) => {
    requireLocalConversation("review:commit-push");
    const status = await runGit(path, ["status", "--porcelain"]);
    if (status.out.trim()) {
      const add = await runGit(path, ["add", "-A"]);
      if (add.code !== 0) return { ok: false, error: add.err.trim() };
      const commit = await runGit(path, ["commit", "-m", "Changes from Unbiased"]);
      if (commit.code !== 0) return { ok: false, error: commit.err.trim() || commit.out.trim() };
    }
    const push = await runGit(path, ["push", "-u", "origin", "HEAD"]);
    return push.code === 0 ? { ok: true } : { ok: false, error: push.err.trim() || "push failed" };
  });

  ipcMain.handle("review:create-pr", (_e, path: string) => {
    requireLocalConversation("review:create-pr");
    return new Promise((resolve) => {
      execFile("gh", ["pr", "create", "--fill", "--web"], { cwd: path, timeout: 60000 }, (err, _o, stderr) => {
        resolve(err ? { ok: false, error: (stderr ?? "").trim() || "gh pr create failed (is GitHub CLI installed?)" } : { ok: true });
      });
    });
  });

  // Destructive by design — only reachable through the modal that lists
  // exactly which files will be lost.
  ipcMain.handle("git:discard", async (_e, path: string) => {
    requireLocalConversation("git:discard");
    const reset = await runGit(path, ["reset", "--hard"]);
    if (reset.code !== 0) return { ok: false, error: reset.err.trim() };
    const clean = await runGit(path, ["clean", "-fd"]);
    return clean.code === 0 ? { ok: true } : { ok: false, error: clean.err.trim() };
  });

  // Line blame for the file viewer (GitLens-style hints). Porcelain output
  // gives hash/author/time/summary; the commit URL derives from the repo's
  // origin remote (ssh remotes normalized to https).
  ipcMain.handle("git:blame-line", async (_e, p: { file: string; line: number }) => {
    const dir = p.file.split("/").slice(0, -1).join("/") || "/";
    const run = (args: string[]) =>
      new Promise<string>((resolve) => {
        execFile("git", args, { cwd: dir, timeout: 5000 }, (err, stdout) => resolve(err ? "" : stdout));
      });
    const out = await run(["blame", "-L", `${p.line},${p.line}`, "--porcelain", "--", p.file]);
    if (!out) return { error: "No blame information" };
    const hash = out.split(/\s/)[0] ?? "";
    const field = (key: string) =>
      out
        .split("\n")
        .find((l) => l.startsWith(key + " "))
        ?.slice(key.length + 1) ?? "";
    const uncommitted = /^0+$/.test(hash);
    let url: string | null = null;
    if (!uncommitted) {
      let remote = (await run(["config", "--get", "remote.origin.url"])).trim().replace(/\.git$/, "");
      const ssh = /^git@([^:]+):(.+)$/.exec(remote);
      if (ssh) remote = `https://${ssh[1]}/${ssh[2]}`;
      if (/^https?:/.test(remote)) url = `${remote}/commit/${hash}`;
    }
    return {
      hash,
      author: field("author"),
      time: Number(field("author-time")) * 1000,
      summary: field("summary"),
      uncommitted,
      url,
    };
  });

  // "Open in external browser" from the browser toolbar.
  ipcMain.handle("browser:open-external", (_e, url: string) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { ok: true };
  });

  // Whole-word references search across the active project — the engine
  // behind ⌘-click in the file viewer. Text-based (grep), not semantic:
  // works for every language, no language servers. execFile with an args
  // array means the symbol is never shell-interpreted.
  ipcMain.handle("fs:search-refs", (_e, word: string) => {
    const base = mainCwd ?? pendingCwd;
    if (!base || base === app.getPath("home")) {
      return { results: [], error: "References need a project conversation" };
    }
    if (!/^[\w$]{1,128}$/.test(word)) return { results: [], error: "Not a searchable symbol" };
    return new Promise((resolve) => {
      execFile(
        "grep",
        [
          "-rnIwF", // recursive, line numbers, skip binaries, whole word, literal
          "--exclude-dir=node_modules",
          "--exclude-dir=.git",
          "--exclude-dir=.claude", // worktrees duplicate the whole repo
          "--exclude-dir=dist",
          "--exclude-dir=out",
          "--exclude-dir=build",
          "--exclude-dir=.next",
          "--exclude-dir=target",
          word,
          base,
        ],
        { maxBuffer: 8 * 1024 * 1024, timeout: 10_000 },
        (_err, stdout) => {
          // grep exits 1 on "no matches" — a result, not a failure.
          const lines = stdout ? stdout.split("\n").filter(Boolean) : [];
          const results = [];
          for (const ln of lines.slice(0, 200)) {
            const m = /^(.*?):(\d+):(.*)$/.exec(ln);
            if (!m) continue;
            results.push({
              path: m[1],
              rel: relative(base, m[1]),
              line: Number(m[2]),
              text: m[3].trim().slice(0, 200),
            });
          }
          resolve({ results, truncated: lines.length > 200 });
        },
      );
    });
  });

  // Full-size image as a data URL for the side panel's preview tab (the
  // renderer can't load file:// under its CSP; data: is allowed).
  ipcMain.handle("file:read-image", (_e, path: string) => {
    if (typeof path !== "string" || !path) return { error: "A file path is required." };
    const base = mainCwd ?? pendingCwd ?? app.getPath("home");
    const fullPath = isAbsolute(path) ? path : join(base, path);
    try {
      if (statSync(fullPath).size > 15_000_000) return { fullPath, error: "Image is larger than 15 MB" };
      const img = nativeImage.createFromPath(fullPath);
      if (img.isEmpty()) return { fullPath, error: "Could not read image" };
      return { fullPath, dataUrl: img.toDataURL() };
    } catch {
      return { fullPath, error: `Could not open ${path}` };
    }
  });

  // Site icons for source links in assistant markdown. Same shape as
  // file:read-image above and for the same reason: `img-src 'self' data:`
  // means the renderer cannot load a remote icon itself. Misses are cached as
  // null too, so a site without an icon is asked once per run.
  const FAVICON_CACHE_MAX = 256;
  const faviconCache = new Map<string, string | null>();
  ipcMain.handle("link:favicon", async (_e, rawHost: string) => {
    const host = faviconHostOrNull(String(rawHost ?? ""));
    if (!host) return { dataUrl: null };
    if (faviconCache.has(host)) return { dataUrl: faviconCache.get(host) ?? null };
    // /favicon.ico first, then /favicon.png. Sites served out of a bundler
    // increasingly ship only the PNG and point at it with <link rel="icon">,
    // which we deliberately don't fetch pages to read — learn.chatgpt.com is
    // one. The second guess costs a request only when the first one misses.
    const dataUrl = (await fetchIcon(host, "/favicon.ico")) ?? (await fetchIcon(host, "/favicon.png"));
    // Bounded: a long session citing many domains would otherwise hold every
    // icon it ever saw, and the renderer keeps its own copy of the same bytes.
    // Map iterates in insertion order, so the oldest entry goes first.
    if (faviconCache.size >= FAVICON_CACHE_MAX) {
      const oldest = faviconCache.keys().next().value;
      if (oldest !== undefined) faviconCache.delete(oldest);
    }
    faviconCache.set(host, dataUrl);
    return { dataUrl };
  });

  // ── Agent-browser mirror IPC ──
  registerBrowserMirrorIpc(ipcMain, browserRuntime, rootThreadOf);

  // A copied/pasted image lives in the native clipboard; persist it to a
  // temp PNG so it can ride the next turn as a localImage input item.
  ipcMain.handle("attach:clipboard-image", async () => {
    const items = await clipboard.read();
    const bytes = await clipboardImageBuffer(items);
    if (!bytes) return { attachment: null };

    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) return { attachment: null };
    const png = image.toPNG();
    const error = attachmentSizeError("Pasted image", png.length, "image");
    if (error) return { attachment: null, error };
    const dir = join(app.getPath("temp"), "unbiased-pastes");
    mkdirSync(dir, { recursive: true });
    const name = `pasted-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
    const path = join(dir, name);
    writeFileSync(path, png);
    return { attachment: { name, path, kind: "image", thumb: thumbDataUrl(image) } };
  });

  /** Close a deleted conversation's browser tab. Best-effort: the browser may
   *  not be running, and a failure here must never block the delete. */
  async function releaseConversationTab(rootId: string): Promise<void> {
    await browserRuntime.request("session.release", {sessionId:rootId}).catch(() => undefined);
  }

  ipcMain.handle("threads:delete", async (_e, id: string) => {
    for (const record of sideChatRecents.recordsForParent(id)) {
      dropSidePane(record.paneId);
      try {
        await engine.request("thread/delete", { threadId: record.threadId });
        sideChatRecents.remove(record.paneId);
        threadMcp.delete(record.threadId);
        rmSync(sideChatTranscriptFile(record.threadId), { force: true });
      } catch (error) {
        console.warn("[side-chat] could not delete child thread:", error);
      }
    }
    saveSideChatRecents();
    saveThreadMcp();
    // A running turn dies with its thread — stop it first so the engine
    // isn't left executing against a deleted conversation.
    const turnId = runningTurns.get(id);
    if (turnId) {
      try {
        await engine.request("turn/interrupt", { threadId: id, turnId });
      } catch {
        // the delete below is the outcome that matters
      }
    }
    // Sub-agents run in their own sessions: stop and forget them with
    // their parent, or they keep executing (and raising approvals) against
    // a deleted conversation.
    for (const [subId, info] of [...subAgents]) {
      if (info.parent !== id) continue;
      const subTurn = runningTurns.get(subId);
      if (subTurn) {
        try {
          await engine.request("turn/interrupt", { threadId: subId, turnId: subTurn });
        } catch {
          // best-effort — the sub may have just finished
        }
      }
      runningTurns.delete(subId);
      petFinished(`turn:${subId}`, "interrupted");
      settleLocalApprovals(subId);
      settleLocalUserInputs(subId);
      subAgents.delete(subId);
      subAgentMail.delete(subId);
      heldApprovals.delete(subId);
      bgStream.delete(subId);
    }
    runningTurns.delete(id);
    petFinished(`turn:${id}`, "interrupted");
    settleLocalApprovals(id);
    settleLocalUserInputs(id);
    threadMcp.delete(id);
    mcpApplyPending.delete(id);
    saveThreadMcp();
    browserNetGrants.delete(id);
    browserConnectGrants.delete(id);
    threadAccessModes.delete(id);
    bgStream.delete(id);
    heldApprovals.delete(id);
    heldErrors.delete(id);
    await engine.request("thread/delete", { threadId: id });
    multiMountLeases.delete(id);
    delete panes[`multi:${id}`];
    void releaseConversationTab(id);
    try {
      rmSync(transcriptFile(id), { force: true });
    } catch {
      // cache cleanup is best-effort
    }
    if (panes.main.threadId === id) {
      panes.main.threadId = null;
      panes.main.turnId = null;
      resetSidePanes();
    }
    return { ok: true };
  });

  createWindow();
  if (petPreferences.visible) createPetWindow();
  installAppMenu();
  void completeDevAccessibilityRecovery();
  // Check for updates shortly after launch (let the window settle first),
  // then on a slow timer — a desktop app can stay open for days.
  // Before the first check, so a bundle staged by a previous run is offered
  // as "restart" instead of being downloaded all over again.
  recoverStagedUpdate();
  void refreshReleaseNotes();
  if (stagedUpdate) {
    send("update:available", { version: stagedUpdate.version, dmgUrl: "", sumsUrl: null });
    send("update:staged", { version: stagedUpdate.version });
  }
  setTimeout(() => void checkForUpdate(), 8000);
  setInterval(() => void checkForUpdate(), UPDATE_INTERVAL_MS);
  // The engine no longer auto-starts: the renderer's login gate decides
  // whether to sign in (a stored key + remembered session) or prompt first,
  // then calls auth:login, which validates and starts the engine.
});

let browserQuitReady = false;
app.on("before-quit", (event) => {
  browserShuttingDown = true;
  if (browserQuitReady || !browserRuntime.running) return;
  event.preventDefault();
  void browserRuntime.shutdown().finally(() => { browserQuitReady = true; app.quit(); });
});

app.on("window-all-closed", () => {
  for (const pty of ptys.values()) pty.kill();
  ptys.clear();
  void learning?.stop();
  learning = null;
  // Downloads and unpacked archives that were never installed.
  for (const dir of skillStages) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort; it is under the OS temp dir either way
    }
  }
  skillStages.clear();
  stopScheduler();
  engine.stop();
  // The agent browser's daemon outlives us otherwise — close every session.

  // Our own Chrome goes with us; its profile (and logins) persist on disk.
  app.quit();
});
