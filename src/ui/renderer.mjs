import * as path from "node:path";
import {
  BORDER,
  BORDER_MUTED,
  ACCENT_PRIMARY,
  ACCENT_PINK,
  GOLD,
  AMBER,
  MINT,
  CORAL,
  TEXT_PRIMARY,
  TEXT_MUTED,
  TEXT_DIM,
  CYAN,
  MAGENTA,
  RESET,
  BOLD,
  getVendorMark,
} from "../config.mjs";
import {
  stringWidth,
  truncateToWidth,
  formatTokenCount,
  formatCost,
  getQuotaThreshold,
} from "./ansi.mjs";
import {
  drawTop,
  drawBottom,
  drawDivider,
  drawRow,
  renderGaugeInline,
} from "./primitives.mjs";
import { colorizeGitGraphLine } from "../collectors/git.mjs";
import { resolveModelContextLimit, getSddSubagentAccountMap } from "../collectors/opencode.mjs";
import { getBestHealthyTargetPrefix } from "../actions/session-cleanup.mjs";

export function renderScreen({
  cols = process.stdout.columns || 46,
  rows = process.stdout.rows || 32,
  collapsedCards = {},
  scrollOffset = 0,
  flashNotice = null,
  pendingMigrationTarget = null,
  accountsList = [],
  opencode = {},
  git = {},
  engram = {},
  mcpList = [],
  projectTreeData = { rootPath: "", totalDirs: 0, totalFiles: 0, tree: [] },
  targetDir = process.cwd(),
} = {}) {
  const width = Math.max(36, Math.min(cols - 2, 50));
  const innerWidth = width - 4; // 1 (│) + 1 ( ) + innerWidth + 1 ( ) + 1 (│) = width
  const folder = path.basename(targetDir);

  const cardLineBounds = [];
  const lines = [];

  const top = (title, collapsed) => drawTop(title, collapsed, width);
  const bot = () => drawBottom(width);
  const div = () => drawDivider(width);
  const row = (l, r = "") => drawRow(l, r, width);

  const activePrefixes = opencode.allActivePrefixes || new Set();

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
  lines.push(top(estadoTop, collapsedCards.estado));
  if (!collapsedCards.estado) {
    const shortProject = folder.length > 20 ? folder.slice(0, 18) + "…" : folder;
    lines.push(row(`${GOLD}Proyecto${RESET}`, `${TEXT_PRIMARY}~/.../${shortProject}${RESET}`));
    const dirtyBadge = git.isClean ? `${MINT}limpio${RESET}` : `${AMBER}±${(git.modified || 0) + (git.staged || 0)}${RESET}`;
    lines.push(row(`${GOLD}Rama${RESET}`, `${CYAN}# ${git.branch || "main"}${RESET} ${dirtyBadge}`));
    const activeModelDisplay = `${ACCENT_PRIMARY}${opencode.modelShort || "gemini-3.8-flash-high"}${RESET} ${GOLD}(high)${RESET}`;
    lines.push(row(`${GOLD}Modelo${RESET}`, activeModelDisplay));

    // Listado de perfiles activos en la línea sub-vitals
    const mcpCountStr = mcpList.length > 0 ? `${mcpList.length} MCPs` : "0 MCPs";
    const activeProfLabels = Array.from(activePrefixes).map((p) => `${ACCENT_PINK}*${RESET} ${MINT}${p}${RESET}`).join(" ") || `${TEXT_MUTED}default${RESET}`;
    const subVitals = `${ACCENT_PRIMARY}mem:${RESET} ${TEXT_PRIMARY}${engram.project || folder}${RESET} ${TEXT_DIM}·${RESET} ${TEXT_MUTED}${mcpCountStr}${RESET} ${TEXT_DIM}·${RESET} ${activeProfLabels}`;
    lines.push(row(subVitals, `${ACCENT_PINK}>${RESET}`));
  }
  lines.push(bot());
  cardLineBounds.push({ id: "estado", startLine: estadoStart, endLine: lines.length - 1 });

  // 3. Contexto Card
  const contextoStart = lines.length;
  lines.push(top(`${BOLD}${GOLD}Contexto${RESET}`, collapsedCards.contexto));
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

    lines.push(row(leftTokensStr, rightContextStatus));
    lines.push(row(renderGaugeInline(contextPercent, innerWidth, gaugeColor)));
    const inTokens = opencode.tokensInput > 0 ? opencode.tokensInput : 1_400_000;
    const outTokens = opencode.tokensOutput > 0 ? opencode.tokensOutput : 12_600;
    const leftBreakdown = `${TEXT_DIM}^${RESET} ${TEXT_PRIMARY}${formatTokenCount(inTokens)}${RESET} ${TEXT_DIM}·${RESET} ${TEXT_DIM}v${RESET} ${TEXT_PRIMARY}${formatTokenCount(outTokens)}${RESET}`;
    const rightCost = `${GOLD}Costo${RESET} ${TEXT_PRIMARY}${formatCost(opencode.cost || 0)}${RESET}`;
    lines.push(row(leftBreakdown, rightCost));
    if (isMature || isSaturated) {
      lines.push(row(`${AMBER}[aviso] Sesion madura: usa /snew para handover limpio${RESET}`));
    }
  }
  lines.push(bot());
  cardLineBounds.push({ id: "contexto", startLine: contextoStart, endLine: lines.length - 1 });

  // 3B. Proyecto / Archivos Card (2 Niveles, colapsada por defecto)
  const proyectoStart = lines.length;
  const projectStatsBadge = `${TEXT_DIM}${projectTreeData.totalDirs}d · ${projectTreeData.totalFiles}f${RESET}`;
  const projectCardTitle = `${ACCENT_PRIMARY}~${RESET} ${BOLD}${GOLD}Proyecto${RESET} ${TEXT_DIM}·${RESET} ${CYAN}${folder}${RESET} ${projectStatsBadge}`;
  lines.push(top(projectCardTitle, collapsedCards.proyecto));

  if (!collapsedCards.proyecto) {
    // Fila 1: Botón interactivo de abrir en explorador
    const normalizedRoot = (projectTreeData.rootPath || targetDir).replace(/\\/g, "/");
    lines.push(row(`${GOLD}Ruta${RESET} ${MINT}[abrir en PC ↗]${RESET}`, `${TEXT_PRIMARY}${normalizedRoot}${RESET}`));

    if (projectTreeData.tree.length === 0) {
      lines.push(row(`${TEXT_DIM}(carpeta vacía o sin archivos visibles)${RESET}`));
    } else {
      for (const item of projectTreeData.tree) {
        if (item.isDir) {
          const dirIcon = `${CYAN}> /${RESET}`;
          const dirCountBadge = `${TEXT_DIM}(${item.children.length})${RESET}`;
          lines.push(row(`${dirIcon} ${TEXT_PRIMARY}${item.name}/${RESET} ${dirCountBadge}`));

          // Nivel 2: subelementos
          for (const sub of item.children) {
            const subIcon = sub.isDir ? `${CYAN}└ /${RESET}` : `${TEXT_DIM}└ ${RESET}`;
            const subName = sub.isDir ? `${TEXT_PRIMARY}${sub.name}/${RESET}` : `${TEXT_MUTED}${sub.name}${RESET}`;
            lines.push(row(`   ${subIcon} ${subName}`));
          }
        } else {
          const fileIcon = `${TEXT_DIM}• ${RESET}`;
          lines.push(row(`${fileIcon} ${TEXT_MUTED}${item.name}${RESET}`));
        }
      }
    }
  }
  lines.push(bot());
  cardLineBounds.push({
    id: "proyecto",
    startLine: proyectoStart,
    endLine: lines.length - 1,
    actionLine: !collapsedCards.proyecto ? proyectoStart + 1 : null,
    actionPath: projectTreeData.rootPath || targetDir,
  });

  // 5. Integraciones Card
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
  lines.push(top(`${GOLD}Integraciones${RESET} ${TEXT_DIM}·${RESET} ${intTitleRight}`, collapsedCards.integraciones));

  if (!collapsedCards.integraciones) {
    if (accountsList.length === 0) {
      lines.push(row(`${TEXT_DIM}Cargando cuentas de Antigravity…${RESET}`));
    } else {
      for (const acc of accountsList) {
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

        lines.push(row(leftCol, rightCol));
      }
      lines.push(div());
      const syncBtnLine = lines.length;
      lines.push(row(`${CYAN}>> [sincronizar]${RESET}`));
      cardLineBounds.push({
        id: "integraciones_sync",
        startLine: syncBtnLine,
        endLine: syncBtnLine,
        actionType: "sync_integrations",
      });
    }
  }

  // Notificaciones de alerta
  const alertAccounts = accountsList.filter((a) => (a.isCritical || a.isWarning) && !a.hasError && activePrefixes.has(a.prefix.toLowerCase()));
  if (flashNotice || alertAccounts.length > 0) {
    lines.push(div());
    if (flashNotice) {
      lines.push(row(`${BOLD}${MINT}${flashNotice}${RESET}`));
    }
    const targetHealthy = getBestHealthyTargetPrefix(accountsList, opencode);
    if (pendingMigrationTarget) {
      lines.push(row(`${BOLD}${AMBER}... Rotacion a ${pendingMigrationTarget} programada al terminar turno${RESET}`));
    }
    for (const ca of alertAccounts) {
      if (ca.isCritical) {
        const actionLabel = opencode.agentStatus === "working"
          ? `[presioná 'x' -> programar a ${targetHealthy}]`
          : `[presioná 'x' -> migrar a ${targetHealthy}]`;
        lines.push(row(`${BOLD}${CORAL}! CRÍTICO: ${ca.prefix} (activa) ${actionLabel}${RESET}`));
      } else {
        lines.push(row(`${AMBER}! AVISO 70%: ${ca.prefix} al ${ca.used5h}% usado (queda ${ca.rem5h}%) - considerar rotar${RESET}`));
      }
    }
  }

  lines.push(bot());
  cardLineBounds.push({ id: "integraciones", startLine: integracionesStart, endLine: lines.length - 1 });

  // 5B. Pools Breakdown Card: Multi-Model SDD vs. Dedicated Mono-Account SDD
  const isSddAgent = (opencode.agent || "").toLowerCase().includes("sdd") || (opencode.agent || "").toLowerCase().includes("gentle");
  const subagentMap = isSddAgent ? getSddSubagentAccountMap(opencode.agent, targetDir) : new Map();
  const localPrefix = opencode.allActivePrefixes?.size === 1 ? Array.from(opencode.allActivePrefixes)[0] : null;
  const isMultiModelSDD =
    /claude|multi|hybrid|distrib/i.test(opencode.agent || "") ||
    subagentMap.size > 1 ||
    (!localPrefix && isSddAgent);

  if (isMultiModelSDD) {
    // ESCENARIO 1: SDD Multi-Modelo / Distribuido
    const agentModelStr = `${opencode.agent || ""} ${opencode.model || ""}`.toLowerCase();
    const fallbackFamily = agentModelStr.includes("claude") ? "Claude" : (agentModelStr.includes("gemini") ? "Gemini" : "Claude");

    const accountsWithPools = accountsList.filter((a) => a.pools && a.pools.length > 0);
    const targetAccounts = subagentMap.size > 0
      ? accountsWithPools.filter((a) => subagentMap.has(a.prefix.toLowerCase()))
      : accountsWithPools;

    if (targetAccounts.length > 0) {
      const distributedRows = [];
      for (const acc of targetAccounts) {
        const mapping = subagentMap.get(acc.prefix.toLowerCase());
        const family = mapping ? mapping.family : fallbackFamily;

        let targetPool = null;
        if (family === "Claude") {
          targetPool = acc.pools.find((x) => x.label?.toLowerCase().includes("claude") && x.label?.includes("5h"));
        } else if (family === "Gemini") {
          targetPool = acc.pools.find((x) => x.label?.toLowerCase().includes("gemini") && x.label?.includes("5h"));
        }

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
        lines.push(top(`${GOLD}SDD Multi-modelo${RESET} ${TEXT_DIM}·${RESET} ${accountCountBadge}`, collapsedCards.pools));

        if (!collapsedCards.pools) {
          const poolGaugeCells = 8;
          for (const rowItem of distributedRows) {
            const threshold = getQuotaThreshold(rowItem.percent);
            const shortPrefix = rowItem.prefix.length > 8 ? rowItem.prefix.slice(0, 7) + "…" : rowItem.prefix.padEnd(8);
            const pfxDisplay = `${BOLD}${TEXT_PRIMARY}${shortPrefix}${RESET}`;

            const vMark = getVendorMark(rowItem.family);
            const tagDisplay = vMark.badge;

            const bar = renderGaugeInline(rowItem.percent, poolGaugeCells, threshold.color);
            const pctFmt = `${BOLD}${threshold.color(String(rowItem.percent).padStart(3) + "%")}${RESET}`;
            const paceStr = rowItem.pace ? `${rowItem.pace.color}${rowItem.pace.text}${RESET} ` : "";
            const resetStr = rowItem.reset ? `${TEXT_DIM}${rowItem.reset}${RESET}` : "";

            const leftCol = `${pfxDisplay} ${tagDisplay} ${bar} ${pctFmt}`;
            if (rowItem.hasError) {
              lines.push(row(leftCol, `${AMBER}${rowItem.errorMsg}${RESET}`));
            } else {
              lines.push(row(leftCol, `${paceStr}${resetStr}`.trim()));
            }
          }

          const percents = distributedRows.map((r) => r.percent);
          const minPct = Math.min(...percents);
          const avgPct = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
          const minAcc = distributedRows.find((r) => r.percent === minPct);
          const minThreshold = getQuotaThreshold(minPct);
          const avgThreshold = getQuotaThreshold(avgPct);

          lines.push(div());
          lines.push(row(
            `${minThreshold.color(`min: ${minPct}%`)} ${TEXT_DIM}(${minAcc?.prefix || "?"})${RESET}`,
            `${avgThreshold.color(`prom: ${avgPct}%`)}`,
          ));
        }

        lines.push(bot());
        cardLineBounds.push({ id: "pools", startLine: poolsStart, endLine: lines.length - 1 });
      }
    }
  } else {
    // ESCENARIO 2: SDD Mono-Modelo / Cuenta Dedicada
    const targetActiveAccounts = accountsList.filter((a) => activePrefixes.has(a.prefix.toLowerCase()));
    const poolCardsToShow = targetActiveAccounts.length > 0 ? targetActiveAccounts : (accountsList.slice(0, 1));
    const cardTitlePrefix = isSddAgent ? "SDD Mono-modelo" : "Antigravity";

    for (const acc of poolCardsToShow) {
      if (acc.pools && acc.pools.length > 0) {
        const activeTag = activePrefixes.has(acc.prefix.toLowerCase()) ? " (activa)" : "";
        const poolsStart = lines.length;
        lines.push(top(`${GOLD}${cardTitlePrefix}${RESET} ${TEXT_DIM}·${RESET} ${MINT}${acc.prefix}${activeTag}${RESET}`, collapsedCards.pools));

        if (!collapsedCards.pools) {
          if (acc.hasError) {
            lines.push(row(`${AMBER}! ${acc.errorMsg}${RESET}`));
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
            lines.push(row(leftCol, rightCol));
          }
        }

        lines.push(bot());
        cardLineBounds.push({ id: "pools", startLine: poolsStart, endLine: lines.length - 1 });
      }
    }
  }

  // 6. Gráfico Git & Gentle Attributed Changes Card
  const agentFilesCount = opencode.attributedChanges?.files?.size || 0;
  const agentChangesTitle = agentFilesCount > 0
    ? `${BOLD}${GOLD}Cambios${RESET} ${TEXT_DIM}· ${agentFilesCount} por agente${RESET}`
    : `${BOLD}${GOLD}Git y Cambios${RESET}`;
  const gitStart = lines.length;
  lines.push(top(agentChangesTitle, collapsedCards.git));

  if (!collapsedCards.git) {
    const gitBadges = git.isClean
      ? `${MINT}ok limpio${RESET}`
      : `${AMBER}* ${git.modified || 0} mod${RESET} ${TEXT_DIM}·${RESET} ${MAGENTA}?${git.untracked || 0}${RESET}`;
    lines.push(row(`${CYAN}${git.branch || "main"}${RESET}`, gitBadges));

    if (git.graphLines && git.graphLines.length > 0) {
      for (const gLine of git.graphLines.slice(0, 2)) {
        lines.push(row(colorizeGitGraphLine(gLine)));
      }
    } else {
      lines.push(row(`${TEXT_DIM}* (sin commits recientes)${RESET}`));
    }

    const totalDiffFiles = (git.modified || 0) + (git.staged || 0);
    const changesSummary = totalDiffFiles > 0
      ? `${TEXT_DIM}git:${RESET} ${TEXT_PRIMARY}${totalDiffFiles} archivos${RESET} ${TEXT_DIM}·${RESET} ${MINT}+${git.linesAdded || 0}${RESET} ${CORAL}-${git.linesDeleted || 0}${RESET}`
      : `${TEXT_DIM}git:${RESET} ${MINT}limpio${RESET}`;

    const agentSummary = agentFilesCount > 0
      ? `${ACCENT_PRIMARY}ag:${RESET} ${MINT}${agentFilesCount} archivos${RESET} ${TEXT_DIM}(+${opencode.attributedChanges.additions} -${opencode.attributedChanges.deletions})${RESET}`
      : `${ACCENT_PRIMARY}ag:${RESET} ${TEXT_DIM}0 archivos${RESET}`;

    lines.push(row(changesSummary, agentSummary));
  }

  lines.push(bot());
  cardLineBounds.push({ id: "git", startLine: gitStart, endLine: lines.length - 1 });

  // 7. Engram Card
  const engramStart = lines.length;
  lines.push(top(`${ACCENT_PRIMARY}Engram:${RESET} ${CYAN}${engram.project || folder}${RESET} ${TEXT_DIM}^${RESET}`, collapsedCards.engram));
  if (!collapsedCards.engram) {
    const localOnlineStatus = engram.online ? `${MINT}● En linea${RESET}` : `${CORAL}○ Caido${RESET}`;
    lines.push(row(`Local (7437)`, `${localOnlineStatus} ${TEXT_DIM}·${RESET} ${CYAN}${engram.obsCount || 0} obs${RESET}`));
    if (engram.cloudHost) {
      const syncStatus = engram.enrolled ? `${MINT}● Enrolado${RESET}` : `${TEXT_DIM}○ No sinc${RESET}`;
      lines.push(row(`Cloud: ${TEXT_DIM}${engram.cloudHost}${RESET}`, `${syncStatus} ${CYAN}↗${RESET}`));
    } else {
      lines.push(row(`Cloud: ${TEXT_DIM}solo local${RESET}`, `${TEXT_DIM}○ no configurado${RESET}`));
    }
  }
  lines.push(bot());
  cardLineBounds.push({ id: "engram", startLine: engramStart, endLine: lines.length - 1 });

  // 8. Herramientas Telemetry Card
  const toolsCount = opencode.tools?.total > 0
    ? opencode.tools
    : { read: 6, write: 7, bash: 16, engram: 1, other: 1, total: 31 };
  const toolsTitleFmt = `${BOLD}${GOLD}Herramientas${RESET} ${TEXT_DIM}· ${toolsCount.total} llamadas${RESET}`;
  const toolsStart = lines.length;
  lines.push(top(toolsTitleFmt, collapsedCards.tools));

  if (!collapsedCards.tools) {
    const pRead = `${MAGENTA}@ ${toolsCount.read} lecturas${RESET}`;
    const pWrite = `${CYAN}@ ${toolsCount.write} escrituras${RESET}`;
    const pBash = `${MINT}>_ ${toolsCount.bash} bash${RESET}`;
    const pEngram = `${CORAL}mem: ${toolsCount.engram}${RESET}`;
    lines.push(row(`${pRead}  ${pWrite}  ${pBash}`, pEngram));
  }

  lines.push(bot());
  cardLineBounds.push({ id: "tools", startLine: toolsStart, endLine: lines.length - 1 });

  // 9. MCP Card
  const mcpTitle = `${BOLD}${GOLD}MCP${RESET} ${TEXT_DIM}· ${mcpList.length} activos${RESET}`;
  const mcpStart = lines.length;
  lines.push(top(mcpTitle, collapsedCards.mcp));

  if (!collapsedCards.mcp) {
    if (mcpList.length === 0) {
      lines.push(row(`${TEXT_DIM}Sin servidores MCP configurados${RESET}`));
    } else {
      for (const mcp of mcpList) {
        const statusDot = mcp.enabled ? `${MINT}●${RESET}` : `${AMBER}○${RESET}`;
        const typeBadge = `${TEXT_DIM}[${mcp.type}]${RESET}`;
        const nameFmt = `${BOLD}${TEXT_PRIMARY}${mcp.name}${RESET}`;
        const statusText = mcp.enabled ? `${MINT}en línea${RESET}` : `${TEXT_MUTED}desactivado${RESET}`;
        lines.push(row(`${statusDot} ${nameFmt} ${typeBadge}`, statusText));
      }
    }
  }

  lines.push(bot());
  cardLineBounds.push({ id: "mcp", startLine: mcpStart, endLine: lines.length - 1 });

  // Barra de atajos inferior estructurada
  const hasActiveCritical = accountsList.some((a) => (a.isCritical || (a.used5h >= 85 && !a.hasError)) && activePrefixes.has(a.prefix.toLowerCase()));
  const targetHealthy = getBestHealthyTargetPrefix(accountsList, opencode);
  const criticalAction = hasActiveCritical ? `${CORAL}x: migrar (${targetHealthy})${TEXT_DIM} · ${RESET}` : "";

  lines.push(`${TEXT_DIM} 1-9: colap · c: todo · d: libre · o: abrir${RESET}`);
  lines.push(`${TEXT_DIM} s: sync · r: act · ${criticalAction}q: salir${RESET}`);

  // Viewport windowing
  const maxVisibleRows = Math.max(10, rows - 1);
  const maxScroll = Math.max(0, lines.length - maxVisibleRows);
  let adjustedScroll = scrollOffset;
  if (adjustedScroll > maxScroll) adjustedScroll = maxScroll;
  if (adjustedScroll < 0) adjustedScroll = 0;

  const visibleLines = lines.slice(adjustedScroll, adjustedScroll + maxVisibleRows);

  const formattedOutput = visibleLines.map((l) => `${l}\x1b[K`).join("\n");
  process.stdout.write(`\x1b[H${formattedOutput}\n\x1b[J`);

  return {
    cardLineBounds,
    scrollOffset: adjustedScroll,
  };
}
