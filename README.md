# hudr

> HUD and Live Telemetry Sidebar for Herdr and OpenCode.

---

## Overview

**hudr** is an ambient terminal HUD engineered to run alongside OpenCode inside the Herdr terminal multiplexer. It splits the terminal into an integrated workspace providing real-time telemetry: active session metrics, context window token consumption gauges, Engram persistent memory status, multi-account API quotas with automated migration, recent Git history graphs, live tool call telemetry, and MCP server states.

```text
               OPENCODE · GENTLE-AI
╭─ Estado ────────────────────────────────── [▼] ╮
│ Proyecto                     ~/.../mi-proyecto │
│ Rama                                  main ±2  │
│ Modelo           gemini-3.8-flash-high (high)  │
│ mem: mi-proyecto · 4 MCPs · * acc-main ▸       │
╰────────────────────────────────────────────────╯
╭─ Contexto ──────────────────────────────── [▼] ╮
│ 125.0k / 1.0M tokens              Optimo 12.5% │
│ ▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  │
│ ^ 1.4M in · v 12.6k out           Costo $0.000 │
╰────────────────────────────────────────────────╯
╭─ Engram: mi-proyecto ^ ─────────────────── [▼] ╮
│ Local (7437)               En línea · 80 obs   │
│ Cloud: solo local           no configurado     │
╰────────────────────────────────────────────────╯
╭─ Integraciones · 5 cuentas ─────────────── [▼] ╮
│    ● acc-1  ▰▰▰▰▰▰▰▰▰▰ 100%  en 4h 59m │
│    ● acc-2  ▰▰▰▰▰▰▰▰▰▰ 100%  en 4h 59m │
│  ▸ ● acc-3  ▰▰▰▰▰▰▰▱▱▱  74%  en 2h 25m │
│    ● acc-4  ▰▰▰▰▰▰▰▰▰▰ 100%  en 4h 59m │
│    ● acc-5  ▰▰▰▰▰▰▰▰▰▰ 100%  en 4h 59m │
╰────────────────────────────────────────────────╯
╭─ Antigravity · acc-3 (activa) ──────────── [▼] ╮
│ ● Gemini Wk ▰▰▰▰▰▰▱▱  74%  ↑12% en 4d 4h │
│ ● Gemini 5h ▰▰▱▱▱▱▱▱  24%   ~0% en 26m   │
│ ● Claude Wk ▰▰▱▱▱▱▱▱  30%   ~0% en 2d 5h │
│ ● Claude 5h ▰▰▰▰▰▰▰▰ 100%   ~0% en 4h 59m│
╰────────────────────────────────────────────────╯
╭─ Git y Cambios ─────────────────────────── [▼] ╮
│ main                                    limpio │
│ * 858ee20 (HEAD -> main) feat: core hud        │
│ 0 archivos · limpio            /gentle:changes │
╰────────────────────────────────────────────────╯
╭─ Herramientas · 70 llamadas ────────────── [▼] ╮
│ 23 lecturas   9 escrituras  >_ 21 bash mem: 17 │
╰────────────────────────────────────────────────╯
╭─ Servidores MCP · 3 activos ────────────── [▼] ╮
│ engram [local]                        en línea │
│ context7 [remote]                     en línea │
│ browser [local]                       en línea │
╰────────────────────────────────────────────────╯
 1-8/clic: colapsar · c: todo · r: act · q: salir
```

---

### Qué hace distinto este HUD

* **Aislamiento de procesos:** El sidebar corre en su propio pane del multiplexor como un script de Node independiente. Lee `opencode.db`, `engram.db` y los archivos de autenticación directo del disco. OpenCode puede reiniciarse, caerse o quedarse sin memoria; la cabina sigue dibujando sin pestañear.
* **Consciencia de cuentas por pestaña:** En vez de meter todo en una bolsa común, el HUD rastrea qué cuenta está corriendo en qué pane del multiplexor (`▸`). Podés mandar una refactorización pesada con la Cuenta A en la Pestaña 1 mientras hablás con la Cuenta B en la Pestaña 2, sin que se pisen la cuota.
* **Migración en frío entre turnos (`x`):** Cambiar credenciales a mitad de una petición HTTP rompe el streaming. Si una cuenta supera el 85% de uso mientras el agente está trabajando (`working`), el HUD encola el relevo. La migración recién toca la base de datos cuando el turno pasa a reposo (`idle`), evitando que se te corte una respuesta por la mitad.
* **Cambios del agente vs. ruido de Git:** Que el árbol de Git esté sucio no significa que lo haya tocado el modelo. El HUD revisa el historial de herramientas para separar el ruido de fondo (compilaciones, archivos temporales) de los archivos que la IA realmente modificó (`✎ agente: N archivos (+X -Y)`).
* **Ponderación de cuota en dos ventanas:** Mirar solo la ventana de 5 horas es una trampa. Una cuenta puede tener 90% libre en 5 horas pero estar al 3% en su tope semanal. La lógica de selección pondera ambas ventanas (70% en 5h / 30% en semanal) y descarta cuentas a punto de bloquearse por cuota semanal.
* **Handover de contexto real (`snew` / `sclose`):** Reiniciar una sesión no es solo abrir una terminal en blanco. `/snew` guarda en Engram la rama activa, los archivos modificados y el último estado del agente, archiva la sesión vieja para liberar el candado de la cuenta y abre la pestaña nueva apuntando directo a la cuenta que tenga mayor margen de cuota.

---


---

## Session Lifecycle and Account Release Architecture

### The Problem: Account Locking vs. Session Units
When running multiple spaces or tabs in Herdr with shared API accounts, closing work in one space must not inadvertently terminate access for another concurrent space using the same credentials.

### The Solution: SQLite-Driven Reactive De-allocation
1. OpenCode tracks sessions inside `session_v2` in `~/.local/share/opencode/opencode.db`.
2. The HUD inspects active sessions using `SELECT agent, model, time_archived FROM session_v2 WHERE time_archived IS NULL`.
3. When ending work in a space via natural language or `/sclose`:
   - Engram persists session state via `mem_session_summary`.
   - The session record is archived by setting `time_archived = Date.now()`.
   - The HUD sidebar automatically recalculates active accounts in its 3-second local polling loop:
     - **Single-space usage:** The account indicator `▸` turns off immediately, releasing the account.
     - **Multi-space usage:** If another open space/pane still references the same account prefix, the account remains marked active for that space.

---

## Interactive Shortcuts and Commands

| Command / Shortcut | Execution Context | Description |
| :--- | :--- | :--- |
| **Mouse Click** | Sidebar TUI | **Toggle Card:** Clic en cualquier encabezado de tarjeta para colapsar (`[▶]`) o expandir (`[▼]`). |
| **Mouse Wheel** | Sidebar TUI | **Scroll Fluido:** Rueda arriba / abajo para desplazarse verticalmente. |
| **`1` – `8`** | Sidebar TUI | **Atajos de Tarjetas:** Alterna colapso individual (1: Estado, 2: Contexto, 3: Engram, 4: Integraciones, 5: Antigravity, 6: Cambios, 7: Herramientas, 8: MCP). |
| **`c`** | Sidebar TUI | **Colapso Global:** Alterna entre colapsar todas las tarjetas o expandir todas a la vez. |
| **`r`** | Sidebar TUI | **Full Fleet Refresh:** Queries all configured accounts concurrently to update quotas on demand. |
| **`x`** | Sidebar TUI | **Automated Critical Migration:** Migrates active sessions from critical accounts (>= 85% used) to the healthiest available account, logging a checkpoint in Engram. |
| **`k` / `j`** or **Up / Down** | Sidebar TUI | **Viewport Scroll:** Navigates vertical content when terminal height is constrained. |
| **`q`** | Sidebar TUI | Clean exit restoring the previous terminal screen buffer. |
| **`/snew`** | OpenCode Chat | **Session Handover:** Persists `mem_session_summary` in Engram and outputs a structured handover block to start a clean session. |
| **`/sclose`** | OpenCode Chat | **Clean Session Termination:** Persists `mem_session_summary` in Engram, sets `time_archived` in `session_v2`, and releases the account in the HUD. |
| **`snew`** | Terminal / Herdr | **Clean Workspace Tab:** Launches a fresh Herdr tab with OpenCode on the left (80%) and HUD on the right (20%). |
| **`sclose`** | Terminal / Herdr | **Local Archive:** Archives the active session for the current workspace directory and updates HUD state (`--close-tab` and `--close-pane` supported). |
| **`sidebar`** | Terminal / Herdr | Attaches or connects the HUD sidebar with standard 80/20 layout ratio. |

---

## Performance & Optimization Engineering

1. **Snapshot + Reactive Active Polling:**
   - Performs a single startup sweep of all accounts.
   - Background routine polls exclusively active accounts every 2 minutes. This minimizes Google Cloud Code API requests by over 80%, eliminating bot-detection and validation-required triggers.
   - Instant local reactivity: Turn completions in OpenCode trigger local quota updates within milliseconds without waiting for the timer.
2. **Deterministic Unicode Cell Metric Engine:**
   - Width calculation algorithm accounting for zero-width joiners, variation selectors, and double-width CJK/Unicode runes.
   - Enforces mathematical box boundaries (width 36 to 50 columns) preventing horizontal line-wrapping across terminal emulators.
3. **Alternate Screen Buffer (`\x1b[?1049h`):**
   - Runs isolated in the terminal alternate buffer. Zero scrollback pollution upon exit.
4. **Native Zero-Dependency SQLite Integration (`node:sqlite`):**
   - Directly queries `opencode.db` and `engram.db` via Node.js native bindings with microsecond read latencies, avoiding external C++ compiler toolchains.

---

## Ecosystem & Foundation Repositories

This sidebar is not a standalone mock; it is a cockpit operating directly on top of specific services and tools. Without the following repositories and services running in your environment, the HUD has no data to display or runtime to dock into:

| Component | Repository | Role in this HUD |
|---|---|---|
| **CPAMC** | [router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center) | Web UI for CLIProxyAPI. Manages OAuth logins and generates the credentials inspected by the sidebar. |
| **CLIProxyAPI** | [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | Local proxy service (port `8317`). Powers multi-account routing, quota inspection endpoints, and auth storage (`~/.cliproxy/auths`). |
| **Herdr** | [herdrdev/herdr](https://github.com/herdrdev/herdr) | Terminal multiplexer runtime. Hosts the sidebar split (0.80 / 0.20 ratio) via `herdr pane list` and `herdr pane current`. |
| **OpenCode** | [OpenCode](https://github.com/opencode-ai/opencode) | Coding agent runtime. The sidebar queries `~/.local/share/opencode/opencode.db` directly to monitor sessions, context windows, and tools. |
| **Engram** | [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | Persistent memory daemon (port `7437`). Provides cross-session observations, project namespace tracking, and session sync. |

---

## Installation & Setup

### Prerequisites
- **Node.js >= 22.0.0** (native `node:sqlite` support).
- **Herdr** running as your terminal multiplexer.
- **OpenCode** with its SQLite database at `~/.local/share/opencode/opencode.db`.
- **CLIProxyAPI** (running at `http://127.0.0.1:8317`) with OAuth tokens managed via **CPAMC**.
- **Engram** daemon running at `http://127.0.0.1:7437`.

### Repository File Structure
```text
hudr/
├── src/                    Modular Clean Architecture core
│   ├── config.mjs          Paths, ANSI palette, constants & timeouts
│   ├── collectors/         Telemetry collectors (git, herdr, opencode, quotas, engram, tree)
│   ├── ui/                 Render engine, geometry primitives & ANSI formatting
│   └── actions/            Session cleanup, hotkeys & SGR mouse dispatcher
├── status-sidebar.mjs      CLI entry point & public façade
├── attach-sidebar.mjs      Split management script for Herdr (0.80/0.20 ratio)
├── snew.mjs                Clean session creator and handover script
├── sclose.mjs              Session termination and account de-allocation script
├── test/                   Automated smoke test suite
├── package.json            Project manifest and binary definitions
└── README.md               Technical documentation
```

### Global Shim Setup (Windows / POSIX)
Add launcher scripts to a directory registered in your `PATH` (such as `~/.local/bin` or Scoop shims):

**`sidebar.cmd`**:
```cmd
@echo off
setlocal
if "%1"=="run" goto run_sidebar

where herdr >nul 2>&1
if errorlevel 1 goto run_sidebar

node "%~dp0\attach-sidebar.mjs"
if not errorlevel 1 exit /b 0

:run_sidebar
chcp 65001 >nul
node "%~dp0\status-sidebar.mjs"
```

**`snew.cmd`**:
```cmd
@echo off
chcp 65001 >nul
node "%~dp0\snew.mjs" %*
```

**`sclose.cmd`**:
```cmd
@echo off
chcp 65001 >nul
node "%~dp0\sclose.mjs" %*
```

---

## License

Distributed under the **MIT License**. Engineered for technical precision, performance density, and stability within OpenCode, Herdr, and Gentle-AI workflows.
