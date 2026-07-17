// =============================================================================
// GAP-L03: INTERNATIONALIZATION (i18n) MODULE (#223)
// Serves the shared @tarodan/i18n catalog + resolves the request locale.
// =============================================================================

import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { I18nService } from './i18n.service';
import { I18nController } from './i18n.controller';
import { LocaleInterceptor } from './locale.interceptor';

@Global()
@Module({
  controllers: [I18nController],
  providers: [
    I18nService,
    // Attaches request.locale on every request (user pref → Accept-Language → tr).
    { provide: APP_INTERCEPTOR, useClass: LocaleInterceptor },
  ],
  exports: [I18nService],
})
export class I18nModule {}
