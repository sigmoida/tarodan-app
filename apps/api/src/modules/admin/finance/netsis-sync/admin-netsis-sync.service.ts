import { Injectable } from "@nestjs/common";
import {
  NetsisSyncStatus,
  type NetsisSyncKind,
  type NetsisSyncRecord,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma";
import {
  dateRangeWhere,
  paginate,
  resolveOrderBy,
  type PaginatedResult,
} from "../../../../common/list";
import { NetsisAccountingSyncService } from "../../../invoicing/accounting/netsis-accounting-sync.service";
import { NETSIS_SYNC_MAX_ATTEMPTS } from "../../../invoicing/accounting/netsis-sync-failure-policy";
import { AdminAuditService } from "../../ops/admin-audit.service";
import type { NetsisSyncQueryDto } from "./dto/netsis-sync.dto";

/** Liste satırı: Decimal yanıt sınırında sayıya çevrilir (CLAUDE.md §8). */
export interface AdminNetsisSyncRow {
  id: string;
  kind: NetsisSyncKind;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  status: NetsisSyncStatus;
  attemptCount: number;
  /** Cron artık denemez; admin müdahalesi (yeniden dene / eşleştir) gerekir. */
  exhausted: boolean;
  lastAttemptAt: Date | null;
  lastError: string | null;
  netsisRef: string | null;
  payload: Prisma.JsonValue | null;
  amount: number | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminNetsisSyncRow(
  record: NetsisSyncRecord,
): AdminNetsisSyncRow {
  return {
    id: record.id,
    kind: record.kind,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    idempotencyKey: record.idempotencyKey,
    status: record.status,
    attemptCount: record.attemptCount,
    exhausted:
      record.status === NetsisSyncStatus.failed &&
      record.attemptCount >= NETSIS_SYNC_MAX_ATTEMPTS,
    lastAttemptAt: record.lastAttemptAt,
    lastError: record.lastError,
    netsisRef: record.netsisRef,
    payload: record.payload,
    amount: record.amount === null ? null : record.amount.toNumber(),
    syncedAt: record.syncedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Netsis muhasebe senkron kayıtlarının admin yüzü (yalnız API; ekran sonra).
 * Liste bir okuma modelidir (doğrudan Prisma, `common/list`); yeniden deneme
 * bir YAZMADIR ve domain servisinden geçer (CLAUDE.md §1) — bu katman yalnız
 * ZORUNLU denetim kaydını aynı işlemde ekler.
 */
@Injectable()
export class AdminNetsisSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: NetsisAccountingSyncService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(
    query: NetsisSyncQueryDto,
  ): Promise<PaginatedResult<AdminNetsisSyncRow>> {
    const where: Prisma.NetsisSyncRecordWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;
    Object.assign(where, dateRangeWhere(query));

    const orderBy =
      resolveOrderBy<Prisma.NetsisSyncRecordOrderByWithRelationInput>(
        "NetsisSyncRecord",
        query,
        { defaultSort: { createdAt: "desc" } },
      );
    const result = await paginate(
      this.prisma.netsisSyncRecord,
      { where, orderBy },
      query,
    );
    return { ...result, data: result.data.map(toAdminNetsisSyncRow) };
  }

  /**
   * Yeniden kuyruğa al (bütçe sıfırlanır) ya da `netsisRef` ile elle eşleştir.
   * Denetim kaydı önce/sonra durumuyla, sıfırlamayla AYNI işlemde yazılır:
   * denetim yazılamazsa kayıt da değişmez.
   */
  async retry(
    adminUserId: string,
    id: string,
    netsisRef?: string,
  ): Promise<AdminNetsisSyncRow> {
    const action = netsisRef?.trim()
      ? "netsis_sync_mark_synced"
      : "netsis_sync_retry";
    const record = await this.sync.resetForRetry(id, {
      netsisRef,
      afterWrite: async (tx, before, after) => {
        await this.audit.createRequiredAuditLog(
          adminUserId,
          action,
          "NetsisSyncRecord",
          id,
          before,
          after,
          tx,
        );
      },
    });
    return toAdminNetsisSyncRow(record);
  }
}
