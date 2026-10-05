import { describe, expect, it } from "vitest";
import { createTable, getCoreRowModel } from "@tanstack/react-table";

/**
 * DataTable, TanStack'e `autoResetPageIndex: false` verir. Bu test nedenini
 * sabitler: varsayılan ayarda, her render'da YENİ bir `data` dizisi alan tablo
 * (render içinde satır kuran çağıran) ilk yeniden render'dan sonra "veri
 * değişti → sayfa indeksini sıfırla" diye durum yazar; o yazım yeni bir
 * render, yeni bir dizi ve yine bir yazım üretir — bitmeyen döngü.
 *
 * React'siz bir benzetimdir: `render()` = bileşenin bir render'ı, durum
 * yazımı = yeniden render isteği.
 */
async function rendersUntilQuiet(
  options: { autoResetPageIndex?: boolean; autoResetExpanded?: boolean },
  cap = 30,
): Promise<number> {
  type Row = { id: number };
  let renders = 0;
  let rerenderRequested = false;
  const table = createTable<Row>({
    data: [],
    columns: [{ id: "id", accessorKey: "id" }],
    getCoreRowModel: getCoreRowModel(),
    state: {},
    onStateChange: () => {},
    renderFallbackValue: null,
    ...options,
  });
  let state = table.initialState;
  const render = () => {
    renders += 1;
    table.setOptions((prev) => ({
      ...prev,
      ...options,
      data: [{ id: 1 }],
      state,
      onStateChange: (updater) => {
        state = typeof updater === "function" ? updater(state) : updater;
        rerenderRequested = true;
      },
    }));
    table.getRowModel();
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  render();
  await settle();
  render(); // üst bileşen yeniden render oldu (ör. bir modal açıldı)
  for (let i = 0; i < cap; i += 1) {
    await settle();
    if (!rerenderRequested) break;
    rerenderRequested = false;
    render();
  }
  return renders;
}

describe("DataTable — render döngüsü koruması", () => {
  it("varsayılan TanStack ayarı, her render'da yeni dizi verilince durmaz", async () => {
    expect(await rendersUntilQuiet({})).toBeGreaterThan(20);
  });

  it("DataTable'ın verdiği ayarla iki render'da durur", async () => {
    expect(
      await rendersUntilQuiet({
        autoResetPageIndex: false,
        autoResetExpanded: false,
      }),
    ).toBe(2);
  });
});
