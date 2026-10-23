import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageNotifications } from "../src/components/message-notifications";

const observed = vi.hoisted(
  (): {
    effect: (() => void | (() => void)) | undefined;
    updates: unknown[];
  } => ({ effect: undefined, updates: [] }),
);
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)): void => {
    observed.effect = effect;
  },
  useState: (initial: unknown): [unknown, (value: unknown) => void] => [
    initial,
    (value): void => {
      observed.updates.push(value);
    },
  ],
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/portal" }));

class NotificationSource extends EventTarget {
  static current: NotificationSource;
  onopen: (() => void) | null = null;
  constructor() {
    super();
    NotificationSource.current = this;
  }
  close(): void {}
}

function summary(total: number): Response {
  return Response.json({ data: { total, conversations: [] } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  observed.updates = [];
});

describe("message notification response ordering", () => {
  it("retires the old stream during rotation, ignoring its queued revocation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(summary(0)));
    vi.stubGlobal("EventSource", NotificationSource);
    const assign = vi.fn(),
      events = new EventTarget();
    vi.stubGlobal("window", Object.assign(events, { location: { assign } }));
    MessageNotifications({ role: "operator" });
    const cleanup = observed.effect?.();
    events.dispatchEvent(new Event("yinsen:session-changing"));
    NotificationSource.current.dispatchEvent(new Event("revoked"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(assign).not.toHaveBeenCalled();
    events.dispatchEvent(new Event("yinsen:session-changed"));
    expect(observed.updates.some((value) => typeof value === "function")).toBe(
      true,
    );
    if (typeof cleanup === "function") cleanup();
  });

  it("still redirects an actually revoked session and a denied replacement stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    vi.stubGlobal("EventSource", NotificationSource);
    const assign = vi.fn(),
      events = new EventTarget();
    vi.stubGlobal("window", Object.assign(events, { location: { assign } }));
    MessageNotifications({ role: "operator" });
    const cleanup = observed.effect?.();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
    assign.mockClear();
    NotificationSource.current.dispatchEvent(new Event("revoked"));
    expect(assign).toHaveBeenCalledWith("/login");
    if (typeof cleanup === "function") cleanup();
  });

  it.each(["success", "failure", "unavailable", "revoked"])(
    "ignores an obsolete %s after a newer authoritative refresh",
    async (outcome) => {
      let release = (_value: Response): void => undefined;
      const old = new Promise<Response>((resolve) => {
        release = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockReturnValueOnce(old).mockResolvedValue(summary(0)),
      );
      vi.stubGlobal("EventSource", NotificationSource);
      const events = new EventTarget();
      vi.stubGlobal(
        "window",
        Object.assign(events, { location: { assign: vi.fn() } }),
      );
      MessageNotifications({ role: "client" });
      const cleanup = observed.effect?.();
      if (outcome === "unavailable" || outcome === "revoked")
        NotificationSource.current.dispatchEvent(new Event(outcome));
      else {
        events.dispatchEvent(new Event("yinsen:unread"));
        await vi.waitFor(() =>
          expect(observed.updates).toContainEqual({
            total: 0,
            conversations: [],
          }),
        );
      }
      const accepted = [...observed.updates];
      release(
        outcome === "failure"
          ? new Response(null, { status: 503 })
          : summary(1),
      );
      await old;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(observed.updates).toEqual(accepted);
      if (typeof cleanup === "function") cleanup();
    },
  );
});
