import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * HIGH: `PROCESS_ROLE=web` yalnız `WorkerModule`'ü kapatıyordu. `scheduled`
 * kuyruğunun processor'ları her zaman yüklenen feature modüllerinin provider'ı
 * olduğu için bir `web` replikası 27 cron'un TAMAMI için tüketici oluyordu —
 * tam-tablo popülerlik hesabı ve GERÇEK PayTR para transferleri HTTP process'inde
 * koşuyordu. Doğruluk sorunu değil (Bull tek-sefer garantisi) ama Faz 7.2'nin
 * kaynak izolasyonu hedefi fiilen hiç uygulanmıyordu.
 *
 * Çözüm: her `scheduled` processor'ı modülüne KOŞULLU (runsQueueWorkers) kayıt
 * edilir. Bu test, yeni eklenen bir processor'ın gate'i atlamasını engeller.
 */
describe("scheduled queue processors are gated by PROCESS_ROLE", () => {
  const modulesDir = join(__dirname);

  /**
   * Modül içindeki KLASÖR DÜZENİNDEN bağımsız tarama. Bir processor'ın modül
   * kökünde mi yoksa `jobs/` altında mı durduğu bu sözleşmeyi ilgilendirmez;
   * tek seviye okumak, dosyayı bir alt klasöre taşıyan kişinin gate'i sessizce
   * kaybetmesi demekti.
   */
  const filesUnder = (dir: string, suffix: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(join(dir, entry.name), suffix)
        : entry.name.endsWith(suffix)
          ? [join(dir, entry.name)]
          : [],
    );

  const processorFiles = readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      filesUnder(join(modulesDir, entry.name), ".processor.ts").map((path) => ({
        module: entry.name,
        path,
        file: path.slice(path.lastIndexOf("/") + 1),
      })),
    )
    .filter(({ path }) =>
      readFileSync(path, "utf8").includes("QUEUE_NAMES.SCHEDULED"),
    );

  it("scheduled processor'lar bulunur (test kendini doğrular)", () => {
    expect(processorFiles.length).toBeGreaterThan(10);
  });

  it.each(processorFiles.map((p) => [p.module, p.file] as const))(
    "%s/%s koşullu olarak kaydedilir",
    (moduleName, file) => {
      const moduleFiles = filesUnder(
        join(modulesDir, moduleName),
        ".module.ts",
      );
      const className = file
        .replace(/\.ts$/, "")
        .split(/[-.]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");

      const registrations = moduleFiles
        .map((f) => readFileSync(f, "utf8"))
        .filter((content) => content.includes(className));

      expect(registrations.length).toBeGreaterThan(0);
      // Provider listesine koşulsuz eklenmemeli: rol gate'i (scheduledProcessors)
      // üzerinden gelmeli.
      for (const content of registrations) {
        expect(content).toMatch(/scheduledProcessors\(/);
      }
    },
  );
});
