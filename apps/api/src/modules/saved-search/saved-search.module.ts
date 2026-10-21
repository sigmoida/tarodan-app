import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { MembershipModule } from "../membership/membership.module";
import { SavedSearchController } from "./saved-search.controller";
import { SavedSearchService } from "./saved-search.service";

@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [SavedSearchController],
  providers: [SavedSearchService],
  exports: [SavedSearchService],
})
export class SavedSearchModule {}
