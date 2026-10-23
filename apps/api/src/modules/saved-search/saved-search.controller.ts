import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth";
import { UuidParam } from "../../common/pipes/uuid-param.decorator";
import {
  CreateSavedSearchDto,
  SavedSearchListQueryDto,
  SavedSearchListResponseDto,
  SavedSearchResponseDto,
} from "./dto";
import { SavedSearchService } from "./saved-search.service";

/**
 * The caller's saved searches. Every route needs a session: the global
 * JwtAuthGuard is default closed and nothing here is `@Public()`. Ownership is
 * checked by the service (another user's id is a 404).
 */
@ApiTags("saved-searches")
@ApiBearerAuth()
@Controller("saved-searches")
export class SavedSearchController {
  constructor(private readonly savedSearches: SavedSearchService) {}

  @Get()
  @ApiOperation({ summary: "My saved searches, newest first" })
  @ApiResponse({ status: 200, type: SavedSearchListResponseDto })
  list(
    @CurrentUser("id") userId: string,
    @Query() query: SavedSearchListQueryDto,
  ): Promise<SavedSearchListResponseDto> {
    return this.savedSearches.list(userId, query);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: "Save the current search" })
  @ApiResponse({ status: 201, type: SavedSearchResponseDto })
  @ApiResponse({
    status: 400,
    description: "server.savedSearch.emptyQuery or invalid filter",
  })
  @ApiResponse({
    status: 403,
    description: "SAVED_SEARCH_LIMIT (with `limit`)",
  })
  @ApiResponse({ status: 409, description: "SAVED_SEARCH_DUPLICATE" })
  create(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateSavedSearchDto,
  ): Promise<SavedSearchResponseDto> {
    return this.savedSearches.create(userId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "Delete one of my saved searches" })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: "server.savedSearch.notFound" })
  remove(
    @CurrentUser("id") userId: string,
    @UuidParam("id") id: string,
  ): Promise<void> {
    return this.savedSearches.remove(userId, id);
  }
}
