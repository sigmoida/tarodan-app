import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SAVED_SEARCH_ERROR_CODES,
  canonicalizeSavedSearchLabels,
  canonicalizeSavedSearchQuery,
  isEmptySavedSearchQuery,
  savedSearchDefaultName,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { paginate } from "../../common/list";
import { i18nMessage } from "../i18n";
import { MembershipService } from "../membership/membership.service";
import { lockActiveUserForQuota } from "../user/helpers/user-row-lock";
import {
  CreateSavedSearchDto,
  SavedSearchListQueryDto,
  SavedSearchListResponseDto,
  SavedSearchResponseDto,
} from "./dto";
import { savedSearchQueryHash } from "./helpers/saved-search-hash";

const SAVED_SEARCH_SELECT = {
  id: true,
  name: true,
  query: true,
  labels: true,
  createdAt: true,
} satisfies Prisma.SavedSearchSelect;

type SavedSearchRow = Prisma.SavedSearchGetPayload<{
  select: typeof SAVED_SEARCH_SELECT;
}>;

/**
 * A user's saved product searches (docs/SAVED_SEARCHES.md). The query is
 * stored canonical (`@tarodan/types` saved-search.ts) and deduplicated by its
 * hash; the tier limit is `MembershipTier.maxSavedSearches`.
 *
 * Privacy: the search text and the name are the user's own words; nothing
 * here logs them, only ids and counts.
 */
@Injectable()
export class SavedSearchService {
  private readonly logger = new Logger(SavedSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  /** The caller's searches, newest first. */
  async list(
    userId: string,
    query: SavedSearchListQueryDto,
  ): Promise<SavedSearchListResponseDto> {
    const page = await paginate(
      this.prisma.savedSearch,
      {
        where: { userId },
        select: SAVED_SEARCH_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      query,
    );
    return { data: page.data.map(toResponse), meta: page.meta };
  }

  /**
   * Saves a search. Refuses an empty query (400), a duplicate of a saved
   * one (409) and a save over the tier limit (403), in that order: a
   * duplicate needs no free slot.
   */
  async create(
    userId: string,
    dto: CreateSavedSearchDto,
  ): Promise<SavedSearchResponseDto> {
    const query = canonicalizeSavedSearchQuery(dto.query);
    if (isEmptySavedSearchQuery(query)) {
      throw new BadRequestException(
        i18nMessage("server.savedSearch.emptyQuery"),
      );
    }
    const labels = canonicalizeSavedSearchLabels(dto.labels, query);
    const name = dto.name || savedSearchDefaultName(query, labels) || null;
    const queryHash = savedSearchQueryHash(query);

    // The effective tier's limit, read before the transaction (nothing
    // more than the tier rows). A tier change racing this save is harmless:
    // the next save sees it.
    const limit = await this.membership.getSavedSearchLimit(userId);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Serialises this user's saves, so the count below cannot go stale
        // before the insert (two parallel saves at limit - 1 leave one).
        await lockActiveUserForQuota(tx, userId);

        const duplicate = await tx.savedSearch.findUnique({
          where: { userId_queryHash: { userId, queryHash } },
          select: { id: true },
        });
        if (duplicate) throw duplicateError();

        const count = await tx.savedSearch.count({ where: { userId } });
        if (count >= limit) throw limitError(limit);

        return tx.savedSearch.create({
          // Plain JSON by construction (canonicalize*); the interfaces only
          // lack the index signature Prisma's JSON input type asks for.
          data: {
            userId,
            name,
            query: query as Prisma.InputJsonObject,
            labels: labels as Prisma.InputJsonObject,
            queryHash,
          },
          select: SAVED_SEARCH_SELECT,
        });
      });
      this.logger.log(`saved-search created id=${row.id} userId=${userId}`);
      return toResponse(row);
    } catch (error) {
      // The unique (user_id, query_hash) index is the last word on
      // duplicates; only a writer outside the lock could reach it.
      if (isUniqueViolation(error)) throw duplicateError();
      throw error;
    }
  }

  /** Deletes one of the caller's searches; another user's id is a 404 too. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.savedSearch.deleteMany({
      where: { id, userId },
    });
    if (count === 0) {
      throw new NotFoundException(i18nMessage("server.savedSearch.notFound"));
    }
  }
}

function toResponse(row: SavedSearchRow): SavedSearchResponseDto {
  // Re-canonicalised on read: a key later removed from the allow-list
  // disappears from old rows instead of reaching clients.
  const query = canonicalizeSavedSearchQuery(row.query);
  return {
    id: row.id,
    name: row.name,
    query,
    labels: canonicalizeSavedSearchLabels(row.labels, query),
    createdAt: row.createdAt.toISOString(),
  };
}

function duplicateError(): ConflictException {
  return new ConflictException({
    ...i18nMessage("server.savedSearch.alreadySaved"),
    errorCode: SAVED_SEARCH_ERROR_CODES.duplicate,
  });
}

function limitError(limit: number): ForbiddenException {
  return new ForbiddenException({
    ...i18nMessage("server.savedSearch.limitReached", { limit }),
    errorCode: SAVED_SEARCH_ERROR_CODES.limitReached,
    limit,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
