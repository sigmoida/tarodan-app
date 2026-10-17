import assert from "node:assert/strict";
import test from "node:test";

import {
  branchNameError,
  developmentPushes,
  invalidBranchNames,
  isValidBranchName,
  masterPushes,
  parsePushLines,
  treeMismatchError,
} from "./pre-push-verify.mjs";

test("accepts <type>/<kebab> branches and the allowed fixed names", () => {
  for (const name of [
    "feat/min-price-setting",
    "fix/offer-counter-lock",
    "refactor/split-refund",
    "perf/list-query",
    "chore/bump-turbo",
    "ci/verification-pipeline",
    "docs/claude-structure",
    "test/payout-pins",
    "hotfix/paytr-callback-2",
    "development",
    "master",
    "worktree-agent-a1b2c3",
    "integration/wave-4",
  ]) {
    assert.equal(isValidBranchName(name), true, name);
  }
});

test("rejects branches outside the naming rule", () => {
  for (const name of [
    "feature/x",
    "fix/Offer-Lock",
    "fix/offer_lock",
    "fix/",
    "fix/a/b",
    "nav/rails-to-search",
    "my-branch",
    "style/format",
    "main",
    "worktree-",
  ]) {
    assert.equal(isValidBranchName(name), false, name);
  }
});

const ZERO = "0000000000000000000000000000000000000000";

test("checks the local branch pushed into development or master", () => {
  const pushes = parsePushLines(
    [
      "refs/heads/fix/offer-lock aaa refs/heads/development bbb",
      "refs/heads/nav/rails ccc refs/heads/development ddd",
      "refs/heads/release_x ccc refs/heads/master ddd",
      "HEAD 111 refs/heads/development 222",
      "refs/heads/development 444 refs/heads/development 555",
      "refs/heads/worktree-agent-1 666 refs/heads/development 777",
    ].join("\n"),
  );
  assert.deepEqual(invalidBranchNames(pushes), ["nav/rails", "release_x"]);
});

test("checks the remote name only when the push creates the branch", () => {
  const pushes = parsePushLines(
    [
      `refs/heads/feat/ok aaa refs/heads/Feature_X ${ZERO}`,
      `refs/heads/local_name bbb refs/heads/fix/good-name ${ZERO}`,
      `refs/tags/v1 ccc refs/tags/v1 ${ZERO}`,
    ].join("\n"),
  );
  assert.deepEqual(invalidBranchNames(pushes), ["Feature_X"]);
});

test("updating an existing remote branch passes whatever its name", () => {
  const pushes = parsePushLines(
    [
      "refs/heads/dependabot/npm_and_yarn/next-15.5.9 aaa refs/heads/dependabot/npm_and_yarn/next-15.5.9 bbb",
      "refs/heads/Feature_X ccc refs/heads/Feature_X ddd",
    ].join("\n"),
  );
  assert.deepEqual(invalidBranchNames(pushes), []);
});

test("deletions are never blocked by the naming rule", () => {
  const pushes = parsePushLines(
    "(delete) 0000000000000000000000000000000000000000 refs/heads/bad_name aaa",
  );
  assert.deepEqual(invalidBranchNames(pushes), []);
});

test("explains the rule when a name is rejected", () => {
  assert.equal(branchNameError([]), undefined);
  assert.match(
    branchNameError(["nav/rails"]),
    /"nav\/rails".*<type>\/<kebab-description>.*git branch -m/,
  );
});

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
