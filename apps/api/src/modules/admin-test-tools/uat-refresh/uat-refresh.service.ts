import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  UAT_REFRESH_ACTIVE_STATES,
  UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR,
  UAT_REFRESH_HISTORY_LIMIT,
  UatRefreshRun,
  UatRefreshStatus,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { isLiveProduction } from "../../../config/environment";
import { i18nMessage } from "../../i18n";
import {
  acceptsReport,
  blocksNewRun,
  generateReportToken,
  hashReportToken,
  isActiveState,
  reportTokenMatches,
  toUatRefreshRun,
} from "../helpers/uat-refresh.helper";
import {
  StartUatRefreshDto,
  UatRefreshReportDto,
} from "../dto/uat-refresh.dto";
import { UatRefreshDispatchService } from "./uat-refresh-dispatch.service";

/**
 * Staging "production'dan maskeli yenile" (docs/UAT_REFRESH.md).
 *
 *  - `getStatus`: düğmenin durumu + son 10 koşu;
 *  - `start`: süper admin isteği → koşu satırı (kuyrukta) + GitHub dispatch;
 *  - `report`: workflow'un aşama raporu (koşuya özel token'la).
 *
 * Canlı dağıtımda (isLiveProduction) düğme "production" nedeniyle kullanılamaz,
 * başlatma 403, rapor ucu 404'tür. Ağır iş burada DEĞİL, workflow'dadır:
 * production veritabanı kimliği yalnız GitHub secret'larında durur.
 *
 * Aynı anda tek koşu: `start` kontrolü ve satır açılışı bir advisory lock
 * altında. Engel kuralı görünür zaman aşımından AYRI (`blocksNewRun`): bitmemiş
 * bir koşu, son yazımından bu yana uzun süre sessiz kalmadıkça yeni koşuyu
 * engeller — "zaman aşımına uğramış görünen" yavaş bir koşu takas ortasında
 * ezilemez.
 *
 * Dispatch belirsiz biterse (zaman aşımı, ağ, 5xx) GitHub isteği almış
 * olabilir: koşu `queued` kalır, `error` = `dispatchUnconfirmed`; workflow'un
 * ilk raporu onu sahiplenir ve kodu temizler. Yalnız kesin red (4xx) koşuyu
 * başarısız yapar.
 */
@Injectable()
export class UatRefreshService {
  private readonly logger = new Logger(UatRefreshService.name);

  /** `pg_advisory_xact_lock` anahtarı: "uat-refresh" başlatmalarını sıraya sokar. */
  static readonly START_LOCK_KEY = 7_331_201;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: UatRefreshDispatchService,
  ) {}

  async getStatus(now = new Date()): Promise<UatRefreshStatus> {
    if (isLiveProduction()) {
      return {
        available: false,
        unavailableReason: "production",
        current: null,
        last: null,
        history: [],
      };
    }
    const configured = this.dispatcher.config() !== null;
    const rows = await this.prisma.uatRefreshRun.findMany({
      orderBy: { requestedAt: "desc" },
      take: UAT_REFRESH_HISTORY_LIMIT,
    });
    const history = rows.map((row) => toUatRefreshRun(row, now));
    return {
      available: configured,
      unavailableReason: configured ? null : "notConfigured",
      current: history.find((run) => isActiveState(run.state)) ?? null,
      last: history.find((run) => !isActiveState(run.state)) ?? null,
      history,
    };
  }

  async start(
    requestedById: string,
    dto: StartUatRefreshDto,
    now = new Date(),
  ): Promise<UatRefreshRun> {
    if (isLiveProduction()) {
      throw new ForbiddenException(
        i18nMessage("server.uatRefresh.productionRefused"),
      );
    }
    const config = this.dispatcher.config();
    if (!config) {
      throw new ServiceUnavailableException(
        i18nMessage("server.uatRefresh.notConfigured"),
      );
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: requestedById },
      select: { displayName: true },
    });
    const token = generateReportToken();

    const run = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${UatRefreshService.START_LOCK_KEY})`;
      const active = await tx.uatRefreshRun.findMany({
        where: { state: { in: [...UAT_REFRESH_ACTIVE_STATES] } },
        orderBy: { requestedAt: "desc" },
      });
      if (active.some((row) => blocksNewRun(row, now))) {
        throw new ConflictException(
          i18nMessage("server.uatRefresh.alreadyRunning"),
        );
      }
      return tx.uatRefreshRun.create({
        data: {
          state: "queued",
          requestedById,
          requestedByName: requester?.displayName ?? null,
          requestedAt: now,
          dryRun: dto.dryRun ?? false,
          tokenHash: hashReportToken(token),
        },
      });
    });

    // Dış çağrı transaction DIŞINDA (CLAUDE.md §5).
    const dispatched = await this.dispatcher.dispatch(config, {
      runId: run.id,
      reportToken: token,
      dryRun: run.dryRun,
    });
    if (!dispatched.ok && dispatched.definite) {
      await this.prisma.uatRefreshRun.update({
        where: { id: run.id },
        data: {
          state: "failed",
          finishedAt: new Date(),
          error: dispatched.error,
        },
      });
      throw new BadGatewayException(
        i18nMessage("server.uatRefresh.dispatchFailed"),
      );
    }
    if (!dispatched.ok) {
      // Belirsiz: workflow koşuyor olabilir. Kuyrukta kalır (yeni koşuyu da
      // engeller); ilk rapor sahiplenir, gelmezse sessizlik süresi sonunda düşer.
      const unconfirmed = await this.prisma.uatRefreshRun.update({
        where: { id: run.id },
        data: { error: UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR },
      });
      this.logger.warn(
        `UAT refresh ${run.id}: dispatch unconfirmed (${dispatched.error}); left queued for the workflow to claim`,
      );
      return toUatRefreshRun(unconfirmed, now);
    }
    this.logger.log(
      `UAT refresh ${run.id} dispatched (dryRun=${run.dryRun}) by ${requestedById}`,
    );
    return toUatRefreshRun(run, now);
  }

  /**
   * Workflow raporu. Satır yoksa ya da token tutmuyorsa AYNI yanıt (403):
   * koşu kimliklerini yoklamak bir şey söylemesin. Bitmiş koşu yeniden
   * yazılamaz (409) — tek istisna dispatch'i belirsiz kalıp başarısız
   * işaretlenmiş koşunun `running` raporu (`acceptsReport`). Zaman aşımına
   * uğramış GÖRÜNEN koşu yazılabilir: workflow geç de olsa gerçeği söyler.
   */
  async report(
    runId: string,
    token: string | undefined,
    dto: UatRefreshReportDto,
    now = new Date(),
  ): Promise<UatRefreshRun> {
    if (isLiveProduction()) {
      throw new NotFoundException(i18nMessage("server.uatRefresh.runNotFound"));
    }
    const row = await this.prisma.uatRefreshRun.findUnique({
      where: { id: runId },
    });
    if (!row || !reportTokenMatches(token, row.tokenHash)) {
      throw new ForbiddenException(
        i18nMessage("server.uatRefresh.invalidToken"),
      );
    }
    if (!acceptsReport(row, dto.state)) {
      throw new ConflictException(
        i18nMessage("server.uatRefresh.alreadyFinished"),
      );
    }

    const date = (value: string | undefined) =>
      value ? new Date(value) : undefined;
    const terminal = dto.state !== "running";
    // Workflow belirsiz dispatch'i sahipleniyor: not ve (varsa) bitiş silinir.
    const claimsUnconfirmed =
      !terminal && row.error === UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR;
    const data: Prisma.UatRefreshRunUpdateInput = {
      state: dto.state,
      startedAt: date(dto.startedAt) ?? row.startedAt ?? now,
      ...(terminal ? { finishedAt: date(dto.finishedAt) ?? now } : {}),
      ...(dto.sourceSnapshotAt
        ? { sourceSnapshotAt: date(dto.sourceSnapshotAt) }
        : {}),
      ...(dto.masked
        ? {
            masked: dto.masked.map(({ table, rows }) => ({ table, rows })),
          }
        : {}),
      ...(dto.migrationsApplied
        ? { migrationsApplied: dto.migrationsApplied }
        : {}),
      ...(dto.backupFile !== undefined ? { backupFile: dto.backupFile } : {}),
      ...(dto.workflowRunUrl ? { workflowRunUrl: dto.workflowRunUrl } : {}),
      ...(terminal
        ? { error: dto.state === "failed" ? (dto.error ?? null) : null }
        : {}),
      ...(claimsUnconfirmed ? { error: null, finishedAt: null } : {}),
    };
    const updated = await this.prisma.uatRefreshRun.update({
      where: { id: runId },
      data,
    });
    this.logger.log(`UAT refresh ${runId} reported ${dto.state}`);
    return toUatRefreshRun(updated, now);
  }
}
