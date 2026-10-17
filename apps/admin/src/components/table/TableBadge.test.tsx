import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableBadge, TABLE_BADGE_SIZE } from "./TableBadge";
import { STATUS_TONE } from "@/lib/status-tone";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("TableBadge", () => {
  it("always renders the sm badge size", () => {
    expect(TABLE_BADGE_SIZE).toBe("sm");
    const out = html(<TableBadge variant="success">Yayında</TableBadge>);
    expect(out).toContain("text-xs");
    expect(out).toContain("px-2");
    expect(out).not.toContain("text-sm");
    expect(out).toContain("Yayında");
  });

  it("colours by the given state variant", () => {
    expect(html(<TableBadge variant="danger">x</TableBadge>)).toContain(
      "bg-danger-100",
    );
    expect(html(<TableBadge variant="outline">x</TableBadge>)).toContain(
      "border-border",
    );
  });

  it("config mode reads label + variant from the status config", () => {
    const config = {
      live: { label: "Yayında", variant: STATUS_TONE.live },
    } as const;
    const out = html(<TableBadge status="live" config={config} />);
    expect(out).toContain("Yayında");
    expect(out).toContain("bg-success-100");
    expect(out).toContain("text-xs");
  });

  it("puts the tooltip on the native title", () => {
    const out = html(
      <TableBadge variant="warning" tooltip="Tam cümle">
        Kısa
      </TableBadge>,
    );
    expect(out).toContain('title="Tam cümle"');
    expect(out).toContain("Kısa");
  });
});

describe("STATUS_TONE", () => {
  it("is the one status → colour rule", () => {
    expect(STATUS_TONE).toEqual({
      live: "success",
      pending: "default",
      ended: "warning",
      failed: "danger",
      inactive: "outline",
    });
  });
});
