import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { CARGO_PROVIDER, type CargoProvider } from "./cargo-provider";
import {
  requestCarrierCancellationTask,
  type CarrierCancellationTaskInput,
} from "./carrier-cancellation-task";

export interface CarrierCancellationRequest extends CarrierCancellationTaskInput {
  updateLocal: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * Uzak iptal sözleşmesi olmayan sağlayıcılarda tek iptal kapısı: provider'ın
 * yerel idempotency durumunu temizler, domain kaydını ve kalıcı operasyon
 * görevini aynı transaction içinde yazar.
 */
@Injectable()
export class CarrierCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARGO_PROVIDER) private readonly cargo: CargoProvider,
  ) {}

  async request(input: CarrierCancellationRequest) {
    const cleared = await this.cargo.clearLocalShipment(input.reference);
    if (!cleared.ok) {
      throw new Error(cleared.providerMessage ?? "carrier_local_cancel_non_ok");
    }

    return this.prisma.$transaction(async (tx) => {
      await input.updateLocal(tx);
      return requestCarrierCancellationTask(tx as any, input);
    });
  }
}
