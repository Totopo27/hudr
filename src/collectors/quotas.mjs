import * as fs from "node:fs";
import * as path from "node:path";
import {
  AUTHS_DIR,
  QUOTA_URL,
  USER_AGENT,
} from "../config.mjs";
import { formatRelativeReset, calculateQuotaPace } from "../ui/ansi.mjs";

export const accountsList = [];
export let lastUpdatedTime = "";
export let isFetchingQuotas = false;
export let isInitialFetch = true;

export function getLastUpdatedTime() {
  return lastUpdatedTime;
}

export function getIsFetchingQuotas() {
  return isFetchingQuotas;
}

export function discoverAccounts(targetList = accountsList) {
  if (!fs.existsSync(AUTHS_DIR)) return targetList;

  const files = fs.readdirSync(AUTHS_DIR).filter(
    (f) => f.startsWith("antigravity-") && f.endsWith(".json")
  );

  const seenAuthFiles = new Set();

  for (const file of files) {
    try {
      const authFilePath = path.join(AUTHS_DIR, file);
      seenAuthFiles.add(authFilePath);
      const raw = fs.readFileSync(authFilePath, "utf8");
      const auth = JSON.parse(raw);
      const prefix = auth.prefix || (auth.email ? auth.email.split("@")[0] : file);

      // Buscar por archivo primero (evita duplicar si cambió el prefijo en disco)
      let existing = targetList.find((a) => a.authFile === authFilePath);
      if (!existing) {
        existing = targetList.find((a) => a.prefix === prefix);
      }

      if (!existing) {
        existing = {
          prefix,
          auth,
          authFile: authFilePath,
          email: auth.email || "",
          rem5h: 100,
          used5h: 0,
          reset5h: "",
          remWk: 100,
          usedWk: 0,
          resetWk: "",
          isCritical: false,
          isWarning: false,
          hasError: false,
          errorMsg: "",
        };
        targetList.push(existing);
      } else {
        existing.prefix = prefix;
        existing.auth = auth;
        existing.authFile = authFilePath;
        existing.email = auth.email || "";
      }
    } catch {}
  }

  // Purgar cuentas huérfanas cuyos archivos ya no existen o cambiaron
  for (let i = targetList.length - 1; i >= 0; i--) {
    if (!seenAuthFiles.has(targetList[i].authFile)) {
      targetList.splice(i, 1);
    }
  }

  targetList.sort((a, b) => a.prefix.localeCompare(b.prefix));
  return targetList;
}

export async function updateAccountQuota(account) {
  // Releer el archivo auth en disco por si cliproxy refrescó el access_token
  if (account.authFile && fs.existsSync(account.authFile)) {
    try {
      const freshRaw = fs.readFileSync(account.authFile, "utf8");
      account.auth = JSON.parse(freshRaw);
    } catch {}
  }

  const { auth } = account;
  if (!auth || !auth.access_token || auth.disabled) return;

  try {
    const res = await fetch(QUOTA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ project: auth.project_id }),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      account.hasError = false;
      account.errorMsg = "";

      const geminiGroup = data.groups?.find((g) => g.displayName === "Gemini Models");
      const claudeGroup = data.groups?.find((g) => g.displayName?.includes("Claude"));

      const geminiWk = geminiGroup?.buckets?.find((b) => b.window === "weekly");
      const gemini5h = geminiGroup?.buckets?.find((b) => b.window === "5h");
      const claudeWk = claudeGroup?.buckets?.find((b) => b.window === "weekly");
      const claude5h = claudeGroup?.buckets?.find((b) => b.window === "5h");

      const remFraction = gemini5h?.remainingFraction ?? 1;
      const remPercent = Math.max(0, Math.min(100, Math.round(remFraction * 100)));
      const usedPercent = 100 - remPercent;

      account.rem5h = remPercent;
      account.used5h = usedPercent;
      account.reset5h = formatRelativeReset(gemini5h?.resetTime || null);

      const gemWkPct = Math.max(0, Math.min(100, Math.round(((geminiWk?.remainingFraction ?? 1) * 100))));
      const claudeWkPct = Math.round(((claudeWk?.remainingFraction ?? 1) * 100));
      const claude5hPct = Math.round(((claude5h?.remainingFraction ?? 1) * 100));

      account.remWk = gemWkPct;
      account.usedWk = 100 - gemWkPct;
      account.resetWk = formatRelativeReset(geminiWk?.resetTime || null);

      account.pools = [
        {
          label: "Gemini Wk",
          percent: gemWkPct,
          reset: formatRelativeReset(geminiWk?.resetTime || null),
          pace: calculateQuotaPace(gemWkPct, "weekly", geminiWk?.resetTime || null),
        },
        {
          label: "Gemini 5h",
          percent: remPercent,
          reset: account.reset5h,
          pace: calculateQuotaPace(remPercent, "5h", gemini5h?.resetTime || null),
        },
        {
          label: "Claude Wk",
          percent: claudeWkPct,
          reset: formatRelativeReset(claudeWk?.resetTime || null),
          pace: calculateQuotaPace(claudeWkPct, "weekly", claudeWk?.resetTime || null),
        },
        {
          label: "Claude 5h",
          percent: claude5hPct,
          reset: formatRelativeReset(claude5h?.resetTime || null),
          pace: calculateQuotaPace(claude5hPct, "5h", claude5h?.resetTime || null),
        },
      ];

      // Alerta progresiva de cuota:
      // >= 85% usado (<= 15% libre) -> Crítico (rojo)
      // >= 70% usado (< 85% usado)  -> Aviso preventivo (amarillo)
      account.isCritical = usedPercent >= 85;
      account.isWarning = usedPercent >= 70 && usedPercent < 85;
    } else {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401 || err?.error?.message?.includes("expired") || err?.error?.status === "UNAUTHENTICATED") {
        account.hasError = true;
        account.errorMsg = "token expirado";
      } else if (err?.error?.message?.includes("Verify your account") || err?.error?.details?.some((d) => d.reason === "VALIDATION_REQUIRED")) {
        account.hasError = true;
        account.errorMsg = "verif. requerida";
      } else if (res.status === 429) {
        account.hasError = true;
        account.errorMsg = "rate limited";
      } else {
        account.hasError = true;
        account.errorMsg = "err " + res.status;
      }
    }
  } catch (e) {
    // Si hubo timeout u error de red temporal, no borrar datos previos si ya existían
  }
}

/**
 * Estrategia de Refresco Inteligente (Snapshot + Reactive Active Polling):
 * - Al arrancar (isInitialFetch) o al presionar 'r' (forceAll): consulta todas las cuentas para pintar el panorama general.
 * - En los intervalos automáticos de 2m: SOLO consulta las cuentas activas en uso en alguna sesión.
 */
export async function fetchQuotas({
  targetList = accountsList,
  sessionData = null,
  forceAll = false,
  onDone = null,
} = {}) {
  if (isFetchingQuotas) return;
  isFetchingQuotas = true;

  discoverAccounts(targetList);

  const activePrefixes = sessionData?.allActivePrefixes || new Set();

  const accountsToQuery = (forceAll || isInitialFetch)
    ? targetList
    : targetList.filter((a) => activePrefixes.has(a.prefix.toLowerCase()));

  const targetAccounts = accountsToQuery.length > 0 ? accountsToQuery : targetList.slice(0, 1);

  await Promise.allSettled(targetAccounts.map((acc) => updateAccountQuota(acc)));

  isInitialFetch = false;
  lastUpdatedTime = new Date().toLocaleTimeString();
  isFetchingQuotas = false;
  if (typeof onDone === "function") onDone();
}
