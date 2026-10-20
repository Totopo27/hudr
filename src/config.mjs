import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ============================================================================
// PALETA LINEAR / TUI (Truecolor 24-bit ANSI)
// ============================================================================
export const BORDER = "\x1b[38;2;120;75;160m";        // #784ba0 (violeta estructural sobrio)
export const BORDER_MUTED = "\x1b[38;2;70;45;95m";    // #462d5f (separadores sutiles)
export const ACCENT_PRIMARY = "\x1b[38;2;123;138;255m"; // #7B8AFF (periwinkle Linear)
export const ACCENT_PINK = "\x1b[38;2;240;149;200m";    // #F095C8 (indicador activo ▸)
export const GOLD = "\x1b[38;2;224;194;122m";           // #E0C27A (etiquetas, números destacados)
export const AMBER = "\x1b[38;2;242;184;109m";          // #F2B86D (aviso 70%+, git mod)
export const MINT = "\x1b[38;2;76;183;130m";            // #4CB782 (Linear success green)
export const CORAL = "\x1b[38;2;235;87;87m";            // #EB5757 (Linear error / crítico 85%+)
export const TEXT_PRIMARY = "\x1b[38;2;247;248;248m";   // #F7F8F8 (off-white texto principal)
export const TEXT_MUTED = "\x1b[38;2;138;143;152m";     // #8A8F98 (Linear muted secondary)
export const TEXT_DIM = "\x1b[38;2;90;94;102m";         // #5A5E66 (detalles tenues)
export const CYAN = "\x1b[38;2;139;233;253m";           // #8BE9FD (Dracula cyan)
export const MAGENTA = "\x1b[38;2;189;147;249m";        // #BD93F9 (Dracula purple)
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";

// ============================================================================
// CONFIGURACION Y RUTAS LOCALES (Portables & Agnosticas)
// ============================================================================
export function resolveAuthsDir() {
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

export const AUTHS_DIR = resolveAuthsDir();
export const QUOTA_URL = (process.env.CLIPROXY_QUOTA_URL && process.env.CLIPROXY_QUOTA_URL.trim())
  || "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
export const USER_AGENT = "antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)";
export const POLL_INTERVAL_MS = 120_000; // 2 minutos para el sondeo pasivo

export function resolveEngramDbPath() {
  if (process.env.ENGRAM_DB_PATH && process.env.ENGRAM_DB_PATH.trim()) {
    return process.env.ENGRAM_DB_PATH.trim();
  }
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

export function resolveModelsCachePath() {
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

export function resolveOpencodeDbPath() {
  if (process.env.OPENCODE_DB_PATH && process.env.OPENCODE_DB_PATH.trim()) {
    return process.env.OPENCODE_DB_PATH.trim();
  }
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

export const OPENCODE_DB_PATH = resolveOpencodeDbPath();
export const MODELS_CACHE_PATH = resolveModelsCachePath();
export const ENGRAM_DB_PATH = resolveEngramDbPath();

// Cache TTLs
export const GIT_CACHE_TTL_MS = 10_000;
export const HERDR_CACHE_TTL_MS = 2_500;

// Estructuras de fallback
export const fallbackGitData = {
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

export const fallbackHerdrPanes = {
  panes: [],
  myPaneId: process.env.HERDR_PANE_ID || null,
  myTabId: null,
};

// Explorador de proyecto / Carpetas ignoradas
export const PROJECT_TREE_IGNORED = new Set([
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

// Insignias de Familia de Modelos (Colores semánticos Linear)
export const VENDOR_MARKS = {
  claude: { name: "Claude", color: CYAN },
  gemini: { name: "Gemini", color: MINT },
  gpt: { name: "GPT", color: MAGENTA },
  agy: { name: "Antigravity", color: GOLD },
  opencode: { name: "OpenCode", color: ACCENT_PRIMARY },
  deepseek: { name: "DeepSeek", color: CYAN },
};

export function getVendorMark(vendorKey) {
  const key = (vendorKey || "").toLowerCase();
  const v = VENDOR_MARKS[key] || VENDOR_MARKS.claude;
  return {
    name: v.name,
    color: v.color,
    badge: `${v.color}[${v.name}]${RESET}`,
  };
}

// Estado inicial por defecto de acordeones colapsables
export const DEFAULT_COLLAPSED_CARDS = {
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
