import {
  buildInstallmentFeeDocument,
  installmentFeeReturnOf,
  splitVatIncluded,
} from "./installment-fee-basis";

/**
 * The buyer installment fee document (ADR 0019 D4, AS-F1, AS-F3), pinned on
 * the plan's worked examples (plan 4.4, k = 1/6): a 1,000.00 TL cart at 3
 * installments carries F = 66.38, invoiced as 55.32 + 11.06 VAT; a cart of
 * two sellers splits F into 39.83 and 26.55 at capture.
 */
describe("splitVatIncluded", () => {
  it.each`
    gross     | net       | tax
    ${66.38}  | ${55.32}  | ${11.06}
    ${142.22} | ${118.52} | ${23.7}
    ${33.2}   | ${27.67}  | ${5.53}
    ${71.12}  | ${59.27}  | ${11.85}
    ${39.83}  | ${33.19}  | ${6.64}
    ${26.55}  | ${22.13}  | ${4.42}
    ${0.01}   | ${0.01}   | ${0}
    ${0}      | ${0}      | ${0}
  `("splits $gross at 20 % into $net + $tax", ({ gross, net, tax }) => {
    expect(splitVatIncluded(gross, 20)).toEqual({ net, tax });
  });

  it("always sums back to the gross, to the kuruş (0.00 to 200.00)", () => {
    for (let kurus = 0; kurus <= 20_000; kurus += 1) {
      const gross = kurus / 100;
      const { net, tax } = splitVatIncluded(gross, 20);
      expect(Math.round(net * 100) + Math.round(tax * 100)).toBe(kurus);
      expect(Math.round(net * 100)).toBe(Math.round((kurus * 100) / 120));
    }
  });

  it("puts no VAT in it at a 0 % rate (AS-F1 answered 'not VAT-able')", () => {
    expect(splitVatIncluded(66.38, 0)).toEqual({ net: 66.38, tax: 0 });
  });
});

describe("buildInstallmentFeeDocument", () => {
  const order = (id: string, fee: number, refundedFee = 0) => ({
    id,
    fee,
    refundedFee,
  });

  it("invoices a 66.38 fee as one line of 55.32 + 11.06 VAT", () => {
    const doc = buildInstallmentFeeDocument({
      orders: [order("o1", 66.38)],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
    });

    expect(doc).toEqual({
      baseGross: 66.38,
      gross: 66.38,
      net: 55.32,
      tax: 11.06,
      lines: [
        {
          name: "Taksit vade farkı",
          quantity: 1,
          net: 55.32,
          unitPrice: 55.32,
          vatRate: 20,
          taxAmount: 11.06,
        },
      ],
    });
  });

  it("sums the fee of every order of the package into one document", () => {
    // Two listings of one seller in a cart: two orders, one package.
    const doc = buildInstallmentFeeDocument({
      orders: [order("o1", 20.0), order("o2", 13.19)],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
    });

    expect(doc).toMatchObject({ baseGross: 33.19, gross: 33.19 });
    expect(doc?.lines).toHaveLength(1);
    expect(doc?.lines[0]).toMatchObject({ net: 27.66, taxAmount: 5.53 });
  });

  it("gives each seller's package its own share (cart 39.83 / 26.55 = 66.38)", () => {
    const big = buildInstallmentFeeDocument({
      orders: [order("big", 39.83)],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
    });
    const small = buildInstallmentFeeDocument({
      orders: [order("small", 26.55)],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
    });

    expect([big?.net, big?.tax]).toEqual([33.19, 6.64]);
    expect([small?.net, small?.tax]).toEqual([22.13, 4.42]);
    // The two documents together carry the whole fee and its whole VAT.
    expect(Math.round(((big?.gross ?? 0) + (small?.gross ?? 0)) * 100)).toBe(
      6638,
    );
    expect(Math.round(((big?.tax ?? 0) + (small?.tax ?? 0)) * 100)).toBe(1106);
  });

  it("leaves out the fee already given back with refunds", () => {
    const doc = buildInstallmentFeeDocument({
      orders: [order("o1", 66.38, 26.55)],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
    });

    expect(doc).toMatchObject({
      baseGross: 66.38,
      gross: 39.83,
      net: 33.19,
      tax: 6.64,
    });
  });

  it("carries nothing once the payment's whole fee went back, even a sibling package's shortfall", () => {
    const doc = buildInstallmentFeeDocument({
      orders: [order("o1", 39.83, 36.0)],
      paymentFeeFullyRefunded: true,
      vatRatePct: 20,
    });

    expect(doc).toMatchObject({ baseGross: 39.83, gross: 0, lines: [] });
  });

  it("never goes below zero", () => {
    const doc = buildInstallmentFeeDocument({
      orders: [order("o1", 10, 12)],
      paymentFeeFullyRefunded: false,
      vatRatePct: 20,
    });

    expect(doc).toMatchObject({ gross: 0, net: 0, tax: 0, lines: [] });
  });

  it.each`
    case                                | orders
    ${"single payment (no fee)"}        | ${[order("o1", 0)]}
    ${"a package without orders"}       | ${[]}
    ${"a 100 % platform share (F = 0)"} | ${[order("o1", 0), order("o2", 0)]}
  `("issues no document for $case", ({ orders }) => {
    expect(
      buildInstallmentFeeDocument({
        orders,
        paymentFeeFullyRefunded: false,
        vatRatePct: 20,
      }),
    ).toBeNull();
  });
});

describe("installmentFeeReturnOf", () => {
  const issued66 = { total: 66.38, net: 55.32 };

  it("reverses 400.00 then 600.00 of goods as 26.55 then 39.83, summing to the document", () => {
    const first = installmentFeeReturnOf({
      issued: issued66,
      priorReturns: [],
      targetGross: 39.83,
      refundedFee: 26.55,
      vatRatePct: 20,
    });
    expect(first).toEqual({
      total: 26.55,
      net: 22.13,
      tax: 4.42,
      closesDocument: false,
      lines: [
        {
          name: "İade edilen taksit vade farkı",
          quantity: 1,
          net: 22.13,
          unitPrice: 22.13,
          vatRate: 20,
          taxAmount: 4.42,
        },
      ],
    });

    const second = installmentFeeReturnOf({
      issued: issued66,
      priorReturns: [{ total: 26.55, net: 22.13 }],
      targetGross: 0,
      refundedFee: 39.83,
      vatRatePct: 20,
    });
    expect(second).toMatchObject({
      total: 39.83,
      net: 33.19,
      tax: 6.64,
      closesDocument: true,
    });
    expect(Math.round(((first?.net ?? 0) + (second?.net ?? 0)) * 100)).toBe(
      5532,
    );
    expect(Math.round(((first?.tax ?? 0) + (second?.tax ?? 0)) * 100)).toBe(
      1106,
    );
  });

  it("lets the closing return take the exact remainder when the plain split would drift a kuruş", () => {
    // 10.00 = 8.33 + 1.67. Two halves split alone would be 4.17 + 0.83 each
    // (net 8.34): the closing one takes 8.33 - 4.17 = 4.16 + 0.84.
    const issued = { total: 10, net: 8.33 };
    const first = installmentFeeReturnOf({
      issued,
      priorReturns: [],
      targetGross: 5,
      refundedFee: 5,
      vatRatePct: 20,
    });
    const second = installmentFeeReturnOf({
      issued,
      priorReturns: [{ total: 5, net: first?.net ?? 0 }],
      targetGross: 0,
      refundedFee: 5,
      vatRatePct: 20,
    });

    expect([first?.net, first?.tax]).toEqual([4.17, 0.83]);
    expect([second?.net, second?.tax]).toEqual([4.16, 0.84]);
  });

  it("sums three partial refunds to the fee (22.13 + 22.13 + 22.12)", () => {
    const issued = { total: 66.38, net: 55.32 };
    const shares = [22.13, 22.13, 22.12];
    const returns: Array<{ total: number; net: number; tax: number }> = [];
    let refunded = 0;
    for (const share of shares) {
      refunded = Math.round((refunded + share) * 100) / 100;
      const r = installmentFeeReturnOf({
        issued,
        priorReturns: returns,
        targetGross: Math.round((66.38 - refunded) * 100) / 100,
        refundedFee: share,
        vatRatePct: 20,
      });
      expect(r).not.toBeNull();
      returns.push(r as { total: number; net: number; tax: number });
    }
    const sum = (key: "total" | "net" | "tax") =>
      Math.round(returns.reduce((s, r) => s + r[key], 0) * 100);
    expect([sum("total"), sum("net"), sum("tax")]).toEqual([6638, 5532, 1106]);
  });

  it("owes nothing when the document was cut after the refund (already net of it)", () => {
    expect(
      installmentFeeReturnOf({
        issued: { total: 39.83, net: 33.19 },
        priorReturns: [],
        targetGross: 39.83,
        refundedFee: 26.55,
        vatRatePct: 20,
      }),
    ).toBeNull();
  });

  it("owes nothing on a replay of a reversed refund", () => {
    expect(
      installmentFeeReturnOf({
        issued: issued66,
        priorReturns: [{ total: 26.55, net: 22.13 }],
        targetGross: 39.83,
        refundedFee: 26.55,
        vatRatePct: 20,
      }),
    ).toBeNull();
  });

  it("reverses each refund's own share when the handlers run out of order", () => {
    // Both refunds are finalized (target 0); the second one's handler runs first.
    const late = installmentFeeReturnOf({
      issued: issued66,
      priorReturns: [],
      targetGross: 0,
      refundedFee: 39.83,
      vatRatePct: 20,
    });
    const early = installmentFeeReturnOf({
      issued: issued66,
      priorReturns: [{ total: 39.83, net: late?.net ?? 0 }],
      targetGross: 0,
      refundedFee: 26.55,
      vatRatePct: 20,
    });

    expect(late).toMatchObject({ total: 39.83, closesDocument: false });
    expect(early).toMatchObject({ total: 26.55, closesDocument: true });
  });

  it("never reverses more than the document carries (a share carrying another package's shortfall)", () => {
    expect(
      installmentFeeReturnOf({
        issued: { total: 39.83, net: 33.19 },
        priorReturns: [],
        targetGross: 0,
        refundedFee: 45.0,
        vatRatePct: 20,
      }),
    ).toMatchObject({
      total: 39.83,
      net: 33.19,
      tax: 6.64,
      closesDocument: true,
    });
  });

  it("reverses everything outstanding for a refund event without an attempt", () => {
    expect(
      installmentFeeReturnOf({
        issued: issued66,
        priorReturns: [{ total: 26.55, net: 22.13 }],
        targetGross: 39.83,
        refundedFee: null,
        vatRatePct: 20,
      }),
    ).toMatchObject({ total: 39.83, net: 33.19, closesDocument: true });
  });

  it("owes nothing for a refund that gave no fee back", () => {
    expect(
      installmentFeeReturnOf({
        issued: issued66,
        priorReturns: [],
        targetGross: 66.38,
        refundedFee: 0,
        vatRatePct: 20,
      }),
    ).toBeNull();
  });
});

/**
 * Properties over many amounts and event orders, not only the worked
 * examples. The generator is seeded, so every run checks the same cases.
 */
describe("installment fee amounts (properties)", () => {
  const seeded = (seed: number) => {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  };
  const kurus = (tl: number) => Math.round(tl * 100);
  /** `total` kuruş split at `count - 1` random points (parts may be 0). */
  const partition = (rnd: () => number, total: number, count: number) => {
    const cuts = Array.from({ length: count - 1 }, () =>
      Math.floor(rnd() * (total + 1)),
    ).sort((a, b) => a - b);
    return [...cuts, total].map((cut, i, all) => cut - (i ? all[i - 1] : 0));
  };

  it("splits net exactly half up at every rate, so net + VAT is the gross", () => {
    // Exact reference in integers: round half up of gross * 100 / (100 + rate).
    const halfUp = (gross: bigint, rate: bigint) =>
      (2n * 100n * gross + (100n + rate)) / (2n * (100n + rate));
    const grosses = [
      ...Array.from({ length: 30_001 }, (_, k) => k),
      // Up to the column's limit, Decimal(10, 2).
      123_456_789,
      999_999_995,
      4_294_967_297,
      9_999_999_998,
      9_999_999_999,
    ];
    const wrong: string[] = [];
    for (const rate of [1, 8, 10, 18, 20]) {
      for (const gross of grosses) {
        const { net, tax } = splitVatIncluded(gross / 100, rate);
        if (
          kurus(net) + kurus(tax) !== gross ||
          BigInt(kurus(net)) !== halfUp(BigInt(gross), BigInt(rate))
        ) {
          wrong.push(`${gross} at ${rate} %: ${net} + ${tax}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("never reverses more than the document and ends at what it should carry, whatever the order of events", () => {
    // A package fee F, refunds finalized one after the other, the document
    // cut after some of them (net of those), each refund's event handled
    // one to three times at any point after it was finalized (outbox
    // replays, a late handler of a refund from before the cut). One return
    // per attempt at most, like `(type, sourceId)`.
    const rnd = seeded(20261106);
    const broken: string[] = [];
    for (let run = 0; run < 20_000; run++) {
      // Small fees too: a closing return of a kuruş after several others.
      const fee = 1 + Math.floor(rnd() * (rnd() < 0.5 ? 300 : 20_000));
      const refunded = rnd() < 0.5 ? fee : Math.floor(rnd() * (fee + 1));
      const shares = partition(rnd, refunded, 1 + Math.floor(rnd() * 5));
      const cutAfter = Math.floor(rnd() * (shares.length + 1));
      const issuedTotal =
        fee - shares.slice(0, cutAfter).reduce((s, x) => s + x, 0);
      if (issuedTotal <= 0) continue;
      const issued = {
        total: issuedTotal / 100,
        net: splitVatIncluded(issuedTotal / 100, 20).net,
      };

      type Step = { kind: "finalize" | "cut" | "handle"; refund: number };
      const steps: Step[] = shares.map((_, refund) => ({
        kind: "finalize",
        refund,
      }));
      steps.splice(cutAfter, 0, { kind: "cut", refund: -1 });
      shares.forEach((_, refund) => {
        for (let times = 1 + Math.floor(rnd() * 3); times > 0; times--) {
          const after =
            steps.findIndex(
              (s) => s.kind === "finalize" && s.refund === refund,
            ) + 1;
          const at = after + Math.floor(rnd() * (steps.length - after + 1));
          steps.splice(at, 0, { kind: "handle", refund });
        }
      });

      let finalized = 0;
      let cut = false;
      const returns = new Map<number, { total: number; net: number }>();
      const reversed = () =>
        [...returns.values()].reduce((s, r) => s + kurus(r.total), 0);
      for (const step of steps) {
        if (step.kind === "finalize") finalized += shares[step.refund];
        if (step.kind === "cut") cut = true;
        if (step.kind !== "handle" || !cut || returns.has(step.refund))
          continue;
        const target = Math.max(0, fee - finalized);
        const due = installmentFeeReturnOf({
          issued,
          priorReturns: [...returns.values()],
          targetGross: target / 100,
          refundedFee: shares[step.refund] / 100,
          vatRatePct: 20,
        });
        if (!due) continue;
        returns.set(step.refund, { total: due.total, net: due.net });
        if (
          !(kurus(due.total) > 0) ||
          kurus(due.net) < 0 ||
          kurus(due.tax) < 0 ||
          kurus(due.net) + kurus(due.tax) !== kurus(due.total) ||
          issuedTotal - reversed() < target
        ) {
          broken.push(
            `run ${run}: ${JSON.stringify({ fee, shares, cutAfter, due })}`,
          );
        }
      }
      const left = issuedTotal - reversed();
      if (left !== Math.max(0, fee - refunded)) {
        broken.push(
          `run ${run}: ${JSON.stringify({ fee, shares, cutAfter, left })}`,
        );
      }
    }
    expect(broken).toEqual([]);
  });

  it("sums the returns of a fully reversed document to its net and VAT exactly (up to two returns)", () => {
    const rnd = seeded(66_38);
    const off: string[] = [];
    for (let run = 0; run < 50_000; run++) {
      const total = 1 + Math.floor(rnd() * 50_000);
      const issued = {
        total: total / 100,
        net: splitVatIncluded(total / 100, 20).net,
      };
      const [first, second] = partition(rnd, total, 2);
      const prior: Array<{ total: number; net: number }> = [];
      for (const [share, target] of [
        [first, second],
        [second, 0],
      ]) {
        const due = installmentFeeReturnOf({
          issued,
          priorReturns: prior,
          targetGross: target / 100,
          refundedFee: share / 100,
          vatRatePct: 20,
        });
        if (due) prior.push({ total: due.total, net: due.net });
      }
      const net = prior.reduce((s, r) => s + kurus(r.net), 0);
      const sum = prior.reduce((s, r) => s + kurus(r.total), 0);
      if (sum !== total || net !== kurus(issued.net)) {
        off.push(`${total} = ${first} + ${second}: net ${net}`);
      }
    }
    expect(off).toEqual([]);
  });
});
