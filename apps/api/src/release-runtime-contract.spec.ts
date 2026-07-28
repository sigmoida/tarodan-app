import { readFileSync } from "fs";
import { resolve } from "path";

describe("production runtime contract", () => {
  const repoRoot = resolve(__dirname, "../../..");
  const entrypoint = readFileSync(
    resolve(__dirname, "../entrypoint.sh"),
    "utf8",
  );
  const compose = readFileSync(
    resolve(repoRoot, "infrastructure/docker-compose.prod.yml"),
    "utf8",
  );
  const railway = readFileSync(resolve(__dirname, "../railway.toml"), "utf8");

  it("fails the container when a production migration fails", () => {
    expect(entrypoint).toContain("prisma migrate deploy");
    expect(entrypoint).not.toMatch(/migrate deploy[^\n]*\|\|/);
  });

  it("assigns explicit and distinct web/worker process roles", () => {
    const apiSection = compose.split(/\n {2}worker:/)[0];
    const workerSection = compose
      .split(/\n {2}worker:/)[1]
      ?.split(/\n {2}web:/)[0];

    expect(apiSection).toMatch(/PROCESS_ROLE:\s*web/);
    expect(workerSection).toMatch(/PROCESS_ROLE:\s*worker/);
  });

  it("runs migrations before starting the Railway web process", () => {
    expect(railway).toMatch(
      /startCommand\s*=\s*["'][^"']*prisma migrate deploy[^"']*["']/,
    );
  });
});
