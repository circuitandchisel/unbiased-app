import { createServer } from "node:net";
import { BrowserRuntimeClient as PinnedBrowserRuntimeClient } from "../../build/browser-runtime/client";

type Configuration = ConstructorParameters<typeof PinnedBrowserRuntimeClient>[0];

/** The pinned runtime supports a custom port; isolate each desktop instance. */
export class BrowserRuntimeClient extends PinnedBrowserRuntimeClient {
  private readonly runtimeOptions: Configuration["options"];
  private portAllocation: Promise<void> | null = null;
  private initialization: ReturnType<PinnedBrowserRuntimeClient["ready"]> | null = null;
  private shutdownInFlight: ReturnType<PinnedBrowserRuntimeClient["shutdown"]> | null = null;

  constructor(config: Configuration) {
    const options = { ...config.options };
    super({ ...config, options });
    this.runtimeOptions = options;
  }

  override ready(): ReturnType<PinnedBrowserRuntimeClient["ready"]> {
    if (this.shutdownInFlight) return Promise.reject(new Error("Agent Browser is shutting down."));
    this.initialization ??= this.initializeRuntime().finally(() => { this.initialization = null; });
    return this.initialization;
  }

  override shutdown(): ReturnType<PinnedBrowserRuntimeClient["shutdown"]> {
    if (this.shutdownInFlight) return this.shutdownInFlight;
    const initialization = this.initialization;
    this.shutdownInFlight = (async () => {
      // The base client cannot see a child until port allocation completes.
      // Drain that startup (including its handshake) before stopping the child.
      await initialization?.catch(() => undefined);
      return super.shutdown();
    })().finally(() => { this.shutdownInFlight = null; });
    return this.shutdownInFlight;
  }

  private async initializeRuntime() {
    if (this.runtimeOptions.port === undefined) {
      this.portAllocation ??= new Promise<void>((resolve, reject) => {
        const reservation = createServer();
        reservation.once("error", reject);
        reservation.listen(0, "127.0.0.1", () => {
          const address = reservation.address();
          if (!address || typeof address === "string") {
            reservation.close(); reject(new Error("Could not choose an Agent Browser port.")); return;
          }
          const port = address.port;
          reservation.close(error => {
            if (error) reject(error);
            else { this.runtimeOptions.port = port; resolve(); }
          });
        });
      }).catch(error => { this.portAllocation = null; throw error; });
      await this.portAllocation;
    }
    // Chrome still verifies port ownership before connecting. A competing bind
    // after allocation fails safely rather than attaching an unrelated browser.
    return super.ready();
  }
}
