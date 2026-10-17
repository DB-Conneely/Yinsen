import { projectActor, projectAccess } from "../projects/access";
import { requestToken } from "../auth/session";
import { subscribeProjects } from "./hub";
import { AppError } from "../errors";

export async function projectStream(
  request: Request,
  projectId?: string,
): Promise<Response> {
  const token = requestToken(request);
  const actor = await projectActor(token);
  if (projectId) await projectAccess(projectId, actor);
  let cleanup = (): void => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let queue = Promise.resolve();
      const send = (event: string): void => {
        if (!closed)
          controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
      };
      const close = (): void => {
        if (!closed) {
          closed = true;
          cleanup();
          controller.close();
        }
      };
      const verify = async (refresh: boolean): Promise<void> => {
        try {
          const current = await projectActor(token);
          if (projectId) await projectAccess(projectId, current);
          send(refresh ? "refresh" : "heartbeat");
        } catch (error: unknown) {
          send(
            error instanceof AppError && error.statusCode < 500
              ? "revoked"
              : "unavailable",
          );
          close();
        }
      };
      const schedule = (refresh: boolean): void => {
        queue = queue.then(() => (closed ? undefined : verify(refresh)));
      };
      const unsubscribe = subscribeProjects((change) => {
        if (
          (!change.projectId || !projectId || projectId === change.projectId) &&
          (actor.role === "operator" || change.clientIds.includes(actor.id))
        )
          schedule(true);
      });
      const timer = setInterval(() => schedule(false), 5000);
      cleanup = (): void => {
        closed = true;
        clearInterval(timer);
        unsubscribe();
        request.signal.removeEventListener("abort", close);
      };
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close();
      else schedule(true);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
