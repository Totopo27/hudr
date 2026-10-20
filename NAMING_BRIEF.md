# NAMING BRIEF: Proyecto Telemetría Ambiental TUI

## 1. Fondo (Esencia y Propuesta de Valor)
- **¿Qué es técnicamente?**: Un HUD / TUI de terminal compacto (26% de ancho) de telemetría ambiental en tiempo real para multiplexores (Herdr/Zellij/Tmux) y agentes IA (OpenCode).
- **Funcionalidades medulares**:
  1. Telemetría de tokens, turnos y costos de sesión.
  2. Gestión y pooling de cuotas multi-cuenta (Gemini, Claude, GPT).
  3. Integración con memoria asociativa (Engram) y estado de Git/agente.
  4. Prevención de bloqueo de cuentas y migración en caliente.
- **Arquetipo de Usuario**: Desarrollador senior, power-user de terminal, CLI-first, alérgico al bloatware ("anti-slop"), estilo Linear, estricto con el rendimiento y el minimalismo.
- **Diferenciador Ohmae**: Cero dependencias pesadas, arranque instantáneo, I/O reactivo (SQLite WAL watcher), densidad informativa sin fricción cognitiva.

## 2. Forma (Restricciones Léxicas y Fonéticas)
- **Problema del nombre actual**: `sidebarHerdrOpencode` es un acrónimo descriptivo encadenado ("CamelCase spaghetti"), largo (21 caracteres), engorroso de tipear en terminal y atado rígidamente a nombres de terceros.
- **Requisitos de Forma**:
  - Longitud ideal: 4 a 8 caracteres (1 o 2 sílabas rítmicas).
  - Comando CLI fácil y rápido de invocar (`herdr`, `tmux`, `git`, `lazygit`).
  - Fonética sobria, afilada, memorable internacionalmente (inglés universal o raíz técnica/náutica/astronómica).
  - Categorías semánticas:
    - *Territorio A: Observabilidad / Centinela / HUD / Navegación*.
    - *Territorio B: Convivencia / Panel lateral / Co-piloto / Margen*.
    - *Territorio C: Flujo / Pulso / Ritmo / Telemetría*.

## 3. Scope de Registro / Distribución
- Software Open Source (CLI / NPM / GitHub).
- Clase de Niza orientativa: Clase 9 (Software de desarrollo / herramientas de terminal).
