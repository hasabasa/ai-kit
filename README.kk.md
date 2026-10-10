<p align="center">
  <img src="assets/logo.png" alt="ai-kit" width="200">
</p>

<h1 align="center">ai-kit</h1>

<p align="center">
  <strong>ИИ-ассистентіңді дұрыс баптап ал — 2 минутта</strong>
</p>

<p align="center">
  🌍 <a href="README.md">English</a> |
  <strong>Қазақша</strong> |
  <a href="README.es.md">Español</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.zh.md">中文</a> |
  <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/v/aidevkit?color=60a5fa&style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/dm/aidevkit?color=2dd4bf&style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/hasabasa/ai-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-daea6a?style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-60a5fa?style=flat-square" alt="node version">
  <img src="https://img.shields.io/badge/тәуелділік-0-2dd4bf?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/тіл-17-daea6a?style=flat-square" alt="17 languages">
</p>

---

> ```
> ✦ ~45 562 токен/сұраныс (балласт 2 590 · CLAUDE.md 42 088 · дағдылар 884)
> ≈ $47,67/ай, 150 сұраныс/күн
> ```
> Нақты машинадағы нақты нәтиже. Ісінген баптау осынша тұрады.

<p align="center"><img src="assets/demo-kk.gif" alt="ai-kit демо" width="700"></p>

---

## Бұл не?

**Тәуелділіксіз**, тек Node stdlib. CLI құрал:

1. **Сканерлейді** — IDE, ИИ-кеңейтімдер, CLI, LLM, MCP-серверлер, жоба стегі
2. **Сұрайды** — ~10 сұрақ көрсеткілермен, көбі сканнан толтырылған
3. **Таңдайды** — **20 669 құрал** каталогынан, әрқайсысына себебін айтады
4. **Орнатады** — бір растау арқылы, артық балластты өшіреді
5. **Тексереді** — `doctor`: токен/сұраныс, $/ай, ісінген конфигтер

**Claude Code** үшін жұмыс істейді, **Cursor**, **Gemini CLI**, **Codex** көреді. **17 тілге** аударылған.

## Жылдам бастау

```bash
npx aidevkit
```

Немесе глобалды:

```bash
npm i -g aidevkit
```

## Командалар

| Команда | Не істейді |
|---|---|
| `ai-kit` | Толық цикл: скан → сұрақ → жоспар → орнату |
| `ai-kit scan` | Тек инвентаризация: IDE, кеңейтімдер, CLI, LLM, MCP, стектер |
| `ai-kit discover` | 20к+ құрал каталогы, стегіңізге бейімделген + GitHub іздеу |
| `ai-kit doctor` | Аудит: балласт плагиндер, ісінген CLAUDE.md, токен/сұраныс, $/ай |
| `ai-kit doctor --fix` | Сол + балластты өшіру (растауды сұрайды) |
| `ai-kit update` | Сақталған профильден жоспарды қайта құру |

## Жалаушалар

| Жалауша | Әсері |
|---|---|
| `--dry-run` | Жоспарды көрсету, ештеңе өзгертпеу |
| `--yes` | Растаусыз |
| `--lang kk` | Тіл таңдауды өткізіп жіберу |
| `--no-open` | HTML-есепті ашпау |
| `--json` | CI үшін машинаоқылатын нәтиже |
| `--requests N` | Құн бағалауға өз сұраныс/күн |

## Қалай жұмыс істейді

### 1. Скан

ai-kit сұрамас бұрын машинаңызды сканерлейді:

- **IDE**: VS Code, Cursor, Zed, Neovim, JetBrains, Xcode, Android Studio
- **ИИ-құралдар**: Claude Code, Cursor, Gemini CLI, Codex, Cline, Windsurf, Copilot
- **Конфигтер**: `.claude/`, MCP конфигтер, CLAUDE.md, дағдылар, плагиндер
- **Жоба стегі**: `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` т.б.
- **LLM**: Ollama модельдер, LM Studio, бұлттық API кілттер

### 2. Сұрақ

~10 сұрақ көрсеткілермен. Көп жауап сканнан толтырылған:

- Рөл мен деңгей
- Тілдер мен фреймворктар
- Деректер базалары мен бұлттық қызметтер
- Жұмыс стилі: қолмен код немесе вайб-кодинг
- Ағымдағы баптауда не ең көп мазалайды

### 3. Жоспар

Әр ұсынылған құрал:
- **Бір жол** — не үшін керек
- **«Сізге не үшін сәйкес»** — жауаптарыңызға байланысты
- **Қақтығыстар** — бір-біріне кедергі жасайтын екі құралды қоймайды

### 4. Орнату

Бір `y` бәрін орнатады. Тек өз командалары арқылы (`claude mcp add`, `uv tool install` т.б.).

### 5. Доктор

```
✦ ~45 562 токен/сұраныс (балласт 2 590 · CLAUDE.md 42 088 · дағдылар 884)
≈ $47,67/ай, 150 сұраныс/күн

Балласт (әр сұранысқа жүктеледі, пайдасы жоқ):
  ✗ sales-navigator         1 240 токен
  ✗ legal-review               850 токен
  ✗ hr-toolkit                 500 токен
```

## Қолдау көрсетілетін ассистенттер

| Ассистент | Скан | Орнату (авто) | Орнату (қолмен) | Доктор |
|---|:---:|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ `claude mcp add` | ✅ | ✅ балласт + конфиг |
| Cursor | ✅ | ✅ `mcp.json` жазады | ✅ | ✅ конфиг |
| Gemini CLI | ✅ | ✅ `gemini mcp add` | ✅ | ✅ конфиг |
| Antigravity | ✅ | ✅ `mcp_config.json` жазады | ✅ | ✅ конфиг |
| Codex | ✅ | ✅ `codex mcp add` | ✅ | ✅ конфиг |
| Windsurf | ✅ | ✅ `mcp_config.json` жазады | ✅ | ✅ конфиг |
| Cline | ✅ | ✅ `mcp_settings.json` жазады | ✅ | ✅ конфиг |

## Тілдер

🇺🇸 English · 🇷🇺 Русский · 🇰🇿 Қазақша · 🇪🇸 Español · 🇧🇷 Português · 🇫🇷 Français · 🇩🇪 Deutsch · 🇹🇷 Türkçe · 🇮🇩 Bahasa · 🇵🇱 Polski · 🇨🇳 中文 · 🇯🇵 日本語 · 🇰🇷 한국어 · 🇮🇳 हिन्दी · 🇸🇦 العربية · 🇺🇿 O'zbek · 🇦🇱 Shqip

## Қауіпсіздік

- Нақты `y` растауыңызсыз ештеңе орнатылмайды және өшірілмейді
- `doctor` сандары — адал бағалар, жалған дәлдік емес
- Телеметрия жоқ. Өз желілік сұраныстары жоқ
- Нөл тәуелділік — тек Node stdlib

## Лицензия

[MIT](LICENSE) © [hasabasa](https://github.com/hasabasa)
