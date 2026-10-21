// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePagedPicks } from "./usePagedPicks";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  id: string;
  title: string;
}
const row = (id: string, title = id): Row => ({ id, title });

let root: Root;
let current: ReturnType<typeof usePagedPicks<Row>>;
function Probe(props: { loaded: Row[]; complete: boolean; ready: boolean }) {
  current = usePagedPicks<Row>(props);
  return null;
}
const render = (loaded: Row[], complete: boolean, ready = true) =>
  act(() =>
    root.render(<Probe loaded={loaded} complete={complete} ready={ready} />),
  );

beforeEach(() => {
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

describe("usePagedPicks", () => {
  it("toggles picks in click order and ignores unknown ids", () => {
    render([row("a"), row("b")], true);
    act(() => current.toggle("b"));
    act(() => current.toggle("a"));
    act(() => current.toggle("zz"));
    expect(current.pickedIds).toEqual(["b", "a"]);
    act(() => current.toggle("b"));
    expect(current.pickedIds).toEqual(["a"]);
  });

  it("prunes a missing pick once every page is loaded", () => {
    render([row("a"), row("b")], true);
    act(() => current.toggle("a"));
    render([row("b")], true);
    expect(current.pickedIds).toEqual([]);
    // Back later: it does not return checked.
    render([row("a"), row("b")], true);
    expect(current.pickedIds).toEqual([]);
  });

  it("keeps a missing pick, pinned first, while more pages exist", () => {
    render([row("a"), row("b")], false);
    act(() => current.toggle("b"));
    render([row("x"), row("a")], false);
    expect(current.pickedIds).toEqual(["b"]);
    expect(current.rows.map((r) => r.id)).toEqual(["b", "x", "a"]);
    // Loading the rest settles it: still listed, so it stays and unpins.
    render([row("x"), row("a"), row("b")], true);
    expect(current.pickedIds).toEqual(["b"]);
    expect(current.rows.map((r) => r.id)).toEqual(["x", "a", "b"]);
  });

  it("refreshes a listed pick from the latest row", () => {
    render([row("a", "old")], true);
    act(() => current.toggle("a"));
    render([row("a", "new")], true);
    expect(current.picked[0].title).toBe("new");
  });

  it("does not prune before the list is ready", () => {
    render([row("a")], true);
    act(() => current.toggle("a"));
    render([], true, false);
    expect(current.pickedIds).toEqual(["a"]);
  });

  it("selects by id and clears", () => {
    render([row("a"), row("b"), row("c")], true);
    act(() => current.select(["c", "a", "zz"]));
    expect(current.pickedIds).toEqual(["c", "a"]);
    act(() => current.clear());
    expect(current.pickedIds).toEqual([]);
  });
});
