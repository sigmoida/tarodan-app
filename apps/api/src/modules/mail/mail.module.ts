/**
 * Mail Module
 *
 * Owns the process-wide outbound SMTP transport. Every module that sends mail
 * imports this one instead of declaring `SmtpProvider` in its own `providers`
 * array — a local declaration would instantiate a second transport (its own
 * connection pool and `verify()` call) inside that module's injector, which is
 * how notification, order and elogo previously ended up with three.
 *
 * Mail Routing's read side lives here too (`MailRoutingDirectory` + the
 * password cipher): the transport needs it to pick each mail's sender. The
 * admin write side and staff notifications are in `modules/mail-routing`.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SmtpProvider } from "./smtp.provider";
import { MailRoutingDirectory } from "./mail-routing-directory";
import { MailAccountCipher } from "./mail-account-cipher";

@Module({
  imports: [ConfigModule],
  providers: [SmtpProvider, MailRoutingDirectory, MailAccountCipher],
  exports: [SmtpProvider, MailRoutingDirectory, MailAccountCipher],
})
export class MailModule {}
