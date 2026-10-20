import { RESET, CORAL, AMBER, GOLD, MINT } from "../config.mjs";

// ============================================================================
// MOTOR DE MEDICION UNICODE A PRUEBA DE DESBORDES (ZERO-WRAPPING)
// ============================================================================
export function charWidth(codePoint) {
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

export function stripAnsi(str) {
  if (!str) return "";
  return str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
}

export function stringWidth(str) {
  if (!str) return 0;
  const clean = stripAnsi(str);
  let w = 0;
  for (const char of clean) {
    w += charWidth(char.codePointAt(0));
  }
  return w;
}

export function truncateToWidth(str, maxWidth) {
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

export function formatTokenCount(num) {
  if (!Number.isFinite(num) || num <= 0) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
  return num.toString();
}

export function formatCost(num) {
  if (!Number.isFinite(num) || num <= 0) return "$0.000";
  return `$${num.toFixed(3)}`;
}

export function getQuotaThreshold(availablePercent) {
  const rounded = Math.round(availablePercent);
  if (rounded <= 15) return { color: (s) => `${CORAL}${s}${RESET}`, colorRaw: CORAL, level: "critical", label: "Crítico" };
  if (rounded <= 30) return { color: (s) => `${AMBER}${s}${RESET}`, colorRaw: AMBER, level: "alert", label: "Aviso 70%+" };
  if (rounded < 65) return { color: (s) => `${GOLD}${s}${RESET}`, colorRaw: GOLD, level: "medium", label: "Medio" };
  return { color: (s) => `${MINT}${s}${RESET}`, colorRaw: MINT, level: "optimal", label: "Óptimo" };
}

export function formatRelativeReset(resetAt, now = Date.now()) {
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
export function calculateQuotaPace(remPercent, windowType, resetAt, now = Date.now()) {
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
