import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { OPENCODE_DB_PATH, MODELS_CACHE_PATH } from "../config.mjs";
import { getHerdrPanesData } from "./herdr.mjs";

let modelsCacheData = null;
let modelsCacheMtime = 0;

export function resolveModelContextLimit(modelId, providerId = null) {
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
// RESOLUCION DE PREFIJOS DE CUENTA (MULTI-MODEL / JSON COMPLIANT)
// ============================================================================
export function extractAccountPrefix(agentStr, modelStr, accountsList = []) {
  // 1. Del agente (ej: sdd-orchestrator-xen1, sdd-apply-gianni, sdd-orchestrator-nina, etc.)
  if (agentStr) {
    const m = (agentStr || "").match(/sdd-[a-z0-9]+-([a-z0-9_-]+)/i);
    if (m?.[1]) return m[1].toLowerCase();

    const lowerAgent = agentStr.toLowerCase();
    for (const acc of accountsList) {
      const pfx = acc.prefix.toLowerCase();
      const re = new RegExp(`(?:^|[_-])${pfx}(?:[_-]|$)`, "i");
      if (re.test(lowerAgent) || lowerAgent.includes(`-${pfx}`) || lowerAgent.includes(`_${pfx}`)) {
        return pfx;
      }
    }
  }

  // 2. Del modelo (ej: {"id":"nina/gemini-3.8-flash-high"}, "cliproxy/nina/...", "nina/...")
  if (modelStr) {
    let modelId = String(modelStr);
    try {
      const parsed = JSON.parse(modelStr);
      if (parsed.id) modelId = parsed.id;
    } catch {}

    const cleanModel = modelId.toLowerCase().replace(/^(?:cliproxy|opencode)\//i, "");

    const mMod = cleanModel.match(/(?:^|[/"'\\\\])([a-z0-9_-]+)\/(?:gemini|claude|antigravity|[a-z0-9.-]+)/i);
    if (mMod?.[1]) {
      const candidate = mMod[1].toLowerCase();
      if (candidate !== "cliproxy" && candidate !== "opencode") {
        return candidate;
      }
    }

    for (const acc of accountsList) {
      const pfx = acc.prefix.toLowerCase();
      const re = new RegExp(`(?:^|[/"'\\\\])${pfx}(?:[/_-]|$)`, "i");
      if (re.test(cleanModel) || re.test(modelId.toLowerCase())) {
        return pfx;
      }
    }
  }

  return null;
}

// ============================================================================
// MCP SERVERS CONFIGURATION DISCOVERY
// ============================================================================
export function getMcpData(targetDir) {
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

// ============================================================================
// MAPEO DE SUBAGENTES SDD A CUENTAS Y FAMILIAS DE MODELOS
// ============================================================================
let cachedOpencodeConfig = null;
let cachedOpencodeConfigTime = 0;

export function resolveOpencodeConfig(targetDir) {
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

export function getSddSubagentAccountMap(orchestratorAgent, targetDir, localPrefix = null) {
  const accountModelMap = new Map(); // prefix -> { family, model, phase }
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
  const profile = m ? m[1].toLowerCase() : (localPrefix ? localPrefix.toLowerCase() : "");

  const agentSections = [];
  if (cfg.agent && typeof cfg.agent === "object") agentSections.push(cfg.agent);
  if (cfg.agents && typeof cfg.agents === "object") agentSections.push(cfg.agents);

  for (const section of agentSections) {
    for (const [name, def] of Object.entries(section)) {
      const lowerName = name.toLowerCase();
      const isMatch = profile
        ? lowerName.startsWith("sdd-") && lowerName.endsWith(`-${profile}`) && !lowerName.includes("orchestrator")
        : lowerName.startsWith("sdd-") && !lowerName.includes("orchestrator") && !lowerName.match(/sdd-[a-z0-9]+-[a-z0-9_-]+/i);

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

// ============================================================================
// OPENCODE SESSION, CONTEXT, MULTI-PANE HERDR & TOOL TELEMETRY
// ============================================================================
export function getOpenCodeSessionData({ cwd = process.cwd(), accountsList = [], herdrPanesData = null } = {}) {
  const result = {
    agent: "sdd-orchestrator",
    model: "gemini-3.8-flash-high",
    modelShort: "gemini-3.8-flash-high",
    localPrefix: null,
    tokensInput: 0,
    tokensOutput: 0,
    activeTurnContextTokens: 0,
    cost: 0,
    tools: { read: 0, write: 0, bash: 0, engram: 0, other: 0, total: 0 },
    activeDirectory: cwd,
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
    db.exec("PRAGMA busy_timeout = 2000;");

    let targetSession = null;

    // A. Consultamos el mapa en vivo de Herdr para descubrir todos los panes activos
    try {
      const { panes, myPaneId, myTabId } = herdrPanesData || getHerdrPanesData();

      // Recolectar todas las cuentas en uso a lo largo de TODOS los panes abiertos
      for (const p of panes) {
        const sesId = p.agent_session?.value;
        if (sesId) {
          const s = db.prepare("SELECT agent, model, time_archived, time_updated FROM session_v2 WHERE id = ?").get(sesId);
          if (s) {
            const isAlive = !s.time_archived || (s.time_updated && s.time_updated > s.time_archived) || p.agent_status === "working" || (myTabId && p.tab_id === myTabId);
            if (isAlive) {
              const pfx = extractAccountPrefix(s.agent, s.model, accountsList);
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
      const localPfx = extractAccountPrefix(targetSession.agent, targetSession.model, accountsList);
      if (localPfx) {
        result.localPrefix = localPfx;
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
