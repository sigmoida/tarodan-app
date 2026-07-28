import { readFileSync } from "fs";
import { resolve } from "path";

describe("production runtime contract", () => {
  const entrypoint = readFileSync(
    resolve(__dirname, "../entrypoint.sh"),
    "utf8",
  );
  const dockerfile = readFileSync(resolve(__dirname, "../Dockerfile"), "utf8");

  it("fails the container when a production migration fails", () => {
    expect(entrypoint).toContain("prisma migrate deploy");
    expect(entrypoint).not.toMatch(/migrate deploy[^\n]*\|\|/);
  });

  it("uses the migration-aware entrypoint in the Coolify image", () => {
    expect(dockerfile).toContain('ENTRYPOINT ["./entrypoint.sh"]');
  });

  it("starts the explicit Coolify web or worker process after bootstrap", () => {
    expect(entrypoint).toContain('if [ "$ROLE" = "worker" ]');
    expect(entrypoint).toContain("exec node dist/worker");
    expect(entrypoint).toContain("exec node dist/main");
  });
});
