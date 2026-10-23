// @vitest-environment jsdom
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { DataTable, type ColumnDef } from "./DataTable";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; name: string };

/**
 * A row menu renders its items in a portal (Radix). React still bubbles
 * their clicks to the row, outside the row's DOM: such a click must not
 * count as a click on the row (it opened or closed the expanded row behind
 * the "Mark as paid" dialog).
 */
describe("DataTable row click", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onRowClick = vi.fn();

  const columns: ColumnDef<Row, unknown>[] = [
    { id: "name", header: "Name", cell: ({ row }) => row.original.name },
    {
      id: "menu",
      header: "",
      cell: () =>
        createPortal(
          <div role="menuitem" data-testid="portal-item">
            Mark as paid
          </div>,
          document.body,
        ),
    },
  ];

  beforeEach(() => {
    onRowClick.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <DataTable<Row>
          columns={columns}
          data={[{ id: "r1", name: "Row one" }]}
          getRowId={(r) => r.id}
          onRowClick={onRowClick}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("a click on the row's own cell opens it", () => {
    const cell = Array.from(container.querySelectorAll("td")).find((td) =>
      td.textContent?.includes("Row one"),
    )!;
    act(() => cell.click());
    expect(onRowClick).toHaveBeenCalledWith({ id: "r1", name: "Row one" });
  });

  it("a click in a portal rendered by the row does not", () => {
    const item = document.querySelector<HTMLElement>(
      '[data-testid="portal-item"]',
    )!;
    expect(container.contains(item)).toBe(false);
    act(() => item.click());
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
