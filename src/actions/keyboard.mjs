const CARD_KEYS = [
  "estado",
  "contexto",
  "proyecto",
  "integraciones",
  "pools",
  "git",
  "engram",
  "tools",
  "mcp",
];

export function handleInput(data, context) {
  const raw = data.toString();

  // 1. Manejo de Mouse (SGR Extended Mode: \x1b[<button;x;yM / m)
  const mouseMatch = raw.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (mouseMatch) {
    const btn = parseInt(mouseMatch[1], 10);
    const y = parseInt(mouseMatch[3], 10);
    const isPress = mouseMatch[4] === "M";

    if (isPress) {
      const scrollOffset = context.getScrollOffset();
      const cardBounds = context.getCardLineBounds ? context.getCardLineBounds() : (context.cardLineBounds || []);
      const collapsedCards = context.collapsedCards;

      if (btn === 0) { // Clic izquierdo
        const clickedLine = (y - 1) + scrollOffset;

        // Verificar si el clic fue en la acción especial de sincronización
        const syncHit = cardBounds.find((c) => c.actionType === "sync_integrations" && clickedLine === c.startLine);
        if (syncHit) {
          if (typeof context.onSyncIntegrations === "function") {
            context.onSyncIntegrations();
          }
          return;
        }

        // Verificar si el clic fue en la acción especial de abrir carpeta
        const actionHit = cardBounds.find((c) => c.actionLine === clickedLine && c.actionPath);
        if (actionHit) {
          if (typeof context.onOpenFolder === "function") {
            context.onOpenFolder(actionHit.actionPath);
          }
          return;
        }

        const hitCard = cardBounds.find((c) => {
          if (collapsedCards[c.id]) {
            return clickedLine >= c.startLine && clickedLine <= c.endLine;
          }
          return clickedLine === c.startLine || clickedLine === c.endLine;
        });
        if (hitCard) {
          collapsedCards[hitCard.id] = !collapsedCards[hitCard.id];
          context.scheduleRender();
          return;
        }
      } else if (btn === 64) { // Rueda arriba (Scroll UP)
        if (scrollOffset > 0) {
          context.setScrollOffset(Math.max(0, scrollOffset - 2));
          context.scheduleRender();
        }
        return;
      } else if (btn === 65) { // Rueda abajo (Scroll DOWN)
        context.setScrollOffset(scrollOffset + 2);
        context.scheduleRender();
        return;
      }
    }
    return;
  }

  // 2. Manejo de Teclado
  const key = raw;
  if (key === "q" || key === "\u0003") {
    if (typeof context.onExit === "function") context.onExit();
  } else if (key === "r" || key === "R") {
    if (typeof context.onRefreshQuotas === "function") context.onRefreshQuotas(true);
  } else if (key === "s" || key === "S") {
    if (typeof context.onSyncIntegrations === "function") context.onSyncIntegrations();
  } else if (key === "d" || key === "D") {
    if (typeof context.onReleaseSessions === "function") context.onReleaseSessions();
  } else if (key === "x" || key === "X") {
    if (typeof context.onMigrateCritical === "function") context.onMigrateCritical();
  } else if (key === "o" || key === "O") {
    const activePath = typeof context.getActiveProjPath === "function" ? context.getActiveProjPath() : process.cwd();
    if (typeof context.onOpenFolder === "function") context.onOpenFolder(activePath);
  } else if (key === "c" || key === "C") {
    // Alternar todas las tarjetas (colapsar todo / expandir todo)
    const collapsedCards = context.collapsedCards;
    const anyOpen = Object.values(collapsedCards).some((v) => !v);
    for (const k of Object.keys(collapsedCards)) {
      collapsedCards[k] = anyOpen;
    }
    context.scheduleRender();
  } else if (key >= "1" && key <= "9") {
    const target = CARD_KEYS[parseInt(key, 10) - 1];
    if (target && context.collapsedCards) {
      context.collapsedCards[target] = !context.collapsedCards[target];
      context.scheduleRender();
    }
  } else if (key === "\u001b[A" || key === "k") {
    const current = context.getScrollOffset();
    if (current > 0) {
      context.setScrollOffset(current - 1);
      context.scheduleRender();
    }
  } else if (key === "\u001b[B" || key === "j") {
    const current = context.getScrollOffset();
    context.setScrollOffset(current + 1);
    context.scheduleRender();
  }
}

export function setupKeyboardAndMouse(context) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (data) => handleInput(data, context);
    process.stdin.on("data", onData);
    return () => {
      process.stdin.removeListener("data", onData);
    };
  }
  return () => {};
}
