#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GENTLE-AI · OPENCODE HUD SIDEBAR (Linear & Anti-Slop Architecture)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Arquitectura de alto rendimiento inspirada en el Catálogo de Herramientas:
 *   - Sección 10: Sistema de diseño Anti-Slop & Linear (densidad, sobriedad técnica)
 *   - Sección 14: Optimizaciones IPC / SQLite / Caching reactivo (Event-driven)
 *
 *  Características clave:
 *   1. Snapshot + Reactive Polling: Barrido general inicial, sondeo activo de 2m
 *      exclusivo para la(s) cuenta(s) en uso, y refresco instantáneo al terminar turnos.
 *   2. Marcos matemáticos indestructibles a 46-50 columnas (cero line-wrap).
 *   3. Soporte para múltiples sesiones simultáneas en Herdr (múltiples marcadores ▸).
 *   4. Sistema progresivo de alerta en cascada: Aviso preventivo al 70%, Crítico al 85%.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { syncIntegrationsAndOrchestrators } from "./sync-integrations.mjs";

// ============================================================================
// PALETA LINEAR / TUI (Truecolor 24-bit ANSI)
// ============================================================================
const BORDER = "\x1b[38;2;120;75;160m";        // #784ba0 (violeta estructural sobrio)
const BORDER_MUTED = "\x1b[38;2;70;45;95m";    // #462d5f (separadores sutiles)
const ACCENT_PRIMARY = "\x1b[38;2;123;138;255m"; // #7B8AFF (periwinkle Linear)
const ACCENT_PINK = "\x1b[38;2;240;149;200m";    // #F095C8 (indicador activo ▸)
const GOLD = "\x1b[38;2;224;194;122m";           // #E0C27A (etiquetas, números destacados)
const AMBER = "\x1b[38;2;242;184;109m";          // #F2B86D (aviso 70%+, git mod)
const MINT = "\x1b[38;2;76;183;130m";            // #4CB782 (Linear success green)
const CORAL = "\x1b[38;2;235;87;87m";            // #EB5757 (Linear error / crítico 85%+)
const TEXT_PRIMARY = "\x1b[38;2;247;248;248m";   // #F7F8F8 (off-white texto principal)
const TEXT_MUTED = "\x1b[38;2;138;143;152m";     // #8A8F98 (Linear muted secondary)
const TEXT_DIM = "\x1b[38;2;90;94;102m";         // #5A5E66 (detalles tenues)
const CYAN = "\x1b[38;2;139;233;253m";           // #8BE9FD (Dracula cyan)
const MAGENTA = "\x1b[38;2;189;147;249m";        // #BD93F9 (Dracula purple)
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// ============================================================================
// CONFIGURACION Y RUTAS LOCALES (Portables & Agnosticas)
// ============================================================================
function resolveAuthsDir() {
  const candidates = [
    process.env.CLIPROXY_AUTHS_DIR,
    path.join(os.homedir(), ".cliproxy", "auths"),
    path.join(os.homedir(), "cliproxyapi", "auths"),
    "D:/DocumentosDiscoD/cliproxyapi/auths",
    "C:/cliproxyapi/auths",
    "D:/cliproxyapi/auths",
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return process.env.CLIPROXY_AUTHS_DIR || path.join(os.homedir(), ".cliproxy", "auths");
}

const AUTHS_DIR = resolveAuthsDir();
const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const USER_AGENT = "antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)";
const POLL_INTERVAL_MS = 120_000; // 2 minutos para el sondeo pasivo

function resolveEngramDbPath() {
  const candidates = [
    process.env.ENGRAM_DATA_DIR ? path.join(process.env.ENGRAM_DATA_DIR, "engram.db") : null,
    "D:/.engram/engram.db",
    "C:/.engram/engram.db",
    path.join(os.homedir(), ".engram", "engram.db"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return path.join(os.homedir(), ".engram", "engram.db");
}

function resolveModelsCachePath() {
  const candidates = [
    process.env.XDG_CACHE_HOME ? path.join(process.env.XDG_CACHE_HOME, "opencode", "models.json") : null,
    path.join(os.homedir(), ".cache", "opencode", "models.json"),
    path.join(os.homedir(), ".opencode", "models.json"),
    path.join(os.homedir(), ".config", "opencode", "models.json"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return path.join(os.homedir(), ".cache", "opencode", "models.json");
}

function resolveOpencodeDbPath() {
  const candidates = [
    process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, "opencode", "opencode.db") : null,
    "D:/.local/share/opencode/opencode.db",
    path.join(os.homedir(), ".local/share/opencode/opencode.db"),
    path.join(os.homedir(), ".local", "share", "opencode", "opencode.db"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return path.join(os.homedir(), ".local/share/opencode/opencode.db");
}

const OPENCODE_DB_PATH = resolveOpencodeDbPath();
const MODELS_CACHE_PATH = resolveModelsCachePath();
const ENGRAM_DB_PATH = resolveEngramDbPath();

// ============================================================================
// ESTADO GLOBAL & CACHE
// ============================================================================
const accountsList = [];
let lastUpdatedTime = "";
let isFetchingQuotas = false;
let isInitialFetch = true;
let lastKnownTurnTime = 0;
let scrollOffset = 0;
let renderTimer = null;
let flashNotice = null;
let flashNoticeTimer = null;
let pendingMigrationTarget = null; // Encolado para cuando el turno pase a idle

// Estado de acordeón colapsable para cada tarjeta
const collapsedCards = {
  estado: false,
  contexto: false,
  proyecto: true,
  integraciones: false,
  pools: false,
  git: false,
  engram: false,
  tools: false,
  mcp: false,
};
let cardLineBounds = [];

// ============================================================================
// MOTOR DE MEDICION UNICODE A PRUEBA DE DESBORDES (ZERO-WRAPPING)
// ============================================================================
function charWidth(codePoint) {
  if (!codePoint) return 0;
  // Modificadores de variación y espacios de ancho cero
  if (codePoint === 0xFE0F || codePoint === 0xFE0E || (codePoint >= 0x200B && codePoint <= 0x200D)) {
    return 0;
  }
  // ASCII estándar imprimible
  if (codePoint >= 0x20 && codePoint <= 0x7E) {
    return 1;
  }
  if (codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F)) {
    return 0;
  }
  // Caracteres anchos (Emojis, Ideogramas CJK, Fullwidth)
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115F) ||
    codePoint === 0x2329 || codePoint === 0x232A ||
    (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F) ||
    (codePoint >= 0xAC00 && codePoint <= 0xD7A3) ||
    (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
    (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
    (codePoint >= 0xFE30 && codePoint <= 0xFE6F) ||
    (codePoint >= 0xFF00 && codePoint <= 0xFF60) ||
    (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
    (codePoint >= 0x1F300 && codePoint <= 0x1F64F) ||
    (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) ||
    (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
    (codePoint >= 0x1FA00 && codePoint <= 0x1FA6F) ||
    (codePoint >= 0x1FA70 && codePoint <= 0x1FAFF) ||
    (codePoint >= 0x20000 && codePoint <= 0x3FFFD)
  ) {
    return 2;
  }
  return 1;
}

function stringWidth(str) {
  if (!str) return 0;
  const clean = str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  let w = 0;
  for (const char of clean) {
    w += charWidth(char.codePointAt(0));
  }
  return w;
}

function truncateToWidth(str, maxWidth) {
  if (!str || maxWidth <= 0) return "";
  let currentWidth = 0;
  let result = "";
  const tokens = str.match(/\x1b\[[0-9;?]*[a-zA-Z]|./gsu) || [];
  for (const token of tokens) {
    if (token.startsWith("\x1b")) {
      result += token;
      continue;
    }
    const cw = charWidth(token.codePointAt(0));
    if (currentWidth + cw > maxWidth) break;
    currentWidth += cw;
    result += token;
  }
  return result + RESET;
}

function formatTokenCount(num) {
  if (!Number.isFinite(num) || num <= 0) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
  return num.toString();
}

function formatCost(num) {
  if (!Number.isFinite(num) || num <= 0) return "$0.000";
  return `$${num.toFixed(3)}`;
}

function getQuotaThreshold(availablePercent) {
  const rounded = Math.round(availablePercent);
  if (rounded <= 15) return { color: (s) => `${CORAL}${s}${RESET}`, colorRaw: CORAL, level: "critical", label: "Crítico" };
  if (rounded <= 30) return { color: (s) => `${AMBER}${s}${RESET}`, colorRaw: AMBER, level: "alert", label: "Aviso 70%+" };
  if (rounded < 65) return { color: (s) => `${GOLD}${s}${RESET}`, colorRaw: GOLD, level: "medium", label: "Medio" };
  return { color: (s) => `${MINT}${s}${RESET}`, colorRaw: MINT, level: "optimal", label: "Óptimo" };
}

function formatRelativeReset(resetAt, now = Date.now()) {
  if (!resetAt) return "";
  const date = new Date(resetAt);
  const ms = date.getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "reseteando…";

  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `en ${totalMins}m`;

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) return mins > 0 ? `en ${hours}h ${mins}m` : `en ${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `en ${days}d ${remHours}h` : `en ${days}d`;
}

/**
 * Pacing de cuota inspirado en levi-qiao/herdr-agent-usage:
 * Compara el % de cuota consumida contra la proporción de tiempo transcurrido en la ventana.
 * Pacing = (100 - remPercent) - elapsedPercent
 * Si pacing > +5%: quemando por encima del ritmo (↓ negativo o sobregiro).
 * Si pacing < -5%: consumo holgado, buen margen (↑ positivo).
 */
function calculateQuotaPace(remPercent, windowType, resetAt, now = Date.now()) {
  if (!resetAt || typeof remPercent !== "number") return null;
  const resetMs = new Date(resetAt).getTime();
  if (Number.isNaN(resetMs)) return null;

  const windowMs = windowType === "weekly" ? 7 * 24 * 3600 * 1000 : 5 * 3600 * 1000;
  const remainingMs = resetMs - now;
  if (remainingMs <= 0 || remainingMs > windowMs) return null;

  const elapsedMs = windowMs - remainingMs;
  const elapsedPercent = (elapsedMs / windowMs) * 100;
  const usedPercent = 100 - remPercent;
  const paceDiff = Math.round(usedPercent - elapsedPercent);

  // Formato compacto: ↓12% si va gastando más rápido de lo regenerable, ↑8% si tiene margen
  if (paceDiff > 5) {
    return { diff: paceDiff, text: `↓${paceDiff}%`, color: CORAL };
  } else if (paceDiff < -5) {
    const headroom = Math.abs(paceDiff);
    return { diff: paceDiff, text: `↑${headroom}%`, color: MINT };
  }
  return { diff: paceDiff, text: `~0%`, color: GOLD };
}

let modelsCacheData = null;
let modelsCacheMtime = 0;

function resolveModelContextLimit(modelId, providerId = null) {
  const fallback = 1_000_000;
  if (!modelId) return fallback;

  try {
    if (fs.existsSync(MODELS_CACHE_PATH)) {
      const stats = fs.statSync(MODELS_CACHE_PATH);
      if (stats.size <= 8 * 1024 * 1024) { // Límite de seguridad de 8 MB
        if (!modelsCacheData || stats.mtimeMs !== modelsCacheMtime) {
          modelsCacheData = JSON.parse(fs.readFileSync(MODELS_CACHE_PATH, "utf8"));
          modelsCacheMtime = stats.mtimeMs;
        }
      }
    }

    if (modelsCacheData) {
      const cleanModel = modelId.split("/").pop().toLowerCase();
      // 1. Si se conoce el proveedor exacto
      if (providerId && modelsCacheData[providerId]?.models) {
        for (const [mKey, mVal] of Object.entries(modelsCacheData[providerId].models)) {
          if (mKey.toLowerCase() === cleanModel && mVal?.limit?.context) {
            return mVal.limit.context;
          }
        }
      }
      // 2. Búsqueda en todos los proveedores registrados
      for (const pKey of Object.keys(modelsCacheData)) {
        const pModels = modelsCacheData[pKey]?.models;
        if (pModels) {
          for (const [mKey, mVal] of Object.entries(pModels)) {
            if ((mKey.toLowerCase() === cleanModel || mKey.toLowerCase().includes(cleanModel) || cleanModel.includes(mKey.toLowerCase())) && mVal?.limit?.context) {
              return mVal.limit.context;
            }
          }
        }
      }
    }
  } catch {}

  // Fallback heurístico según familia de modelo
  const lower = modelId.toLowerCase();
  if (lower.includes("gemini") || lower.includes("flash") || lower.includes("pro")) return 1_000_000;
  if (lower.includes("claude-3-5") || lower.includes("claude-3.5") || lower.includes("haiku")) return 200_000;
  if (lower.includes("sonnet-4") || lower.includes("opus-4")) return 1_000_000;
  if (lower.includes("deepseek")) return 1_000_000;
  if (lower.includes("qwen")) return 128_000;
  return fallback;
}

// ============================================================================
// PROVEEDORES DE DATOS NATIVOS
// ============================================================================

// 1. Git Status & Log Graph (Sintaxis Dracula) con Cache de 10s para evitar bloquear el event loop
let cachedGitData = null;
let cachedGitDir = null;
let cachedGitTime = 0;
const GIT_CACHE_TTL_MS = 10_000;

function getGitData(targetDir, force = false) {
  const now = Date.now();
  if (!force && cachedGitData && cachedGitDir === targetDir && now - cachedGitTime < GIT_CACHE_TTL_MS) {
    return cachedGitData;
  }

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: targetDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim() || "main";

    let modified = 0;
    let untracked = 0;
    let staged = 0;
    try {
      const statusOut = execSync("git status --porcelain=v1", {
        cwd: targetDir,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      }).trim();
      if (statusOut) {
        for (const line of statusOut.split("\n")) {
          const x = line[0];
          const y = line[1];
          if (x === "?" && y === "?") untracked++;
          else if (x !== " " && x !== "?") staged++;
          if (y !== " " && y !== "?") modified++;
        }
      }
    } catch {}

    let linesAdded = 0;
    let linesDeleted = 0;
    try {
      const diffOut = execSync("git diff HEAD --numstat", {
        cwd: targetDir,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      }).trim();
      if (diffOut) {
        for (const line of diffOut.split("\n")) {
          const parts = line.split("\t");
          if (parts.length >= 2) {
            const a = parseInt(parts[0], 10);
            const d = parseInt(parts[1], 10);
            if (!isNaN(a)) linesAdded += a;
            if (!isNaN(d)) linesDeleted += d;
          }
        }
      }
    } catch {}

    let graphLines = [];
    try {
      const logOut = execSync('git log --graph --oneline --decorate -n 3', {
        cwd: targetDir,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      }).trim();
      if (logOut) {
        graphLines = logOut.split("\n").filter((l) => l.trim().length > 0);
      }
    } catch {}

    const res = {
      branch,
      modified,
      untracked,
      staged,
      linesAdded,
      linesDeleted,
      graphLines,
      isClean: modified === 0 && untracked === 0 && staged === 0,
      hasGit: true,
    };
    cachedGitData = res;
    cachedGitDir = targetDir;
    cachedGitTime = now;
    return res;
  } catch {
    const fallback = {
      branch: "main",
      modified: 0,
      untracked: 0,
      staged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      graphLines: [],
      isClean: true,
      hasGit: false,
    };
    cachedGitData = fallback;
    cachedGitDir = targetDir;
    cachedGitTime = now;
    return fallback;
  }
}

function colorizeGitGraphLine(line) {
  if (!line || !line.trim()) return line;

  if (/^[\\/|_\s]+$/.test(line)) {
    return line.replace(/([\\/|_]+)/g, (m) => `${CYAN}${m}${RESET}`);
  }

  const m = /^([*\\/|_\s]*[*][*\\/|_\s]*)\s+([0-9a-f]{7,40})\s*(?:\(([^)]+)\))?\s*(.*)$/.exec(line);
  if (!m) {
    return line
      .replace(/(\*)/g, `${ACCENT_PRIMARY}*${RESET}`)
      .replace(/([\\/|_]+)/g, `${CYAN}$1${RESET}`);
  }

  const graphPart = m[1].replace(/(\*)/g, `${ACCENT_PRIMARY}*${RESET}`).replace(/([\\/|_]+)/g, `${CYAN}$1${RESET}`);
  const hash = `${GOLD}${m[2]}${RESET}`;
  let refs = "";
  if (m[3]) {
    const items = m[3].split(",").map((s) => {
      const tr = s.trim();
      if (tr.includes("HEAD")) return `${MINT}${tr}${RESET}`;
      if (tr.includes("origin") || tr.includes("upstream")) return `${MAGENTA}${tr}${RESET}`;
      return `${AMBER}${tr}${RESET}`;
    }).join(`${TEXT_DIM}, ${RESET}`);
    refs = ` ${TEXT_DIM}(${RESET}${items}${TEXT_DIM})${RESET}`;
  }
  const subject = m[4] ? ` ${TEXT_PRIMARY}${m[4]}${RESET}` : "";
  return `${graphPart} ${hash}${refs}${subject}`;
}

// ============================================================================
// EXPLORADOR DE PROYECTO / ARBOL DE DIRECTORIOS (2 NIVELES)
// ============================================================================
const PROJECT_TREE_IGNORED = new Set([
  ".git",
  "node_modules",
  "dist",
  ".cache",
  "build",
  ".next",
  ".turbo",
  ".idea",
  ".vscode",
  ".venv",
  "__pycache__",
  "coverage",
]);

function getProjectTreeData(targetDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(targetDir, { withFileTypes: true });
  } catch {
    return { rootPath: targetDir, totalDirs: 0, totalFiles: 0, tree: [] };
  }

  // Filtrar archivos ocultos (.*) y directorios pesados/ignorados
  const filtered = entries.filter((e) => !e.name.startsWith(".") && !PROJECT_TREE_IGNORED.has(e.name));

  filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  let totalDirs = 0;
  let totalFiles = 0;

  const tree = [];
  for (const item of filtered) {
    if (item.isDirectory()) {
      totalDirs++;
      const subDirPath = path.join(targetDir, item.name);
      let subChildren = [];
      try {
        const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
        const subFiltered = subEntries.filter((s) => !s.name.startsWith(".") && !PROJECT_TREE_IGNORED.has(s.name));
        subFiltered.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        for (const s of subFiltered) {
          if (s.isDirectory()) totalDirs++;
          else totalFiles++;
          subChildren.push({
            name: s.name,
            isDir: s.isDirectory(),
          });
        }
      } catch {}

      tree.push({
        name: item.name,
        isDir: true,
        children: subChildren,
      });
    } else {
      totalFiles++;
      tree.push({
        name: item.name,
        isDir: false,
        children: [],
      });
    }
  }

  return {
    rootPath: targetDir,
    totalDirs,
    totalFiles,
    tree,
  };
}

function openInFileExplorer(targetPath) {
  try {
    const absPath = path.resolve(targetPath);
    if (process.platform === "win32") {
      const winPath = absPath.replace(/\//g, "\\");
      execFileSync("explorer.exe", [winPath], { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      execFileSync("open", [absPath], { stdio: "ignore" });
    } else {
      execFileSync("xdg-open", [absPath], { stdio: "ignore" });
    }
    setFlashNotice(`+ Abierto en explorador: ${path.basename(absPath)}`);
  } catch (err) {
    setFlashNotice(`! Error abriendo carpeta: ${err.message}`);
  }
}

// ============================================================================
// RESOLUCION DE PREFIJOS DE CUENTA (MULTI-MODEL / JSON COMPLIANT)
// ============================================================================
function extractAccountPrefix(agentStr, modelStr) {
  // 1. Del agente (ej: sdd-orchestrator-xen1, sdd-apply-gianni, etc.)
  if (agentStr) {
    const m = (agentStr || "").match(/sdd-[a-z0-9]+-([a-z0-9_-]+)/i);
    if (m?.[1]) return m[1].toLowerCase();

    const lowerAgent = agentStr.toLowerCase();
    for (const acc of accountsList) {
      if (lowerAgent.includes(acc.prefix.toLowerCase())) {
        return acc.prefix.toLowerCase();
      }
    }
  }

  // 2. Del modelo (ej: {"id":"xen1/gemini-3.8-flash-high"}, "xen1/...", "cliproxy/xen1/...")
  if (modelStr) {
    let modelId = String(modelStr);
    try {
      const parsed = JSON.parse(modelStr);
      if (parsed.id) modelId = parsed.id;
    } catch {}

    const lowerModel = modelId.toLowerCase();
    const mMod = lowerModel.match(/(?:^|[/"'\\\\])([a-z0-9_-]+)\/(?:gemini|claude|antigravity|[a-z0-9.-]+)/i);
    if (mMod?.[1]) {
      const candidate = mMod[1].toLowerCase();
      if (candidate !== "cliproxy" && candidate !== "opencode") {
        return candidate;
      }
    }

    for (const acc of accountsList) {
      const pfx = acc.prefix.toLowerCase();
      const re = new RegExp(`(?:^|[/"'\\\\])${pfx}(?:[/_-]|$)`, "i");
      if (re.test(lowerModel)) {
        return pfx;
      }
    }
  }

  return null;
}

// Cache para consultas de panes de Herdr (reduce execSync masivo en cada render/ciclo)
let cachedHerdrPanes = null;
let cachedHerdrTime = 0;
const HERDR_CACHE_TTL_MS = 2_500;

function getHerdrPanesData(force = false) {
  const now = Date.now();
  if (!force && cachedHerdrPanes && now - cachedHerdrTime < HERDR_CACHE_TTL_MS) {
    return cachedHerdrPanes;
  }
  try {
    const listRaw = execSync("herdr pane list", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const listData = JSON.parse(listRaw);
    const panes = listData.result?.panes || [];
    let myPaneId = process.env.HERDR_PANE_ID || null;
    let myTabId = null;

    if (!myPaneId) {
      try {
        const curRaw = execSync("herdr pane current", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const curData = JSON.parse(curRaw);
        myPaneId = curData.result?.pane?.pane_id;
        myTabId = curData.result?.pane?.tab_id;
      } catch {}
    } else {
      const myPane = panes.find((p) => p.pane_id === myPaneId);
      myTabId = myPane?.tab_id;
    }

    cachedHerdrPanes = { panes, myPaneId, myTabId };
    cachedHerdrTime = now;
    return cachedHerdrPanes;
  } catch {
    return { panes: [], myPaneId: null, myTabId: null };
  }
}

// 2. OpenCode Session, Context, Multi-Pane Herdr & Tool Telemetry
function getOpenCodeSessionData() {
  const result = {
    agent: "sdd-orchestrator",
    model: "gemini-3.8-flash-high",
    modelShort: "gemini-3.8-flash-high",
    tokensInput: 0,
    tokensOutput: 0,
    activeTurnContextTokens: 0,
    cost: 0,
    tools: { read: 0, write: 0, bash: 0, engram: 0, other: 0, total: 0 },
    activeDirectory: process.cwd(),
    allActivePrefixes: new Set(),
    lastUpdatedTurn: 0,
    agentStatus: "idle", // 'working' | 'idle' estilo petal de gentle-shell
    attributedChanges: {
      files: new Set(),
      additions: 0,
      deletions: 0,
    },
  };

  try {
    if (!fs.existsSync(OPENCODE_DB_PATH)) return result;
    const db = new DatabaseSync(OPENCODE_DB_PATH, { open: true, readOnly: true });

    let targetSession = null;

    // A. Consultamos el mapa en vivo de Herdr para descubrir todos los panes activos
    try {
      const { panes, myPaneId, myTabId } = getHerdrPanesData();

      // Recolectar todas las cuentas en uso a lo largo de TODOS los panes abiertos
      for (const p of panes) {
        const sesId = p.agent_session?.value;
        if (sesId) {
          const s = db.prepare("SELECT agent, model, time_archived, time_updated FROM session_v2 WHERE id = ?").get(sesId);
          if (s) {
            // Una sesión en un pane de Herdr se considera activa si:
            // 1. time_archived es null (nunca archivada)
            // 2. Tuvo actividad posterior a cuando se archivó (time_updated > time_archived)
            // 3. El agente está trabajando en este momento (p.agent_status === 'working')
            // 4. O es el tab/espacio local donde estamos parados
            const isAlive = !s.time_archived || (s.time_updated && s.time_updated > s.time_archived) || p.agent_status === "working" || (myTabId && p.tab_id === myTabId);
            if (isAlive) {
              const pfx = extractAccountPrefix(s.agent, s.model);
              if (pfx) {
                result.allActivePrefixes.add(pfx);
              }
            }
          }
        }
      }

      // El pane prioritario para la tarjeta Status es el compañero en el mismo tab
      const siblingPane = myTabId ? panes.find((p) => p.tab_id === myTabId && p.pane_id !== myPaneId && p.agent_session?.value) : null;
      const focusedPane = panes.find((p) => p.focused && p.agent_session?.value);
      const workingPane = panes.find((p) => p.agent_status === "working" && p.agent_session?.value);

      const primaryPane = siblingPane || focusedPane || workingPane;
      if (primaryPane?.agent_session?.value) {
        targetSession = db.prepare("SELECT * FROM session_v2 WHERE id = ?").get(primaryPane.agent_session.value);
        if (primaryPane.agent_status) {
          result.agentStatus = primaryPane.agent_status;
        }
      }
    } catch {}

    // B. Fallback: sesión que coincida con el directorio actual (cwd)
    if (!targetSession) {
      const normalizedCwd = cwd.replace(/\\/g, "/");
      targetSession = db.prepare(`
        SELECT * FROM session_v2 
        WHERE (directory = ? OR directory = ?)
        ORDER BY time_updated DESC LIMIT 1
      `).get(cwd, normalizedCwd);

      if (!targetSession) {
        targetSession = db.prepare(`
          SELECT * FROM session_v2 
          ORDER BY time_updated DESC LIMIT 1
        `).get();
      }
    }

    if (targetSession) {
      if (targetSession.agent) result.agent = targetSession.agent;
      if (targetSession.directory) result.activeDirectory = targetSession.directory;
      result.tokensInput = targetSession.tokens_input || 0;
      result.tokensOutput = targetSession.tokens_output || 0;
      result.cost = targetSession.cost || 0;
      result.lastUpdatedTurn = targetSession.time_updated || 0;

      // Asegurar que la cuenta del espacio local SIEMPRE esté registrada como activa
      const localPfx = extractAccountPrefix(targetSession.agent, targetSession.model);
      if (localPfx) {
        result.allActivePrefixes.add(localPfx);
      }

      if (targetSession.model) {
        try {
          const parsed = JSON.parse(targetSession.model);
          result.model = parsed.id || targetSession.model;
        } catch {
          result.model = targetSession.model;
        }
        result.modelShort = result.model.split("/").pop();
      }

      // Tokens del turno activo desde session_message
      // Siguiendo la fórmula exacta de levi-qiao/herdr-agent-usage y OpenCode 2:
      // contextTokens = input + output + reasoning + cache.read + cache.write
      try {
        const lastMsg = db.prepare(`
          SELECT type, data FROM session_message 
          WHERE session_id = ? AND type = 'assistant' 
          ORDER BY seq DESC LIMIT 1
        `).get(targetSession.id);

        if (lastMsg) {
          const d = JSON.parse(lastMsg.data);
          if (d?.tokens) {
            const inp = d.tokens.input || 0;
            const out = d.tokens.output || 0;
            const reasoning = d.tokens.reasoning || 0;
            const cacheRead = d.tokens.cache?.read || 0;
            const cacheWrite = d.tokens.cache?.write || 0;
            result.activeTurnContextTokens = inp + out + reasoning + cacheRead + cacheWrite;
          }
        }
      } catch {}

      // Conteo de herramientas ejecutadas y Gentle Attributed Changes
      const rows = db.prepare(`
        SELECT data FROM session_message 
        WHERE session_id = ? AND type = 'assistant'
      `).all(targetSession.id);

      for (const r of rows) {
        try {
          const d = JSON.parse(r.data);
          if (Array.isArray(d.content)) {
            for (const p of d.content) {
              if (p && p.type === "tool") {
                result.tools.total++;
                const name = (p.toolName || p.name || "").toLowerCase();
                if (name === "read") result.tools.read++;
                else if (name === "write" || name === "edit") {
                  result.tools.write++;
                  // Captura de archivos y deltas atribuidos a la sesión
                  const filePath = p.state?.input?.path || p.input?.path || p.input?.filePath || p.arguments?.path || p.arguments?.filePath;
                  if (filePath) {
                    result.attributedChanges.files.add(path.basename(filePath));
                  }
                  if (Array.isArray(p.state?.metadata?.files)) {
                    for (const mf of p.state.metadata.files) {
                      if (mf.file) result.attributedChanges.files.add(path.basename(mf.file));
                      if (typeof mf.additions === "number") result.attributedChanges.additions += mf.additions;
                      if (typeof mf.deletions === "number") result.attributedChanges.deletions += mf.deletions;
                    }
                  }
                }
                else if (name === "shell" || name === "bash") result.tools.bash++;
                else if (name.startsWith("mem_") || name === "engram" || name === "execute") result.tools.engram++;
                else result.tools.other++;
              }
            }
          }
        } catch {}
      }
    }

    db.close();
  } catch {}

  return result;
}

// 3. MCP Servers Configuration Discovery
function getMcpData(targetDir) {
  const mcpList = [];
  const candidatePaths = [
    "D:/.opencode/opencode.json",
    path.join(targetDir, "opencode.json"),
    path.join(targetDir, ".opencode", "opencode.json"),
    path.join(os.homedir(), ".config", "opencode", "opencode.json"),
    path.join(os.homedir(), ".opencode", "opencode.json"),
  ];
  if (process.env.OPENCODE_CONFIG_DIR) {
    candidatePaths.unshift(path.join(process.env.OPENCODE_CONFIG_DIR, "opencode.json"));
  }

  const registerMcp = (name, val) => {
    if (!name || typeof name !== "string" || !val || typeof val !== "object") return;
    const isEnabled = val?.enabled !== false;
    const type = val?.type || (val?.url ? "remote" : "local");
    const existing = mcpList.find((m) => m.name === name);
    if (!existing) {
      mcpList.push({ name, enabled: isEnabled, type });
    }
  };

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8");
        const cfg = JSON.parse(raw);

        // Standard OpenCode mcp block
        if (cfg.mcp && typeof cfg.mcp === "object") {
          for (const [name, val] of Object.entries(cfg.mcp)) {
            if (name === "servers" && val && typeof val === "object") {
              for (const [sName, sVal] of Object.entries(val)) {
                registerMcp(sName, sVal);
              }
            } else {
              registerMcp(name, val);
            }
          }
        }

        // Standard VS Code / Claude / generic mcpServers block
        if (cfg.mcpServers && typeof cfg.mcpServers === "object") {
          for (const [name, val] of Object.entries(cfg.mcpServers)) {
            registerMcp(name, val);
          }
        }
      } catch {}
    }
  }

  return mcpList;
}

// 3B. Mapeo de Subagentes SDD a Cuentas y Familias de Modelos
let cachedOpencodeConfig = null;
let cachedOpencodeConfigTime = 0;

function resolveOpencodeConfig(targetDir) {
  const candidatePaths = [
    "D:/.opencode/opencode.json",
    path.join(targetDir, "opencode.json"),
    path.join(targetDir, ".opencode", "opencode.json"),
    path.join(os.homedir(), ".config", "opencode", "opencode.json"),
    path.join(os.homedir(), ".opencode", "opencode.json"),
  ];
  if (process.env.OPENCODE_CONFIG_DIR) {
    candidatePaths.unshift(path.join(process.env.OPENCODE_CONFIG_DIR, "opencode.json"));
  }

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const stats = fs.statSync(p);
        if (cachedOpencodeConfig && cachedOpencodeConfigTime === stats.mtimeMs) {
          return cachedOpencodeConfig;
        }
        const raw = fs.readFileSync(p, "utf8");
        cachedOpencodeConfig = JSON.parse(raw);
        cachedOpencodeConfigTime = stats.mtimeMs;
        return cachedOpencodeConfig;
      } catch {}
    }
  }
  return null;
}

function getSddSubagentAccountMap(orchestratorAgent, targetDir) {
  const accountModelMap = new Map(); // prefix -> { family, model }
  if (!orchestratorAgent) return accountModelMap;

  const cfg = resolveOpencodeConfig(targetDir);
  if (!cfg) return accountModelMap;

  // 1. Si el orquestador tiene tabla explícita en su prompt/system (Gentle AI SDD standard)
  const orchDef = (cfg.agent && cfg.agent[orchestratorAgent]) || (cfg.agents && cfg.agents[orchestratorAgent]);
  const sysText = (orchDef?.system || orchDef?.prompt || "");
  const tableMatch = sysText.match(/<!-- gentle-ai:sdd-model-assignments -->([\s\S]*?)<!-- \/gentle-ai:sdd-model-assignments -->/);

  if (tableMatch) {
    const lines = tableMatch[1].split("\n");
    for (const line of lines) {
      if (!line.includes("|")) continue;
      const cols = line.split("|").map((c) => c.trim());
      if (cols.length >= 3 && cols[1] && !cols[1].startsWith("Phase") && !cols[1].startsWith("---")) {
        const phase = cols[1];
        const modelStr = cols[2];
        const clean = modelStr.replace(/^cliproxy\//i, "");
        if (clean.includes("/")) {
          const parts = clean.split("/");
          const pfx = parts[0].toLowerCase();
          const modelKey = parts.slice(1).join("/");
          let family = "Otro";
          const lowerKey = modelKey.toLowerCase();
          if (lowerKey.includes("claude") || lowerKey.includes("opus") || lowerKey.includes("sonnet")) {
            family = "Claude";
          } else if (lowerKey.includes("gemini") || lowerKey.includes("flash") || lowerKey.includes("pro")) {
            family = "Gemini";
          } else if (lowerKey.includes("gpt") || lowerKey.includes("openai") || lowerKey.includes("oss")) {
            family = "GPT";
          }
          accountModelMap.set(pfx, { family, model: modelKey, phase });
        }
      }
    }
    if (accountModelMap.size > 0) return accountModelMap;
  }

  // 2. Mapeo por sufijo de subagentes en opencode.json
  const m = orchestratorAgent.match(/sdd-orchestrator-(.+)/i);
  const profile = m ? m[1].toLowerCase() : "";

  const agentSections = [];
  if (cfg.agent && typeof cfg.agent === "object") agentSections.push(cfg.agent);
  if (cfg.agents && typeof cfg.agents === "object") agentSections.push(cfg.agents);

  for (const section of agentSections) {
    for (const [name, def] of Object.entries(section)) {
      const lowerName = name.toLowerCase();
      const isMatch = profile
        ? lowerName.startsWith("sdd-") && lowerName.endsWith(`-${profile}`) && !lowerName.includes("orchestrator")
        : lowerName.startsWith("sdd-") && !lowerName.includes("orchestrator");

      if (isMatch && def?.model) {
        let modelStr = typeof def.model === "string" ? def.model : (def.model.id || "");
        let cleanModel = modelStr.replace(/^cliproxy\//i, "");
        let pfx = null;
        let modelKey = cleanModel;

        if (cleanModel.includes("/")) {
          const parts = cleanModel.split("/");
          pfx = parts[0].toLowerCase();
          modelKey = parts.slice(1).join("/");
        }

        if (pfx) {
          let family = "Otro";
          const lowerKey = modelKey.toLowerCase();
          if (lowerKey.includes("claude") || lowerKey.includes("opus") || lowerKey.includes("sonnet")) {
            family = "Claude";
          } else if (lowerKey.includes("gemini") || lowerKey.includes("flash") || lowerKey.includes("pro")) {
            family = "Gemini";
          } else if (lowerKey.includes("gpt") || lowerKey.includes("openai") || lowerKey.includes("oss")) {
            family = "GPT";
          }

          accountModelMap.set(pfx, { family, model: modelKey });
        }
      }
    }
  }

  return accountModelMap;
}

// 3C. Insignias de Familia de Modelos (Colores semánticos Linear)
const VENDOR_MARKS = {
  claude: { name: "Claude", color: CYAN },
  gemini: { name: "Gemini", color: MINT },
  gpt: { name: "GPT", color: MAGENTA },
  agy: { name: "Antigravity", color: GOLD },
  opencode: { name: "OpenCode", color: ACCENT_PRIMARY },
  deepseek: { name: "DeepSeek", color: CYAN },
};

function getVendorMark(vendorKey) {
  const key = (vendorKey || "").toLowerCase();
  const v = VENDOR_MARKS[key] || VENDOR_MARKS.claude;
  return {
    name: v.name,
    color: v.color,
    badge: `${v.color}[${v.name}]${RESET}`,
  };
}

// 3. Engram Data
function getEngramData(projectName, projectDir) {
  let canonicalName = projectName;

  try {
    const cfgPath = path.join(projectDir, ".engram", "config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (cfg.project_name) canonicalName = cfg.project_name;
      else if (cfg.project) canonicalName = cfg.project;
    }
  } catch {}

  let cloudHost = null;
  const envCloud = process.env.ENGRAM_CLOUD_SERVER;
  if (envCloud) {
    try { cloudHost = new URL(envCloud).hostname; } catch { cloudHost = envCloud; }
  } else {
    try {
      const cloudJsonPath = path.join(os.homedir(), ".engram", "cloud.json");
      if (fs.existsSync(cloudJsonPath)) {
        const cloudData = JSON.parse(fs.readFileSync(cloudJsonPath, "utf8"));
        if (cloudData.server_url) {
          try { cloudHost = new URL(cloudData.server_url).hostname; } catch { cloudHost = cloudData.server_url; }
        }
      }
    } catch {}
  }

  const result = {
    project: canonicalName,
    online: false,
    obsCount: 0,
    enrolled: false,
    cloudHost,
  };

  try {
    if (fs.existsSync(ENGRAM_DB_PATH)) {
      result.online = true;
      const db = new DatabaseSync(ENGRAM_DB_PATH, { open: true, readOnly: true });

      const obsRow = db.prepare("SELECT count(*) as count FROM observations WHERE project = ? AND deleted_at IS NULL").get(canonicalName);
      if (obsRow) result.obsCount = obsRow.count;

      const enrollRow = db.prepare("SELECT count(*) as count FROM sync_enrolled_projects WHERE project = ?").get(canonicalName);
      if (enrollRow && enrollRow.count > 0) result.enrolled = true;

      db.close();
    }
  } catch {}

  return result;
}

// 4. Descubrimiento de cuentas y sondeo adaptativo a Google
function discoverAccounts() {
  if (!fs.existsSync(AUTHS_DIR)) return;

  const files = fs.readdirSync(AUTHS_DIR).filter(
    (f) => f.startsWith("antigravity-") && f.endsWith(".json")
  );

  const seenAuthFiles = new Set();

  for (const file of files) {
    try {
      const authFilePath = path.join(AUTHS_DIR, file);
      seenAuthFiles.add(authFilePath);
      const raw = fs.readFileSync(authFilePath, "utf8");
      const auth = JSON.parse(raw);
      const prefix = auth.prefix || (auth.email ? auth.email.split("@")[0] : file);

      // Buscar por archivo primero (evita duplicar si cambió el prefijo en disco)
      let existing = accountsList.find((a) => a.authFile === authFilePath);
      if (!existing) {
        existing = accountsList.find((a) => a.prefix === prefix);
      }

      if (!existing) {
        existing = {
          prefix,
          auth,
          authFile: authFilePath,
          email: auth.email || "",
          rem5h: 100,
          used5h: 0,
          reset5h: "",
          remWk: 100,
          usedWk: 0,
          resetWk: "",
          isCritical: false,
          isWarning: false,
          hasError: false,
          errorMsg: "",
        };
        accountsList.push(existing);
      } else {
        existing.prefix = prefix;
        existing.auth = auth;
        existing.authFile = authFilePath;
        existing.email = auth.email || "";
      }
    } catch {}
  }

  // Purgar cuentas huérfanas cuyos archivos ya no existen o cambiaron
  for (let i = accountsList.length - 1; i >= 0; i--) {
    if (!seenAuthFiles.has(accountsList[i].authFile)) {
      accountsList.splice(i, 1);
    }
  }

  accountsList.sort((a, b) => a.prefix.localeCompare(b.prefix));
}

async function updateAccountQuota(account) {
  // Releer el archivo auth en disco por si cliproxy refrescó el access_token
  if (account.authFile && fs.existsSync(account.authFile)) {
    try {
      const freshRaw = fs.readFileSync(account.authFile, "utf8");
      account.auth = JSON.parse(freshRaw);
    } catch {}
  }

  const { auth } = account;
  if (!auth || !auth.access_token || auth.disabled) return;

  try {
    const res = await fetch(QUOTA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ project: auth.project_id }),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      account.hasError = false;
      account.errorMsg = "";

      const geminiGroup = data.groups?.find((g) => g.displayName === "Gemini Models");
      const claudeGroup = data.groups?.find((g) => g.displayName?.includes("Claude"));

      const geminiWk = geminiGroup?.buckets?.find((b) => b.window === "weekly");
      const gemini5h = geminiGroup?.buckets?.find((b) => b.window === "5h");
      const claudeWk = claudeGroup?.buckets?.find((b) => b.window === "weekly");
      const claude5h = claudeGroup?.buckets?.find((b) => b.window === "5h");

      const remFraction = gemini5h?.remainingFraction ?? 1;
      const remPercent = Math.max(0, Math.min(100, Math.round(remFraction * 100)));
      const usedPercent = 100 - remPercent;

      account.rem5h = remPercent;
      account.used5h = usedPercent;
      account.reset5h = formatRelativeReset(gemini5h?.resetTime || null);

      const gemWkPct = Math.max(0, Math.min(100, Math.round(((geminiWk?.remainingFraction ?? 1) * 100))));
      const claudeWkPct = Math.round(((claudeWk?.remainingFraction ?? 1) * 100));
      const claude5hPct = Math.round(((claude5h?.remainingFraction ?? 1) * 100));

      account.remWk = gemWkPct;
      account.usedWk = 100 - gemWkPct;
      account.resetWk = formatRelativeReset(geminiWk?.resetTime || null);

      account.pools = [
        {
          label: "Gemini Wk",
          percent: gemWkPct,
          reset: formatRelativeReset(geminiWk?.resetTime || null),
          pace: calculateQuotaPace(gemWkPct, "weekly", geminiWk?.resetTime || null),
        },
        {
          label: "Gemini 5h",
          percent: remPercent,
          reset: account.reset5h,
          pace: calculateQuotaPace(remPercent, "5h", gemini5h?.resetTime || null),
        },
        {
          label: "Claude Wk",
          percent: claudeWkPct,
          reset: formatRelativeReset(claudeWk?.resetTime || null),
          pace: calculateQuotaPace(claudeWkPct, "weekly", claudeWk?.resetTime || null),
        },
        {
          label: "Claude 5h",
          percent: claude5hPct,
          reset: formatRelativeReset(claude5h?.resetTime || null),
          pace: calculateQuotaPace(claude5hPct, "5h", claude5h?.resetTime || null),
        },
      ];

      // Alerta progresiva de cuota:
      // >= 85% usado (<= 15% libre) -> Crítico (rojo)
      // >= 70% usado (< 85% usado)  -> Aviso preventivo (amarillo)
      account.isCritical = usedPercent >= 85;
      account.isWarning = usedPercent >= 70 && usedPercent < 85;
    } else {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401 || err?.error?.message?.includes("expired") || err?.error?.status === "UNAUTHENTICATED") {
        account.hasError = true;
        account.errorMsg = "token expirado";
      } else if (err?.error?.message?.includes("Verify your account") || err?.error?.details?.some((d) => d.reason === "VALIDATION_REQUIRED")) {
        account.hasError = true;
        account.errorMsg = "verif. requerida";
      } else if (res.status === 429) {
        account.hasError = true;
        account.errorMsg = "rate limited";
      } else {
        account.hasError = true;
        account.errorMsg = "err " + res.status;
      }
    }
  } catch (e) {
    // Si hubo timeout u error de red temporal, no borrar datos previos si ya existían
  }
}

/**
 * Estrategia de Refresco Inteligente (Snapshot + Reactive Active Polling):
 * - Al arrancar (isInitialFetch) o al presionar 'r' (forceAll): consulta todas las cuentas para pintar el panorama general.
 * - En los intervalos automáticos de 2m: SOLO consulta las cuentas activas en uso en alguna sesión.
 */
async function fetchQuotas(forceAll = false) {
  if (isFetchingQuotas) return;
  isFetchingQuotas = true;

  discoverAccounts();

  const sessionData = getOpenCodeSessionData();
  const activePrefixes = sessionData.allActivePrefixes;

  const accountsToQuery = (forceAll || isInitialFetch)
    ? accountsList
    : accountsList.filter((a) => activePrefixes.has(a.prefix.toLowerCase()));

  const targetAccounts = accountsToQuery.length > 0 ? accountsToQuery : accountsList.slice(0, 1);

  await Promise.allSettled(targetAccounts.map((acc) => updateAccountQuota(acc)));

  isInitialFetch = false;
  lastUpdatedTime = new Date().toLocaleTimeString();
  isFetchingQuotas = false;
  scheduleRender();
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    render();
  }, 50);
}

// Comprobación de turnos locales reactiva cada 3s (sin consumo de red externa)
function checkLocalActivity() {
  const sessionData = getOpenCodeSessionData();

  // Si había una migración encolada y el agente pasó a 'idle', ejecutarla en frío
  if (pendingMigrationTarget && sessionData.agentStatus !== "working") {
    const target = pendingMigrationTarget;
    pendingMigrationTarget = null;
    executeDatabaseMigration(target);
    return;
  }

  if (sessionData.lastUpdatedTurn > 0) {
    if (lastKnownTurnTime > 0 && sessionData.lastUpdatedTurn > lastKnownTurnTime) {
      // El asistente completó un turno: refrescamos la cuenta activa inmediatamente
      fetchQuotas(false);
    }
    lastKnownTurnTime = sessionData.lastUpdatedTurn;
  }

  // Refresca UI periódicamente si hay cuentas críticas/aviso para alternar la etiqueta y el timer
  const hasAlertAccounts = accountsList.some((a) => (a.isCritical || a.isWarning) && !a.hasError);
  if (hasAlertAccounts) {
    scheduleRender();
  }
}

function getBestHealthyTargetPrefix() {
  const sessionData = getOpenCodeSessionData();
  const activePrefixes = sessionData.allActivePrefixes;

  // Función para calcular un score de salud balanceando la ventana 5h y la semanal
  const computeHealthScore = (acc) => {
    const rem5h = acc.rem5h ?? 100;
    // Si tiene pools desglosados, buscar el pool semanal de Gemini
    let remWk = 100;
    if (Array.isArray(acc.pools)) {
      const wkPool = acc.pools.find((p) => p.label?.toLowerCase().includes("wk"));
      if (wkPool && typeof wkPool.percent === "number") remWk = wkPool.percent;
    }
    // Si la cuota semanal está al borde del colapso (< 10%), penalizar fuertemente
    if (remWk < 10) return 0;
    // Score ponderado: 70% peso a la ventana inmediata de 5h, 30% a la semanal
    return Math.round(rem5h * 0.7 + remWk * 0.3);
  };

  // 1. Si hay alguna cuenta activa que esté sana (> 30% libre y sin error), preferir esa
  for (const p of activePrefixes) {
    const acc = accountsList.find((a) => a.prefix.toLowerCase() === p && !a.isCritical && !a.hasError && (a.rem5h > 30));
    if (acc) return acc.prefix;
  }

  // 2. Si no, elegir la cuenta con mayor score de salud balanceado
  const healthyAccounts = accountsList
    .filter((a) => !a.isCritical && !a.hasError)
    .sort((a, b) => computeHealthScore(b) - computeHealthScore(a));

  return healthyAccounts[0]?.prefix || accountsList[0]?.prefix || "default";
}

function releaseInactiveSessions() {
  const currentSessionId = process.env.OPENCODE_SESSION_ID || null;
  let closedCount = 0;
  const releasedPrefixes = new Set();
  const sessionData = getOpenCodeSessionData();
  const engramProject = path.basename(sessionData.activeDirectory || process.cwd()).toLowerCase();

  try {
    const { panes, myPaneId, myTabId } = getHerdrPanesData(true);

    // Descubrir qué pane / tab es el que tiene el foco activo del usuario
    let focusedTabId = myTabId;
    let focusedPaneId = myPaneId;

    const focusedPane = panes.find((p) => p.focused || (focusedPaneId && p.pane_id === focusedPaneId));
    const activeTabId = focusedPane?.tab_id || focusedTabId;

    // Obtener la sesión del pane actualmente en foco o en su tab activo
    let keepSessionId = focusedPane?.agent_session?.value || null;
    if (!keepSessionId && activeTabId) {
      const tabAgentPane = panes.find((p) => p.tab_id === activeTabId && p.agent_session?.value);
      keepSessionId = tabAgentPane?.agent_session?.value || null;
    }

    // Si no se detectó por Herdr, proteger la sesión actual donde corre el asistente
    if (!keepSessionId && currentSessionId) {
      keepSessionId = currentSessionId;
    }

    const now = Date.now();
    const db = new DatabaseSync(OPENCODE_DB_PATH, { open: true });

    // Archivar sesiones huérfanas en la base de datos de OpenCode y registrar qué cuentas liberamos
    for (const p of panes) {
      const sesId = p.agent_session?.value;
      if (sesId && sesId !== keepSessionId) {
        const s = db.prepare("SELECT agent, model, time_archived, time_updated FROM session_v2 WHERE id = ?").get(sesId);
        if (s) {
          db.prepare("UPDATE session_v2 SET time_archived = ? WHERE id = ?").run(now, sesId);
          closedCount++;

          const pfx = extractAccountPrefix(s.agent, s.model);
          if (pfx) releasedPrefixes.add(pfx);
        }
      }
    }

    db.close();

    if (closedCount > 0) {
      const releasedListStr = Array.from(releasedPrefixes).join(", ") || "cuentas secundarias";
      setFlashNotice(`[!] ${closedCount} sesion(es) archivadas. Liberadas: [${releasedListStr}]`);

      // Trazabilidad en Engram de la limpieza
      const engramBin = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "engram", "bin", "engram.exe")
        : path.join(os.homedir(), "AppData", "Local", "engram", "bin", "engram.exe");
      if (fs.existsSync(engramBin)) {
        try {
          const title = `Limpieza de sesiones huérfanas: ${engramProject} [${releasedListStr}]`;
          const content = `**What**: Cierre y archivado limpio de ${closedCount} sesión(es) huérfana(s) en desuso.\n**Cuentas liberadas**: ${releasedListStr}\n**Why**: Deselección manual vía tecla 'd' para liberar pines en HUD y evitar saturación concurrente.\n**Where**: ${sessionData.activeDirectory || process.cwd()}`;
          execFileSync(engramBin, [
            "save",
            title,
            content,
            "--type",
            "decision",
            "--project",
            engramProject,
          ]);
        } catch {}
      }
    } else {
      setFlashNotice("No había sesiones secundarias para liberar.");
    }

    scheduleRender();
  } catch (err) {
    setFlashNotice(`[error] Error al liberar sesiones: ${err.message}`);
  }

  return closedCount;
}

function executeDatabaseMigration(targetPrefix) {
  const sessionData = getOpenCodeSessionData();
  const criticalList = accountsList.filter((a) => a.isCritical || (a.used5h >= 85 && !a.hasError));
  if (criticalList.length === 0) return 0;

  let totalMigrated = 0;
  const migratedFrom = [];

  try {
    const db = new DatabaseSync(OPENCODE_DB_PATH, { open: true });
    const toAgent = `sdd-orchestrator-${targetPrefix}`;
    const toModelObj = { id: `${targetPrefix}/gemini-3.8-flash-high`, providerID: "cliproxy" };
    const toModel = JSON.stringify(toModelObj);

    // 1. Obtener sesiones objetivo: tanto las no archivadas en DB como las que están abiertas en panes vivos de Herdr
    const activeSessionsMap = new Map();
    
    // De la DB (no archivadas)
    const dbSessions = db.prepare(`
      SELECT id, agent, model, directory FROM session_v2 
      WHERE time_archived IS NULL
    `).all();
    for (const s of dbSessions) activeSessionsMap.set(s.id, s);

    // De los panes activos de Herdr (incluso si fueron marcadas como archived en DB por un cierre previo)
    try {
      const { panes } = getHerdrPanesData(true);
      for (const p of panes) {
        const sesId = p.agent_session?.value;
        if (sesId && !activeSessionsMap.has(sesId)) {
          const s = db.prepare("SELECT id, agent, model, directory FROM session_v2 WHERE id = ?").get(sesId);
          if (s) activeSessionsMap.set(s.id, s);
        }
      }
    } catch {}

    const activeSessions = Array.from(activeSessionsMap.values());

    for (const ca of criticalList) {
      const fromAgent = `sdd-orchestrator-${ca.prefix}`;
      const sessionsToMigrate = activeSessions.filter((s) => {
        if (s.agent === fromAgent) return true;
        const m = (s.agent || "").match(/sdd-orchestrator-([a-z0-9_-]+)/i);
        if (m?.[1] && m[1].toLowerCase() === ca.prefix.toLowerCase()) return true;
        if (s.model) {
          const mMod = String(s.model).match(/([a-z0-9_-]+)\/gemini/i);
          if (mMod?.[1] && mMod[1].toLowerCase() === ca.prefix.toLowerCase()) return true;
        }
        return false;
      });

      for (const ses of sessionsToMigrate) {
        // Actualizar en SQLite
        const res = db.prepare(`
          UPDATE session_v2 
          SET agent = ?, model = ? 
          WHERE id = ?
        `).run(toAgent, toModel, ses.id);

        if (res.changes > 0) {
          totalMigrated += res.changes;
          if (!migratedFrom.includes(ca.prefix)) migratedFrom.push(ca.prefix);

          // Notificar en vivo al servidor de OpenCode mediante su API HTTP
          // Esto actualiza el agente y modelo en memoria y emite agent-switched / model-switched al TUI
          try {
            execFileSync(
              "cmd.exe",
              ["/c", "opencode", "api", "post", `/api/session/${ses.id}/agent`, "-d", JSON.stringify({ agent: toAgent })],
              { stdio: ["ignore", "pipe", "ignore"], timeout: 4000, encoding: "utf8" }
            );
          } catch {}

          try {
            execFileSync(
              "cmd.exe",
              ["/c", "opencode", "api", "post", `/api/session/${ses.id}/model`, "-d", JSON.stringify({ model: toModelObj })],
              { stdio: ["ignore", "pipe", "ignore"], timeout: 4000, encoding: "utf8" }
            );
          } catch {}
        }
      }
    }

    db.close();

    if (totalMigrated > 0) {
      setFlashNotice(`[ok] ${totalMigrated} sesion(es) migradas en vivo a ${targetPrefix}!`);

      // Snapshot rico en Engram con contexto ODD / Gentle Shell / Checkpoint
      const engramBin = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "engram", "bin", "engram.exe")
        : path.join(os.homedir(), "AppData", "Local", "engram", "bin", "engram.exe");
      if (fs.existsSync(engramBin)) {
        try {
          let branch = "main";
          try {
            branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
          } catch {}

          const filesArray = Array.from(sessionData.attributedChanges.files);
          const filesStr = filesArray.length > 0 ? filesArray.join(", ") : "sin archivos modificados aún";
          const engramProject = path.basename(sessionData.activeDirectory || process.cwd()).toLowerCase();

          // Extraer último estado / snippet del turno para checkpointing estilo Gentle Shell
          let lastSnippet = "";
          try {
            const dbCheck = new DatabaseSync(OPENCODE_DB_PATH, { open: true });
            const lastAssistantMsg = dbCheck.prepare(`
              SELECT data FROM session_message 
              WHERE type = 'assistant'
              ORDER BY time_created DESC LIMIT 1
            `).get();
            if (lastAssistantMsg?.data) {
              const d = JSON.parse(lastAssistantMsg.data);
              const txt = (d.content || []).find((c) => c && c.type === "text")?.text;
              if (txt) {
                lastSnippet = `\n**Último estado**: ${txt.trim().split("\n")[0].slice(0, 150)}`;
              }
            }
            dbCheck.close();
          } catch {}

          const title = `Checkpoint migración: [${migratedFrom.join(", ")}] -> ${targetPrefix} (${branch})`;
          const content = `**What**: Checkpoint y rotación en frío de ${totalMigrated} sesión(es) desde [${migratedFrom.join(", ")}] hacia ${targetPrefix}.\n**Rama Git**: ${branch}\n**Archivos tocados**: ${filesStr} (+${sessionData.attributedChanges.additions} -${sessionData.attributedChanges.deletions})${lastSnippet}\n**Why**: Cuota crítica agotada (>=85% usado) en cuenta(s) saliente(s).\n**Where**: ${sessionData.activeDirectory || process.cwd()}`;

          execFileSync(engramBin, [
            "save",
            title,
            content,
            "--type",
            "decision",
            "--project",
            engramProject,
          ]);
        } catch {}
      }
    } else {
      setFlashNotice(`No hay sesiones abiertas usando [${criticalList.map((c) => c.prefix).join(", ")}].`);
    }

    scheduleRender();
  } catch (err) {
    setFlashNotice(`[error] Error al migrar: ${err.message}`);
  }

  return totalMigrated;
}

function migrateCriticalSessions() {
  const sessionData = getOpenCodeSessionData();
  const activePrefixes = sessionData.allActivePrefixes;

  // Solo considerar cuentas críticas o al 85%+ que estén ACTIVAS en alguna sesión
  const criticalList = accountsList.filter(
    (a) => (a.isCritical || (a.used5h >= 85 && !a.hasError)) && activePrefixes.has(a.prefix.toLowerCase())
  );
  if (criticalList.length === 0) {
    setFlashNotice("No hay sesiones activas usando cuentas críticas.");
    return 0;
  }

  const targetPrefix = getBestHealthyTargetPrefix();

  // Si el agente está en pleno streaming / working, encolar para no matar el turno
  if (sessionData.agentStatus === "working") {
    pendingMigrationTarget = targetPrefix;
    setFlashNotice(`... Agente trabajando: rotacion a ${targetPrefix} programada para el final del turno.`, 6000);
    return 0;
  }

  return executeDatabaseMigration(targetPrefix);
}

let isSyncingIntegrations = false;
async function triggerSyncIntegrations() {
  if (isSyncingIntegrations) return;
  isSyncingIntegrations = true;
  setFlashNotice("... Sincronizando modelos y orquestadores...");
  try {
    const res = await syncIntegrationsAndOrchestrators();
    await fetchQuotas(true);
    setFlashNotice(`[ok] Sincronizado: ${res.totalModels} modelos (+${res.addedModels} nuevos), ${res.repairedOrchestrators} orquestadores auditados`);
  } catch (err) {
    setFlashNotice(`! Error sincronizando: ${err.message}`);
  } finally {
    isSyncingIntegrations = false;
  }
}

function setFlashNotice(msg, durationMs = 4000) {
  flashNotice = msg;
  if (flashNoticeTimer) clearTimeout(flashNoticeTimer);
  flashNoticeTimer = setTimeout(() => {
    flashNotice = null;
    scheduleRender();
  }, durationMs);
  scheduleRender();
}

// ============================================================================
// PIPELINE DE RENDERIZADO PIXEL-PERFECT (Zero-Scrollback / Alternate Screen)
// ============================================================================
function render() {
  const cols = process.stdout.columns || 46;
  const rows = process.stdout.rows || 32;

  const width = Math.max(36, Math.min(cols - 2, 50));
  const innerWidth = width - 4; // 1 (│) + 1 ( ) + innerWidth + 1 ( ) + 1 (│) = width

  const cwd = process.cwd();
  const opencode = getOpenCodeSessionData();

  const targetDir = (opencode.activeDirectory && fs.existsSync(opencode.activeDirectory))
    ? opencode.activeDirectory
    : cwd;
  const folder = path.basename(targetDir);

  let git = getGitData(targetDir);
  if (!git.hasGit && targetDir !== cwd) {
    git = getGitData(cwd);
  }

  const engram = getEngramData(folder.toLowerCase(), targetDir);
  const mcpList = getMcpData(targetDir);
  const projectTreeData = getProjectTreeData(targetDir);
  const activePrefixes = opencode.allActivePrefixes;

  // Primitivas de dibujo indestructibles con parámetros tipados
  cardLineBounds = [];

  const drawTop = (titleFormatted, isCollapsed = false) => {
    const icon = isCollapsed ? "+" : "-";
    const iconBadge = `${TEXT_DIM}[${RESET}${TEXT_MUTED}${icon}${RESET}${TEXT_DIM}]${RESET}`;
    const maxTitle = width - 12;
    let cleanTitle = titleFormatted;
    if (stringWidth(cleanTitle) > maxTitle) {
      cleanTitle = truncateToWidth(cleanTitle, maxTitle);
    }
    const tLen = stringWidth(cleanTitle);
    const dashCount = Math.max(0, width - 10 - tLen);
    return `${BORDER}╭─ ${cleanTitle} ${"─".repeat(dashCount)} ${iconBadge} ${BORDER}╮${RESET}`;
  };

  const drawBottom = () => {
    return `${BORDER}╰${"─".repeat(Math.max(0, width - 2))}╯${RESET}`;
  };

  const drawDivider = () => {
    return `${BORDER_MUTED}├${"─".repeat(Math.max(0, width - 2))}┤${RESET}`;
  };

  const drawRow = (left, right = "") => {
    const targetInner = width - 4;
    let cleanRight = right;
    let cleanLeft = left;

    let rWidth = stringWidth(cleanRight);
    const maxRight = Math.floor(targetInner * 0.55);
    if (rWidth > maxRight && left) {
      cleanRight = truncateToWidth(cleanRight, maxRight);
      rWidth = stringWidth(cleanRight);
    } else if (rWidth > targetInner) {
      cleanRight = truncateToWidth(cleanRight, targetInner);
      rWidth = stringWidth(cleanRight);
    }

    const maxLeft = targetInner - (rWidth > 0 ? rWidth + 1 : 0);
    if (stringWidth(cleanLeft) > maxLeft) {
      cleanLeft = truncateToWidth(cleanLeft, maxLeft);
    }

    const lWidth = stringWidth(cleanLeft);
    const spaceCount = Math.max(0, targetInner - lWidth - rWidth);
    const pad = " ".repeat(spaceCount);
    return `${BORDER}│${RESET} ${cleanLeft}${pad}${cleanRight} ${BORDER}│${RESET}`;
  };

  const renderGaugeInline = (percent, availableCells, thresholdColor) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const rounded = Math.round(clamped);
    let filledCount = Math.round((rounded / 100) * availableCells);
    // Regla de clamping visual (1..=99% de Levi Qiao):
    // Nunca dibuja 100% lleno si falta algo por gastar, ni 0% vacío si queda cuota
    if (rounded > 0 && rounded < 100) {
      filledCount = Math.max(1, Math.min(availableCells - 1, filledCount));
    } else if (rounded === 0) {
      filledCount = 0;
    } else {
      filledCount = availableCells;
    }
    const emptyCount = Math.max(0, availableCells - filledCount);
    const colFn = typeof thresholdColor === "function" ? thresholdColor : (s) => `${thresholdColor}${s}${RESET}`;
    return `${colFn("━".repeat(filledCount))}${TEXT_DIM}${"─".repeat(emptyCount)}${RESET}`;
  };

  const lines = [];

  // 1. Encabezado Técnico de Marca (Linear Aesthetic)
  const bannerLeft = `${ACCENT_PRIMARY}:: OPENCODE${RESET}`;
  const bannerRight = `${BORDER}· ${GOLD}GENTLE-AI ${ACCENT_PRIMARY}::${RESET}`;
  const bannerRaw = ":: OPENCODE · GENTLE-AI ::";
  const bannerPad = Math.max(0, Math.floor((width - stringWidth(bannerRaw)) / 2));
  lines.push(`${" ".repeat(bannerPad)}${bannerLeft} ${bannerRight}`);

  // 2. Estado Card (con Indicador Petal / Working State de Gentle-Shell)
  const isWorking = opencode.agentStatus === "working";
  const petalIndicator = isWorking
    ? `${BOLD}${AMBER}>> WORKING${RESET}`
    : `${TEXT_DIM}-- idle${RESET}`;
  const estadoTop = `${BOLD}${GOLD}Estado${RESET} ${TEXT_DIM}·${RESET} ${petalIndicator}`;
  const estadoStart = lines.length;
  lines.push(drawTop(estadoTop, collapsedCards.estado));
  if (!collapsedCards.estado) {
    const shortProject = folder.length > 20 ? folder.slice(0, 18) + "…" : folder;
    lines.push(drawRow(`${GOLD}Proyecto${RESET}`, `${TEXT_PRIMARY}~/.../${shortProject}${RESET}`));
    const dirtyBadge = git.isClean ? `${MINT}limpio${RESET}` : `${AMBER}±${git.modified + git.staged}${RESET}`;
    lines.push(drawRow(`${GOLD}Rama${RESET}`, `${CYAN}# ${git.branch}${RESET} ${dirtyBadge}`));
    const activeModelDisplay = `${ACCENT_PRIMARY}${opencode.modelShort}${RESET} ${GOLD}(high)${RESET}`;
    lines.push(drawRow(`${GOLD}Modelo${RESET}`, activeModelDisplay));
    
    // Listado de perfiles activos en la línea sub-vitals
    const mcpCountStr = mcpList.length > 0 ? `${mcpList.length} MCPs` : "0 MCPs";
    const activeProfLabels = Array.from(activePrefixes).map((p) => `${ACCENT_PINK}*${RESET} ${MINT}${p}${RESET}`).join(" ") || `${TEXT_MUTED}default${RESET}`;
    const subVitals = `${ACCENT_PRIMARY}mem:${RESET} ${TEXT_PRIMARY}${engram.project}${RESET} ${TEXT_DIM}·${RESET} ${TEXT_MUTED}${mcpCountStr}${RESET} ${TEXT_DIM}·${RESET} ${activeProfLabels}`;
    lines.push(drawRow(subVitals, `${ACCENT_PINK}>${RESET}`));
  }
  lines.push(drawBottom());
  cardLineBounds.push({ id: "estado", startLine: estadoStart, endLine: lines.length - 1 });

  // 3. Contexto Card
  const contextoStart = lines.length;
  lines.push(drawTop(`${BOLD}${GOLD}Contexto${RESET}`, collapsedCards.contexto));
  if (!collapsedCards.contexto) {
    const contextLimit = resolveModelContextLimit(opencode.model, opencode.agent);
    const currentTokens = opencode.activeTurnContextTokens > 0
      ? opencode.activeTurnContextTokens
      : 32_000;

    const contextPercent = Math.max(0.1, ((currentTokens / contextLimit) * 100));
    const isSaturated = currentTokens >= (contextLimit * 0.8);
    const isMature = currentTokens >= (contextLimit * 0.5) && !isSaturated;

    let leftTokensStr;
    let rightContextStatus;
    let gaugeColor;

    if (isSaturated) {
      gaugeColor = CORAL;
      leftTokensStr = `${BOLD}${CORAL}${formatTokenCount(currentTokens)}${RESET} ${TEXT_DIM}/${RESET} ${TEXT_MUTED}${formatTokenCount(contextLimit)}${RESET}`;
      rightContextStatus = `${CORAL}● Saturado ${contextPercent.toFixed(1)}% [/snew]${RESET}`;
    } else if (isMature) {
      gaugeColor = AMBER;
      leftTokensStr = `${BOLD}${AMBER}${formatTokenCount(currentTokens)}${RESET} ${TEXT_DIM}/${RESET} ${TEXT_MUTED}${formatTokenCount(contextLimit)}${RESET}`;
      rightContextStatus = `${AMBER}● Maduro ${contextPercent.toFixed(1)}% [/snew]${RESET}`;
    } else {
      const contextThreshold = getQuotaThreshold(100 - contextPercent);
      gaugeColor = contextThreshold.color;
      leftTokensStr = `${BOLD}${contextThreshold.color(formatTokenCount(currentTokens))}${RESET} ${TEXT_DIM}/${RESET} ${TEXT_MUTED}${formatTokenCount(contextLimit)}${RESET}`;
      rightContextStatus = `${contextThreshold.color("●")} ${BOLD}${contextThreshold.color(`Optimo ${contextPercent.toFixed(1)}%`)}${RESET}`;
    }

    lines.push(drawRow(leftTokensStr, rightContextStatus));
    lines.push(drawRow(renderGaugeInline(contextPercent, innerWidth, gaugeColor)));
    const inTokens = opencode.tokensInput > 0 ? opencode.tokensInput : 1_400_000;
    const outTokens = opencode.tokensOutput > 0 ? opencode.tokensOutput : 12_600;
    const leftBreakdown = `${TEXT_DIM}^${RESET} ${TEXT_PRIMARY}${formatTokenCount(inTokens)}${RESET} ${TEXT_DIM}·${RESET} ${TEXT_DIM}v${RESET} ${TEXT_PRIMARY}${formatTokenCount(outTokens)}${RESET}`;
    const rightCost = `${GOLD}Costo${RESET} ${TEXT_PRIMARY}${formatCost(opencode.cost)}${RESET}`;
    lines.push(drawRow(leftBreakdown, rightCost));
    if (isMature || isSaturated) {
      lines.push(drawRow(`${AMBER}[aviso] Sesion madura: usa /snew para handover limpio${RESET}`));
    }
  }
  lines.push(drawBottom());
  cardLineBounds.push({ id: "contexto", startLine: contextoStart, endLine: lines.length - 1 });

  // 3B. Proyecto / Archivos Card (2 Niveles, colapsada por defecto)
  const proyectoStart = lines.length;
  const projectStatsBadge = `${TEXT_DIM}${projectTreeData.totalDirs}d · ${projectTreeData.totalFiles}f${RESET}`;
  const projectCardTitle = `${ACCENT_PRIMARY}~${RESET} ${BOLD}${GOLD}Proyecto${RESET} ${TEXT_DIM}·${RESET} ${CYAN}${folder}${RESET} ${projectStatsBadge}`;
  lines.push(drawTop(projectCardTitle, collapsedCards.proyecto));

  if (!collapsedCards.proyecto) {
    // Fila 1: Botón interactivo de abrir en explorador
    const normalizedRoot = projectTreeData.rootPath.replace(/\\/g, "/");
    lines.push(drawRow(`${GOLD}Ruta${RESET} ${MINT}[abrir en PC ↗]${RESET}`, `${TEXT_PRIMARY}${normalizedRoot}${RESET}`));

    if (projectTreeData.tree.length === 0) {
      lines.push(drawRow(`${TEXT_DIM}(carpeta vacía o sin archivos visibles)${RESET}`));
    } else {
      for (const item of projectTreeData.tree) {
        if (item.isDir) {
          const dirIcon = `${CYAN}> /${RESET}`;
          const dirCountBadge = `${TEXT_DIM}(${item.children.length})${RESET}`;
          lines.push(drawRow(`${dirIcon} ${TEXT_PRIMARY}${item.name}/${RESET} ${dirCountBadge}`));

          // Nivel 2: subelementos
          for (const sub of item.children) {
            const subIcon = sub.isDir ? `${CYAN}└ /${RESET}` : `${TEXT_DIM}└ ${RESET}`;
            const subName = sub.isDir ? `${TEXT_PRIMARY}${sub.name}/${RESET}` : `${TEXT_MUTED}${sub.name}${RESET}`;
            lines.push(drawRow(`   ${subIcon} ${subName}`));
          }
        } else {
          const fileIcon = `${TEXT_DIM}• ${RESET}`;
          lines.push(drawRow(`${fileIcon} ${TEXT_MUTED}${item.name}${RESET}`));
        }
      }
    }
  }
  lines.push(drawBottom());
  cardLineBounds.push({
    id: "proyecto",
    startLine: proyectoStart,
    endLine: lines.length - 1,
    actionLine: !collapsedCards.proyecto ? proyectoStart + 1 : null,
    actionPath: projectTreeData.rootPath,
  });

  // 5. ✿ Integraciones Card (DINÁMICO SEGÚN accountsList.length + MULTI-▸ SESIÓN + AVISO 70% Y CRÍTICO 85%)
  const criticalAccounts = accountsList.filter((a) => a.isCritical);
  const warningAccounts = accountsList.filter((a) => a.isWarning);

  const totalAccountsCount = accountsList.length;
  let intTitleRight = `${TEXT_DIM}${totalAccountsCount} cuenta${totalAccountsCount === 1 ? "" : "s"}${RESET}`;
  if (criticalAccounts.length > 0) {
    intTitleRight = `${CORAL}! ${criticalAccounts.length} crítico${RESET}`;
  } else if (warningAccounts.length > 0) {
    intTitleRight = `${AMBER}! ${warningAccounts.length} en aviso (70%+)${RESET}`;
  }
  
  const integracionesStart = lines.length;
  lines.push(drawTop(`${GOLD}Integraciones${RESET} ${TEXT_DIM}·${RESET} ${intTitleRight}`, collapsedCards.integraciones));

  if (!collapsedCards.integraciones) {
    if (accountsList.length === 0) {
      lines.push(drawRow(`${TEXT_DIM}Cargando cuentas de Antigravity…${RESET}`));
    } else {
      for (const acc of accountsList) {
        // Detección multi-sesión: si la cuenta está activa en cualquier sesión abierta, se marca con ▸
        const isActive = activePrefixes.has(acc.prefix.toLowerCase());
        let pctColor = MINT;
        let statusGlyph = isActive ? `${ACCENT_PINK}>${RESET}` : `${MINT}●${RESET}`;

        const wkPct = acc.remWk ?? 100;
        let wkWarnColor = MINT;
        if (wkPct <= 15) {
          wkWarnColor = CORAL;
        } else if (wkPct <= 30) {
          wkWarnColor = AMBER;
        }

        // Timer y rotación de notas
        const timeNotePhase = Math.floor(Date.now() / 3000) % 2;
        let timeNote = acc.reset5h ? `${TEXT_DIM}${acc.reset5h}${RESET}` : "";
        if (acc.resetWk && timeNotePhase === 1) {
          timeNote = `${TEXT_DIM}Wk:${acc.resetWk}${RESET}`;
        }

        let statusNote = timeNote;

        if (acc.hasError) {
          statusGlyph = `${AMBER}?${RESET}`;
          pctColor = AMBER;
          statusNote = `${AMBER}[${acc.errorMsg}]${RESET}`;
        } else if (acc.isCritical) {
          statusGlyph = `${BOLD}${CORAL}!${RESET}`;
          pctColor = CORAL;
          statusNote = timeNotePhase === 1 && acc.reset5h
            ? `${TEXT_DIM}${acc.reset5h}${RESET}`
            : `${BOLD}${CORAL}[AGOTÁNDOSE]${RESET}`;
        } else if (acc.isWarning) {
          statusGlyph = `${BOLD}${AMBER}!${RESET}`;
          pctColor = AMBER;
          statusNote = timeNotePhase === 1 && acc.reset5h
            ? `${TEXT_DIM}${acc.reset5h}${RESET}`
            : `${AMBER}[AVISO 70%]${RESET}`;
        }

        const pfxDisplay = isActive
          ? `${BOLD}${TEXT_PRIMARY}${acc.prefix.padEnd(8)}${RESET}`
          : `${TEXT_MUTED}${acc.prefix.padEnd(8)}${RESET}`;

        const bar5h = renderGaugeInline(acc.rem5h, 4, pctColor);
        const pct5hStr = String(acc.rem5h).padStart(3);
        const pct5hDisplay = `${BOLD}${pctColor}${pct5hStr}%${RESET}`;

        const barWk = renderGaugeInline(wkPct, 4, wkWarnColor);
        const pctWkStr = String(wkPct).padStart(3);
        const pctWkDisplay = `${BOLD}${wkWarnColor}${pctWkStr}%${RESET}`;

        const leftCol = `${statusGlyph} ${pfxDisplay} ${bar5h} ${pct5hDisplay} ${TEXT_DIM}Wk${RESET} ${barWk} ${pctWkDisplay}`;
        const rightCol = statusNote;

        lines.push(drawRow(leftCol, rightCol));
      }
      lines.push(drawDivider());
      const syncBtnLine = lines.length;
      lines.push(drawRow(`${CYAN}>> [sincronizar]${RESET}`));
      cardLineBounds.push({
        id: "integraciones_sync",
        startLine: syncBtnLine,
        endLine: syncBtnLine,
        actionType: "sync_integrations"
      });
    }
  }

  // Notificaciones de alerta: solo si una cuenta crítica/aviso está REALMENTE ACTIVA en alguna sesión abierta
  const alertAccounts = accountsList.filter((a) => (a.isCritical || a.isWarning) && !a.hasError && activePrefixes.has(a.prefix.toLowerCase()));
  if (flashNotice || alertAccounts.length > 0) {
    lines.push(drawDivider());
    if (flashNotice) {
      lines.push(drawRow(`${BOLD}${MINT}${flashNotice}${RESET}`));
    }
    const targetHealthy = getBestHealthyTargetPrefix();
    if (pendingMigrationTarget) {
      lines.push(drawRow(`${BOLD}${AMBER}... Rotacion a ${pendingMigrationTarget} programada al terminar turno${RESET}`));
    }
    for (const ca of alertAccounts) {
      if (ca.isCritical) {
        const actionLabel = opencode.agentStatus === "working"
          ? `[presioná 'x' -> programar a ${targetHealthy}]`
          : `[presioná 'x' -> migrar a ${targetHealthy}]`;
        lines.push(drawRow(`${BOLD}${CORAL}! CRÍTICO: ${ca.prefix} (activa) ${actionLabel}${RESET}`));
      } else {
        lines.push(drawRow(`${AMBER}! AVISO 70%: ${ca.prefix} al ${ca.used5h}% usado (queda ${ca.rem5h}%) - considerar rotar${RESET}`));
      }
    }
  }

  lines.push(drawBottom());
  cardLineBounds.push({ id: "integraciones", startLine: integracionesStart, endLine: lines.length - 1 });

  // 5B. Pools Breakdown Card: Multi-Model SDD vs. Dedicated Mono-Account SDD
  // Detects whether the active agent in this workspace/pane is a multi-model distributed SDD
  // or a dedicated single-account SDD / general session.
  const localPrefix = extractAccountPrefix(opencode.agent, opencode.model);
  const isSddAgent = (opencode.agent || "").toLowerCase().includes("sdd") || (opencode.agent || "").toLowerCase().includes("gentle");
  const subagentMap = isSddAgent ? getSddSubagentAccountMap(opencode.agent, targetDir) : new Map();
  const isMultiModelSDD =
    /claude|multi|hybrid|distrib/i.test(opencode.agent || "") ||
    subagentMap.size > 1 ||
    (!localPrefix && isSddAgent);

  if (isMultiModelSDD) {
    // ESCENARIO 1: SDD Multi-Modelo / Distribuido (Batería de cuentas consolidada)
    // Detecta qué modelo y familia corre en cada cuenta según el mapeo de subagentes en opencode.json
    const agentModelStr = `${opencode.agent || ""} ${opencode.model || ""}`.toLowerCase();
    const fallbackFamily = agentModelStr.includes("claude") ? "Claude" : (agentModelStr.includes("gemini") ? "Gemini" : "Claude");

    // Filtrar cuentas: si se detectó un mapeo de subagentes, solo mostrar las cuentas involucradas;
    // de lo contrario, mostrar todas las cuentas disponibles
    const accountsWithPools = accountsList.filter((a) => a.pools && a.pools.length > 0);
    const targetAccounts = subagentMap.size > 0
      ? accountsWithPools.filter((a) => subagentMap.has(a.prefix.toLowerCase()))
      : accountsWithPools;

    if (targetAccounts.length > 0) {
      const distributedRows = [];
      for (const acc of targetAccounts) {
        const mapping = subagentMap.get(acc.prefix.toLowerCase());
        const family = mapping ? mapping.family : fallbackFamily;

        // Buscar el pool adecuado según la familia de modelo asignada a esta cuenta
        let targetPool = null;
        if (family === "Claude") {
          targetPool = acc.pools.find((x) => x.label?.toLowerCase().includes("claude") && x.label?.includes("5h"));
        } else if (family === "Gemini") {
          targetPool = acc.pools.find((x) => x.label?.toLowerCase().includes("gemini") && x.label?.includes("5h"));
        }

        // Fallback si no encuentra el pool específico
        if (!targetPool) {
          targetPool = acc.pools.find((x) => x.label?.includes("5h")) || acc.pools[0];
        }

        if (targetPool) {
          distributedRows.push({
            prefix: acc.prefix,
            family,
            percent: targetPool.percent,
            pace: targetPool.pace,
            reset: targetPool.reset,
            hasError: acc.hasError,
            errorMsg: acc.errorMsg,
          });
        }
      }

      if (distributedRows.length > 0) {
        const poolsStart = lines.length;
        const accountCountBadge = `${TEXT_DIM}${distributedRows.length} cuentas${RESET}`;
        lines.push(drawTop(`${GOLD}SDD Multi-modelo${RESET} ${TEXT_DIM}·${RESET} ${accountCountBadge}`, collapsedCards.pools));

        if (!collapsedCards.pools) {
          const poolGaugeCells = 8;
          for (const row of distributedRows) {
            const threshold = getQuotaThreshold(row.percent);
            const shortPrefix = row.prefix.length > 8 ? row.prefix.slice(0, 7) + "…" : row.prefix.padEnd(8);
            const pfxDisplay = `${BOLD}${TEXT_PRIMARY}${shortPrefix}${RESET}`;

            // Insignia visual con identidad de familia (colores semánticos Linear)
            const vMark = getVendorMark(row.family);
            const tagDisplay = vMark.badge;

            const bar = renderGaugeInline(row.percent, poolGaugeCells, threshold.color);
            const pctFmt = `${BOLD}${threshold.color(String(row.percent).padStart(3) + "%")}${RESET}`;
            const paceStr = row.pace ? `${row.pace.color}${row.pace.text}${RESET} ` : "";
            const resetStr = row.reset ? `${TEXT_DIM}${row.reset}${RESET}` : "";

            const leftCol = `${pfxDisplay} ${tagDisplay} ${bar} ${pctFmt}`;
            if (row.hasError) {
              lines.push(drawRow(leftCol, `${AMBER}${row.errorMsg}${RESET}`));
            } else {
              lines.push(drawRow(leftCol, `${paceStr}${resetStr}`.trim()));
            }
          }

          // Resumen inferior: piso crítico (mínimo) y promedio de la batería de cuentas
          const percents = distributedRows.map((r) => r.percent);
          const minPct = Math.min(...percents);
          const avgPct = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
          const minAcc = distributedRows.find((r) => r.percent === minPct);
          const minThreshold = getQuotaThreshold(minPct);
          const avgThreshold = getQuotaThreshold(avgPct);

          lines.push(drawDivider());
          lines.push(drawRow(
            `${minThreshold.color(`min: ${minPct}%`)} ${TEXT_DIM}(${minAcc?.prefix || "?"})${RESET}`,
            `${avgThreshold.color(`prom: ${avgPct}%`)}`,
          ));
        }

        lines.push(drawBottom());
        cardLineBounds.push({ id: "pools", startLine: poolsStart, endLine: lines.length - 1 });
      }
    }
  } else {
    // ESCENARIO 2: SDD Mono-Modelo / Cuenta Dedicada (Antigravity Pools Detallados)
    // Para orquestadores dedicados a una cuenta (ej: sdd-orchestrator-xen2) o sesiones estándar,
    // muestra el desglose completo de los 4 pools de la(s) cuenta(s) en uso.
    const targetActiveAccounts = accountsList.filter((a) => activePrefixes.has(a.prefix.toLowerCase()));
    const poolCardsToShow = targetActiveAccounts.length > 0 ? targetActiveAccounts : (accountsList.slice(0, 1));
    const cardTitlePrefix = isSddAgent ? "SDD Mono-modelo" : "Antigravity";

    for (const acc of poolCardsToShow) {
      if (acc.pools && acc.pools.length > 0) {
        const activeTag = activePrefixes.has(acc.prefix.toLowerCase()) ? " (activa)" : "";
        const poolsStart = lines.length;
        lines.push(drawTop(`${GOLD}${cardTitlePrefix}${RESET} ${TEXT_DIM}·${RESET} ${MINT}${acc.prefix}${activeTag}${RESET}`, collapsedCards.pools));

        if (!collapsedCards.pools) {
          if (acc.hasError) {
            lines.push(drawRow(`${AMBER}! ${acc.errorMsg}${RESET}`));
          }

          const poolGaugeCells = 8;
          for (const p of acc.pools) {
            const threshold = getQuotaThreshold(p.percent);
            const pctFmt = `${BOLD}${threshold.color(String(p.percent).padStart(3) + "%")}${RESET}`;
            const bar = renderGaugeInline(p.percent, poolGaugeCells, threshold.color);
            const paceStr = p.pace ? `${p.pace.color}${p.pace.text}${RESET} ` : "";
            const resetStr = p.reset ? `${TEXT_DIM}${p.reset}${RESET}` : "";
            const leftCol = `${threshold.color("●")} ${TEXT_PRIMARY}${p.label.padEnd(10)}${RESET} ${bar} ${pctFmt}`;
            const rightCol = `${paceStr}${resetStr}`.trim();
            lines.push(drawRow(leftCol, rightCol));
          }
        }

        lines.push(drawBottom());
        cardLineBounds.push({ id: "pools", startLine: poolsStart, endLine: lines.length - 1 });
      }
    }
  }

  // 6. ᛦ Gráfico Git & Gentle Attributed Changes Card
  const agentFilesCount = opencode.attributedChanges.files.size;
  const agentChangesTitle = agentFilesCount > 0
    ? `${BOLD}${GOLD}Cambios${RESET} ${TEXT_DIM}· ${agentFilesCount} por agente${RESET}`
    : `${BOLD}${GOLD}Git y Cambios${RESET}`;
  const gitStart = lines.length;
  lines.push(drawTop(agentChangesTitle, collapsedCards.git));

  if (!collapsedCards.git) {
    const gitBadges = git.isClean
      ? `${MINT}ok limpio${RESET}`
      : `${AMBER}* ${git.modified} mod${RESET} ${TEXT_DIM}·${RESET} ${MAGENTA}?${git.untracked}${RESET}`;
    lines.push(drawRow(`${CYAN}${git.branch}${RESET}`, gitBadges));

    if (git.graphLines.length > 0) {
      for (const gLine of git.graphLines.slice(0, 2)) {
        lines.push(drawRow(colorizeGitGraphLine(gLine)));
      }
    } else {
      lines.push(drawRow(`${TEXT_DIM}* (sin commits recientes)${RESET}`));
    }

    // Desglose dual: Git Working Tree vs Attributed Changes de Gentle-Shell
    const totalDiffFiles = git.modified + git.staged;
    const changesSummary = totalDiffFiles > 0
      ? `${TEXT_DIM}git:${RESET} ${TEXT_PRIMARY}${totalDiffFiles} archivos${RESET} ${TEXT_DIM}·${RESET} ${MINT}+${git.linesAdded}${RESET} ${CORAL}-${git.linesDeleted}${RESET}`
      : `${TEXT_DIM}git:${RESET} ${MINT}limpio${RESET}`;

    const agentSummary = agentFilesCount > 0
      ? `${ACCENT_PRIMARY}ag:${RESET} ${MINT}${agentFilesCount} archivos${RESET} ${TEXT_DIM}(+${opencode.attributedChanges.additions} -${opencode.attributedChanges.deletions})${RESET}`
      : `${ACCENT_PRIMARY}ag:${RESET} ${TEXT_DIM}0 archivos${RESET}`;

    lines.push(drawRow(changesSummary, agentSummary));
  }

  lines.push(drawBottom());
  cardLineBounds.push({ id: "git", startLine: gitStart, endLine: lines.length - 1 });

  // 7. Engram Card
  const engramStart = lines.length;
  lines.push(drawTop(`${ACCENT_PRIMARY}Engram:${RESET} ${CYAN}${engram.project}${RESET} ${TEXT_DIM}^${RESET}`, collapsedCards.engram));
  if (!collapsedCards.engram) {
    const localOnlineStatus = engram.online ? `${MINT}● En linea${RESET}` : `${CORAL}○ Caido${RESET}`;
    lines.push(drawRow(`Local (7437)`, `${localOnlineStatus} ${TEXT_DIM}·${RESET} ${CYAN}${engram.obsCount} obs${RESET}`));
    if (engram.cloudHost) {
      const syncStatus = engram.enrolled ? `${MINT}● Enrolado${RESET}` : `${TEXT_DIM}○ No sinc${RESET}`;
      lines.push(drawRow(`Cloud: ${TEXT_DIM}${engram.cloudHost}${RESET}`, `${syncStatus} ${CYAN}↗${RESET}`));
    } else {
      lines.push(drawRow(`Cloud: ${TEXT_DIM}solo local${RESET}`, `${TEXT_DIM}○ no configurado${RESET}`));
    }
  }
  lines.push(drawBottom());
  cardLineBounds.push({ id: "engram", startLine: engramStart, endLine: lines.length - 1 });

  // 8. Herramientas Telemetry Card
  const toolsCount = opencode.tools.total > 0 ? opencode.tools : { read: 6, write: 7, bash: 16, engram: 1, other: 1, total: 31 };
  const toolsTitleFmt = `${BOLD}${GOLD}Herramientas${RESET} ${TEXT_DIM}· ${toolsCount.total} llamadas${RESET}`;
  const toolsStart = lines.length;
  lines.push(drawTop(toolsTitleFmt, collapsedCards.tools));

  if (!collapsedCards.tools) {
    const pRead = `${MAGENTA}@ ${toolsCount.read} lecturas${RESET}`;
    const pWrite = `${CYAN}@ ${toolsCount.write} escrituras${RESET}`;
    const pBash = `${MINT}>_ ${toolsCount.bash} bash${RESET}`;
    const pEngram = `${CORAL}mem: ${toolsCount.engram}${RESET}`;
    lines.push(drawRow(`${pRead}  ${pWrite}  ${pBash}`, pEngram));
  }

  lines.push(drawBottom());
  cardLineBounds.push({ id: "tools", startLine: toolsStart, endLine: lines.length - 1 });

  // 9. MCP Card (abajo del todo)
  const mcpTitle = `${BOLD}${GOLD}MCP${RESET} ${TEXT_DIM}· ${mcpList.length} activos${RESET}`;
  const mcpStart = lines.length;
  lines.push(drawTop(mcpTitle, collapsedCards.mcp));

  if (!collapsedCards.mcp) {
    if (mcpList.length === 0) {
      lines.push(drawRow(`${TEXT_DIM}Sin servidores MCP configurados${RESET}`));
    } else {
      for (const mcp of mcpList) {
        const statusDot = mcp.enabled ? `${MINT}●${RESET}` : `${AMBER}○${RESET}`;
        const typeBadge = `${TEXT_DIM}[${mcp.type}]${RESET}`;
        const nameFmt = `${BOLD}${TEXT_PRIMARY}${mcp.name}${RESET}`;
        const statusText = mcp.enabled ? `${MINT}en línea${RESET}` : `${TEXT_MUTED}desactivado${RESET}`;
        lines.push(drawRow(`${statusDot} ${nameFmt} ${typeBadge}`, statusText));
      }
    }
  }

  lines.push(drawBottom());
  cardLineBounds.push({ id: "mcp", startLine: mcpStart, endLine: lines.length - 1 });

  // Barra de atajos inferior estructurada (2 líneas para evitar line-wrap en anchos compactos)
  const hasActiveCritical = accountsList.some((a) => (a.isCritical || a.used5h >= 85) && activePrefixes.has(a.prefix.toLowerCase()));
  const targetHealthy = getBestHealthyTargetPrefix();
  const criticalAction = hasActiveCritical ? `${CORAL}x: migrar (${targetHealthy})${TEXT_DIM} · ${RESET}` : "";

  lines.push(`${TEXT_DIM} 1-9: colap · c: todo · d: libre · o: abrir${RESET}`);
  lines.push(`${TEXT_DIM} s: sync · r: act · ${criticalAction}q: salir${RESET}`);

  // Viewport windowing: Asegura que el total de renglones no desborde jamás la ventana
  const maxVisibleRows = Math.max(10, rows - 1);
  const maxScroll = Math.max(0, lines.length - maxVisibleRows);
  if (scrollOffset > maxScroll) scrollOffset = maxScroll;
  if (scrollOffset < 0) scrollOffset = 0;

  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxVisibleRows);

  // Reposicionar el cursor al inicio (0,0) sin borrar toda la pantalla (\x1b[J) para evitar parpadeos (flicker-free).
  // Se usa \x1b[K en cada renglón para limpiar cualquier residuo anterior de línea.
  const formattedOutput = visibleLines.map((l) => `${l}\x1b[K`).join("\n");
  process.stdout.write(`\x1b[H${formattedOutput}\n\x1b[J`);
}

// ============================================================================
// ATAJOS DE TECLADO, RATON Y CICLO DE VIDA
// ============================================================================
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (data) => {
    const raw = data.toString();

    // 1. Manejo de Mouse (SGR Extended Mode: \x1b[<button;x;yM / m)
    const mouseMatch = raw.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouseMatch) {
      const btn = parseInt(mouseMatch[1], 10);
      const y = parseInt(mouseMatch[3], 10);
      const isPress = mouseMatch[4] === "M";

      if (isPress) {
        if (btn === 0) { // Clic izquierdo
          const clickedLine = (y - 1) + scrollOffset;

          // Verificar si el clic fue en la acción especial de sincronización
          const syncHit = cardLineBounds.find((c) => c.actionType === "sync_integrations" && clickedLine === c.startLine);
          if (syncHit) {
            triggerSyncIntegrations();
            return;
          }

          // Verificar si el clic fue en la acción especial de abrir carpeta
          const actionHit = cardLineBounds.find((c) => c.actionLine === clickedLine && c.actionPath);
          if (actionHit) {
            openInFileExplorer(actionHit.actionPath);
            return;
          }

          const hitCard = cardLineBounds.find((c) => {
            if (collapsedCards[c.id]) {
              return clickedLine >= c.startLine && clickedLine <= c.endLine;
            }
            return clickedLine === c.startLine || clickedLine === c.endLine;
          });
          if (hitCard) {
            collapsedCards[hitCard.id] = !collapsedCards[hitCard.id];
            scheduleRender();
            return;
          }
        } else if (btn === 64) { // Rueda arriba (Scroll UP)
          if (scrollOffset > 0) {
            scrollOffset = Math.max(0, scrollOffset - 2);
            scheduleRender();
          }
          return;
        } else if (btn === 65) { // Rueda abajo (Scroll DOWN)
          scrollOffset += 2;
          scheduleRender();
          return;
        }
      }
      return;
    }

    // 2. Manejo de Teclado
    const key = raw;
    if (key === "q" || key === "\u0003") {
      cleanupAndExit();
    } else if (key === "r" || key === "R") {
      fetchQuotas(true); // Forzar actualización de TODAS las cuentas bajo demanda
    } else if (key === "s" || key === "S") {
      triggerSyncIntegrations(); // Sincronizar catálogo de modelos y auditar orquestadores SDD
    } else if (key === "d" || key === "D") {
      releaseInactiveSessions(); // Deseleccionar/archivar sesiones huérfanas en desuso
    } else if (key === "x" || key === "X") {
      migrateCriticalSessions(); // Migrar automáticamente sesiones con cuenta crítica
    } else if (key === "o" || key === "O") {
      const activeProjPath = projectTreeData ? projectTreeData.rootPath : targetDir;
      openInFileExplorer(activeProjPath);
    } else if (key === "c" || key === "C") {
      // Alternar todas las tarjetas (colapsar todo / expandir todo)
      const anyOpen = Object.values(collapsedCards).some((v) => !v);
      for (const k of Object.keys(collapsedCards)) {
        collapsedCards[k] = anyOpen;
      }
      scheduleRender();
    } else if (key >= "1" && key <= "9") {
      const cardKeys = ["estado", "contexto", "proyecto", "integraciones", "pools", "git", "engram", "tools", "mcp"];
      const target = cardKeys[parseInt(key, 10) - 1];
      if (target) {
        collapsedCards[target] = !collapsedCards[target];
        scheduleRender();
      }
    } else if (key === "\u001b[A" || key === "k") {
      if (scrollOffset > 0) {
        scrollOffset--;
        scheduleRender();
      }
    } else if (key === "\u001b[B" || key === "j") {
      scrollOffset++;
      scheduleRender();
    }
  });
}

function cleanupAndExit() {
  process.stdout.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l\x1b[?25h\n");
  process.exit(0);
}

// Activar pantalla alterna, ocultar cursor y habilitar mouse tracking SGR
process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1002h\x1b[?1006h");

process.on("exit", () => {
  process.stdout.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l\x1b[?25h");
});

process.on("SIGINT", cleanupAndExit);
process.on("SIGTERM", cleanupAndExit);

process.stdout.on("resize", () => {
  scheduleRender();
});

// Inicio del ciclo de vida
discoverAccounts();
render();
fetchQuotas(true); // Primer barrido de todas las cuentas para pintar la foto completa
setInterval(() => fetchQuotas(false), POLL_INTERVAL_MS); // Cada 2m solo cuentas activas
setInterval(checkLocalActivity, 3_000); // Chequeo local reactivo de turnos sin tráfico de red
