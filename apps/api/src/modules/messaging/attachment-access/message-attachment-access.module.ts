import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma";
import { MessageAttachmentAccessService } from "./message-attachment-access.service";

/**
 * Yaprak modül: yalnız Prisma'ya bağlı. MessagingModule, MediaModule'ü
 * içe aktardığı için (gönderimde ek sahipliği), media tarafının mesaj
 * üyeliği denetimi MessagingModule'e değil buna bağlanır — döngü olmaz.
 */
@Module({
  imports: [PrismaModule],
  providers: [MessageAttachmentAccessService],
  exports: [MessageAttachmentAccessService],
})
export class MessageAttachmentAccessModule {}
