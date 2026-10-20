import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CYAN,
  RESET,
  ACCENT_PRIMARY,
  GOLD,
  MINT,
  MAGENTA,
  AMBER,
  TEXT_DIM,
  TEXT_PRIMARY,
  fallbackGitData,
  GIT_CACHE_TTL_MS,
} from "../config.mjs";

const execFileAsync = promisify(execFile);

let cachedGitData = fallbackGitData;
let cachedGitDir = null;
let cachedGitTime = 0;
const gitCacheByDir = new Map();
const inFlightGitRefreshes = new Set();

export function getCachedGitData() {
  return cachedGitData || fallbackGitData;
}

export async function refreshGitDataAsync(targetDir, onUpdate = null) {
  if (!targetDir || inFlightGitRefreshes.has(targetDir)) {
    const existing = gitCacheByDir.get(targetDir);
    return existing ? existing.data : cachedGitData;
  }
  inFlightGitRefreshes.add(targetDir);

  try {
    let branch = "main";
    try {
      const { stdout: branchOut } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: targetDir,
        encoding: "utf8",
      });
      branch = branchOut.trim() || "main";
    } catch {
      const fallback = { ...fallbackGitData };
      cachedGitData = fallback;
      cachedGitDir = targetDir;
      cachedGitTime = Date.now();
      gitCacheByDir.set(targetDir, { data: fallback, time: cachedGitTime });
      if (typeof onUpdate === "function") onUpdate();
      return fallback;
    }

    const [statusRes, diffRes, logRes] = await Promise.allSettled([
      execFileAsync("git", ["status", "--porcelain=v1"], {
        cwd: targetDir,
        encoding: "utf8",
      }),
      execFileAsync("git", ["diff", "HEAD", "--numstat"], {
        cwd: targetDir,
        encoding: "utf8",
      }),
      execFileAsync("git", ["log", "--graph", "--oneline", "--decorate", "-n", "3"], {
        cwd: targetDir,
        encoding: "utf8",
      }),
    ]);

    let modified = 0;
    let untracked = 0;
    let staged = 0;
    if (statusRes.status === "fulfilled" && statusRes.value?.stdout) {
      const statusOut = statusRes.value.stdout.trim();
      if (statusOut) {
        for (const line of statusOut.split("\n")) {
          const x = line[0];
          const y = line[1];
          if (x === "?" && y === "?") untracked++;
          else if (x !== " " && x !== "?") staged++;
          if (y !== " " && y !== "?") modified++;
        }
      }
    }

    let linesAdded = 0;
    let linesDeleted = 0;
    if (diffRes.status === "fulfilled" && diffRes.value?.stdout) {
      const diffOut = diffRes.value.stdout.trim();
      if (diffOut) {
        for (const line of diffOut.split("\n")) {
          const parts = line.split("\t");
          if (parts.length >= 2) {
            const a = parseInt(parts[0], 10);
            const d = parseInt(parts[1], 10);
            if (!isNaN(a)) linesAdded += a;
            if (!isNaN(d)) linesDeleted += d;
          }
        }
      }
    }

    let graphLines = [];
    if (logRes.status === "fulfilled" && logRes.value?.stdout) {
      const logOut = logRes.value.stdout.trim();
      if (logOut) {
        graphLines = logOut.split("\n").filter((l) => l.trim().length > 0);
      }
    }

    const res = {
      branch,
      modified,
      untracked,
      staged,
      linesAdded,
      linesDeleted,
      graphLines,
      isClean: modified === 0 && untracked === 0 && staged === 0,
      hasGit: true,
    };

    cachedGitData = res;
    cachedGitDir = targetDir;
    cachedGitTime = Date.now();
    gitCacheByDir.set(targetDir, { data: res, time: cachedGitTime });
    if (typeof onUpdate === "function") onUpdate();
    return res;
  } catch {
    const fallback = { ...fallbackGitData };
    cachedGitData = fallback;
    cachedGitDir = targetDir;
    cachedGitTime = Date.now();
    gitCacheByDir.set(targetDir, { data: fallback, time: cachedGitTime });
    if (typeof onUpdate === "function") onUpdate();
    return fallback;
  } finally {
    inFlightGitRefreshes.delete(targetDir);
  }
}

export function getGitData(targetDir, force = false, onUpdate = null) {
  const now = Date.now();
  const entry = gitCacheByDir.get(targetDir);
  const isFresh = !force && entry && (now - entry.time < GIT_CACHE_TTL_MS);

  if (!isFresh && !inFlightGitRefreshes.has(targetDir)) {
    refreshGitDataAsync(targetDir, onUpdate);
  }

  if (entry) {
    return entry.data;
  }
  return cachedGitData || fallbackGitData;
}

export function colorizeGitGraphLine(line) {
  if (!line || !line.trim()) return line;

  if (/^[\\/|_\s]+$/.test(line)) {
    return line.replace(/([\\/|_]+)/g, (m) => `${CYAN}${m}${RESET}`);
  }

  const m = /^([*\\/|_\s]*[*][*\\/|_\s]*)\s+([0-9a-f]{7,40})\s*(?:\(([^)]+)\))?\s*(.*)$/.exec(line);
  if (!m) {
    return line
      .replace(/(\*)/g, `${ACCENT_PRIMARY}*${RESET}`)
      .replace(/([\\/|_]+)/g, `${CYAN}$1${RESET}`);
  }

  const graphPart = m[1].replace(/(\*)/g, `${ACCENT_PRIMARY}*${RESET}`).replace(/([\\/|_]+)/g, `${CYAN}$1${RESET}`);
  const hash = `${GOLD}${m[2]}${RESET}`;
  let refs = "";
  if (m[3]) {
    const items = m[3].split(",").map((s) => {
      const tr = s.trim();
      if (tr.includes("HEAD")) return `${MINT}${tr}${RESET}`;
      if (tr.includes("origin") || tr.includes("upstream")) return `${MAGENTA}${tr}${RESET}`;
      return `${AMBER}${tr}${RESET}`;
    }).join(`${TEXT_DIM}, ${RESET}`);
    refs = ` ${TEXT_DIM}(${RESET}${items}${TEXT_DIM})${RESET}`;
  }
  const subject = m[4] ? ` ${TEXT_PRIMARY}${m[4]}${RESET}` : "";
  return `${graphPart} ${hash}${refs}${subject}`;
}
