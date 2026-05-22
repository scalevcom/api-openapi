import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT_PATH = resolve(import.meta.dirname, "check-dash-only-leakage.mjs");

const passing = runFixture({
  "/v3/pages": {
    get: {
      summary: "List public business pages"
    }
  }
});

if (passing.status !== 0) {
  throw new Error(`Expected non-leaking fixture to pass:\n${passing.stderr || passing.stdout}`);
}

const leaking = runFixture({
  "/v3/webhook-endpoints/{id}": {
    patch: {
      summary: "Dashboard-only webhook endpoint update"
    }
  }
});

if (leaking.status === 0) {
  throw new Error("Expected leaking fixture to fail, but it passed.");
}

if (!leaking.stderr.includes("PATCH /v3/webhook-endpoints/:id")) {
  throw new Error(`Expected leaking fixture to report PATCH path conversion:\n${leaking.stderr}`);
}

console.log("Dash-only leakage fixture tests passed.");

function runFixture(paths) {
  const root = mkdtempSync(join(tmpdir(), "api-openapi-dash-only-"));
  const apiRoot = join(root, "api-openapi");
  const nexusRoot = join(root, "nexus");

  try {
    writeFile(
      join(nexusRoot, "test/scalev_api_web/controllers/v3_route_aliases_test.exs"),
      `defmodule ScalevApiWeb.V3RouteAliasesTest do
  @allowed_dash_only_v3_routes [
    {:get, "/v3/oauth/authorize"},
    {:post, "/v3/oauth/authorize/approve"},
    {:patch, "/v3/webhook-endpoints/:id"}
  ]
end
`
    );

    writeFile(
      join(apiRoot, "specs/v3/openapi.yaml"),
      `openapi: 3.1.0
info:
  title: Fixture
  version: 1.0.0
paths:
${yamlPaths(paths)}
`
    );

    return spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: apiRoot,
      env: {
        ...process.env,
        API_OPENAPI_ROOT: apiRoot,
        NEXUS_REPO_DIR: nexusRoot
      },
      encoding: "utf8"
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function yamlPaths(paths) {
  return Object.entries(paths)
    .map(([path, operations]) => {
      const operationYaml = Object.entries(operations)
        .map(([method, operation]) => {
          return `    ${method}:
      summary: ${JSON.stringify(operation.summary)}
      responses:
        "200":
          description: OK`;
        })
        .join("\n");

      return `  ${JSON.stringify(path)}:\n${operationYaml}`;
    })
    .join("\n");
}
