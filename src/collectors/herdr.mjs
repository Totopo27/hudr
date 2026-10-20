import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fallbackHerdrPanes, HERDR_CACHE_TTL_MS } from "../config.mjs";

const execFileAsync = promisify(execFile);

let cachedHerdrPanes = fallbackHerdrPanes;
let cachedHerdrTime = 0;
let isRefreshingHerdr = false;

export function getCachedHerdrPanes() {
  return cachedHerdrPanes || fallbackHerdrPanes;
}

export async function refreshHerdrPanesAsync(onUpdate = null) {
  if (isRefreshingHerdr) return cachedHerdrPanes;
  isRefreshingHerdr = true;
  try {
    const { stdout: listRaw } = await execFileAsync("herdr", ["pane", "list"], {
      encoding: "utf8",
    });
    const listData = JSON.parse(listRaw);
    const panes = listData.result?.panes || [];
    let myPaneId = process.env.HERDR_PANE_ID || null;
    let myTabId = null;

    if (!myPaneId) {
      try {
        const { stdout: curRaw } = await execFileAsync("herdr", ["pane", "current"], {
          encoding: "utf8",
        });
        const curData = JSON.parse(curRaw);
        myPaneId = curData.result?.pane?.pane_id;
        myTabId = curData.result?.pane?.tab_id;
      } catch {}
    } else {
      const myPane = panes.find((p) => p.pane_id === myPaneId);
      myTabId = myPane?.tab_id;
    }

    cachedHerdrPanes = { panes, myPaneId, myTabId };
    cachedHerdrTime = Date.now();
  } catch {
    if (!cachedHerdrPanes) {
      cachedHerdrPanes = fallbackHerdrPanes;
    }
  } finally {
    isRefreshingHerdr = false;
  }
  if (typeof onUpdate === "function") onUpdate();
  return cachedHerdrPanes;
}

export function getHerdrPanesData(force = false, onUpdate = null) {
  const now = Date.now();
  const isFresh = !force && (now - cachedHerdrTime < HERDR_CACHE_TTL_MS);

  if (!isFresh && !isRefreshingHerdr) {
    refreshHerdrPanesAsync(onUpdate);
  }

  return cachedHerdrPanes || fallbackHerdrPanes;
}
