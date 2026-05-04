import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';

describe('E2E Smoke', () => {
  let ctx: E2ETestApp;

  beforeAll(async () => {
    await truncateAll();
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  it('boots the Nest app and reaches the test database', async () => {
    const baseline = await seedBaseline();
    expect(baseline.categoryId).toBeTruthy();

    const prisma = getPrisma();
    const cat = await prisma.category.findUnique({ where: { id: baseline.categoryId } });
    expect(cat?.slug).toBe('test-category');

    const server = ctx.app.getHttpServer();
    expect(server).toBeDefined();
  });
});
