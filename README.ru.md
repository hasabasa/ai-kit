<p align="center">
  <img src="assets/logo.png" alt="ai-kit" width="200">
</p>

<h1 align="center">ai-kit</h1>

<p align="center">
  <strong>Настрой своего ИИ-ассистента как надо — за 2 минуты</strong>
</p>

<p align="center">
  🌍 <a href="README.md">English</a> |
  <a href="README.kk.md">Қазақша</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.zh.md">中文</a> |
  <strong>Русский</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/v/aidevkit?color=60a5fa&style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/dm/aidevkit?color=2dd4bf&style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/hasabasa/ai-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-daea6a?style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-60a5fa?style=flat-square" alt="node version">
  <img src="https://img.shields.io/badge/зависимости-0-2dd4bf?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/языки-17-daea6a?style=flat-square" alt="17 languages">
</p>

---

> ```
> ✦ ~45 562 токенов/запрос (балласт 2 590 · CLAUDE.md 42 088 · навыки 884)
> ≈ $47,67/мес при 150 запросов/день
> ```
> Реальный вывод на реальной машине. Столько стоит раздутая настройка.

<p align="center"><img src="assets/demo-ru.gif" alt="ai-kit демо" width="700"></p>

---

## Что это?

**Без единой зависимости**, только Node stdlib. CLI, который:

1. **Сканирует** машину — IDE, ИИ-расширения, CLI-инструменты, LLM, MCP-серверы, стек проектов
2. **Спрашивает** — ~10 вопросов стрелками, большинство заполнены из скана
3. **Подбирает** из каталога **20 669 инструментов** — с объяснением, зачем каждый
4. **Устанавливает** по одному подтверждению — и отключает балласт, который жрёт токены
5. **Аудит** существующей настройки: `doctor` — токены/запрос, $/месяц, раздутые конфиги

Работает с **Claude Code**, видит **Cursor**, **Gemini CLI**, **Codex**. Интерфейс переведён на **17 языков**.

## Быстрый старт

```bash
npx aidevkit
```

Или глобально:

```bash
npm i -g aidevkit
```

## Команды

| Команда | Что делает |
|---|---|
| `ai-kit` | Полный цикл: скан → опрос → план → установка |
| `ai-kit scan` | Только инвентаризация: IDE, расширения, CLI, LLM, MCP, стеки |
| `ai-kit discover` | Каталог 20к+ инструментов, ранжированных под ваш стек + поиск по GitHub |
| `ai-kit doctor` | Аудит: балластные плагины, раздутый CLAUDE.md, токены/запрос, $/мес |
| `ai-kit doctor --fix` | То же + отключение балласта (спросит подтверждение) |
| `ai-kit update` | Перестроить план из сохранённого профиля, без опроса |

## Флаги

| Флаг | Эффект |
|---|---|
| `--dry-run` | Показать план, ничего не менять |
| `--yes` | Без подтверждений |
| `--lang ru` | Пропустить выбор языка |
| `--no-open` | Не открывать HTML-отчёт |
| `--json` | Машиночитаемый вывод doctor (для CI) |
| `--requests N` | Свои запросы/день для оценки стоимости |

Полный список: `npx aidevkit --help`

## Как это работает

### 1. Скан

ai-kit сканирует машину до того, как спросит что-либо:

- **IDE**: VS Code, Cursor, Zed, Neovim, JetBrains, Xcode, Android Studio
- **ИИ-инструменты**: Claude Code, Cursor, Gemini CLI, Codex, Cline, Windsurf, Copilot
- **Конфиги**: `.claude/`, MCP-конфиги, CLAUDE.md, навыки, плагины
- **Стек проектов**: из `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` и т.д.
- **LLM**: модели Ollama, LM Studio, облачные API-ключи

### 2. Опрос

~10 вопросов со стрелками. Большинство ответов заполнено из скана:

- Роль и уровень
- Языки и фреймворки
- Базы данных и облака
- Стиль работы: ручной код или вайб-кодинг, часов в день
- Что больше всего раздражает в текущей настройке
- К каждому вопросу можно написать свой вариант

### 3. План

Каждый рекомендованный инструмент:
- **Одна строка** — зачем он нужен
- **«Почему вам подходит»** — привязка к вашим ответам
- **Конфликты** — не поставит два инструмента, которые мешают друг другу

Балласт помечен: бизнес-навыки (продажи, юридика, HR, финансы…), которые грузятся в каждый запрос и разработчику ничего не дают.

### 4. Установка

Одно `y` ставит всё. Через родные команды (`claude mcp add`, `uv tool install` и т.д.). Без вашего подтверждения ничего не делается.

### 5. Доктор

```
✦ ~45 562 токенов/запрос (балласт 2 590 · CLAUDE.md 42 088 · навыки 884)
≈ $47,67/мес при 150 запросов/день

Балласт (грузится в каждый запрос, пользы ноль):
  ✗ sales-navigator         1 240 токенов
  ✗ legal-review               850 токенов
  ✗ hr-toolkit                 500 токенов
```

`doctor --fix` отключает балласт, предварительно показав, что именно. `--json` отдаёт результат для CI.

## Каталог

**20 669 инструментов** по категориям:

- **MCP-серверы** — коннекторы БД, интеграции API, файловые, облачные
- **Навыки Claude Code** — ревью, тесты, деплой, документация
- **Правила Cursor** — по фреймворку, по языку, по воркфлоу
- **Плагины** — линтеры, форматтеры, дебаггеры, профайлеры
- **CLI-утилиты** — dev-инструменты через npm, pip, cargo, brew

## Поддерживаемые ассистенты

| Ассистент | Скан | Установка (авто) | Установка (ручная) | Доктор |
|---|:---:|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ `claude mcp add` | ✅ | ✅ балласт + конфиги |
| Cursor | ✅ | ✅ пишет `mcp.json` | ✅ | ✅ конфиги |
| Gemini CLI | ✅ | ✅ `gemini mcp add` | ✅ | ✅ конфиги |
| Antigravity | ✅ | ✅ пишет `mcp_config.json` | ✅ | ✅ конфиги |
| Codex | ✅ | ✅ `codex mcp add` | ✅ | ✅ конфиги |
| Windsurf | ✅ | ✅ пишет `mcp_config.json` | ✅ | ✅ конфиги |
| Cline | ✅ | ✅ пишет `mcp_settings.json` | ✅ | ✅ конфиги |

## Языки

🇺🇸 English · 🇷🇺 Русский · 🇰🇿 Қазақша · 🇪🇸 Español · 🇧🇷 Português · 🇫🇷 Français · 🇩🇪 Deutsch · 🇹🇷 Türkçe · 🇮🇩 Bahasa · 🇵🇱 Polski · 🇨🇳 中文 · 🇯🇵 日本語 · 🇰🇷 한국어 · 🇮🇳 हिन्दी · 🇸🇦 العربية · 🇺🇿 O'zbek · 🇦🇱 Shqip

## Безопасность

- Ничего не ставится и не отключается без вашего явного `y`
- Числа `doctor` — честные оценки, а не выдуманная точность
- Никакой телеметрии. Никаких сетевых запросов — только вызовы `claude`, `uv` и т.д.
- Ноль зависимостей — только Node stdlib

## Лицензия

[MIT](LICENSE) © [hasabasa](https://github.com/hasabasa)
