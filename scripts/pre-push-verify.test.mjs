import assert from "node:assert/strict";
import test from "node:test";

import {
  developmentPushes,
  masterPushes,
  parsePushLines,
  treeMismatchError,
} from "./pre-push-verify.mjs";

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

test("only development pushes run the local gate; deletions run nothing", () => {
  const pushes = parsePushLines(
    [
      "refs/heads/development aaa refs/heads/development bbb",
      "refs/heads/feature ccc refs/heads/feature ddd",
      "(delete) 0000000000000000000000000000000000000000 refs/heads/development eee",
      "refs/heads/master fff refs/heads/master ggg",
    ].join("\n"),
  );
  assert.deepEqual(
    developmentPushes(pushes).map((push) => push.localSha),
    ["aaa"],
  );
  assert.deepEqual(
    masterPushes(pushes).map((push) => push.localSha),
    ["fff"],
  );
});

test("blocks a development push whose commit is not the checked-out tree", () => {
  const push = {
    localRef: "refs/heads/feature",
    localSha: "abc123",
    remoteRef: "refs/heads/development",
    remoteSha: "def456",
  };
  const trees = { abc123: "tree-pushed" };
  const treeOf = (sha) => trees[sha];
  assert.equal(treeMismatchError(push, "tree-pushed", treeOf), undefined);
  assert.match(
    treeMismatchError(push, "tree-checked-out", treeOf),
    /Check out the commit you push/,
  );
});
