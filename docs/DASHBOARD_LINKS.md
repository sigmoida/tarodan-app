# Dashboard bağlantıları

Her kuyruk satırı ve uyarı bir panel listesine gider. Tablo, listenin sayılan
kümeyi ne kadar açtığını söyler: **birebir** (aynı küme), **daha geniş** (küme
listenin içinde ama elle süzmek gerekir), **daha dar**, **filtre yok** (yalnız
ekran). Bağlantılar `packages/types/src/dashboard.ts`'te; sayfa+sekmenin var
olduğunu `dashboard-links.contract.spec.ts` doğrular. Listeler test kayıtlarını
rozetle gösterir, kuyruklar saymaz — "birebir" bu farkı yok sayar.

| Satır | Bağlantı | Eşleşme |
| --- | --- | --- |
| refundsPendingReview | `/operations/refunds?bucket=pending_review` | birebir |
| refundsDisputed | `/operations/refunds?bucket=disputed` | birebir |
| tradesAtWarehouse | `/operations/orders?tab=trades` | filtre yok |
| tradeDisputesOpen | `/operations/orders?tab=trades` | filtre yok |
| tradeRefundFailures | `/operations/orders?tab=trades` | filtre yok |
| tradeCompensationPending | `/operations/orders?tab=trades` | filtre yok |
| productsPending | `/catalog/products?tab=pending` | birebir |
| messagesPendingApproval | `/messaging/messages` | filtre yok |
| corporateApplications | `/accounts/seller-applications` | daha dar (varsayılan sekme `submitted`; `under_review` ayrı sekme) |
| sellerDocuments | `/accounts/seller-applications` | filtre yok |
| ticketsOpen / ticketsUrgent | `/messaging/support` | filtre yok |
| reportsPending | `/accounts/reports` | filtre yok |
| payoutsFailed | `/finance/payouts?tab=transfers&status=failed` | daha dar (`returned` ayrı seçilir) |
| holdsOverdue | `/finance/payouts?tab=escrow&status=held&overdue=true` | birebir (`overdue` = `overdueHoldsWhere`) |
| adjustmentsOpen | `/finance/payouts?tab=adjustments&status=open` | birebir |
| holdsUpcoming (bilgi) | `/finance/payouts?tab=schedule` | daha geniş (7 gün sınırı yok, iade kilitliler dahil) |
| invoicesExhausted | `/finance/invoices` | filtre yok (`?status=failed` daha geniş olurdu) |
| ordersUninvoiced | `/finance/invoices` | filtre yok |
| carrierCancellations | `/operations/shipping?tab=iptaller` | birebir (sekme `pending` ile açılır) |
| shipmentsWithoutTracking | `/operations/shipping` | filtre yok |
| **Uyarı** stuckShippedOrders | `/operations/orders?bucket=all&shippedBefore=<eşik anı>` | birebir (`shippedBeforeWhere`) |
| stuckWarehouseTrades | `/operations/orders?tab=trades` | filtre yok |
| stuckOutboundTrades | `/operations/orders?tab=trades` | filtre yok |
| paymentsMissingFromStatement | `/finance/psp` | filtre yok |
| unresolvedStatementLines | `/finance/psp` | filtre yok |
| commissionLedgerDrift | `/finance/overview` | filtre yok |
| paymentsWithoutOrders | `/finance/overview` | filtre yok |
| ordersWithoutHold | `/finance/overview` | filtre yok |
| outboxDead | `/system/logs` | ekran yok — panelde outbox sekmesi yok, en yakın sayfa |
| outboxStuckProcessing | `/system/logs` | ekran yok — aynı |
| noActiveCommissionRuleSet | `/finance/commission` | birebir (yapılandırma ekranı) |
| noActiveShippingTariff | `/system/shipping-tariffs` | birebir (yapılandırma ekranı) |
| staleCouponReservations | `/marketing/discounts` | filtre yok |
| deliveredHoldsWithoutRelease | `/finance/payouts` | filtre yok |
| agedCarrierCancellations | `/operations/shipping?tab=iptaller` | daha geniş (yaş eşiği yok) |
| exhaustedPayoutRetries | `/finance/payouts?tab=transfers&status=retry_pending` | daha geniş (hakkı bitmemişler de) |
| preparingDeadlineApproaching | `/operations/orders` | filtre yok |

Sıradaki adaylar (liste süzgeci gerekir): takas kuyrukları, destek/şikayet,
satıcı belgeleri, takipsiz gönderiler, outbox ekranı, döküm ve komisyon
teşhisleri.
