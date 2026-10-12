import type { ConfigService } from "@nestjs/config";
import type { ElogoService } from "../elogo.service";
import { ElogoInvoiceProvider } from "./elogo.provider";
import type { EInvoiceProvider } from "./e-invoice-provider";

/**
 * Port sözleşmesi: alan servisleri yalnız `EInvoiceProvider`'ı bilir, bu
 * yüzden her uygulama portun HER üyesini taşımalı. Liste `keyof` ile
 * tiplendiği için porta eklenen bir üye burada da yazılmadan derlenmez.
 */
const PORT_MEMBERS: Record<keyof EInvoiceProvider, "property" | "method"> = {
  name: "property",
  numbering: "property",
  isEnabled: "method",
  resolveRecipientKind: "method",
  send: "method",
  getStatus: "method",
  cancelEArchive: "method",
  fetchPdf: "method",
  eArchiveReversalStrategy: "method",
  classifyError: "method",
};

const implementations: Array<[string, () => EInvoiceProvider]> = [
  [
    "ElogoInvoiceProvider",
    () =>
      new ElogoInvoiceProvider(
        {} as ElogoService,
        { get: () => undefined } as unknown as ConfigService,
      ),
  ],
];

describe.each(implementations)("EInvoiceProvider contract — %s", (_, make) => {
  it.each(Object.entries(PORT_MEMBERS))("%s üyesi var", (member, kind) => {
    const provider = make() as unknown as Record<string, unknown>;
    if (kind === "method") {
      expect(typeof provider[member]).toBe("function");
    } else {
      expect(provider[member]).toBeDefined();
    }
  });

  it("ad ve numaralandırma portun izin verdiği değerlerden biri", () => {
    const provider = make();
    expect(["elogo", "netsis"]).toContain(provider.name);
    expect(["local", "provider"]).toContain(provider.numbering);
  });
});

describe("ElogoInvoiceProvider", () => {
  it("eLogo numarayı bize bırakır: numaralandırma YEREL", () => {
    const provider = implementations[0][1]();
    expect(provider.name).toBe("elogo");
    expect(provider.numbering).toBe("local");
  });
});
