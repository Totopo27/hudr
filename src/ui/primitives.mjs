import { BORDER, BORDER_MUTED, RESET, TEXT_DIM, TEXT_MUTED } from "../config.mjs";
import { stringWidth, truncateToWidth } from "./ansi.mjs";

export function drawTop(titleFormatted, isCollapsed = false, width = 46) {
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
}

export function drawBottom(width = 46) {
  return `${BORDER}╰${"─".repeat(Math.max(0, width - 2))}╯${RESET}`;
}

export function drawDivider(width = 46) {
  return `${BORDER_MUTED}├${"─".repeat(Math.max(0, width - 2))}┤${RESET}`;
}

export function drawRow(left, right = "", width = 46) {
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
}

export function renderGaugeInline(percent, availableCells, thresholdColor) {
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
}

export function createCardDrawers(width = 46) {
  return {
    drawTop: (title, isCollapsed = false) => drawTop(title, isCollapsed, width),
    drawBottom: () => drawBottom(width),
    drawDivider: () => drawDivider(width),
    drawRow: (left, right = "") => drawRow(left, right, width),
    renderGaugeInline,
  };
}
