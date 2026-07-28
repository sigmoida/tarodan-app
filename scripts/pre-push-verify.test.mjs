import assert from "node:assert/strict";
import test from "node:test";

import { parsePushLines, validateReleaseMarker } from "./pre-push-verify.mjs";

test("parses all refs supplied by the git pre-push protocol", () => {
  assert.deepEqual(
    parsePushLines(
      [
        "refs/heads/development aaa refs/heads/development bbb",
        "refs/heads/master ccc refs/heads/master ddd",
        "",
      ].join("\n"),
    ),
    [
      {
        localRef: "refs/heads/development",
        localSha: "aaa",
        remoteRef: "refs/heads/development",
        remoteSha: "bbb",
      },
      {
        localRef: "refs/heads/master",
        localSha: "ccc",
        remoteRef: "refs/heads/master",
        remoteSha: "ddd",
      },
    ],
  );
});

test("accepts only a passing marker for the exact tree", () => {
  assert.equal(
    validateReleaseMarker({ status: "PASS", tree: "tree-1" }, "tree-1"),
    undefined,
  );
  assert.match(
    validateReleaseMarker({ status: "FAIL", tree: "tree-1" }, "tree-1"),
    /FAIL/,
  );
  assert.match(
    validateReleaseMarker({ status: "PASS", tree: "tree-2" }, "tree-1"),
    /changed/,
  );
  assert.match(validateReleaseMarker(undefined, "tree-1"), /No local release/);
});
