#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GENTLE-AI · OPENCODE HUD SIDEBAR (Linear & Anti-Slop Architecture)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Arquitectura modular de alto rendimiento:
 *   - Clean Architecture / Screaming Architecture bajo src/
 *   - Collectors reactivos (Git, Herdr, OpenCode SQLite, Quotas, Engram, Tree)
 *   - Pipeline UI pixel-perfect sin parpadeo (Zero-Scrollback / ANSI)
 *   - Acciones de mantenimiento (Migración, Liberación, Atajos y Ratón SGR)
 */

import { startSidebar } from "./src/index.mjs";

export * from "./src/index.mjs";

startSidebar();
