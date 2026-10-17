type Change = { projectId?: string; clientIds: string[] };
type Listener = (change: Change) => void;
declare global {
  var yinsenProjectListeners: Set<Listener> | undefined;
}

export function subscribeProjects(listener: Listener): () => void {
  globalThis.yinsenProjectListeners ??= new Set();
  globalThis.yinsenProjectListeners.add(listener);
  return () => {
    globalThis.yinsenProjectListeners?.delete(listener);
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
