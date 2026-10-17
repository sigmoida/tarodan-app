import type { ColumnDef } from "@tanstack/react-table";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { historyColumns } from "./columns";
import type { NotificationLog } from "./types";

vi.mock("@/components/table/TruncatedText", () => ({
  TruncatedText: (p: { children: React.ReactNode; className?: string }) => (
    <span className={p.className}>{p.children}</span>
  ),
}));

const t = ((key: string) => key) as never;

const log: NotificationLog = {
  id: "n1",
  userId: "u1",
  channel: "email",
  type: "broadcast",
  title: "Kampanya",
  body: "",
  status: "delivered",
  createdAt: "2026-07-01T00:00:00.000Z",
  data: { hasHtmlEmail: true, mailingType: "marketing" },
};

function render(id: string, row: NotificationLog): string {
  const c = (historyColumns(t) as ColumnDef<NotificationLog, unknown>[]).find(
    (x) => x.id === id,
  );
  if (!c || typeof c.cell !== "function") throw new Error(`no column ${id}`);
  return renderToStaticMarkup(
    (c.cell as (ctx: unknown) => ReactElement)({ row: { original: row } }),
  );
}

describe("historyColumns", () => {
  it("content badges are outline (labels, not states) and sm", () => {
    const out = render("admin.marketing.notifications.contentColumn", log);
    expect(out).toContain("admin.marketing.notifications.htmlEmailBadge");
    expect(out).toContain(
      "admin.marketing.notifications.mailingType.marketing",
    );
    expect(out).not.toContain("bg-warning-100");
    expect(out).not.toContain("bg-primary-100");
    expect(out.match(/border-border/g)?.length).toBe(2);
  });

  it("status badge is the sm TableBadge", () => {
    const out = render("common.status", log);
    expect(out).toContain("text-xs");
    expect(out).toContain("bg-success-100");
  });
});
