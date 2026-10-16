import type { ReactElement, ReactNode } from "react";

/**
 * Sunucu bileşen ağacını (async bileşenler dahil) düz metne indirir. React 18'in
 * `renderToStaticMarkup`'ı async bileşeni çizemez; yasal belgeler async
 * (`getTranslations`) olduğundan testte ağaç elle çözülür: işlev bileşenleri
 * çağrılır (await'lenir), diğer öğelerin çocukları gezilir. Kanca kullanan
 * istemci bileşenleri testte `vi.mock` ile sahte bileşene çevrilmelidir.
 */
export async function serverTreeText(node: ReactNode): Promise<string> {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return (await Promise.all(node.map(serverTreeText))).join(" ");
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  const { type } = element;
  if (typeof type === "function") {
    // Sınıf bileşeni çağrılamaz; sessizce geçmek metni (ve "yok" iddialarını)
    // boşa çıkarırdı.
    if (type.prototype?.isReactComponent) {
      throw new Error(
        `serverTreeText: sınıf bileşeni çözülemez (${type.name})`,
      );
    }
    const render = type as (props: unknown) => ReactNode;
    return serverTreeText(await render(element.props));
  }
  // Ana bilgisayar öğesi ("div") ya da Fragment (symbol) → çocuklara in.
  if (typeof type === "string" || typeof type === "symbol") {
    return serverTreeText(element.props?.children);
  }
  // memo / forwardRef / lazy / context nesneleri: çözemeyiz — sessiz geçme.
  throw new Error(
    "serverTreeText: çözülemeyen öğe türü (memo/forwardRef/lazy)",
  );
}
