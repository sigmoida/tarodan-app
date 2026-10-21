import { PickType } from "@nestjs/swagger";
import { AdminListQueryDto } from "../../../common/list";

/**
 * `GET /admin/users/:id/sign-in-methods/events`: paging only. The order is
 * fixed (newest first) and there is no search, so the other list parameters
 * are not accepted (the global pipe drops them).
 */
export class AdminSignInMethodEventsQueryDto extends PickType(
  AdminListQueryDto,
  ["page", "limit"] as const,
) {}
