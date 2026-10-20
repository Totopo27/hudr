#!/usr/bin/env node
import * as path from "node:path";
import { execSync } from "node:child_process";

const SCRIPT_DIR = import.meta.dirname || path.resolve(".");
const STATUS_SIDEBAR_CMD = path.join(SCRIPT_DIR, "status-sidebar.cmd");

try {
  // 1. Obtener el tab y pane actual sin emitir ruido a la consola
  const currentRaw = execSync("herdr pane current", {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  const currentData = JSON.parse(currentRaw);
  const currentPane = currentData.result?.pane;
  const currentPaneId = currentPane?.pane_id;
  const currentTabId = currentPane?.tab_id;

  if (!currentPaneId) {
    process.exit(1);
  }

  // 2. Comprobar si ya existe un split en este mismo tab
  const listRaw = execSync("herdr pane list", {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  const listData = JSON.parse(listRaw);
  const panesInTab = (listData.result?.panes || []).filter((p) => p.tab_id === currentTabId);

  // Si solo hay 1 pane en este tab: creamos el split a la derecha
  // En Herdr, --ratio define el tamaño del pane principal (izquierdo).
  // ratio 0.80 deja el 80% a OpenCode y el 20% (~48-50 columnas) al sidebar lateral.
  if (panesInTab.length <= 1) {
    const splitRaw = execSync("herdr pane split --current --direction right --ratio 0.80 --no-focus", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    const splitData = JSON.parse(splitRaw);
    const newPaneId = splitData.result?.pane?.pane_id || splitData.result?.new_pane_id;

    if (newPaneId) {
      execSync(`herdr pane run ${newPaneId} ${JSON.stringify(STATUS_SIDEBAR_CMD)}`, {
        stdio: ["ignore", "pipe", "ignore"],
      });
      process.exit(0);
    }
  }

  // Si ya hay 2 o más panes en el tab actual:
  // Si el usuario ejecutó 'sidebar' directamente en un pane de terminal / powershell:
  // Salimos con código 1 para que sidebar.cmd ejecute :run_sidebar en este mismo pane.
  if (!currentPane.agent || currentPane.agent_status === "unknown") {
    process.exit(1);
  }

  // Si el usuario está en el pane principal de OpenCode y el otro pane existe:
  const otherPane = panesInTab.find((p) => p.pane_id !== currentPaneId);
  if (otherPane) {
    execSync(`herdr pane run ${otherPane.pane_id} ${JSON.stringify(STATUS_SIDEBAR_CMD)}`, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    process.exit(0);
  }

  process.exit(1);
} catch {
  process.exit(1);
}
