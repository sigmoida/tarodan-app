import { readFileSync } from "fs";
import { resolve } from "path";

function modelBlock(schema: string, model: string): string {
  const match = schema.match(
    new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`Prisma model not found: ${model}`);
  return match[1];
}

describe("immutable financial schema contract", () => {
  const schema = readFileSync(
    resolve(__dirname, "../prisma/schema.prisma"),
    "utf8",
  );

  it("stores the checkout tax, commission, membership and discount decision snapshot", () => {
    const order = modelBlock(schema, "Order");
    expect(order).toMatch(
      /financialSnapshot\s+Json\?\s+@map\("financial_snapshot"\)/,
    );
  });

  it("allows only one local invoice per order", () => {
    const invoice = modelBlock(schema, "Invoice");
    expect(invoice).toMatch(/orderId\s+String\s+@unique/);
  });
});
