import {
  Injectable,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { isProduction, isTest } from "../config/environment";
import { errorMessage } from "../common/helpers/error-message";

const WATCHED_WRITE_ACTIONS = ["create", "update", "upsert", "delete"];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {
    // TEST'te: Prisma Client runtime'da apps/api/.env'i yükleyip process.env.DATABASE_URL'i
    // dev (tarodan) yapıyor → E2E'de YANLIŞ DB. .env'de OLMAYAN dedike TEST_DATABASE_URL ile
    // EXPLICIT datasource url ver → Prisma'nın .env'i bunu ezemez. (prod/dev'i etkilemez.)
    const testUrl =
      isTest() && process.env.TEST_DATABASE_URL
        ? process.env.TEST_DATABASE_URL
        : undefined;
    super({
      ...(testUrl ? { datasources: { db: { url: testUrl } } } : {}),
      log: [
        { emit: "event", level: "query" },
        { emit: "stdout", level: "info" },
        { emit: "stdout", level: "warn" },
        { emit: "stdout", level: "error" },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Database connection established");
    this.registerSearchSyncMiddleware();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("Database connection closed");
  }

  /**
   * Prisma middleware that emits events after Product / Collection writes
   * so Elasticsearch can be kept in sync automatically.
   */
  private registerSearchSyncMiddleware(): void {
    if (!this.eventEmitter) {
      this.logger.warn(
        "EventEmitter not available – search sync middleware skipped",
      );
      return;
    }

    const emitter = this.eventEmitter;

    this.$use(async (params, next) => {
      // For CarModel delete: capture product IDs BEFORE delete (ON DELETE SET NULL clears them)
      let productIdsToReindex: string[] | undefined;
      if (params.model === "CarModel" && params.action === "delete") {
        const carModelId = (params.args?.where as any)?.id;
        if (carModelId) {
          const products = await (this as any).product.findMany({
            where: { carModelId },
            select: { id: true },
          });
          productIdsToReindex = products.map((p: any) => p.id);
        }
      }

      const result = await next(params);

      if (!params.model || !WATCHED_WRITE_ACTIONS.includes(params.action)) {
        return result;
      }

      try {
        if (params.model === "Product") {
          const id = result?.id ?? params.args?.where?.id;
          if (id) {
            const event =
              params.action === "delete"
                ? "product.deleted"
                : "product.changed";
            emitter.emit(event, { entityId: id });
          }
        }

        if (params.model === "Collection") {
          const id = result?.id ?? params.args?.where?.id;
          if (id) {
            const event =
              params.action === "delete"
                ? "collection.deleted"
                : "collection.changed";
            emitter.emit(event, { entityId: id });
          }
        }

        if (params.model === "CarModel") {
          const carModelId = result?.id ?? (params.args?.where as any)?.id;
          if (carModelId) {
            if (params.action === "delete" && productIdsToReindex?.length) {
              emitter.emit("carModel.deleted", {
                entityId: carModelId,
                productIds: productIdsToReindex,
              });
            } else if (params.action !== "delete") {
              emitter.emit("carModel.changed", { entityId: carModelId });
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          `Search sync event emission failed: ${errorMessage(err)}`,
        );
      }

      return result;
    });

    this.logger.log(
      "Prisma search-sync middleware registered (Product, Collection, CarModel)",
    );
  }

  /**
   * Clean database (for testing purposes only)
   */
  async cleanDatabase() {
    if (isProduction()) {
      throw new Error("Cannot clean database in production");
    }

    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== "_prisma_migrations")
      .map((name) => `"public"."${name}"`)
      .join(", ");

    try {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
      this.logger.error("Error cleaning database:", error);
    }
  }
}
