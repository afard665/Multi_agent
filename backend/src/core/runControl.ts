import crypto from "crypto";

type RunControlEntry = {
  cancelToken: string;
  cancelled: boolean;
  createdAt: number;
  abort?: () => void;
};

const controls = new Map<string, RunControlEntry>();

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

export function registerRun(runId: string): string {
  const cancelToken = randomToken();
  controls.set(runId, { cancelToken, cancelled: false, createdAt: Date.now() });
  return cancelToken;
}

export function attachRunAbort(runId: string, abort: () => void) {
  const entry = controls.get(runId);
  if (!entry) return;
  entry.abort = abort;
}

export function cancelRun(runId: string, cancelToken: string): boolean {
  const entry = controls.get(runId);
  if (!entry) return false;
  if (entry.cancelToken !== cancelToken) return false;
  entry.cancelled = true;
  try {
    entry.abort?.();
  } catch {
    // ignore
  }
  return true;
}

export function isRunCancelled(runId: string): boolean {
  return controls.get(runId)?.cancelled === true;
}

export function completeRun(runId: string) {
  controls.delete(runId);
}
