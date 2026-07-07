/**
 * DI-graph canary: boots AppModule in Nest "preview" mode.
 * Preview mode builds the full dependency graph and resolves providers WITHOUT
 * instantiating them (no constructors, no onModuleInit, no DB/Redis/ES connect).
 * Used to catch unresolvable-dependency / forwardRef wiring errors introduced by
 * a module refactor, without needing live infrastructure.
 *
 * Exit 0 = graph resolved. Non-zero = DI wiring problem (prints the error).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    abortOnError: false,
    logger: false,
  });
  await app.close();
  // eslint-disable-next-line no-console
  console.log('PREVIEW_BOOT_OK');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('PREVIEW_BOOT_FAIL:', err?.message ?? err);
  process.exit(1);
});
