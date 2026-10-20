import assert from "node:assert/strict";
import * as config from "../src/config.mjs";
import * as ansi from "../src/ui/ansi.mjs";
import * as primitives from "../src/ui/primitives.mjs";
import * as git from "../src/collectors/git.mjs";
import * as herdr from "../src/collectors/herdr.mjs";
import * as tree from "../src/collectors/tree.mjs";
import * as engram from "../src/collectors/engram.mjs";
import * as opencode from "../src/collectors/opencode.mjs";
import * as quotas from "../src/collectors/quotas.mjs";
import * as cleanup from "../src/actions/session-cleanup.mjs";
import * as keyboard from "../src/actions/keyboard.mjs";
import * as renderer from "../src/ui/renderer.mjs";
import * as index from "../src/index.mjs";

console.log("=== RUNNING MODULAR SMOKE TESTS ===");

// 1. Config test
assert.ok(config.BORDER.includes("\x1b[38;2;120;75;160m"), "BORDER color match");
assert.ok(config.RESET === "\x1b[0m", "RESET code match");
assert.ok(typeof config.QUOTA_URL === "string", "QUOTA_URL should be string");
assert.ok(typeof config.getVendorMark === "function", "getVendorMark is function");
const vMark = config.getVendorMark("claude");
assert.equal(vMark.name, "Claude");
console.log("✓ Config verified");

// 2. ANSI test
assert.equal(ansi.charWidth(0x41), 1); // 'A'
assert.equal(ansi.charWidth(0x1F600), 2); // 😀
assert.equal(ansi.stripAnsi("\x1b[31mhello\x1b[0m"), "hello");
assert.equal(ansi.stringWidth("hello"), 5);
assert.equal(ansi.formatTokenCount(1500), "1.5k");
assert.equal(ansi.formatTokenCount(2500000), "2.5M");
assert.equal(ansi.formatCost(0.1234), "$0.123");
const qThreshold = ansi.getQuotaThreshold(10);
assert.equal(qThreshold.level, "critical");
const pace = ansi.calculateQuotaPace(80, "5h", new Date(Date.now() + 4 * 3600 * 1000).toISOString());
assert.ok(pace !== null);
console.log("✓ ANSI verified");

// 3. Primitives test
const width = 46;
const top = primitives.drawTop("Test Card", false, width);
assert.ok(top.includes("Test Card"));
assert.ok(top.includes("╭─"));
const bot = primitives.drawBottom(width);
assert.ok(bot.includes("╰─"));
const row = primitives.drawRow("Left", "Right", width);
assert.ok(row.includes("Left") && row.includes("Right"));
const gauge = primitives.renderGaugeInline(50, 10, ansi.getQuotaThreshold(50).color);
assert.ok(gauge.includes("━"));
console.log("✓ Primitives verified");

// 4. Git Collector test
const gitData = git.getGitData(process.cwd());
assert.ok(typeof gitData.branch === "string");
assert.ok(typeof gitData.isClean === "boolean");
const coloredLine = git.colorizeGitGraphLine("* 1234567 commit msg");
assert.ok(coloredLine.includes("1234567"));
console.log("✓ Git Collector verified");

// 5. Herdr Collector test
const herdrData = herdr.getHerdrPanesData();
assert.ok(Array.isArray(herdrData.panes));
console.log("✓ Herdr Collector verified");

// 6. Tree Collector test
const treeData = tree.getProjectTreeData(process.cwd());
assert.ok(treeData.totalFiles >= 0);
assert.ok(Array.isArray(treeData.tree));
console.log("✓ Tree Collector verified");

// 7. Engram Collector test
const engramData = engram.getEngramData("sidebarherdropencode", process.cwd());
assert.ok(engramData.project === "sidebarherdropencode");
console.log("✓ Engram Collector verified");

// 8. OpenCode Collector test
const contextLimit = opencode.resolveModelContextLimit("gemini-3.8-flash-high");
assert.equal(contextLimit, 1_000_000);
const mcpList = opencode.getMcpData(process.cwd());
assert.ok(Array.isArray(mcpList));
const prefix = opencode.extractAccountPrefix("sdd-orchestrator-xen1", null, [{ prefix: "xen1" }]);
assert.equal(prefix, "xen1");
console.log("✓ OpenCode Collector verified");

// 9. Quotas Collector test
const discovered = quotas.discoverAccounts([]);
assert.ok(Array.isArray(discovered));
console.log("✓ Quotas Collector verified (found", discovered.length, "accounts)");

// 10. Actions test
const healthy = cleanup.getBestHealthyTargetPrefix(discovered, { allActivePrefixes: new Set() });
assert.ok(typeof healthy === "string");
console.log("✓ Actions verified (best target:", healthy, ")");

// 11. Keyboard Handler test
let exited = false;
let scrollVal = 0;
keyboard.handleInput(Buffer.from("q"), {
  getScrollOffset: () => scrollVal,
  setScrollOffset: (v) => { scrollVal = v; },
  collapsedCards: {},
  onExit: () => { exited = true; },
  scheduleRender: () => {},
});
assert.equal(exited, true);

keyboard.handleInput(Buffer.from("j"), {
  getScrollOffset: () => scrollVal,
  setScrollOffset: (v) => { scrollVal = v; },
  collapsedCards: {},
  scheduleRender: () => {},
});
assert.equal(scrollVal, 1);
console.log("✓ Keyboard dispatcher verified");

// 12. Renderer test
const origWrite = process.stdout.write;
let renderOutput = "";
process.stdout.write = (chunk) => {
  renderOutput += chunk;
  return true;
};
try {
  const renderRes = renderer.renderScreen({
    cols: 46,
    rows: 32,
    collapsedCards: config.DEFAULT_COLLAPSED_CARDS,
    scrollOffset: 0,
    accountsList: discovered,
    opencode: {
      agent: "sdd-orchestrator",
      model: "gemini-3.8-flash-high",
      modelShort: "gemini-3.8-flash-high",
      tokensInput: 1000,
      tokensOutput: 500,
      activeTurnContextTokens: 1500,
      cost: 0.05,
      tools: { read: 1, write: 1, bash: 2, engram: 1, other: 0, total: 5 },
      activeDirectory: process.cwd(),
      allActivePrefixes: new Set(["xen1"]),
      lastUpdatedTurn: 0,
      agentStatus: "idle",
      attributedChanges: { files: new Set(["test.mjs"]), additions: 10, deletions: 2 },
    },
    git: gitData,
    engram: engramData,
    mcpList,
    projectTreeData: treeData,
    targetDir: process.cwd(),
  });
  assert.ok(renderRes.cardLineBounds.length > 0);
  assert.ok(renderOutput.includes("OPENCODE"));
  assert.ok(renderOutput.includes("Estado"));
  assert.ok(renderOutput.includes("Contexto"));
  assert.ok(renderOutput.includes("Proyecto"));
  assert.ok(renderOutput.includes("Integraciones"));

  // 12B. Test SDD Mono-modelo (nina) vs SDD Multi-modelo (claude-1)
  const mockNinaAccounts = discovered.map((acc) => {
    if (acc.prefix === "nina") {
      return {
        ...acc,
        pools: [
          { label: "Gemini Wk", percent: 100, pace: { color: "", text: "↑10%" }, reset: "en 6d 7h" },
          { label: "Gemini 5h", percent: 100, pace: { color: "", text: "~0%" }, reset: "en 4h 59m" },
          { label: "Claude Wk", percent: 100, pace: { color: "", text: "~0%" }, reset: "en 6d 23h" },
          { label: "Claude 5h", percent: 100, pace: { color: "", text: "~0%" }, reset: "en 4h 59m" },
        ],
      };
    }
    return acc;
  });

  renderOutput = "";
  renderer.renderScreen({
    cols: 46,
    rows: 40,
    collapsedCards: config.DEFAULT_COLLAPSED_CARDS,
    scrollOffset: 0,
    accountsList: mockNinaAccounts,
    opencode: {
      agent: "sdd-orchestrator-nina",
      model: "cliproxy/nina/gemini-3.8-flash-high",
      modelShort: "gemini-3.8-flash-high",
      localPrefix: "nina",
      allActivePrefixes: new Set(["clas", "gianni", "nina", "portafolio"]),
      attributedChanges: { files: new Set() },
    },
    git: gitData,
    engram: engramData,
    mcpList,
    projectTreeData: treeData,
    targetDir: process.cwd(),
  });
  assert.ok(renderOutput.includes("SDD Mono-modelo"), "Must render SDD Mono-modelo for nina");
  assert.ok(renderOutput.includes("nina"), "Must reference nina account");
  assert.ok(renderOutput.includes("Gemini Wk"), "Must contain Gemini Wk pool");
  assert.ok(renderOutput.includes("Claude 5h"), "Must contain Claude 5h pool");
  assert.ok(!renderOutput.includes("SDD Multi-modelo"), "Must NOT render SDD Multi-modelo for nina");

  // Multi-modelo check for claude-1
  const mockAllPools = discovered.map((acc) => ({
    ...acc,
    pools: [
      { label: "Claude 5h", percent: 100, pace: { color: "", text: "~0%" }, reset: "en 4h 59m" },
    ],
  }));

  renderOutput = "";
  renderer.renderScreen({
    cols: 46,
    rows: 40,
    collapsedCards: config.DEFAULT_COLLAPSED_CARDS,
    scrollOffset: 0,
    accountsList: mockAllPools,
    opencode: {
      agent: "sdd-orchestrator-claude-1",
      model: "cliproxy/claude-opus-4-6-thinking",
      modelShort: "claude-opus-4-6-thinking",
      localPrefix: null,
      allActivePrefixes: new Set(["clas", "gianni", "nina", "portafolio"]),
      attributedChanges: { files: new Set() },
    },
    git: gitData,
    engram: engramData,
    mcpList,
    projectTreeData: treeData,
    targetDir: process.cwd(),
  });
  assert.ok(renderOutput.includes("SDD Multi-modelo"), "Must render SDD Multi-modelo for claude-1");
  assert.ok(renderOutput.includes("cuentas"), "Must include cuentas badge");
} finally {
  process.stdout.write = origWrite;
}
console.log("✓ Screen renderer verified");

// 13. Index exports test
assert.ok(typeof index.startSidebar === "function");
assert.ok(typeof index.getGitData === "function");
assert.ok(typeof index.refreshGitDataAsync === "function");
assert.ok(typeof index.getHerdrPanesData === "function");
assert.ok(typeof index.refreshHerdrPanesAsync === "function");
assert.ok(typeof index.resolveOpencodeDbPath === "function");
assert.ok(typeof index.resolveEngramDbPath === "function");
assert.ok(typeof index.QUOTA_URL === "string");
console.log("✓ Index exports verified");

console.log("\nALL MODULAR SMOKE TESTS PASSED!");
