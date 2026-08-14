import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Bir modülün kendi klasöründeki bir servisi enjekte edip onu `providers`
 * listesine EKLEMEMESİ, birim testlerinden geçen ama üretimde boot'u öldüren
 * bir hatadır: Nest bağımlılığı çözemez ve konteyner MODULE/DEPENDENCY hatası
 * ile crash-loop'a girer.
 *
 * Suite bunu yakalamıyor çünkü her spec kendi test modülünü kurup sağlayıcıyı
 * elle kaydediyor — gerçek `@Module` metadata'sını derleyen hiçbir birim testi
 * yok. Bu sözleşme o boşluğu statik olarak kapatır: modül klasöründe tanımlı
 * her `@Injectable` bağımlılık, aynı klasördeki modüllerden birinin
 * `providers` listesinde görünmek zorunda.
 *
 * Gerçek olay: PayTRTransferService enjekte edildi, kaydedilmedi; typecheck,
 * 2476 test ve build yeşildi.
 */
describe("module providers cover their own injectables", () => {
  const MODULES_DIR = __dirname;

  const filesUnder = (dir: string, suffix: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? filesUnder(join(dir, e.name), suffix)
        : e.name.endsWith(suffix) && !e.name.endsWith(".spec.ts")
          ? [join(dir, e.name)]
          : [],
    );

  const moduleDirs = readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(MODULES_DIR, e.name));

  /**
   * `providers: [...]` içindeki sınıf adları. Diziyi parantez sayarak okur:
   * regex ile ilk `]`'e kadar almak, factory nesnesi (`useValue: [...]`) ya da
   * tek satırlık dizi olan modüllerde listeyi yanlış keser ve var olan bir
   * kaydı yok sayar.
   */
  function registeredProviders(moduleSource: string): Set<string> {
    const start = moduleSource.indexOf("providers:");
    if (start === -1) return new Set();
    const open = moduleSource.indexOf("[", start);
    if (open === -1) return new Set();
    let depth = 0;
    let end = open;
    for (let i = open; i < moduleSource.length; i++) {
      const c = moduleSource[i];
      if (c === "[" || c === "{" || c === "(") depth++;
      else if (c === "]" || c === "}" || c === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    return new Set(
      moduleSource
        .slice(open + 1, end)
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter((t) => /^[A-Z][A-Za-z0-9_]*$/.test(t)),
    );
  }

  /** Sınıfın constructor parametrelerindeki tip adları. */
  function injectedTypes(source: string): string[] {
    const ctor = source.match(/\n\s*constructor\(([\s\S]*?)\n\s*\)\s*\{/);
    if (!ctor) return [];
    return [...ctor[1].matchAll(/:\s*([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]);
  }

  const cases = moduleDirs.flatMap((dir) => {
    const moduleFiles = filesUnder(dir, ".module.ts");
    if (moduleFiles.length === 0) return [];

    // Aynı modül klasöründeki TÜM modüllerin sağlayıcıları birlikte sayılır:
    // bazı klasörler kendi alt modülünü barındırır (ör. product/lock).
    const provided = new Set(
      moduleFiles.flatMap((f) => [
        ...registeredProviders(readFileSync(f, "utf8")),
      ]),
    );

    // Klasörde tanımlı @Injectable sınıflar — yalnız bunlar aranır; başka
    // modülden gelenler o modülün exports'undan gelir ve burayı ilgilendirmez.
    const localInjectables = new Map<string, string>();
    for (const f of filesUnder(dir, ".ts")) {
      const src = readFileSync(f, "utf8");
      if (!src.includes("@Injectable()")) continue;
      for (const m of src.matchAll(/export class ([A-Z][A-Za-z0-9_]*)/g)) {
        localInjectables.set(m[1], f);
      }
    }

    return [...localInjectables]
      .filter(([name]) => provided.has(name))
      .flatMap(([name, file]) =>
        injectedTypes(readFileSync(file, "utf8"))
          .filter((dep) => localInjectables.has(dep) && !provided.has(dep))
          .map(
            (dep) => [dir.slice(MODULES_DIR.length + 1), name, dep] as const,
          ),
      );
  });

  it("tarama kendini doğrular: modüller ve enjekte edilebilirler bulundu", () => {
    expect(moduleDirs.length).toBeGreaterThan(20);
  });

  it("kayıtlı hiçbir sağlayıcı, aynı modülün kaydetmediği bir servisi enjekte etmez", () => {
    const missing = cases.map(
      ([mod, cls, dep]) => `${mod}: ${cls} → ${dep} (providers'da yok)`,
    );
    expect(missing).toEqual([]);
  });
});
