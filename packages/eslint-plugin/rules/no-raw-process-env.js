/**
 * no-raw-process-env
 *
 * Configuration is read in one place and handed to the rest of the app through
 * a typed accessor; it is not picked up from `process.env` wherever it happens
 * to be needed. Scattered reads are how the same value ends up with several
 * different fallbacks — `FRONTEND_URL` had drifted into seven variants across
 * 16 files, and the platform warehouse address existed twice with its defaults
 * kept in step by hand.
 *
 * There is a second, sharper reason on this codebase: `ConfigModule` validates
 * env through a zod schema that STRIPS unknown keys, and only the surviving
 * keys are written back into `process.env`. A key that lives in an `.env` file
 * but is not declared in the schema therefore never arrives at all — it reads
 * as `undefined` and the inline fallback silently wins. Routing reads through
 * `src/config/` is what keeps a key and its declaration together.
 *
 * Options:
 *   allowIn — path fragments where raw reads are legitimate: the config module
 *             itself, and bootstrap files that run before the DI container
 *             exists.
 *   allow   — keys not yet centralized. This list is a to-do, not a
 *             permission: entries come off it as each key gets an accessor,
 *             and nothing new goes on.
 */
"use strict";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow reading process.env outside the config module — go through a src/config accessor",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowIn: { type: "array", items: { type: "string" } },
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      raw: "Raw process.env.{{key}} — read it through a src/config accessor so the value (and its fallback) is defined once. New env keys must also be declared in config/env.validation.ts, or ConfigModule drops them.",
      rawUnknown:
        "Raw process.env access — read configuration through a src/config accessor.",
    },
  },

  create(context) {
    const { allowIn = [], allow = [] } = context.options[0] || {};
    const filename = (context.filename ?? context.getFilename() ?? "").replace(
      /\\/g,
      "/",
    );
    if (allowIn.some((fragment) => filename.includes(fragment))) return {};

    const allowed = new Set(allow);

    return {
      MemberExpression(node) {
        const { object, property } = node;
        if (
          object.type !== "MemberExpression" ||
          object.object.type !== "Identifier" ||
          object.object.name !== "process" ||
          object.property.type !== "Identifier" ||
          object.property.name !== "env"
        ) {
          return;
        }
        const key =
          property.type === "Identifier" && !node.computed
            ? property.name
            : property.type === "Literal" && typeof property.value === "string"
              ? property.value
              : null;
        if (key === null) {
          context.report({ node, messageId: "rawUnknown" });
          return;
        }
        if (allowed.has(key)) return;
        context.report({ node, messageId: "raw", data: { key } });
      },
    };
  },
};
