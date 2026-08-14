/**
 * no-hardcoded-exception-message
 *
 * API exceptions carry a catalog key, not a fixed Turkish string:
 *
 *   throw new NotFoundException(i18nMessage("server.order.notFound", { orderNumber }));
 *
 * `AllExceptionsFilter` renders the key in the request's locale, so the same
 * error reaches a Turkish storefront, an English one and the mobile app in the
 * right language, and the response carries `i18nKey` for clients that want to
 * re-render it. A literal message bypasses all of that and pins the API to one
 * language at the throw site.
 *
 * Narrower than `no-hardcoded-turkish` on purpose: it fires only on messages
 * handed to an exception constructor, which is where the localization contract
 * actually lives. Turkish in a log line or a comment is not user-facing copy
 * and is left alone.
 */
"use strict";

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const EXCEPTION_NAME = /(?:Exception|Error)$/;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow hardcoded Turkish exception messages — pass i18nMessage(key) instead",
    },
    schema: [],
    messages: {
      hardcoded:
        'Hardcoded Turkish exception message — pass i18nMessage("server.…") so AllExceptionsFilter can render it in the caller\'s locale.',
    },
  },

  create(context) {
    /** The message is the first argument of `new SomethingException(...)`. */
    function checkArgument(argument) {
      if (!argument) return;
      if (
        argument.type === "Literal" &&
        typeof argument.value === "string" &&
        TURKISH_CHARS.test(argument.value)
      ) {
        context.report({ node: argument, messageId: "hardcoded" });
        return;
      }
      if (
        argument.type === "TemplateLiteral" &&
        argument.quasis.some((quasi) =>
          TURKISH_CHARS.test(quasi.value.cooked ?? ""),
        )
      ) {
        context.report({ node: argument, messageId: "hardcoded" });
      }
    }

    return {
      NewExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          !EXCEPTION_NAME.test(node.callee.name)
        ) {
          return;
        }
        checkArgument(node.arguments[0]);
      },
    };
  },
};
