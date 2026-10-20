import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { OPENCODE_DB_PATH } from "../config.mjs";
import { extractAccountPrefix } from "../collectors/opencode.mjs";

export function getBestHealthyTargetPrefix(accountsList = [], sessionData = null) {
  const activePrefixes = sessionData?.allActivePrefixes || new Set();

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

export function releaseInactiveSessions({
  accountsList = [],
  getHerdrPanesData,
  getOpenCodeSessionData,
  onNotice = null,
  onRender = null,
  cwd = process.cwd(),
} = {}) {
  const currentSessionId = process.env.OPENCODE_SESSION_ID || null;
  let closedCount = 0;
  const releasedPrefixes = new Set();
  const sessionData = getOpenCodeSessionData({ cwd, accountsList });
  const engramProject = path.basename(sessionData.activeDirectory || cwd).toLowerCase();

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
    db.exec("PRAGMA busy_timeout = 3000;");

    // Archivar sesiones huérfanas en la base de datos de OpenCode y registrar qué cuentas liberamos
    for (const p of panes) {
      const sesId = p.agent_session?.value;
      if (sesId && sesId !== keepSessionId) {
        const s = db.prepare("SELECT agent, model, time_archived, time_updated FROM session_v2 WHERE id = ?").get(sesId);
        if (s) {
          db.prepare("UPDATE session_v2 SET time_archived = ? WHERE id = ?").run(now, sesId);
          closedCount++;

          const pfx = extractAccountPrefix(s.agent, s.model, accountsList);
          if (pfx) releasedPrefixes.add(pfx);
        }
      }
    }

    db.close();

    if (closedCount > 0) {
      const releasedListStr = Array.from(releasedPrefixes).join(", ") || "cuentas secundarias";
      if (typeof onNotice === "function") {
        onNotice(`[!] ${closedCount} sesion(es) archivadas. Liberadas: [${releasedListStr}]`);
      }

      // Trazabilidad en Engram de la limpieza
      const engramBin = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "engram", "bin", "engram.exe")
        : path.join(os.homedir(), "AppData", "Local", "engram", "bin", "engram.exe");
      if (fs.existsSync(engramBin)) {
        try {
          const title = `Limpieza de sesiones huérfanas: ${engramProject} [${releasedListStr}]`;
          const content = `**What**: Cierre y archivado limpio de ${closedCount} sesión(es) huérfana(s) en desuso.\n**Cuentas liberadas**: ${releasedListStr}\n**Why**: Deselección manual vía tecla 'd' para liberar pines en HUD y evitar saturación concurrente.\n**Where**: ${sessionData.activeDirectory || cwd}`;
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
      if (typeof onNotice === "function") {
        onNotice("No había sesiones secundarias para liberar.");
      }
    }

    if (typeof onRender === "function") onRender();
  } catch (err) {
    if (typeof onNotice === "function") {
      onNotice(`[error] Error al liberar sesiones: ${err.message}`);
    }
  }

  return closedCount;
}

export function executeDatabaseMigration(targetPrefix, {
  accountsList = [],
  getHerdrPanesData,
  getOpenCodeSessionData,
  cachedGitData = null,
  onNotice = null,
  onRender = null,
  cwd = process.cwd(),
} = {}) {
  const sessionData = getOpenCodeSessionData({ cwd, accountsList });
  const criticalList = accountsList.filter((a) => a.isCritical || (a.used5h >= 85 && !a.hasError));
  if (criticalList.length === 0) return 0;

  let totalMigrated = 0;
  const migratedFrom = [];

  try {
    const db = new DatabaseSync(OPENCODE_DB_PATH, { open: true });
    db.exec("PRAGMA busy_timeout = 3000;");
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
      if (typeof onNotice === "function") {
        onNotice(`[ok] ${totalMigrated} sesion(es) migradas en vivo a ${targetPrefix}!`);
      }

      // Snapshot rico en Engram con contexto ODD / Gentle Shell / Checkpoint
      const engramBin = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "engram", "bin", "engram.exe")
        : path.join(os.homedir(), "AppData", "Local", "engram", "bin", "engram.exe");
      if (fs.existsSync(engramBin)) {
        try {
          const branch = cachedGitData?.branch || "main";
          const filesArray = Array.from(sessionData.attributedChanges.files);
          const filesStr = filesArray.length > 0 ? filesArray.join(", ") : "sin archivos modificados aún";
          const engramProject = path.basename(sessionData.activeDirectory || cwd).toLowerCase();

          // Extraer último estado / snippet del turno para checkpointing estilo Gentle Shell
          let lastSnippet = "";
          try {
            const dbCheck = new DatabaseSync(OPENCODE_DB_PATH, { open: true, readOnly: true });
            dbCheck.exec("PRAGMA busy_timeout = 2000;");
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
          const content = `**What**: Checkpoint y rotación en frío de ${totalMigrated} sesión(es) desde [${migratedFrom.join(", ")}] hacia ${targetPrefix}.\n**Rama Git**: ${branch}\n**Archivos tocados**: ${filesStr} (+${sessionData.attributedChanges.additions} -${sessionData.attributedChanges.deletions})${lastSnippet}\n**Why**: Cuota crítica agotada (>=85% usado) en cuenta(s) saliente(s).\n**Where**: ${sessionData.activeDirectory || cwd}`;

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
      if (typeof onNotice === "function") {
        onNotice(`No hay sesiones abiertas usando [${criticalList.map((c) => c.prefix).join(", ")}].`);
      }
    }

    if (typeof onRender === "function") onRender();
  } catch (err) {
    if (typeof onNotice === "function") {
      onNotice(`[error] Error al migrar: ${err.message}`);
    }
  }

  return totalMigrated;
}

export function migrateCriticalSessions({
  accountsList = [],
  getHerdrPanesData,
  getOpenCodeSessionData,
  cachedGitData = null,
  onNotice = null,
  onRender = null,
  cwd = process.cwd(),
  setPendingMigration = null,
} = {}) {
  const sessionData = getOpenCodeSessionData({ cwd, accountsList });
  const activePrefixes = sessionData.allActivePrefixes;

  // Solo considerar cuentas críticas o al 85%+ que estén ACTIVAS en alguna sesión
  const criticalList = accountsList.filter(
    (a) => (a.isCritical || (a.used5h >= 85 && !a.hasError)) && activePrefixes.has(a.prefix.toLowerCase())
  );
  if (criticalList.length === 0) {
    if (typeof onNotice === "function") {
      onNotice("No hay sesiones activas usando cuentas críticas.");
    }
    return 0;
  }

  const targetPrefix = getBestHealthyTargetPrefix(accountsList, sessionData);

  // Si el agente está en pleno streaming / working, encolar para no matar el turno
  if (sessionData.agentStatus === "working") {
    if (typeof setPendingMigration === "function") {
      setPendingMigration(targetPrefix);
    }
    if (typeof onNotice === "function") {
      onNotice(`... Agente trabajando: rotacion a ${targetPrefix} programada para el final del turno.`, 6000);
    }
    return 0;
  }

  return executeDatabaseMigration(targetPrefix, {
    accountsList,
    getHerdrPanesData,
    getOpenCodeSessionData,
    cachedGitData,
    onNotice,
    onRender,
    cwd,
  });
}
