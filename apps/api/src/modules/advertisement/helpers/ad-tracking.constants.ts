import {
  BEACON_DEDUPE_SECONDS,
  type BeaconTrackingKind,
} from "../../../common/helpers/beacon-tracking";

/**
 * Reklam tık/gösterim sayımı — tekilleştirme anahtarı. Pencereler ve hız
 * sınırı vitrin içeriğiyle ortaktır (`common/helpers/beacon-tracking`): aynı
 * IP + aynı reklam pencere boyunca bir kez sayılır (DSC-104).
 */
export const AD_TRACKING_DEDUPE_SECONDS = BEACON_DEDUPE_SECONDS;

export type AdTrackingKind = BeaconTrackingKind;

/**
 * Tekilleştirme anahtarı — reklam ve IP ayrı segmentlerde. Alan tıkında alan
 * da anahtardadır: aynı ziyaretçinin aynı reklamdaki İKİ farklı alana art
 * arda tıkı iki tıktır.
 */
export function adTrackingDedupeKey(
  kind: AdTrackingKind,
  adId: string,
  clientIp: string,
  hotspotId?: string,
): string {
  const target = hotspotId ? `${adId}:hotspot:${hotspotId}` : adId;
  return `ads:dedupe:${kind}:${target}:${clientIp}`;
}
