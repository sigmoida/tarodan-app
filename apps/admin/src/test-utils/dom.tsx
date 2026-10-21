/**
 * Test-only DOM helpers for component tests (jsdom, React `act`): mount
 * inside a query client and the confirm layer, type, click, find dialogs and
 * buttons. Never imported by a screen.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@tarodan/ui";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The `t` stand-in: the key, plus its values when there are any. */
export const fakeT = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}|${JSON.stringify(values)}` : key;

/** An axios-like API error. */
export const apiError = (
  status: number,
  i18nKey = "server.test.error",
  message = `server:${i18nKey}`,
) => ({ response: { status, data: { i18nKey, message } } });

export interface Mounted {
  rerender: (node: ReactNode) => void;
  unmount: () => void;
}

/** Renders inside a fresh query client and the confirm layer. */
export function mount(node: ReactNode): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (child: ReactNode) => (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{child}</ConfirmProvider>
    </QueryClientProvider>
  );
  act(() => root.render(wrap(node)));
  return {
    rerender: (next) => act(() => root.render(wrap(next))),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Lets queries, mutations, effects and their re-renders settle. */
export const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

export const bodyText = () => document.body.textContent ?? "";

/** The dialogs on screen, last opened last. */
export const dialogs = () =>
  Array.from(
    document.body.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"]',
    ),
  );

export function findButton(
  label: string,
  scope: ParentNode = document.body,
): HTMLButtonElement | undefined {
  return Array.from(scope.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
}

export function button(
  label: string,
  scope: ParentNode = document.body,
): HTMLButtonElement {
  const found = findButton(label, scope);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

export async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

/** Types into an input or textarea the way React sees it. */
export async function type(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function field<E extends HTMLElement = HTMLInputElement>(
  selector: string,
): E {
  const el = document.body.querySelector<E>(selector);
  if (!el) throw new Error(`no field "${selector}"`);
  return el;
}
