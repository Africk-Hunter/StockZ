import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Each scenario boots the real page modules in a fresh Node process against a
// fake DOM/Firebase/XHR (see tests/smoke/) and drives the page like a user.
const SCENARIOS = [
  "login",
  "login-already-signed-in",
  "main",
  "ticker-info",
  "ticker-path-uncached",
  "ticker-signed-out",
  "watchlist",
  "watchlist-bulk-add",
  "watchlist-export",
];

// --import needs a URL on Windows (a bare D:... path parses as scheme "d:").
const register = new URL("./smoke/register.mjs", import.meta.url).href;
const runner = fileURLToPath(new URL("./smoke/run-scenario.mjs", import.meta.url));

for (const name of SCENARIOS) {
  test(`smoke: ${name}`, () => {
    const result = spawnSync(process.execPath, ["--import", register, runner, name], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
