#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const APP_ORDER = ["api", "web", "admin"];

const APP_PACKAGE_NAMES = new Map([
  ["@tarodan/api", "api"],
  ["@tarodan/web", "web"],
  ["@tarodan/admin", "admin"],
]);

const ALL_APPS_FILES = new Set([
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

function normalizePath(filePath) {
  return filePath.split(sep).join("/").replace(/^\.\//, "");
}

function readPackage(packageFile, repoRoot) {
  const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };

  return {
    name: manifest.name,
    directory: normalizePath(relative(repoRoot, dirname(packageFile))),
    dependencies: Object.keys(dependencies ?? {}),
  };
}

export function loadWorkspaceGraph(repoRoot = REPO_ROOT) {
  const packages = new Map();

  for (const workspaceRoot of ["apps", "packages"]) {
    const absoluteRoot = join(repoRoot, workspaceRoot);
    if (!existsSync(absoluteRoot)) {
      continue;
    }

    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageFile = join(absoluteRoot, entry.name, "package.json");
      if (!existsSync(packageFile)) {
        continue;
      }

      const workspacePackage = readPackage(packageFile, repoRoot);
      if (workspacePackage.name) {
        packages.set(workspacePackage.name, workspacePackage);
      }
    }
  }

  const dependents = new Map();
  for (const workspacePackage of packages.values()) {
    for (const dependency of workspacePackage.dependencies) {
      if (!packages.has(dependency)) {
        continue;
      }

      const consumers = dependents.get(dependency) ?? new Set();
      consumers.add(workspacePackage.name);
      dependents.set(dependency, consumers);
    }
  }

  return { packages, dependents };
}

function findPackageByPath(filePath, packages) {
  let bestMatch;

  for (const workspacePackage of packages.values()) {
    const prefix = `${workspacePackage.directory}/`;
    if (
      (filePath === workspacePackage.directory ||
        filePath.startsWith(prefix)) &&
      (!bestMatch ||
        workspacePackage.directory.length > bestMatch.directory.length)
    ) {
      bestMatch = workspacePackage;
    }
  }

  return bestMatch;
}

function collectApplicationDependents(packageName, graph) {
  const affected = new Set();
  const visited = new Set();
  const queue = [packageName];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const appName = APP_PACKAGE_NAMES.get(current);
    if (appName) {
      affected.add(appName);
    }

    for (const dependent of graph.dependents.get(current) ?? []) {
      queue.push(dependent);
    }
  }

  return affected;
}

export function detectAffectedApps(filePaths, options = {}) {
  const graph =
    options.graph ?? loadWorkspaceGraph(options.repoRoot ?? REPO_ROOT);
  const affected = new Set();

  for (const rawPath of filePaths) {
    const filePath = normalizePath(rawPath.trim());
    if (!filePath) {
      continue;
    }

    if (
      ALL_APPS_FILES.has(filePath) ||
      /^tsconfig(?:\.[^/]+)?\.json$/.test(filePath)
    ) {
      return [...APP_ORDER];
    }

    if (filePath.startsWith("photos/")) {
      affected.add("web");
      continue;
    }

    if (
      filePath.startsWith("apps/mobile/") ||
      filePath.startsWith("packages/ui-native/")
    ) {
      continue;
    }

    if (filePath.startsWith("packages/")) {
      const workspacePackage = findPackageByPath(filePath, graph.packages);
      if (!workspacePackage) {
        return [...APP_ORDER];
      }

      for (const appName of collectApplicationDependents(
        workspacePackage.name,
        graph,
      )) {
        affected.add(appName);
      }
      continue;
    }

    const workspacePackage = findPackageByPath(filePath, graph.packages);
    const appName = workspacePackage
      ? APP_PACKAGE_NAMES.get(workspacePackage.name)
      : undefined;
    if (appName) {
      affected.add(appName);
    }
  }

  return APP_ORDER.filter((appName) => affected.has(appName));
}

export function changedFilesBetween(base, head = "HEAD", repoRoot = REPO_ROOT) {
  if (!base || /^0+$/.test(base)) {
    return { files: [], fallbackAll: true };
  }

  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACDMRTUXB", base, head],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    return {
      files: output.split(/\r?\n/).filter(Boolean),
      fallbackAll: false,
    };
  } catch {
    return { files: [], fallbackAll: true };
  }
}

function parseArguments(argv) {
  const options = {
    base: undefined,
    head: "HEAD",
    files: [],
    format: "csv",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--base") {
      options.base = value;
      index += 1;
    } else if (argument === "--head") {
      options.head = value;
      index += 1;
    } else if (argument === "--file") {
      options.files.push(value);
      index += 1;
    } else if (argument === "--format") {
      options.format = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function printResult(apps, format) {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(apps)}\n`);
  } else if (format === "lines") {
    process.stdout.write(apps.length > 0 ? `${apps.join("\n")}\n` : "");
  } else if (format === "csv") {
    process.stdout.write(`${apps.join(",")}\n`);
  } else {
    throw new Error(`Unsupported format: ${format}`);
  }
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  let apps;

  if (options.files.length > 0) {
    apps = detectAffectedApps(options.files);
  } else {
    const changes = changedFilesBetween(options.base, options.head);
    apps = changes.fallbackAll
      ? [...APP_ORDER]
      : detectAffectedApps(changes.files);
  }

  printResult(apps, options.format);
}

const isDirectExecution =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
