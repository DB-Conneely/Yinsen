import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { ProjectLive } from "../src/components/project-live";

const observed = vi.hoisted(
  (): {
    effects: (() => void | (() => void))[];
    refresh: ReturnType<typeof vi.fn>;
    pending: boolean;
  } => ({ effects: [], refresh: vi.fn(), pending: false }),
);
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)): void => {
    observed.effects.push(effect);
  },
  useState: (initial: unknown): [unknown, () => void] => [initial, vi.fn()],
  useRef: (initial: unknown): { current: unknown } => ({ current: initial }),
  useCallback: <T>(callback: T): T => callback,
  useTransition: (): [boolean, (action: () => void) => void] => [
    observed.pending,
    (action) => action(),
  ],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: observed.refresh }),
}));

class LiveSource extends EventTarget {
  static current: LiveSource;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    super();
    LiveSource.current = this;
  }
}

function mount(): {
  value: { refreshing: boolean; setDraft: (value: boolean) => void };
  window: EventTarget;
  network: { onLine: boolean };
  cleanup: () => void;
} {
  const window = new EventTarget(),
    network = { onLine: true };
  vi.stubGlobal("window", window);
  vi.stubGlobal("navigator", network);
  vi.stubGlobal("EventSource", LiveSource);
  // CAST: ProjectLive renders this exact MessageRefreshContext provider value.
  const element = ProjectLive({ children: "Work" }) as ReactElement<{
    value: { refreshing: boolean; setDraft: (value: boolean) => void };
  }>;
  const cleanups = observed.effects.map((effect) => effect());
  return {
    value: element.props.value,
    window,
    network,
    cleanup: () => {
      for (const cleanup of cleanups)
        if (typeof cleanup === "function") cleanup();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  observed.effects = [];
  observed.refresh.mockClear();
  observed.pending = false;
});

describe("draft-safe live refresh", () => {
  it("keeps message deltas live while deferring server refresh until a draft is clear", () => {
    const mounted = mount(),
      delta = vi.fn();
    mounted.window.addEventListener("yinsen:refresh", delta);
    LiveSource.current.onopen?.();
    expect(observed.refresh).not.toHaveBeenCalled();
    mounted.value.setDraft(true);
    LiveSource.current.dispatchEvent(new Event("refresh"));
    LiveSource.current.dispatchEvent(new Event("refresh"));
    expect(delta).toHaveBeenCalledTimes(2);
    expect(observed.refresh).not.toHaveBeenCalled();
    mounted.value.setDraft(false);
    expect(observed.refresh).toHaveBeenCalledTimes(1);
    mounted.cleanup();
    expect(LiveSource.current.close).toHaveBeenCalledTimes(1);
  });

  it("defers offline refresh and reconnect until the draft is safe, retaining access revocation", () => {
    const mounted = mount();
    mounted.network.onLine = false;
    LiveSource.current.dispatchEvent(new Event("refresh"));
    expect(observed.refresh).not.toHaveBeenCalled();
    mounted.value.setDraft(true);
    mounted.network.onLine = true;
    mounted.window.dispatchEvent(new Event("online"));
    expect(observed.refresh).not.toHaveBeenCalled();
    mounted.value.setDraft(false);
    expect(observed.refresh).toHaveBeenCalledTimes(1);
    mounted.value.setDraft(true);
    LiveSource.current.dispatchEvent(new Event("revoked"));
    expect(observed.refresh).toHaveBeenCalledTimes(2);
    expect(LiveSource.current.close).toHaveBeenCalledTimes(1);
    mounted.cleanup();
    mounted.window.dispatchEvent(new Event("online"));
    expect(observed.refresh).toHaveBeenCalledTimes(2);
  });

  it("exposes an in-flight transition so the composer cannot start a draft inside it", () => {
    observed.pending = true;
    const mounted = mount();
    expect(mounted.value.refreshing).toBe(true);
    mounted.cleanup();
  });
});
