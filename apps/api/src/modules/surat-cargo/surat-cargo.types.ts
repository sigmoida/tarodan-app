/**
 * Sürat Kargo SOAP (GonderiyiKargoyaGonderYeni) — result types.
 * Success only when raw response is exactly "Tamam" (after trim).
 */

export type SuratTechnicalCode =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP_5XX'
  | 'PARSE_ERROR'
  | 'EMPTY_RESPONSE'
  | 'SOAP_FAULT'
  | 'UNKNOWN';

export type SuratShipmentSuccess = {
  ok: true;
  suratMessage: 'Tamam';
  correlationId: string;
  idempotencyKey: string;
};

export type SuratTechnicalFailure = {
  ok: false;
  kind: 'technical';
  code: SuratTechnicalCode;
  cause: Error | undefined;
  rawBodySnippet?: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratBusinessFailure = {
  ok: false;
  kind: 'business';
  suratMessage: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratShipmentResult =
  | SuratShipmentSuccess
  | SuratTechnicalFailure
  | SuratBusinessFailure;

export type SuratShipmentFailure = SuratTechnicalFailure | SuratBusinessFailure;

/** Payload sent to SOAP adapter (real mapping to WSDL fields comes in live client). */
export interface SuratGonderiPayload {
  externalReference: string;
  recipientFullName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientDistrict: string;
  recipientAddressLine: string;
  productId: string;
  productTitle?: string;
  orderNumberPreview: string;
}

export interface SuratShipmentInput {
  idempotencyKey: string;
  correlationId: string;
  payload: SuratGonderiPayload;
}
