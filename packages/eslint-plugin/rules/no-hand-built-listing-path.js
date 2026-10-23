/**
 * no-hand-built-listing-path
 *
 * A listing page lives at `/listings/<slug>-<uuid>` (ADR 0017), and the one
 * builder of that path is `listingPath({ id, title })` from `@tarodan/types`.
 * A hand-built `/listings/${id}` still resolves, but every visit then costs a
 * redirect hop to the canonical URL, and copies of the rule drift (the web
 * once held about 30 of them).
 *
 * Reported: a template literal or string concatenation that puts an id right
 * after `/listings/` (`/listings/${id}`, `${origin}/listings/${id}`,
 * `"/listings/" + id`).
 *
 * Allowed: action sub-routes behind the id (`/listings/${id}/edit`), which
 * stay bare-UUID on purpose, and paths that only contain the word elsewhere
 * (`/admin/listings/${id}` is an API call, not a page link).
 */
"use strict";

/** The text right before the id: the page path, alone or behind an origin. */
const PAGE_PREFIX = /^(?:https?:\/\/[^/]+)?(?:\/en)?\/listings\/$/;

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "disallow hand-built listing page URLs; use listingPath() from @tarodan/types",
    },
    schema: [],
    messages: {
      handBuilt:
        "Build listing page URLs with listingPath({ id, title }) from @tarodan/types (ADR 0017: /listings/<slug>-<uuid>). Only action sub-routes such as `/listings/${id}/edit` are built by hand.",
    },
  },

  create(context) {
    return {
      TemplateLiteral(node) {
        const { quasis } = node;
        for (let i = 0; i < quasis.length - 1; i += 1) {
          const head = quasis[i].value.cooked ?? quasis[i].value.raw;
          const tail = quasis[i + 1].value.cooked ?? quasis[i + 1].value.raw;
          // A later quasi follows an origin expression
          // (`${SITE_URL}/listings/${id}`), so it is tested the same way.
          if (PAGE_PREFIX.test(head) && !tail.startsWith("/")) {
            context.report({ node, messageId: "handBuilt" });
            return;
          }
        }
      },
      BinaryExpression(node) {
        if (
          node.operator === "+" &&
          node.left.type === "Literal" &&
          typeof node.left.value === "string" &&
          PAGE_PREFIX.test(node.left.value)
        ) {
          context.report({ node, messageId: "handBuilt" });
        }
      },
    };
  },
};
