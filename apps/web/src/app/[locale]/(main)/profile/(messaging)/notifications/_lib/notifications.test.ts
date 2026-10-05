/** @format */

import { describe, expect, it } from "vitest";
import {
  collectUnreadIds,
  withUnreadHighlight,
  type Notification,
} from "./notifications";

const n = (id: string, isRead: boolean): Notification => ({
  id,
  type: "new_message",
  title: id,
  message: "",
  isRead,
  createdAt: "2026-01-01T00:00:00Z",
});

describe("collectUnreadIds", () => {
  it("yalnız okunmamışların kimliklerini toplar", () => {
    const ids = collectUnreadIds([n("a", false), n("b", true), n("c", false)]);
    expect([...ids]).toEqual(["a", "c"]);
  });
});

describe("withUnreadHighlight", () => {
  it("küme boşsa aynı diziyi döner", () => {
    const list = [n("a", true)];
    expect(withUnreadHighlight(list, new Set())).toBe(list);
  });

  it("kümedeki okunmuş bildirimi okunmamış gösterir, diğerlerine dokunmaz", () => {
    const list = [n("a", true), n("b", true), n("c", false)];
    const out = withUnreadHighlight(list, new Set(["a"]));
    expect(out.map((x) => x.isRead)).toEqual([false, true, false]);
    expect(out[1]).toBe(list[1]);
  });
});
