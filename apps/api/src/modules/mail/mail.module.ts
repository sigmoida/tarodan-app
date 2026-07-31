/**
 * Mail Module
 *
 * Owns the process-wide outbound SMTP transport. Every module that sends mail
 * imports this one instead of declaring `SmtpProvider` in its own `providers`
 * array — a local declaration would instantiate a second transport (its own
 * connection pool and `verify()` call) inside that module's injector, which is
 * how notification, order and elogo previously ended up with three.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SmtpProvider } from "./smtp.provider";

@Module({
  imports: [ConfigModule],
  providers: [SmtpProvider],
  exports: [SmtpProvider],
})
export class MailModule {}
