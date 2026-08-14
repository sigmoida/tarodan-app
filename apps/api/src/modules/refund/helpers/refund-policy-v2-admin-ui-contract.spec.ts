import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../../../common/helpers/app-root";

/**
 * Admin has no Jest runtime of its own. Keep this small source contract beside
 * the API regression suite so a v1 quarantine cannot silently lose the preview
 * controls again while both applications still typecheck independently.
 */
describe("refund v2 admin quarantine workflow", () => {
  const panel = readFileSync(
    join(
      repoRoot(),
      "apps/admin/src/app/(admin)/operations/refund-requests/[id]/_components/RefundNextActionPanel.tsx",
    ),
    "utf8",
  );

  it("includes financialReviewRequired in the decision gate", () => {
    expect(panel).toContain("isV2 || financialReviewRequired");
    expect(panel).toContain("decisionV2.quarantineWarning");
    expect(panel).toContain("financialReviewRequired && !reviewNote.trim()");
  });
});
