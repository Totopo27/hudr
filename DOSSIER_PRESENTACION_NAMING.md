# DOSSIER DE PRESENTACIÓN: Propuesta de Rebranding para `sidebarHerdrOpencode`

## 1. Diagnóstico del Nombre Actual
El nombre actual `sidebarHerdrOpencode`:
1. **Es un comando antinatural**: 21 caracteres en CamelCase son inviables para invocar con soltura en la terminal (`./sidebarHerdrOpencode` vs `git`, `tmux`, `lazygit`).
2. **Es un nombre prestado**: Depende de encadenar marcas ajenas (`Herdr` y `OpenCode`). Si mañana el multiplexor es Zellij o el cliente es Claude Code / Neovim, el nombre queda obsoleto.
3. **No proyecta identidad**: Describe el "qué y con quién", pero oculta el "por qué" (telemetría ambiental sobria, densidad de información y protección de cuotas).

---

## 2. Las 5 Opciones Finalistas (Defensa de Valor Técnico)

### Opción 1: `vane` (La recomendación de máxima pureza)
* **Pronunciación / Tipeo CLI**: `vane` (4 letras, 1 sílaba, un solo golpe de teclado en terminal).
* **Origen y Significado**: Del inglés *vane* (veleta / álabe medidor). El instrumento que mide de forma continua y pasiva la dirección y la intensidad del viento sin entrometerse en el rumbo del barco.
* **Por qué funciona para este producto**:
  * Es la esencia de la telemetría ambiental: no interactúas con él todo el tiempo; lo miras con el rabillo del ojo para ver "hacia dónde sopla el viento" (cuántos tokens te quedan, si la cuota está al 85% o si Git tiene cambios).
  * Es sobrio, minimalista y encaja de forma impecable en el ecosistema UNIX (`vane status`, `vane attach`).

### Opción 2: `luff` (El flanco del viento)
* **Pronunciación / Tipeo CLI**: `luff` (4 letras, sonido sordo y contundente).
* **Origen y Significado**: En náutica, el *luff* es el borde de ataque vertical de una vela triangular. Es el borde lateral exacto que primero siente la presión del viento y avisa al timonel antes de que la vela flamee o se descompense.
* **Por qué funciona para este producto**:
  * Es una metáfora perfecta del panel lateral del 26%: un borde vertical estrecho que acusa la presión del agente antes de que las cuotas colapsen.
  * La simetría visual de la doble 'f' luce espectacular en terminal monocrómica.

### Opción 3: `gantry` (La plataforma de soporte técnico)
* **Pronunciación / Tipeo CLI**: `gantry` (6 letras, 2 sílabas rítmicas).
* **Origen y Significado**: En ingeniería aeroespacial, el *gantry* es la torre de servicio y telemetría montada a un costado de la plataforma de lanzamiento. Alimenta combustible, monitorea los sensores y se desacopla solo cuando el cohete principal está listo.
* **Por qué funciona para este producto**:
  * Tu panel principal (74%) es donde ocurre la acción pesada del agente; este sidebar (26%) es el *gantry* que monitorea tokens, sincroniza modelos, vigila cuentas y mantiene la máquina en vuelo.
  * Suena industrial, robusto y profesional.

### Opción 4: `flank` (La cobertura táctica perimetral)
* **Pronunciación / Tipeo CLI**: `flank` (5 letras, 1 sílaba).
* **Origen y Significado**: El flanco lateral. En estrategia táctica, es la posición reservada para vigilar los ángulos ciegos y proteger los recursos de retaguardia.
* **Por qué funciona para este producto**:
  * Transmite protección activa y presencia silenciosa: cuida tus cuentas de bloqueo, vigila tus cuotas y te avisa cuando estás en riesgo crítico sin estorbar tu área de trabajo principal.

### Opción 5: `hudr` (El acrónimo rítmico integrado)
* **Pronunciación / Tipeo CLI**: `hudr` (4 letras, rima natural con `herdr`).
* **Origen y Significado**: Neologismo que fusiona **HUD** (*Heads-Up Display*) y **Herdr** (el multiplexor anfitrión).
* **Por qué funciona para este producto**:
  * Si prefieres conservar el lazo orgánico y fonético con tu entorno de terminal, `hudr` y `herdr` suenan como componentes siameses diseñados desde el día uno para convivir juntos (`herdr` en un panel, `hudr` en el otro).

---

## 3. Comparativa Rápida en Terminal

| Nombre | Invocación CLI | Tamaño | Carácter Semántico |
| :--- | :--- | :--- | :--- |
| **`vane`** (Recomendado) | `vane` | 4 letras | Ambiental, sutil, telemetría pura de viento/cuotas. |
| **`luff`** | `luff` | 4 letras | Náutico, vanguardista, el borde que siente la presión. |
| **`gantry`** | `gantry` | 6 letras | Aeroespacial, torre de telemetría de misión crítica. |
| **`flank`** | `flank` | 5 letras | Táctico, cobertura lateral y vigilancia perimetral. |
| **`hudr`** | `hudr` | 4 letras | Nativo de multiplexor, simetría sonora total con `herdr`. |
