/** @format */

import { Prisma, ProductStatus, TradeStatus } from "@prisma/client";
import { safeDecrementReserved } from "../../modules/product/helpers/product-availability.helper";
import { getProductStatusFromQuantity } from "../../modules/product/helpers/product-status.helper";

/**
 * Takas iade bacaklarının kapanış şartı ve kapanışın kendisi — tek kaynak.
 *
 * İade bacağı sayısı yaratılış yoluna göre değişir: depo reddi İKİ bacak
 * (RET-INI + RET-REC), force-cancel-stuck TEK bacak (RET-STK) üretir. Her yol
 * bacaklarını tek transaction'da yarattığından, herhangi bir bacak teslim/kayıp
 * işaretlenebildiği anda planlanan bacakların TAMAMI zaten mevcuttur; kapanış
 * şartı "var olan bacakların hepsi çözüldü"dür (teslim YA DA kayıp — yalnız
 * teslimleri saymak, "önce kayıp sonra teslim" sıralamasında takası sonsuza
 * dek `returning`de bırakırdı). Sabit bir `>= 2` eşiği de tek bacaklı takası
 * aynı şekilde kilitler (rezervasyonlar çözülmez).
 */

export interface ReturnLegDelivery {
  deliveredAt: Date | null;
}

export interface ReturnLegResolution extends ReturnLegDelivery {
  lostAt: Date | null;
}

/** Tüm iade bacakları teslim edildi mi? (yalnız bilgi amaçlı — kapanış şartı değil) */
export function allReturnLegsDelivered(legs: ReturnLegDelivery[]): boolean {
  return legs.length > 0 && legs.every((leg) => leg.deliveredAt !== null);
}

/** Kapanış şartı: tüm iade bacakları çözüldü mü (teslim ya da kayıp)? */
export function allReturnLegsResolved(legs: ReturnLegResolution[]): boolean {
  return (
    legs.length > 0 &&
    legs.every((leg) => leg.deliveredAt !== null || leg.lostAt !== null)
  );
}

export interface ReturnFinalizeResult {
  /** Bu çağrıda takas cancelled'a kapatıldı mı? */
  finalized: boolean;
  /** Var olan iade bacaklarının tamamı çözülmüş mü (teslim ya da kayıp)? */
  allResolved: boolean;
  initiatorId: string | null;
  receiverId: string | null;
}

/**
 * `returning` takasın kapanışı — üç yolun (admin mark-return-delivered,
 * admin mark-return-lost, Sürat poll'unun iade-bacağı teslimi) ortak çekirdeği.
 *
 * Var olan iade bacaklarının TAMAMI çözüldüyse: ürün rezervasyonlarını çözer,
 * KAYIP bacaktaki ürünleri stoktan da düşer (kaybolan ürün satışa dönmez) ve
 * takası cancelled yapar. Idempotent: takas zaten cancelled ise ya da çözülmemiş
 * bacak varsa hiçbir şey yazmaz.
 *
 * ÇAĞIRAN, trade satırını aynı transaction içinde FOR UPDATE ile kilitlemiş
 * olmalıdır (yarışan iki kapanış birbirini beklesin diye).
 */
export async function finalizeReturningTradeIfResolved(
  tx: Prisma.TransactionClient,
  tradeId: string,
  now: Date = new Date(),
): Promise<ReturnFinalizeResult> {
  const trade = await tx.trade.findUnique({
    where: { id: tradeId },
    select: { status: true, initiatorId: true, receiverId: true },
  });
  if (!trade) {
    return {
      finalized: false,
      allResolved: false,
      initiatorId: null,
      receiverId: null,
    };
  }

  const returnShipments = await tx.tradeShipment.findMany({
    where: { tradeId, leg: "return" },
    select: { deliveredAt: true, lostAt: true, recipientUserId: true },
  });
  const allResolved = allReturnLegsResolved(returnShipments);

  if (!allResolved || trade.status === TradeStatus.cancelled) {
    return {
      finalized: false,
      allResolved,
      initiatorId: trade.initiatorId,
      receiverId: trade.receiverId,
    };
  }

  const items = await tx.tradeItem.findMany({
    where: { tradeId },
    select: { productId: true, quantity: true, side: true },
  });

  // Kayıp bacaktaki ürünler sahibine HİÇ ulaşmadı: rezervasyonu çözmekle
  // kalmayıp stoktan da düşülür — aksi halde fiziksel olarak kaybolmuş ürün
  // ilan olarak yeniden satışa çıkardı (autoResolveLostParcelTrades ile aynı
  // kural; yollar arasında fark olmamalı).
  const lostOwnerIds = new Set(
    returnShipments
      .filter((s) => s.lostAt !== null)
      .map((s) => s.recipientUserId)
      .filter((id): id is string => id !== null),
  );
  const ownerOf = (side: string) =>
    side === "initiator" ? trade.initiatorId : trade.receiverId;

  const byProduct = new Map<string, { qty: number; lost: boolean }>();
  for (const item of items) {
    const prev = byProduct.get(item.productId);
    const lost = lostOwnerIds.has(ownerOf(item.side));
    byProduct.set(item.productId, {
      qty: (prev?.qty ?? 0) + item.quantity,
      lost: (prev?.lost ?? false) || lost,
    });
  }

  for (const [productId, { qty, lost }] of byProduct) {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    const prod = await tx.product.findUnique({
      where: { id: productId },
      select: { reservedQuantity: true, quantity: true },
    });
    if (!prod) continue;
    const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
    if (lost) {
      const newQuantity =
        prod.quantity === null ? null : Math.max(0, prod.quantity - qty);
      await tx.product.update({
        where: { id: productId },
        data: {
          reservedQuantity: newReserved,
          ...(prod.quantity === null ? {} : { quantity: newQuantity }),
          status: getProductStatusFromQuantity(newQuantity),
        },
      });
    } else {
      await tx.product.update({
        where: { id: productId },
        data: {
          reservedQuantity: newReserved,
          status:
            newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
        },
      });
    }
  }

  await tx.trade.update({
    where: { id: tradeId },
    data: {
      status: TradeStatus.cancelled,
      cancelledAt: now,
      updatedAt: now,
    },
  });

  return {
    finalized: true,
    allResolved: true,
    initiatorId: trade.initiatorId,
    receiverId: trade.receiverId,
  };
}
