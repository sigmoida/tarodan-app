import * as fs from "node:fs";
import * as path from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * CONTRACT (ADR 0019, plan 5.6): a payment has two money scales. Every
 * comparison of an amount PayTR reports (callback `total_amount`, status
 * inquiry `payment_amount` / `payment_total`, a statement or refund line)
 * with ours goes through `payment/helpers/charged-amount.ts`: the expected
 * amount comes from `expectedPaytrChargeFor` / `paytrChargeExpectationsOf`
 * (the oid's charge attempt, else the legacy `amount`), and the comparison is
 * `paytrAmountMatches` / `paytrKurusMatches`. A hand-written `Math.abs(...)`
 * or `a - b > tolerance` against `Payment.amount` would reject every
 * installment charge (C = T + F) and leave paid orders pending.
 *
 * This spec reads every API source file and fails on such a comparison
 * outside the helper. A comparison of PayTR's own figures with each other
 * (a settlement's sales - returns = net) is not a charge check: mark it with
 * a `psp-amount-ok: <why>` comment on the line or the line above.
 */

/** Amounts PayTR reports, as the API names them once parsed. */
const PSP_AMOUNT =
  /\b(?:paymentTotalTl|paymentAmountTl|amountTl|total_amount|callbackKurus|expectedKurus)\b/;

/**
 * A statement line's amount: only in the files that read statement lines
 * (`line` is a common name elsewhere, e.g. discount lines).
 */
const STATEMENT_LINE_AMOUNT = /\b(?:line\.amount|lineAmount)\b/;
const READS_STATEMENT_LINES = /\bpaytrStatementLine\b|PaytrStatementLine/;

const OPERATOR = String.raw`(?:===|!==|==|!=|<=|>=|<|>|-(?!-))`;

/**
 * What may sit between a PSP amount and the operator that compares it: the
 * closing paren of a wrapper (`Number(x)`), a scale (`x / 100`) or a method
 * (`x.toFixed(2)`).
 */
const WRAPPED = String.raw`(?:\s*\)|\s*[/*]\s*\d+|\s*\.\s*\w+\s*\([^()]*\))*`;

/** `x - y`, `x < y`, `x === y` ... with a PSP amount on either side. */
function operatorNextTo(token: RegExp): RegExp {
  return new RegExp(
    String.raw`(?:${token.source})${WRAPPED}\s*${OPERATOR}\s*[\w(.]` +
      String.raw`|[\w).]\s*${OPERATOR}\s*(?:[\w$]+(?:\?)?\.)*(?:${token.source})`,
  );
}

/** A Decimal comparison (`a.equals(b)`, `a.minus(b).abs()`, `a.lte(b)`). */
const DECIMAL_COMPARISON =
  /\.\s*(?:equals|eq|minus|sub|lt|lte|gt|gte|comparedTo|cmp)\s*\(/;

/** A null or undefined check is not an amount comparison. */
function withoutNullChecks(line: string): string {
  return line
    .replace(/\s*[!=]==?\s*(?:null|undefined)\b/g, " ")
    .replace(/\b(?:null|undefined)\s*[!=]==?\s*/g, " ");
}

const ALLOW_MARKER = "psp-amount-ok:";

/** The only module that may compare PayTR amounts. */
const HELPER = path.join("modules", "payment", "helpers", "charged-amount.ts");

/** Source text without comments and string literals (positions kept). */
export function stripCommentsAndStrings(source: string): string {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,
    (match) => match.replace(/[^\n]/g, " "),
  );
}

/** The balanced-paren argument text of a call starting at `open` ("("). */
function argumentOf(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "(") depth += 1;
    else if (code[i] === ")") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1);
}

export interface PspComparisonFinding {
  line: number;
  text: string;
}

/**
 * Comparisons of a PayTR amount written outside the helper: a `Math.abs`
 * over one, an operator next to one (also through `Number(...)`, `/ 100` or
 * `.toFixed(2)`), or a Decimal comparison on its line. Lines (or the line
 * above) carrying `psp-amount-ok:` are allowed. A heuristic over names: an
 * amount first copied into a local of another name is not seen, which is
 * why the call sites import the helper (the second test below).
 */
export function findPspAmountComparisons(
  source: string,
): PspComparisonFinding[] {
  const tokens = READS_STATEMENT_LINES.test(source)
    ? new RegExp(`${PSP_AMOUNT.source}|${STATEMENT_LINE_AMOUNT.source}`)
    : PSP_AMOUNT;
  const nextToOperator = operatorNextTo(tokens);
  const lines = source.split("\n");
  const code = stripCommentsAndStrings(source);
  const codeLines = code.split("\n");
  const allowed = (lineNo: number) =>
    lines[lineNo]?.includes(ALLOW_MARKER) ||
    lines[lineNo - 1]?.includes(ALLOW_MARKER);
  const findings = new Map<number, PspComparisonFinding>();
  const add = (lineNo: number) => {
    if (!allowed(lineNo)) {
      findings.set(lineNo, { line: lineNo + 1, text: lines[lineNo].trim() });
    }
  };

  const absCall = /Math\.abs\s*\(/g;
  for (let match = absCall.exec(code); match; match = absCall.exec(code)) {
    const open = match.index + match[0].length - 1;
    if (tokens.test(argumentOf(code, open))) {
      add(code.slice(0, match.index).split("\n").length - 1);
    }
  }
  codeLines.forEach((line, i) => {
    if (nextToOperator.test(withoutNullChecks(line))) add(i);
    if (tokens.test(line) && DECIMAL_COMPARISON.test(line)) add(i);
  });
  return [...findings.values()].sort((a, b) => a.line - b.line);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".spec.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("charged-amount contract: PayTR amounts are compared only through the helper", () => {
  const srcRoot = path.join(apiAppRoot(), "src");

  it("finds no PayTR amount comparison outside charged-amount.ts", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const rel = path.relative(srcRoot, file);
      if (rel === HELPER) continue;
      for (const finding of findPspAmountComparisons(
        fs.readFileSync(file, "utf8"),
      )) {
        offenders.push(`${rel}:${finding.line}  ${finding.text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    "modules/payment/checkout/payment-callback.service.ts",
    "modules/payment/checkout/payment-lifecycle.service.ts",
    "modules/payment/reconciliation/psp-reconciliation.service.ts",
    "modules/payment/reconciliation/paytr-report-matching.service.ts",
    "modules/payment/refund/refund-reconciliation.service.ts",
    "modules/membership/membership-subscription.service.ts",
    "modules/admin/finance/admin-psp-reconciliation.service.ts",
  ])("%s reads the PSP scale through the helper", (rel) => {
    const source = fs.readFileSync(path.join(srcRoot, rel), "utf8");
    expect(source).toMatch(
      /from "(\.\.\/)+(payment\/)?helpers\/charged-amount"/,
    );
  });

  describe("the scanner itself (so the contract cannot pass by being blind)", () => {
    it.each([
      [
        "a tolerance check of an inquiry",
        "if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {",
      ],
      [
        "a kuruş check of a callback",
        "if (Math.abs(callbackKurus - expectedKurus) / 100 > toleranceTl) {",
      ],
      [
        "a multi-line Math.abs",
        "const off = Math.abs(\n  match.amountTl -\n  amount,\n) > tol;",
      ],
      [
        "a bare subtraction",
        "const diff = inquiry.paymentTotalTl - Number(payment.amount);",
      ],
      [
        "an equality",
        "if (Number(payment.amount) === inquiry.paymentTotalTl) {",
      ],
      [
        "a statement line",
        "await this.prisma.paytrStatementLine.findMany();\nif (Math.abs(Number(line.amount) - ours) <= 0.05) {",
      ],
      [
        "a kuruş amount scaled before the comparison",
        "if (Number(dto.total_amount) / 100 !== Number(payment.amount)) {",
      ],
      [
        "a formatted comparison",
        "if (inquiry.paymentTotalTl.toFixed(2) !== Number(payment.amount).toFixed(2)) {",
      ],
      [
        "a Decimal equality",
        "if (!new Prisma.Decimal(inquiry.paymentTotalTl).equals(payment.amount)) {",
      ],
      [
        "a Decimal difference",
        "const off = new Prisma.Decimal(inquiry.paymentTotalTl).minus(payment.amount).abs().gt(tol);",
      ],
    ])("flags %s", (_case, source) => {
      expect(findPspAmountComparisons(source)).toHaveLength(1);
    });

    it.each([
      ["recording the reported amount", "totalAmount: inquiry.paymentTotalTl,"],
      [
        "a call to the helper",
        "if (!paytrAmountMatches(inquiry.paymentTotalTl, expected, tolerance)) {",
      ],
      [
        "a comment",
        "// Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance",
      ],
      [
        "text in a log line",
        "this.logger.warn(`paytr=${inquiry.paymentTotalTl} - ours`);",
      ],
      [
        "a marked comparison of PayTR's own totals",
        "paytrStatementLine;\n// psp-amount-ok: PayTR's own totals\nconst ok = Math.abs(line.amount - other.amount) < 1;",
      ],
      ["a type annotation", "paymentTotalTl: number;"],
      ["a null check", "if (match.amountTl != null && ok) {"],
      [
        "a discount line elsewhere",
        "const kept = lines.filter((line) => line.amount > 0);",
      ],
    ])("allows %s", (_case, source) => {
      expect(findPspAmountComparisons(source)).toEqual([]);
    });
  });
});
