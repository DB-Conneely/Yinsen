type Change = { projectId?: string; clientId?: string; clientIds: string[] };
type Listener = (change: Change) => void;
declare global {
  var yinsenProjectListeners: Set<Listener> | undefined;
  var yinsenStreamClosers: Set<() => void> | undefined;
}

export function subscribeProjects(
  listener: Listener,
  close?: () => void,
): () => void {
  globalThis.yinsenProjectListeners ??= new Set();
  if (close) {
    if (!globalThis.yinsenStreamClosers) {
      globalThis.yinsenStreamClosers = new Set();
      // End long-lived responses so Next's existing signal handlers can drain.
      const shutdown = (): void => {
        for (const stop of globalThis.yinsenStreamClosers ?? []) stop();
      };
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    }
    globalThis.yinsenStreamClosers.add(close);
  }
  globalThis.yinsenProjectListeners.add(listener);
  return () => {
    globalThis.yinsenProjectListeners?.delete(listener);
    if (close) globalThis.yinsenStreamClosers?.delete(close);
  };
}

export function publishProject(projectId: string, clientIds: string[]): void {
  for (const listener of globalThis.yinsenProjectListeners ?? [])
    listener({ projectId, clientIds });
}

export function publishClientAccess(clientId: string): void {
  for (const listener of globalThis.yinsenProjectListeners ?? [])
    listener({ clientIds: [clientId] });
}

export function publishConversation(clientId: string): void {
  for (const listener of globalThis.yinsenProjectListeners ?? [])
    listener({ clientId, clientIds: [clientId] });
}
