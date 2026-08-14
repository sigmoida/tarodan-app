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
   * `source[open]`'daki açma parantezinin/köşeli parantezin eşleşen kapanışına
   * kadar olan gövde. Regex ile ilk kapanışa kadar okumak, iç içe geçmiş bir
   * factory nesnesinde (`useValue: [...]`) ya da parametre dekoratöründe
   * (`@Inject(TOKEN)`) listeyi yanlış yerden keser.
   */
  function balancedSlice(source: string, open: number): string {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      const c = source[i];
      if (c === "[" || c === "{" || c === "(") depth++;
      else if (c === "]" || c === "}" || c === ")") {
        depth--;
        if (depth === 0) return source.slice(open + 1, i);
      }
    }
    return "";
  }

  /**
   * `providers: [...]` içindeki sınıf adları. Bir dosyadaki TÜM `providers:`
   * geçişleri toplanır — tek dosyada birden fazla `@Module` tanımlıysa yalnız
   * ilkine bakmak, ikinci modülün kayıtlarını yok sayıp sahte ihlal üretir.
   */
  function registeredProviders(moduleSource: string): Set<string> {
    const names = new Set<string>();
    for (const m of moduleSource.matchAll(/providers:\s*\[/g)) {
      const open = moduleSource.indexOf("[", m.index ?? 0);
      if (open === -1) continue;
      for (const token of balancedSlice(moduleSource, open).split(/[,\n]/)) {
        const name = token.trim();
        if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) names.add(name);
      }
    }
    return names;
  }

  /**
   * Sınıfın constructor parametrelerindeki tip adları.
   *
   * Parametre listesi parantez sayılarak okunur, satır sonuna göre DEĞİL:
   * `constructor(private readonly x: Foo) {}` tek satırdır ve satır sonu arayan
   * bir kalıp onu sessizce atlar. Kaçırılan her constructor bu sözleşmenin
   * kapsamından düşer — nöbetçinin yakalaması gereken tam olarak o durumdur.
   */
  function injectedTypes(source: string): string[] {
    const ctor = source.match(/\n\s*constructor\s*\(/);
    if (!ctor || ctor.index === undefined) return [];
    const open = source.indexOf("(", ctor.index);
    if (open === -1) return [];
    return [
      ...balancedSlice(source, open).matchAll(/:\s*([A-Z][A-Za-z0-9_]*)/g),
    ].map((m) => m[1]);
  }

  /**
   * Taramanın gerçekten bir şey ölçtüğünü kanıtlayan sayaçlar. Kalıplardan biri
   * eşleşmeyi bırakırsa (biçimlendirici sürümü, yeni bir yazım) ihlal listesi
   * boşalır ve sözleşme sessizce hiçbir şey doğrulamayan yeşil bir teste döner.
   */
  const scan = { injectables: 0, registered: 0, injectedLocalDeps: 0 };

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

    scan.injectables += localInjectables.size;

    return [...localInjectables]
      .filter(([name]) => provided.has(name))
      .flatMap(([name, file]) => {
        scan.registered += 1;
        const localDeps = injectedTypes(readFileSync(file, "utf8")).filter(
          (dep) => localInjectables.has(dep),
        );
        scan.injectedLocalDeps += localDeps.length;
        return localDeps
          .filter((dep) => !provided.has(dep))
          .map(
            (dep) => [dir.slice(MODULES_DIR.length + 1), name, dep] as const,
          );
      });
  });

  it("tarama kendini doğrular: modüller, sağlayıcılar ve constructor'lar okundu", () => {
    expect(moduleDirs.length).toBeGreaterThan(20);
    expect(scan.injectables).toBeGreaterThan(100);
    // Bulunan @Injectable'ların çoğu providers listesinde görünmeli; bu oran
    // çökerse okunan şey providers listesi değildir.
    expect(scan.registered).toBeGreaterThan(scan.injectables / 2);
    // En az bu kadar "aynı modülden servis enjekte ediliyor" bağı var; sıfıra
    // düşerse constructor kalıbı artık eşleşmiyor demektir.
    expect(scan.injectedLocalDeps).toBeGreaterThan(50);
  });

  it("kayıtlı hiçbir sağlayıcı, aynı modülün kaydetmediği bir servisi enjekte etmez", () => {
    const missing = cases.map(
      ([mod, cls, dep]) => `${mod}: ${cls} → ${dep} (providers'da yok)`,
    );
    expect(missing).toEqual([]);
  });
});
