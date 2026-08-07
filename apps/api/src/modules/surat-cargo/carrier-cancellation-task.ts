import type { Prisma, PrismaClient } from "@prisma/client";

type CancellationTaskDb = Pick<PrismaClient, "carrierCancellationTask">;

export interface CarrierCancellationTaskInput {
  provider: string;
  reference: string;
  entityType:
    | "order_shipment"
    | "trade_shipment"
    | "refund_return"
    | "admin_endpoint_test";
  entityId: string;
  reason: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Fiziksel taşıyıcı iptali API üzerinden desteklenmediğinde operasyon için
 * idempotent, kalıcı bir iş kaydı açar. TransactionClient ve PrismaService ile
 * aynı şekilde kullanılabilir; çağıran yerel status güncellemesiyle aynı tx'e
 * dahil edebilir.
 */
export async function requestCarrierCancellationTask(
  db: CancellationTaskDb,
  input: CarrierCancellationTaskInput,
) {
  const dedupeKey = [
    input.provider,
    input.entityType,
    input.entityId,
    input.reference,
  ].join(":");

  return db.carrierCancellationTask.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      provider: input.provider,
      reference: input.reference,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      metadata: input.metadata,
    },
    update: {
      // Aynı fiziksel ref yeniden iptal bekliyorsa çözülmüş eski işi tekrar aç.
      status: "pending",
      reason: input.reason,
      metadata: input.metadata,
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
    },
  });
}
