import { readFileSync } from "fs";
import { join } from "path";
import type { SellerTrustInputs } from "@tarodan/types";

/**
 * The 1,000 seeded synthetic inputs of the formula v1 pin
 * (`helpers/trust-formula.v1-pin.json`), for specs that check other code
 * against the same spread. The pin's expected values are read only by
 * `trust-formula.v1-pin.spec.ts`.
 */
export function loadV1PinInputs(): SellerTrustInputs[] {
  const pin = JSON.parse(
    readFileSync(
      join(__dirname, "../helpers/trust-formula.v1-pin.json"),
      "utf8",
    ),
  ) as { inputColumns: Array<keyof SellerTrustInputs>; inputs: number[][] };
  return pin.inputs.map(
    (row) =>
      Object.fromEntries(
        pin.inputColumns.map((key, i) => [key, row[i]]),
      ) as unknown as SellerTrustInputs,
  );
}
