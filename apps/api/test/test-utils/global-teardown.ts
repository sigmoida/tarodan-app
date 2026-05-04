/**
 * Jest globalTeardown — runs once after the entire suite.
 * Closes any lingering DB connections so jest exits cleanly.
 *
 * Note: this file runs in its own Node process, separate from the test
 * worker. The PrismaClient instance imported here is NOT the same one
 * tests use; we just disconnect any clients that the worker may have
 * forgotten (NestJS shutdown hooks should handle the app's own client).
 */

export default async function globalTeardown(): Promise<void> {
  // Intentionally empty — per-test app cleanup is handled in afterAll hooks
  // inside each spec via app.close() and prisma.$disconnect().
}
