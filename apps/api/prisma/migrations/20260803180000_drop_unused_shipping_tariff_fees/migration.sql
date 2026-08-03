-- Kargo tarifesinden ölü ücret kolonlarını düşür.
--
-- Üçü de hiçbir fiyatlama yolunda okunmuyordu:
--   * return_package_fee / trade_leg_fee — "Faz 2" yer tutucularıydı; tek
--     okuyucuları çağıranı olmayan quoteReturnShipment/quoteTradeShipment idi.
--   * outbound_package_fee — paket kademeleri (shipping_package_tiers) devraldı;
--     fiyat artık resolvePackageTier ile kademeden çözülüyor.
--
-- Takas kargosu kademe tutarı × 2 bacaktan, sipariş kargosu kademeden hesaplanır;
-- bu kolonların düşmesi hiçbir tutarı değiştirmez.
ALTER TABLE "shipping_tariffs"
  DROP COLUMN "outbound_package_fee",
  DROP COLUMN "return_package_fee",
  DROP COLUMN "trade_leg_fee";
