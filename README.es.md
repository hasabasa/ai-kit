<p align="center">
  <img src="assets/logo.png" alt="ai-kit" width="200">
</p>

<h1 align="center">ai-kit</h1>

<p align="center">
  <strong>Configura tu asistente de IA como debe ser — en 2 minutos</strong>
</p>

<p align="center">
  🌍 <a href="README.md">English</a> |
  <a href="README.kk.md">Қазақша</a> |
  <strong>Español</strong> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.zh.md">中文</a> |
  <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/v/aidevkit?color=60a5fa&style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/dm/aidevkit?color=2dd4bf&style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/hasabasa/ai-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-daea6a?style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-60a5fa?style=flat-square" alt="node version">
  <img src="https://img.shields.io/badge/dependencias-0-2dd4bf?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/idiomas-17-daea6a?style=flat-square" alt="17 languages">
</p>

---

> ```
> ✦ ~45 562 tokens/solicitud (lastre 2 590 · CLAUDE.md 42 088 · skills 884)
> ≈ $47,67/mes con 150 solicitudes/día
> ```
> Salida real de una máquina real. Eso es lo que cuesta una configuración inflada.

<p align="center"><img src="assets/demo-es.gif" alt="ai-kit demo" width="700"></p>

---

## ¿Qué es esto?

**Sin ninguna dependencia**, solo Node stdlib. Un CLI que:

1. **Escanea** tu máquina — IDEs, extensiones de IA, CLIs, LLMs, servidores MCP, stack de proyectos
2. **Pregunta** — ~10 preguntas con flechas, la mayoría pre-rellenadas del escaneo
3. **Recomienda** de un catálogo de **20 669 herramientas** — con una explicación por cada una
4. **Instala** con una sola confirmación — y desactiva el lastre que consume tus tokens
5. **Audita** tu configuración actual: `doctor` — tokens/solicitud, $/mes, configs inflados

Funciona con **Claude Code**, detecta **Cursor**, **Gemini CLI**, **Codex**. Interfaz traducida a **17 idiomas**.

## Inicio rápido

```bash
npx aidevkit
```

O instalar globalmente:

```bash
npm i -g aidevkit
```

## Comandos

| Comando | Qué hace |
|---|---|
| `ai-kit` | Ciclo completo: escaneo → encuesta → plan → instalación |
| `ai-kit scan` | Solo inventario: IDEs, extensiones, CLIs, LLMs, MCP, stacks |
| `ai-kit discover` | Catálogo de 20k+ herramientas clasificadas para tu stack + búsqueda en GitHub |
| `ai-kit doctor` | Auditoría: plugins de lastre, CLAUDE.md inflado, tokens/solicitud, $/mes |
| `ai-kit doctor --fix` | Lo mismo + desactivar el lastre (pide confirmación) |
| `ai-kit update` | Regenerar plan desde el perfil guardado, sin encuesta |

## Flags

| Flag | Efecto |
|---|---|
| `--dry-run` | Mostrar el plan sin cambiar nada |
| `--yes` | Sin confirmaciones |
| `--lang es` | Saltar la selección de idioma |
| `--no-open` | No abrir el informe HTML |
| `--json` | Salida legible por máquina del doctor (para CI) |
| `--requests N` | Personalizar solicitudes/día para el cálculo de costos |

Lista completa: `npx aidevkit --help`

## Cómo funciona

### 1. Escaneo

ai-kit escanea tu máquina antes de preguntar nada:

- **IDEs**: VS Code, Cursor, Zed, Neovim, JetBrains, Xcode, Android Studio
- **Herramientas de IA**: Claude Code, Cursor, Gemini CLI, Codex, Cline, Windsurf, Copilot
- **Configs**: `.claude/`, configs MCP, CLAUDE.md, skills, plugins
- **Stack de proyectos**: desde `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, etc.
- **LLMs**: modelos Ollama, LM Studio, claves API en la nube

### 2. Encuesta

~10 preguntas con selección por flechas. La mayoría de las respuestas vienen del escaneo:

- Rol y nivel de experiencia
- Lenguajes y frameworks
- Bases de datos y servicios en la nube
- Estilo de trabajo: código manual o vibe-coding, horas al día
- Qué te molesta más de tu configuración actual
- Cada pregunta tiene una opción de texto libre

### 3. Plan

Cada herramienta recomendada incluye:
- **Una línea** — para qué sirve
- **«Por qué te conviene»** — vinculado a tus respuestas
- **Conflictos** — no instalará dos herramientas que se estorben entre sí

El lastre se marca: skill-packs de negocios (ventas, legal, RRHH, finanzas...) que se cargan en cada solicitud y no aportan nada al desarrollador.

### 4. Instalación

Un `y` instala todo. Mediante los comandos nativos de cada herramienta (`claude mcp add`, `uv tool install`, etc.). Nada se ejecuta sin tu confirmación explícita.

### 5. Doctor

```
✦ ~45 562 tokens/solicitud (lastre 2 590 · CLAUDE.md 42 088 · skills 884)
≈ $47,67/mes con 150 solicitudes/día

Lastre (se carga en cada solicitud, utilidad cero):
  ✗ sales-navigator         1 240 tokens
  ✗ legal-review               850 tokens
  ✗ hr-toolkit                 500 tokens
```

`doctor --fix` desactiva el lastre, mostrando primero qué hará. `--json` genera salida legible por máquina para CI.

## Catálogo

**20 669 herramientas** por categorías:

- **Servidores MCP** — conectores de BD, integraciones de API, herramientas de archivos, servicios en la nube
- **Skills de Claude Code** — revisión de código, testing, deploy, documentación
- **Reglas de Cursor** — por framework, por lenguaje, por flujo de trabajo
- **Plugins** — linters, formateadores, depuradores, profilers
- **Herramientas CLI** — utilidades de desarrollo vía npm, pip, cargo, brew

## Asistentes compatibles

| Asistente | Escaneo | Instalación (auto) | Instalación (manual) | Doctor |
|---|:---:|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ `claude mcp add` | ✅ | ✅ lastre + configs |
| Cursor | ✅ | ✅ escribe `mcp.json` | ✅ | ✅ configs |
| Gemini CLI | ✅ | ✅ `gemini mcp add` | ✅ | ✅ configs |
| Antigravity | ✅ | ✅ escribe `mcp_config.json` | ✅ | ✅ configs |
| Codex | ✅ | ✅ `codex mcp add` | ✅ | ✅ configs |
| Windsurf | ✅ | ✅ escribe `mcp_config.json` | ✅ | ✅ configs |
| Cline | ✅ | ✅ escribe `mcp_settings.json` | ✅ | ✅ configs |

## Idiomas

🇺🇸 English · 🇷🇺 Русский · 🇰🇿 Қазақша · 🇪🇸 Español · 🇧🇷 Português · 🇫🇷 Français · 🇩🇪 Deutsch · 🇹🇷 Türkçe · 🇮🇩 Bahasa · 🇵🇱 Polski · 🇨🇳 中文 · 🇯🇵 日本語 · 🇰🇷 한국어 · 🇮🇳 हिन्दी · 🇸🇦 العربية · 🇺🇿 O'zbek · 🇦🇱 Shqip

## Seguridad

- Nada se instala ni desactiva sin tu `y` explícito
- Los números de `doctor` son estimaciones honestas, no precisión inventada
- Sin telemetría. Sin peticiones de red propias — solo llama a `claude`, `uv`, etc.
- Cero dependencias — solo Node stdlib

## Licencia

[MIT](LICENSE) © [hasabasa](https://github.com/hasabasa)
