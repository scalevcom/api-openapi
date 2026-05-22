import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";

const apiOpenapiRoot = resolve(
  process.env.API_OPENAPI_ROOT || resolve(import.meta.dirname, "..")
);
const nexusRoot = resolve(
  apiOpenapiRoot,
  process.env.NEXUS_REPO_DIR || "../nexus"
);

const nexusRouteTestPath = resolvePath(
  nexusRoot,
  process.env.NEXUS_ROUTE_TEST_PATH || "test/scalev_api_web/controllers/v3_route_aliases_test.exs"
);
const openapiPath = resolvePath(
  apiOpenapiRoot,
  process.env.OPENAPI_SPEC_PATH || "specs/v3/openapi.yaml"
);

const nexusRouteTest = readFileSync(nexusRouteTestPath, "utf8");
const openapi = YAML.parse(readFileSync(openapiPath, "utf8"));

const allowedBlock = nexusRouteTest.match(
  /@allowed_dash_only_v3_routes\s+\[([\s\S]*?)\n\s*\]/m
);

if (!allowedBlock) {
  throw new Error(
    `Could not find @allowed_dash_only_v3_routes in ${nexusRouteTestPath}`
  );
}

const allowedDashOnlyRoutes = Array.from(
  allowedBlock[1].matchAll(/\{:(get|post|put|patch|delete),\s*"([^"]+)"\}/g),
  ([, method, phoenixPath]) => ({
    method,
    phoenixPath,
    openapiPath: phoenixPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}"),
  })
);

if (allowedDashOnlyRoutes.length === 0) {
  throw new Error(
    `No dash-only /v3 route pairs were parsed from ${nexusRouteTestPath}`
  );
}

const leakedRoutes = allowedDashOnlyRoutes.filter(({ method, openapiPath }) => {
  return Boolean(openapi.paths?.[openapiPath]?.[method]);
});

if (leakedRoutes.length > 0) {
  const formatted = leakedRoutes
    .map(({ method, phoenixPath }) => `- ${method.toUpperCase()} ${phoenixPath}`)
    .join("\n");

  throw new Error(
    `Dashboard-only /v3 routes must not appear in specs/v3/openapi.yaml:\n${formatted}`
  );
}

console.log(
  `No dashboard-only /v3 route leakage found (${allowedDashOnlyRoutes.length} guarded routes checked).`
);

function resolvePath(root, path) {
  return resolve(root, path);
}
