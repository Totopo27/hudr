import * as fs from "node:fs";
import * as path from "node:path";
import {
  OPENCODE_DB_PATH,
  resolveOpencodeDbPath,
  resolveEngramDbPath,
  QUOTA_URL,
  POLL_INTERVAL_MS,
  DEFAULT_COLLAPSED_CARDS,
} from "./config.mjs";
import { renderScreen } from "./ui/renderer.mjs";
import { getGitData, refreshGitDataAsync, getCachedGitData } from "./collectors/git.mjs";
import { getHerdrPanesData, refreshHerdrPanesAsync } from "./collectors/herdr.mjs";
import { getOpenCodeSessionData, getMcpData } from "./collectors/opencode.mjs";
import {
  accountsList,
  discoverAccounts,
  fetchQuotas as collectorFetchQuotas,
} from "./collectors/quotas.mjs";
import { getEngramData } from "./collectors/engram.mjs";
import { getProjectTreeData, openInFileExplorer } from "./collectors/tree.mjs";
import {
  releaseInactiveSessions as actionReleaseInactiveSessions,
  executeDatabaseMigration as actionExecuteDatabaseMigration,
  migrateCriticalSessions as actionMigrateCriticalSessions,
  getBestHealthyTargetPrefix,
} from "./actions/session-cleanup.mjs";
import { setupKeyboardAndMouse } from "./actions/keyboard.mjs";
import { syncIntegrationsAndOrchestrators } from "../sync-integrations.mjs";

// ============================================================================
// ESTADO GLOBAL DEL SIDEBAR
// ============================================================================
export const state = {
  accountsList,
  collapsedCards: { ...DEFAULT_COLLAPSED_CARDS },
  scrollOffset: 0,
  cardLineBounds: [],
  renderTimer: null,
  flashNotice: null,
  flashNoticeTimer: null,
  pendingMigrationTarget: null,
  lastKnownTurnTime: 0,
  dbWatcher: null,
  dbWatchDebounceTimer: null,
  isSyncingIntegrations: false,
  isStarted: false,
};

export function setFlashNotice(msg, durationMs = 4000) {
  state.flashNotice = msg;
  if (state.flashNoticeTimer) clearTimeout(state.flashNoticeTimer);
  state.flashNoticeTimer = setTimeout(() => {
    state.flashNotice = null;
    scheduleRender();
  }, durationMs);
  scheduleRender();
}

export function scheduleRender() {
  if (state.renderTimer) return;
  state.renderTimer = setTimeout(() => {
    state.renderTimer = null;
    render();
  }, 50);
}

export function render() {
  const cwd = process.cwd();
  const opencode = getOpenCodeSessionData({
    cwd,
    accountsList: state.accountsList,
  });

  const targetDir = (opencode.activeDirectory && fs.existsSync(opencode.activeDirectory))
    ? opencode.activeDirectory
    : cwd;

  let git = getGitData(targetDir, false, scheduleRender);
  if (!git.hasGit && targetDir !== cwd) {
    git = getGitData(cwd, false, scheduleRender);
  }

  const engram = getEngramData(path.basename(targetDir).toLowerCase(), targetDir);
  const mcpList = getMcpData(targetDir);
  const projectTreeData = getProjectTreeData(targetDir);

  const result = renderScreen({
    cols: process.stdout.columns || 46,
    rows: process.stdout.rows || 32,
    collapsedCards: state.collapsedCards,
    scrollOffset: state.scrollOffset,
    flashNotice: state.flashNotice,
    pendingMigrationTarget: state.pendingMigrationTarget,
    accountsList: state.accountsList,
    opencode,
    git,
    engram,
    mcpList,
    projectTreeData,
    targetDir,
  });

  state.cardLineBounds = result.cardLineBounds;
  state.scrollOffset = result.scrollOffset;
}

// Comprobación de turnos locales reactiva cada 5s (fallback seguro)
export function checkLocalActivity() {
  const sessionData = getOpenCodeSessionData({
    cwd: process.cwd(),
    accountsList: state.accountsList,
  });

  // Si había una migración encolada y el agente pasó a 'idle', ejecutarla en frío
  if (state.pendingMigrationTarget && sessionData.agentStatus !== "working") {
    const target = state.pendingMigrationTarget;
    state.pendingMigrationTarget = null;
    executeDatabaseMigration(target);
    return;
  }

  if (sessionData.lastUpdatedTurn > 0) {
    if (state.lastKnownTurnTime > 0 && sessionData.lastUpdatedTurn > state.lastKnownTurnTime) {
      // El asistente completó un turno: refrescamos la cuenta activa inmediatamente
      fetchQuotas(false);
    }
    state.lastKnownTurnTime = sessionData.lastUpdatedTurn;
  }

  // Refresca UI periódicamente si hay cuentas críticas/aviso para alternar la etiqueta y el timer
  const hasAlertAccounts = state.accountsList.some((a) => (a.isCritical || a.isWarning) && !a.hasError);
  if (hasAlertAccounts) {
    scheduleRender();
  }
}

export function setupDatabaseWatcher() {
  try {
    const dbDir = path.dirname(OPENCODE_DB_PATH);
    if (!fs.existsSync(dbDir)) return;

    state.dbWatcher = fs.watch(dbDir, (eventType, filename) => {
      if (!filename) return;
      const lower = filename.toLowerCase();
      if (lower.startsWith("opencode.db")) {
        if (state.dbWatchDebounceTimer) clearTimeout(state.dbWatchDebounceTimer);
        state.dbWatchDebounceTimer = setTimeout(() => {
          state.dbWatchDebounceTimer = null;
          checkLocalActivity();
          scheduleRender();
        }, 250);
      }
    });

    state.dbWatcher.on("error", () => {
      // Ignorar errores transitorios de watcher y dejar activo el fallback por intervalo
    });
  } catch {
    // Si fs.watch falla (ej: permisos, carpetas virtuales), se ignora y opera por polling
  }
}

export async function fetchQuotas(forceAll = false) {
  const sessionData = getOpenCodeSessionData({
    cwd: process.cwd(),
    accountsList: state.accountsList,
  });

  await collectorFetchQuotas({
    targetList: state.accountsList,
    sessionData,
    forceAll,
    onDone: scheduleRender,
  });
}

export async function triggerSyncIntegrations() {
  if (state.isSyncingIntegrations) return;
  state.isSyncingIntegrations = true;
  setFlashNotice("... Sincronizando modelos y orquestadores...");
  try {
    const res = await syncIntegrationsAndOrchestrators();
    await fetchQuotas(true);
    setFlashNotice(`[ok] Sincronizado: ${res.totalModels} modelos (+${res.addedModels} nuevos), ${res.repairedOrchestrators} orquestadores auditados`);
  } catch (err) {
    setFlashNotice(`! Error sincronizando: ${err.message}`);
  } finally {
    state.isSyncingIntegrations = false;
  }
}

export function releaseInactiveSessions() {
  return actionReleaseInactiveSessions({
    accountsList: state.accountsList,
    getHerdrPanesData,
    getOpenCodeSessionData,
    onNotice: setFlashNotice,
    onRender: scheduleRender,
    cwd: process.cwd(),
  });
}

export function executeDatabaseMigration(targetPrefix) {
  return actionExecuteDatabaseMigration(targetPrefix, {
    accountsList: state.accountsList,
    getHerdrPanesData,
    getOpenCodeSessionData,
    cachedGitData: getCachedGitData(),
    onNotice: setFlashNotice,
    onRender: scheduleRender,
    cwd: process.cwd(),
  });
}

export function migrateCriticalSessions() {
  return actionMigrateCriticalSessions({
    accountsList: state.accountsList,
    getHerdrPanesData,
    getOpenCodeSessionData,
    cachedGitData: getCachedGitData(),
    onNotice: setFlashNotice,
    onRender: scheduleRender,
    cwd: process.cwd(),
    setPendingMigration: (target) => {
      state.pendingMigrationTarget = target;
    },
  });
}

export function cleanupAndExit() {
  if (state.dbWatcher) {
    try {
      state.dbWatcher.close();
    } catch {}
  }
  process.stdout.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l\x1b[?25h\n");
  process.exit(0);
}

export function startSidebar() {
  if (state.isStarted) return;
  state.isStarted = true;

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

  // Configurar input teclado y raton
  setupKeyboardAndMouse({
    getScrollOffset: () => state.scrollOffset,
    setScrollOffset: (val) => {
      state.scrollOffset = val;
    },
    getCardLineBounds: () => state.cardLineBounds,
    collapsedCards: state.collapsedCards,
    scheduleRender,
    onExit: cleanupAndExit,
    onRefreshQuotas: (forceAll) => fetchQuotas(forceAll),
    onSyncIntegrations: triggerSyncIntegrations,
    onReleaseSessions: releaseInactiveSessions,
    onMigrateCritical: migrateCriticalSessions,
    onOpenFolder: (targetPath) => openInFileExplorer(targetPath, setFlashNotice),
    getActiveProjPath: () => {
      const opencode = getOpenCodeSessionData({ cwd: process.cwd(), accountsList: state.accountsList });
      return opencode.activeDirectory || process.cwd();
    },
  });

  // Inicio del ciclo de vida
  discoverAccounts(state.accountsList);
  setupDatabaseWatcher();
  refreshGitDataAsync(process.cwd(), scheduleRender);
  refreshHerdrPanesAsync(scheduleRender);
  render();
  fetchQuotas(true); // Primer barrido de todas las cuentas para pintar la foto completa

  setInterval(() => fetchQuotas(false), POLL_INTERVAL_MS); // Cada 2m solo cuentas activas
  setInterval(checkLocalActivity, 5_000); // Chequeo local fallback con safety net de 5s
}

// Re-exports para compatibilidad total con módulos y tests
export {
  getGitData,
  refreshGitDataAsync,
  getHerdrPanesData,
  refreshHerdrPanesAsync,
  resolveOpencodeDbPath,
  resolveEngramDbPath,
  QUOTA_URL,
  getBestHealthyTargetPrefix,
};
