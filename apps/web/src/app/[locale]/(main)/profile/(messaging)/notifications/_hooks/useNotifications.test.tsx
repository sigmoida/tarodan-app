// @vitest-environment jsdom
/** @format */

import { StrictMode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  list: {} as Record<string, unknown>,
  count: {} as Record<string, unknown>,
  autoMark: vi.fn(),
  markAll: vi.fn(),
  markOne: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/hooks/useWebResource", () => ({ useWebList: () => h.list }));
vi.mock("@/hooks/useHeaderBadgeCounts", () => ({
  useUnreadNotificationCount: () => h.count,
}));
vi.mock("@/hooks/useNotificationMutations", () => ({
  NOTIFICATIONS_RESOURCE: "notifications",
  useMarkNotificationRead: () => ({ mutate: h.markOne }),
  useMarkAllNotificationsRead: ({ silent }: { silent?: boolean } = {}) => ({
    mutate: silent ? h.autoMark : h.markAll,
  }),
}));

import { useNotifications } from "./useNotifications";

const item = (id: string, isRead: boolean) => ({
  id,
  type: "new_message",
  title: id,
  message: "",
  isRead,
  createdAt: "2026-01-01T00:00:00Z",
});

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useNotifications>;

function Harness() {
  result = useNotifications(true);
  return null;
}

function render() {
  act(() =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  );
}

const settledList = (data: unknown[]) => ({
  data,
  isSuccess: true,
  isFetching: false,
  isLoading: false,
});
const settledCount = (data: number) => ({
  data,
  isSuccess: true,
  isFetching: false,
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.autoMark.mockReset();
  h.markAll.mockReset();
  h.markOne.mockReset();
  h.list = settledList([item("a", false), item("b", true)]);
  h.count = settledCount(3);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useNotifications — sayfa açılışında otomatik okundu", () => {
  it("strict mode'da ve sonraki render'larda tek sefer, sessizce tetikler", () => {
    render();
    expect(h.autoMark).toHaveBeenCalledTimes(1);
    expect(h.markAll).not.toHaveBeenCalled();
    // Invalidation sonrası sayaç 0'a düşer; tekrar tetiklenmez.
    h.count = settledCount(0);
    render();
    expect(h.autoMark).toHaveBeenCalledTimes(1);
  });

  it("açılıştaki okunmamışları 'yeni' göstermeye devam eder", () => {
    render();
    // Sunucu artık hepsini okunmuş döndürüyor.
    h.list = settledList([item("a", true), item("b", true)]);
    render();
    expect(result.notifications.map((x) => x.isRead)).toEqual([false, true]);
  });

  it("liste tazelenirken bekler", () => {
    h.list = { ...h.list, isFetching: true };
    render();
    expect(h.autoMark).not.toHaveBeenCalled();
  });

  it("hiç okunmamış yoksa sunucuya gitmez", () => {
    h.list = settledList([item("b", true)]);
    h.count = settledCount(0);
    render();
    expect(h.autoMark).not.toHaveBeenCalled();
  });

  it("100'den eski okunmamışlarda sunucu sayacıyla işaretler ve butonu tutar", () => {
    h.list = settledList([item("b", true)]);
    render();
    expect(h.autoMark).toHaveBeenCalledTimes(1);
    expect(result.canMarkAllRead).toBe(true);
    expect(result.unreadCount).toBe(3);
  });

  it("tek bildirimi okundu yapınca vurgusu kalkar", () => {
    render();
    act(() => result.markRead("a"));
    expect(h.markOne).toHaveBeenCalledWith("a");
    h.list = settledList([item("a", true), item("b", true)]);
    render();
    expect(result.notifications.map((x) => x.isRead)).toEqual([true, true]);
  });
});
