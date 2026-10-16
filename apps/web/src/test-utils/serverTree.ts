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
  if (typeof element.type === "function") {
    const render = element.type as (props: unknown) => ReactNode;
    return serverTreeText(await render(element.props));
  }
  return serverTreeText(element.props?.children);
}
