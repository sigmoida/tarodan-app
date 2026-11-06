/**
 * The staging answer of PayTR `POST /odeme/taksit-oranlari` with
 * `single_ratio=1` (marketplace store, captured 2026-11-06, hub plan
 * 2026-11-03-installment-payments task S0). Kept as the raw response TEXT so
 * the specs parse the JSON numbers, float noise included, the way the API
 * does. No merchant id, token or card data is in the answer.
 *
 * In this store every card family has the same row (taksit_2..taksit_12);
 * the single-payment rate is `oranlar.tumu.tek_cekim`.
 */
const FAMILY_ROW =
  '{"taksit_2":7.4299999999999997,"taksit_3":9.4700000000000006,' +
  '"taksit_4":11.5,"taksit_5":13.550000000000001,"taksit_6":15.58,' +
  '"taksit_7":17.609999999999999,"taksit_8":19.649999999999999,' +
  '"taksit_9":21.699999999999999,"taksit_10":23.719999999999999,' +
  '"taksit_11":25.760000000000002,"taksit_12":27.800000000000001}';

/** The families in the order PayTR sent them. */
export const PAYTR_STAGING_FAMILIES = [
  "world",
  "axess",
  "maximum",
  "cardfinans",
  "paraf",
  "advantage",
  "combo",
  "bonus",
  "saglamkart",
] as const;

export const PAYTR_STAGING_REQUEST_ID = "895754eaac7d4018be69afd985c577b2";

/**
 * `oranlar.tumu.tek_cekim`: written into the body below as a bare JSON
 * number, and the text the parser must return for it.
 */
export const PAYTR_STAGING_SINGLE_RATE_PCT = "3.46";

/** The answer with `request_id` set to `requestId` (PayTR echoes it). */
export function paytrTaksitOranlariStagingBody(
  requestId: string = PAYTR_STAGING_REQUEST_ID,
): string {
  const families = PAYTR_STAGING_FAMILIES.map(
    (family) => `"${family}":${FAMILY_ROW}`,
  ).join(",");
  return (
    `{"status":"success","request_id":"${requestId}","max_inst_non_bus":12,` +
    `"oranlar":{${families},"tumu":{"tek_cekim":${PAYTR_STAGING_SINGLE_RATE_PCT}}}}`
  );
}

/** The family row as the parser must normalize it (count -> percent text). */
export const PAYTR_STAGING_FAMILY_RATES: Readonly<Record<string, string>> = {
  "2": "7.43",
  "3": "9.47",
  "4": "11.5",
  "5": "13.55",
  "6": "15.58",
  "7": "17.61",
  "8": "19.65",
  "9": "21.7",
  "10": "23.72",
  "11": "25.76",
  "12": "27.8",
};
