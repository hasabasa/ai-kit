#!/usr/bin/env node
/**
 * ai-kit — опрос → подбор инструментов под задачи → установка.
 * MVP: Claude Code, macOS/Linux. Без зависимостей (stdlib). Многоязычный UI.
 * Выбор стрелками ↑↓ в терминале; вне TTY — ввод номерами (fallback).
 *
 *   npx aidevkit            интерактивно
 *   npx aidevkit --lang ru  пропустить выбор языка
 *   npx aidevkit --yes / --dry-run / --preview
 *   npx aidevkit --help     справка (язык: --lang → профиль → $LANG → en)
 *   node cli.mjs --test   самопроверка
 */
import readline from "node:readline/promises";
import rlcore from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

// ── Оформление ────────────────────────────────────────────────────────────────
const VERSION = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const COLOR = output.isTTY && !process.env.NO_COLOR;
const e = (code, s) => COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
const c = { b: s => e("1", s), d: s => e("2", s),
  g: s => e("38;2;126;211;33", s), y: s => e("38;2;240;180;41", s), r: s => e("38;2;235;87;87", s) };
const W = 72;
// ширина в колонках: иероглифы и хангыль занимают две — иначе рамки у zh/ja/ko разъезжаются
const cw = ch => { const c0 = ch.codePointAt(0); return (c0 >= 0x1100 && c0 <= 0x115f) || (c0 >= 0x2e80 && c0 <= 0xa4cf) || (c0 >= 0xac00 && c0 <= 0xd7a3) ||
  (c0 >= 0xf900 && c0 <= 0xfaff) || (c0 >= 0xfe30 && c0 <= 0xfe4f) || (c0 >= 0xff00 && c0 <= 0xff60) || (c0 >= 0xffe0 && c0 <= 0xffe6) || (c0 >= 0x20000 && c0 <= 0x3fffd) ? 2 : 1; };
const vlen = s => [...s.replace(/\x1b\[[0-9;]*m/g, "")].reduce((n, ch) => n + cw(ch), 0);
const pad = (s, n) => s + " ".repeat(Math.max(0, n - vlen(s)));
function clip(s, n) { let o = "", v = 0, i = 0; while (i < s.length && v < n) {
  const m = s[i] === "\x1b" && s.slice(i).match(/^\x1b\[[0-9;]*m/);
  if (m) { o += m[0]; i += m[0].length; continue; }
  const ch = String.fromCodePoint(s.codePointAt(i)); if (v + cw(ch) > n) break; o += ch; v += cw(ch); i += ch.length; } return o + (COLOR ? "\x1b[0m" : ""); }
function wrap(t, n) { const w = t.split(" "), L = []; let cur = "";
  for (const x of w) { if (vlen((cur + " " + x).trim()) > n) { L.push(cur.trim()); cur = x; } else cur += " " + x; }
  if (cur.trim()) L.push(cur.trim()); return L; }
function grad(s) { if (!COLOR) return s; const a = [96, 165, 250], z = [45, 212, 191], n = Math.max(1, s.length - 1);
  return [...s].map((ch, i) => `\x1b[1;38;2;${Math.round(a[0]+(z[0]-a[0])*i/n)};${Math.round(a[1]+(z[1]-a[1])*i/n)};${Math.round(a[2]+(z[2]-a[2])*i/n)}m${ch}`).join("") + "\x1b[0m"; }
function box(title, lines, color = c.d) {
  console.log([color("╭─ ") + c.b(title) + " " + color("─".repeat(Math.max(0, W - vlen(title) - 4)) + "╮"),
    ...lines.map(l => color("│ ") + pad(clip(l, W - 3), W - 3) + color("│")),
    color("╰" + "─".repeat(W - 1) + "╯")].join("\n"));
}

// ── Языки ─────────────────────────────────────────────────────────────────────
const LANGS = [
  { code: "en", name: "English" }, { code: "kk", name: "Қазақша" },
  { code: "uz", name: "Oʻzbekcha" }, { code: "zh", name: "中文" }, { code: "hi", name: "हिन्दी" },
  { code: "es", name: "Español" }, { code: "pt", name: "Português" }, { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" }, { code: "ar", name: "العربية" }, { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" }, { code: "tr", name: "Türkçe" }, { code: "id", name: "Bahasa Indonesia" },
  { code: "pl", name: "Polski" }, { code: "sq", name: "Shqip" }, { code: "ru", name: "Русский" },
];
// «полный» язык — не хватает не больше 20 ключей (техназвания вроде «React / Next.js» общие и не считаются); иначе показываем пометку про английский
let FULL;

const UI = {
  en: {
    tagline1: "Pick the right tools for your work", tagline2: "Sharper AI · fewer tokens · only what you need",
    hintMulti: "↑↓ move · space — pick several · enter — next · esc — back",
    hintSingle: "↑↓ move · enter — next · esc — back",
    hintMultiN: "numbers comma-separated", hintSingleN: "number",
    own: "your own", ownPrompt: "your own: ", enFallback: "(interface falls back to English)",
    qKind: "What do you build?", kFe: "Frontend — sites, web apps, UI", kBe: "Backend — APIs, services, data", kData: "Data / analytics", kContent: "Content", kDevops: "DevOps / server",
    qLang: "Languages / stack?", lTs: "TypeScript / JS", lPy: "Python", lGo: "Go", lOther: "Other",
    qGoal: "Main goal?", gTokens: "Save tokens", gQuality: "Code quality", gSpeed: "Speed",
    qUsage: "How heavily do you use AI?", uLight: "Rarely (<1h/day)", uMed: "1–3h/day", uHeavy: "3–6h/day", uAllday: "All day (6h+)",
    qSkill: "How well do you code by hand?", sPro: "Confident by hand (senior/mid)", sLearn: "I code but look things up", sVibe: "Mostly vibe-coding (AI writes, I steer)", sNew: "Beginner",
    recommend: "Recommend to install", disable: "Disable — ballast, eats context",
    needUv: "needs uv: ", needClaude: "needs Claude CLI: ",
    installQ: "Install everything? ", installing: "Installing", disabling: "Disabling ballast", done: "Done", nochange: "Ok, changed nothing.", restart: "restart the editor/session",
    previewNote: "preview · demo profile", previewNext: "next in a real run",
    wPonytail: "less code → fewer tokens & edits", wGraphify: "code graph instead of re-reading files",
    wContext7: "fresh library docs on the fly", wTs: "accurate go-to/types for TS/JS",
    wPy: "types & analysis for Python", wMatt: "engineering: TDD, review, specs", wFrontend: "quality UI, not templated",
    dApprox: "rough estimate", dClaudeMd: "CLAUDE.md files", dConfigs: "Config files (all assistants)", dSkillsBox: "User skills",
    dBallast: "Ballast plugins (useless for dev, eat context)", dNone: "No ballast — setup is clean",
    dTotal: "Ballast per EVERY request", dTokens: "tokens", dBig: "heavy! worth trimming",
    dFix: "Disable it: ai-kit doctor --fix", dFixing: "Disabling ballast", dSkillsN: "skills",
    wPr: "PR review agents: comments, tests, errors", wCommit: "git workflow: commit/push commands",
    wPlaywright: "browser e2e tests", wGo: "types & navigation for Go", wTerraform: "Terraform / IaC integration",
    wMd: "audit & slim your CLAUDE.md", wSimplify: "simplifies code for clarity", wFeature: "guided feature-dev workflow",
    pWhy: "Why this fits you", rHeavy: "hours in AI daily → ponytail + graphify cut token burn hard",
    rVibe: "vibe-coding → TDD/review + ponytail keep the code safe",
    rNew: "beginner → guardrails first: review, tests, minimal code",
    rPro: "experienced → precise tools (LSP), no hand-holding",
    rContent: "content work → keeping the marketing pack enabled",
    aFound: "AI assistants detected", aOk: "supported", aSoon: "adapter coming",
    dDupes: "Duplicates / conflicts", dupSerena: "serena duplicates graphify — keep one",
    dCostNote: "req/day · Sonnet input pricing, rough",
    uNoProfile: "No saved profile — run `ai-kit` first",
    pSaved: "profile saved → `ai-kit update` re-plans without the survey",
    mHow: "How do we install?", mAuto: "Automatically — I run the commands",
    mManual: "Manually — give me step-by-step commands", vTitle: "Install check", vOk: "ok", vFail: "missing",
    pUse: "How to use", useAuto: "picks itself up when relevant", planFile: "Plan saved:",
    manDo: "Run these in order", manVerify: "Verify", manBallast: "Then disable the ballast",
    qStackFe: "Frontend stack?", qStackBe: "Backend stack?",
    // техназвания — одни на все языки (fallback)
    fReact: "React / Next.js", fVue: "Vue / Nuxt", fAngular: "Angular", fSvelte: "Svelte", fPlain: "Vanilla JS/TS",
    bNode: "Node / TypeScript", bPy: "Python (FastAPI / Django)", bGo: "Go", bPhp: "PHP / Laravel",
    bJvm: "Java / Kotlin", bCs: "C# / .NET", bRuby: "Ruby / Rails", bRust: "Rust", bSwift: "Swift / iOS", bC: "C / C++",
    wLsp: "precise go-to & types", wLaravel: "Laravel toolkit (artisan, models…)",
    mCancel: "Cancel", repTitle: "Your personal setup report", repProfile: "Your profile",
    scAi: "AI on this machine", scCli: "CLI assistants", scApps: "Desktop apps", scModels: "LLM models", scCloud: "Cloud keys",
    scMcp: "MCP servers configured", scProjects: "Projects", scNone: "nothing found",
    scPrivacy: "reads folder names & manifests only · nothing is sent anywhere",
    scGuess: "Looks like your stack — pre-selected below, just confirm with Enter",
    dsTitle: "Found live for your stack (unverified)", dsNone: "nothing new found", dsHave: "already configured",
    dsNote: "stars · last commit — not vetted by us, read the README before installing", dsSearching: "searching GitHub · npm · PyPI…",
    repFound: "Discovered for your stack", repUnverified: "unverified", repHave: "already configured",
    kMobile: "Mobile", kMl: "AI / ML / LLM apps", qStackMob: "Mobile stack?", mSwift: "Swift / iOS", mKotlin: "Kotlin / Android", mFlutter: "Flutter", mRn: "React Native",
    qAssist: "Which AI assistants do you use?", aClaude: "Claude Code (CLI / IDE extension)", aCursor: "Cursor", aGemini: "Gemini (CLI / Code Assist / Antigravity)", aCodex: "Codex (CLI / IDE extension)", aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "What annoys you most?", pContext: "Re-reads files, burns context", pStale: "Outdated APIs / library versions", pQuality: "Breaks tests, sloppy code",
    pSlow: "Too slow, too much back-and-forth", pProject: "Doesn't know my project", pBrowser: "Can't touch browser / DB / services",
    qDb: "Databases you work with?", dPg: "PostgreSQL", dMy: "MySQL / MariaDB", dMongo: "MongoDB", dRedis: "Redis", dSupa: "Supabase / Firebase", dSqlite: "SQLite",
    qSvc: "Services to wire in?", vGit: "GitHub / GitLab", vFigma: "Figma", vTrack: "Jira / Linear", vDocs: "Notion / Confluence", vChat: "Slack / Discord", vCloud: "AWS / GCP / Azure", vDeploy: "Vercel / Netlify",
    qTeam: "Solo or team?", tSolo: "Solo", tTeam: "Team — PRs, reviews",
    rTeam: "team → PR review + commit conventions keep the history clean", rMobile: "mobile → precise LSP for the platform, UI tools stay off",
    wSoup: "fine-tune an LLM from one YAML on a laptop GPU",
    scCfg: "Configured (no CLI)", scFind: "Findings", fNoMcp: "{host}: no MCP servers — the plan will wire the ones you need",
    fMcp: "{host}: {n} MCP servers configured", fCfgNoCli: "{name}: account/config present, CLI not installed",
    fModelsNoRuntime: "models in HF cache but no runtime to run them (Ollama / LM Studio)", fNoRules: "no AI instructions (CLAUDE.md / AGENTS.md / .cursorrules) in {n} of {m} projects",
    scNext: "what to add or remove — the plan decides after the survey · context cost — `ai-kit doctor`",
    iTitle: "Wire the found tools too? (pick)", iSkip: "— skip —", iInto: "Connecting into", iDone: "connected", iExists: "already there", iFail: "failed",
    iNoHost: "no selected assistant found on this machine — commands only:", iBackup: "config backups are written next to each file (*.bak-<time>)",
    iAutoSkip: "--yes installs only the curated set; found tools need an explicit pick",
    iResult: "Found tools — result",
    support: "Made by one human. If this saved you an hour, a ★ on github.com/hasabasa/ai-kit is how I find out.",
    repBecause: "picked because of", repFile: "Report:",
  },
  ru: {
    tagline1: "Подбор инструментов под твои задачи", tagline2: "Эффективнее ИИ · меньше токенов · только нужное",
    hintMulti: "↑↓ листать · пробел — отметить несколько · enter — дальше · esc — назад",
    hintSingle: "↑↓ листать · enter — дальше · esc — назад",
    hintMultiN: "номера через запятую", hintSingleN: "номер",
    own: "свой вариант", ownPrompt: "свой вариант: ", enFallback: "(интерфейс на английском)",
    qKind: "Что делаешь?", kFe: "Фронтенд — сайты, веб-приложения, UI", kBe: "Бэкенд — API, сервисы, данные", kData: "Данные / аналитика", kContent: "Контент", kDevops: "DevOps / сервер",
    qLang: "Языки / стек?", lTs: "TypeScript / JS", lPy: "Python", lGo: "Go", lOther: "Другое",
    qGoal: "Главная цель?", gTokens: "Экономить токены", gQuality: "Качество кода", gSpeed: "Скорость",
    qUsage: "Насколько активно юзаешь ИИ?", uLight: "Редко (<1ч/день)", uMed: "1–3ч/день", uHeavy: "3–6ч/день", uAllday: "Весь день (6ч+)",
    qSkill: "Насколько умеешь кодить руками?", sPro: "Уверенно сам (senior/middle)", sLearn: "Пишу, но подсматриваю", sVibe: "В основном вайбкодинг (ИИ пишет, я направляю)", sNew: "Новичок",
    recommend: "Рекомендую поставить", disable: "Отключить — балласт, жрёт контекст",
    needUv: "нужен uv: ", needClaude: "нужен Claude CLI: ",
    installQ: "Установить всё? ", installing: "Установка", disabling: "Отключаю балласт", done: "Готово", nochange: "Ок, ничего не менял.", restart: "перезапусти редактор/сессию",
    previewNote: "предпросмотр · демо-профиль", previewNext: "далее в реальном запуске",
    wPonytail: "минимум кода → меньше токенов и правок", wGraphify: "граф кода вместо перечитывания файлов",
    wContext7: "свежая дока библиотек на лету", wTs: "точные переходы/типы для TS/JS",
    wPy: "типы и анализ для Python", wMatt: "инженерия: TDD, ревью, спеки", wFrontend: "качественный UI, не шаблонный",
    dApprox: "грубая оценка", dClaudeMd: "Файлы CLAUDE.md", dConfigs: "Конфиги (все ассистенты)", dSkillsBox: "Пользовательские скилы",
    dBallast: "Плагины-балласт (для разработки не нужны, жрут контекст)", dNone: "Балласта нет — установка чистая",
    dTotal: "Балласт в КАЖДОМ запросе", dTokens: "токенов", dBig: "тяжёлый! стоит ужать",
    dFix: "Отключить: ai-kit doctor --fix", dFixing: "Отключаю балласт", dSkillsN: "скилов",
    wPr: "агенты ревью PR: комменты, тесты, ошибки", wCommit: "git-воркфлоу: команды коммитов",
    wPlaywright: "браузерные e2e-тесты", wGo: "типы и навигация для Go", wTerraform: "интеграция Terraform / IaC",
    wMd: "аудит и ужатие CLAUDE.md", wSimplify: "упрощает код для ясности", wFeature: "поэтапная разработка фич",
    pWhy: "Почему именно тебе", rHeavy: "часы в ИИ каждый день → ponytail + graphify сильно режут токены",
    rVibe: "вайбкодинг → TDD/ревью + ponytail страхуют код",
    rNew: "новичок → сначала страховка: ревью, тесты, минимум кода",
    rPro: "опытный → точные инструменты (LSP), без лишней опеки",
    rContent: "работа с контентом → маркетинг-пакет оставляю включённым",
    aFound: "Найдены ИИ-ассистенты", aOk: "поддерживается", aSoon: "адаптер скоро",
    dDupes: "Дубли / конфликты", dupSerena: "serena дублирует graphify — оставь один",
    dCostNote: "запросов/день · цены входа Sonnet, грубо",
    uNoProfile: "Нет сохранённого профиля — сначала запусти `ai-kit`",
    pSaved: "профиль сохранён → `ai-kit update` пересоберёт план без опроса",
    mHow: "Как ставим?", mAuto: "Автоматически — я выполню команды",
    mManual: "Вручную — дам пошаговые команды", vTitle: "Проверка установки", vOk: "ок", vFail: "не встал",
    pUse: "Как пользоваться", useAuto: "подтягивается сам по задаче", planFile: "План сохранён:",
    manDo: "Выполни по порядку", manVerify: "Проверка", manBallast: "Затем отключи балласт",
    qStackFe: "Фронтенд-стек?", qStackBe: "Бэкенд-стек?",
    wLsp: "точные переходы и типы", wLaravel: "тулкит Laravel (artisan, модели…)",
    mCancel: "Отмена", repTitle: "Твой персональный разбор", repProfile: "Твой профиль",
    scAi: "ИИ на этой машине", scCli: "CLI-ассистенты", scApps: "Приложения", scModels: "LLM-модели", scCloud: "Облачные ключи",
    scMcp: "Настроенные MCP-серверы", scProjects: "Проекты", scNone: "ничего не найдено",
    scPrivacy: "читаются только имена папок и манифесты · никуда не отправляется",
    scGuess: "Похоже, твой стек — уже отмечен ниже, просто подтверди Enter",
    dsTitle: "Найдено под твой стек (не проверено)", dsNone: "нового не нашлось", dsHave: "уже подключён",
    dsNote: "звёзды · последний коммит — нами не проверено, перед установкой читай README", dsSearching: "ищу на GitHub · npm · PyPI…",
    repFound: "Найдено под твой стек", repUnverified: "не проверено", repHave: "уже подключён",
    kMobile: "Мобильная", kMl: "ИИ / ML / LLM-приложения", qStackMob: "Мобильный стек?", mSwift: "Swift / iOS", mKotlin: "Kotlin / Android", mFlutter: "Flutter", mRn: "React Native",
    qAssist: "Какими ИИ-ассистентами пользуешься?", aClaude: "Claude Code (CLI / расширение IDE)", aCursor: "Cursor", aGemini: "Gemini (CLI / Code Assist / Antigravity)", aCodex: "Codex (CLI / расширение IDE)", aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Что бесит больше всего?", pContext: "Перечитывает файлы, жрёт контекст", pStale: "Устаревшие API / версии библиотек", pQuality: "Ломает тесты, грязный код",
    pSlow: "Медленно, много туда-сюда", pProject: "Не знает мой проект", pBrowser: "Не умеет в браузер / базу / сервисы",
    qDb: "С какими базами работаешь?", dPg: "PostgreSQL", dMy: "MySQL / MariaDB", dMongo: "MongoDB", dRedis: "Redis", dSupa: "Supabase / Firebase", dSqlite: "SQLite",
    qSvc: "Какие сервисы подключить?", vGit: "GitHub / GitLab", vFigma: "Figma", vTrack: "Jira / Linear", vDocs: "Notion / Confluence", vChat: "Slack / Discord", vCloud: "AWS / GCP / Azure", vDeploy: "Vercel / Netlify",
    qTeam: "Один или в команде?", tSolo: "Один", tTeam: "Команда — PR, ревью",
    rTeam: "команда → ревью PR + соглашения о коммитах держат историю чистой", rMobile: "мобильная → точный LSP под платформу, UI-инструменты не нужны",
    wSoup: "дообучить LLM одним YAML на ноутбучной видеокарте",
    scCfg: "Настроены (без CLI)", scFind: "Выводы", fNoMcp: "{host}: MCP-серверов нет — план подключит нужные",
    fMcp: "{host}: настроено MCP-серверов — {n}", fCfgNoCli: "{name}: аккаунт/конфиг есть, CLI не стоит",
    fModelsNoRuntime: "модели в кэше HF, но нет среды для запуска (Ollama / LM Studio)", fNoRules: "инструкций для ИИ (CLAUDE.md / AGENTS.md / .cursorrules) нет в {n} из {m} проектов",
    scNext: "что ставить и что убрать — решит план после опроса · цена контекста — `ai-kit doctor`",
    iTitle: "Подключить и найденное? (отметь)", iSkip: "— пропустить —", iInto: "Подключаю в", iDone: "подключено", iExists: "уже было", iFail: "не вышло",
    iNoHost: "выбранных ассистентов на машине не нашёл — только команды:", iBackup: "бэкапы конфигов лежат рядом с каждым файлом (*.bak-<время>)",
    iAutoSkip: "--yes ставит только курируемый набор; найденное — только по явному выбору",
    iResult: "Подключение найденного — итог",
    support: "Сделано одним человеком. Если это сэкономило тебе час — звезда на github.com/hasabasa/ai-kit даст мне об этом знать.",
    repBecause: "подобран из-за", repFile: "Отчёт:",
  },
  kk: {
    tagline1: "Тапсырмаларыңа сай құралдарды таңдау", tagline2: "ЖИ тиімдірек · токен аз · тек қажеттісі",
    hintMulti: "↑↓ жылжу · бос орын — бірнешеуін белгіле · enter — әрі · esc — артқа",
    hintSingle: "↑↓ жылжу · enter — әрі · esc — артқа",
    hintMultiN: "нөмірлер үтірмен", hintSingleN: "нөмір",
    own: "өз нұсқаң", ownPrompt: "өз нұсқаң: ", enFallback: "",
    qKind: "Немен айналысасың?", kFe: "Фронтенд — сайттар, веб-қолданбалар, UI", kBe: "Бэкенд — API, сервистер, деректер", kData: "Деректер / аналитика", kContent: "Контент", kDevops: "DevOps / сервер",
    qLang: "Тілдер / стек?", lTs: "TypeScript / JS", lPy: "Python", lGo: "Go", lOther: "Басқа",
    qGoal: "Басты мақсат?", gTokens: "Токен үнемдеу", gQuality: "Код сапасы", gSpeed: "Жылдамдық",
    qUsage: "ЖИ-ды қаншалықты белсенді қолданасың?", uLight: "Сирек (<1сағ/күн)", uMed: "1–3сағ/күн", uHeavy: "3–6сағ/күн", uAllday: "Күні бойы (6сағ+)",
    qSkill: "Қолмен код жазуды қаншалықты білесің?", sPro: "Өзім сенімді (senior/middle)", sLearn: "Жазамын, бірақ қараймын", sVibe: "Көбіне вайбкодинг (ЖИ жазады, мен бағыттаймын)", sNew: "Жаңа бастаушы",
    recommend: "Орнатуды ұсынамын", disable: "Өшіру — балласт, контекст жейді",
    needUv: "uv керек: ", needClaude: "Claude CLI керек: ",
    installQ: "Бәрін орнатайын ба? ", installing: "Орнату", disabling: "Балласты өшіремін", done: "Дайын", nochange: "Жарайды, ештеңе өзгерткен жоқпын.", restart: "редакторды/сессияны қайта қос",
    previewNote: "алдын ала қарау · демо-профиль", previewNext: "нақты іске қосқанда келесі",
    wPonytail: "аз код → токен мен түзету аз", wGraphify: "файлды қайта оқудың орнына код графы",
    wContext7: "кітапханалардың жаңа құжаттамасы", wTs: "TS/JS үшін нақты өту/типтер",
    wPy: "Python үшін типтер мен талдау", wMatt: "инженерия: TDD, ревью, спектер", wFrontend: "сапалы UI, шаблон емес",
    dApprox: "шамамен баға", dClaudeMd: "CLAUDE.md файлдары", dConfigs: "Конфигтер (барлық ассистенттер)", dSkillsBox: "Пайдаланушы скилдері",
    dBallast: "Балласт-плагиндер (әзірлеуге керек емес, контекст жейді)", dNone: "Балласт жоқ — орнату таза",
    dTotal: "ӘР сұраныстағы балласт", dTokens: "токен", dBig: "ауыр! қысқартқан жөн",
    dFix: "Өшіру: ai-kit doctor --fix", dFixing: "Балласты өшіремін", dSkillsN: "скил",
    wPr: "PR ревью агенттері: комменттер, тесттер", wCommit: "git-воркфлоу: коммит командалары",
    wPlaywright: "браузерлік e2e-тесттер", wGo: "Go үшін типтер мен навигация", wTerraform: "Terraform / IaC интеграциясы",
    wMd: "CLAUDE.md аудиті және қысқарту", wSimplify: "кодты түсінікті етіп жеңілдетеді", wFeature: "фичаны кезең-кезеңмен әзірлеу",
    pWhy: "Неге дәл саған", rHeavy: "күнде ЖИ-да көп сағат → ponytail + graphify токенді қатты үнемдейді",
    rVibe: "вайбкодинг → TDD/ревью + ponytail кодты сақтандырады",
    rNew: "жаңа бастаушы → алдымен қорғаныс: ревью, тесттер, аз код",
    rPro: "тәжірибелі → нақты құралдар (LSP), артық қамқорсыз",
    rContent: "контентпен жұмыс → маркетинг пакетін қосулы қалдырамын",
    aFound: "ЖИ-ассистенттер табылды", aOk: "қолдау бар", aSoon: "адаптер жақында",
    dDupes: "Қайталанулар / қақтығыстар", dupSerena: "serena graphify-ды қайталайды — біреуін қалдыр",
    dCostNote: "сұраныс/күн · Sonnet кіріс бағасы, шамамен",
    uNoProfile: "Сақталған профиль жоқ — алдымен `ai-kit` іске қос",
    pSaved: "профиль сақталды → `ai-kit update` сауалнамасыз жоспар құрады",
    mHow: "Қалай орнатамыз?", mAuto: "Автоматты — командаларды өзім орындаймын",
    mManual: "Қолмен — қадамдық командалар беремін", vTitle: "Орнатуды тексеру", vOk: "ок", vFail: "орнатылмады",
    pUse: "Қалай қолдану", useAuto: "тапсырмаға қарай өзі қосылады", planFile: "Жоспар сақталды:",
    manDo: "Ретімен орында", manVerify: "Тексеру", manBallast: "Сосын балласты өшір",
    qStackFe: "Фронтенд стегі?", qStackBe: "Бэкенд стегі?",
    wLsp: "нақты өту мен типтер", wLaravel: "Laravel құралдары (artisan…)",
    mCancel: "Бас тарту", repTitle: "Жеке талдауың", repProfile: "Профилің",
    scAi: "Осы машинадағы ИИ", scCli: "CLI-ассистенттер", scApps: "Қолданбалар", scModels: "LLM-модельдер", scCloud: "Бұлт кілттері",
    scMcp: "Бапталған MCP-серверлер", scProjects: "Жобалар", scNone: "ештеңе табылмады",
    scPrivacy: "тек қалта аттары мен манифесттер оқылады · ешқайда жіберілмейді",
    scGuess: "Сенің стегің сияқты — төменде белгіленген, Enter-мен растай сал",
    dsTitle: "Стегіңе табылды (тексерілмеген)", dsNone: "жаңа ештеңе табылмады", dsHave: "қосылып қойған",
    dsNote: "жұлдыздар · соңғы коммит — біз тексермедік, орнатар алдында README оқы", dsSearching: "GitHub · npm · PyPI ішінен іздеп жатырмын…",
    repFound: "Стегіңе табылды", repUnverified: "тексерілмеген", repHave: "қосылып қойған",
    kMobile: "Мобильді", kMl: "ИИ / ML / LLM-қолданбалар", qStackMob: "Мобильді стек?", mSwift: "Swift / iOS", mKotlin: "Kotlin / Android", mFlutter: "Flutter", mRn: "React Native",
    qAssist: "Қандай ИИ-ассистенттерді қолданасың?", aClaude: "Claude Code (CLI / IDE кеңейтімі)", aCursor: "Cursor", aGemini: "Gemini (CLI / Code Assist / Antigravity)", aCodex: "Codex (CLI / IDE кеңейтімі)", aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Ең ашуландыратыны не?", pContext: "Файлдарды қайта оқиды, контекст жейді", pStale: "Ескірген API / кітапхана нұсқалары", pQuality: "Тесттерді бұзады, лас код",
    pSlow: "Баяу, көп кері-қарсы", pProject: "Менің жобамды білмейді", pBrowser: "Браузер / база / сервистерге кіре алмайды",
    qDb: "Қандай базалармен жұмыс істейсің?", dPg: "PostgreSQL", dMy: "MySQL / MariaDB", dMongo: "MongoDB", dRedis: "Redis", dSupa: "Supabase / Firebase", dSqlite: "SQLite",
    qSvc: "Қандай сервистерді қосамыз?", vGit: "GitHub / GitLab", vFigma: "Figma", vTrack: "Jira / Linear", vDocs: "Notion / Confluence", vChat: "Slack / Discord", vCloud: "AWS / GCP / Azure", vDeploy: "Vercel / Netlify",
    qTeam: "Жалғыз ба, командада ма?", tSolo: "Жалғыз", tTeam: "Команда — PR, ревью",
    rTeam: "команда → PR ревью + коммит келісімдері тарихты таза ұстайды", rMobile: "мобильді → платформаға дәл LSP, UI-құралдар қажет емес",
    wSoup: "LLM-ді бір YAML-мен ноутбук видеокартасында қосымша оқыту",
    scCfg: "Бапталған (CLI жоқ)", scFind: "Қорытынды", fNoMcp: "{host}: MCP-серверлер жоқ — жоспар керектерін қосады",
    fMcp: "{host}: бапталған MCP-серверлер — {n}", fCfgNoCli: "{name}: аккаунт/конфиг бар, CLI орнатылмаған",
    fModelsNoRuntime: "HF кэшінде модельдер бар, бірақ іске қосатын орта жоқ (Ollama / LM Studio)", fNoRules: "{m} жобаның {n}-інде ИИ нұсқаулығы (CLAUDE.md / AGENTS.md / .cursorrules) жоқ",
    scNext: "не орнату, не алып тастау — сауалнамадан кейін жоспар шешеді · контекст бағасы — `ai-kit doctor`",
    iTitle: "Табылғандарды да қосамыз ба? (белгіле)", iSkip: "— өткізіп жіберу —", iInto: "Қосып жатырмын", iDone: "қосылды", iExists: "бұрыннан бар", iFail: "болмады",
    iNoHost: "таңдалған ассистенттер бұл машинада табылмады — тек командалар:", iBackup: "конфиг көшірмелері әр файлдың жанында (*.bak-<уақыт>)",
    iAutoSkip: "--yes тек іріктелген жиынды орнатады; табылғандар — тек нақты таңдау бойынша",
    iResult: "Табылғандарды қосу — нәтиже",
    support: "Бір адам жасаған. Бір сағат үнемдесе — github.com/hasabasa/ai-kit-тегі жұлдыз маған оны білдіреді.",
    repBecause: "таңдалу себебі", repFile: "Есеп:",
  },
  es: {
    tagline1: "Elige las herramientas para tu trabajo", tagline2: "IA más precisa · menos tokens · solo lo necesario",
    hintMulti: "↑↓ mover · espacio — marca varios · enter — seguir · esc — atrás",
    hintSingle: "↑↓ mover · enter — seguir · esc — atrás",
    hintMultiN: "números separados por comas", hintSingleN: "número",
    own: "tu propia opción", ownPrompt: "tu opción: ", enFallback: "",
    qKind: "¿Qué desarrollas?", kFe: "Frontend — sitios, apps web, UI", kBe: "Backend — APIs, servicios, datos", kData: "Datos / analítica", kContent: "Contenido", kDevops: "DevOps / servidor",
    qLang: "¿Lenguajes / stack?", lTs: "TypeScript / JS", lPy: "Python", lGo: "Go", lOther: "Otro",
    qGoal: "¿Objetivo principal?", gTokens: "Ahorrar tokens", gQuality: "Calidad del código", gSpeed: "Velocidad",
    qUsage: "¿Con qué intensidad usas la IA?", uLight: "Rara vez (<1h/día)", uMed: "1–3h/día", uHeavy: "3–6h/día", uAllday: "Todo el día (6h+)",
    qSkill: "¿Qué tan bien programas a mano?", sPro: "Seguro a mano (senior/mid)", sLearn: "Programo pero consulto", sVibe: "Sobre todo vibe-coding (la IA escribe, yo guío)", sNew: "Principiante",
    recommend: "Recomiendo instalar", disable: "Desactivar — lastre, consume contexto",
    needUv: "necesita uv: ", needClaude: "necesita Claude CLI: ",
    installQ: "¿Instalar todo? ", installing: "Instalando", disabling: "Desactivando lastre", done: "Listo", nochange: "Ok, no cambié nada.", restart: "reinicia el editor/sesión",
    previewNote: "vista previa · perfil demo", previewNext: "siguiente en una ejecución real",
    wPonytail: "menos código → menos tokens y ediciones", wGraphify: "grafo de código en vez de releer archivos",
    wContext7: "docs de librerías al vuelo", wTs: "saltos/tipos precisos para TS/JS",
    wPy: "tipos y análisis para Python", wMatt: "ingeniería: TDD, revisión, specs", wFrontend: "UI de calidad, no genérica",
    dApprox: "estimación aproximada", dClaudeMd: "Archivos CLAUDE.md", dConfigs: "Archivos de config (todos)", dSkillsBox: "Skills del usuario",
    dBallast: "Plugins lastre (inútiles para dev, consumen contexto)", dNone: "Sin lastre — instalación limpia",
    dTotal: "Lastre en CADA petición", dTokens: "tokens", dBig: "¡pesado! conviene recortar",
    dFix: "Desactivar: ai-kit doctor --fix", dFixing: "Desactivando lastre", dSkillsN: "skills",
    wPr: "agentes de revisión de PR: comentarios, tests", wCommit: "flujo git: comandos de commit",
    wPlaywright: "tests e2e de navegador", wGo: "tipos y navegación para Go", wTerraform: "integración Terraform / IaC",
    wMd: "audita y adelgaza tu CLAUDE.md", wSimplify: "simplifica el código", wFeature: "desarrollo de features guiado",
    pWhy: "Por qué te encaja", rHeavy: "horas de IA a diario → ponytail + graphify recortan mucho los tokens",
    rVibe: "vibe-coding → TDD/revisión + ponytail protegen el código",
    rNew: "principiante → primero barandillas: revisión, tests, código mínimo",
    rPro: "con experiencia → herramientas precisas (LSP), sin niñeras",
    rContent: "trabajas contenido → dejo activado el pack de marketing",
    aFound: "Asistentes de IA detectados", aOk: "compatible", aSoon: "adaptador pronto",
    dDupes: "Duplicados / conflictos", dupSerena: "serena duplica graphify — deja uno",
    dCostNote: "peticiones/día · precio de entrada Sonnet, aproximado",
    uNoProfile: "Sin perfil guardado — ejecuta `ai-kit` primero",
    pSaved: "perfil guardado → `ai-kit update` replanifica sin encuesta",
    mHow: "¿Cómo instalamos?", mAuto: "Automático — yo ejecuto los comandos",
    mManual: "Manual — dame los comandos paso a paso", vTitle: "Verificación", vOk: "ok", vFail: "falta",
    pUse: "Cómo usar", useAuto: "se activa solo cuando toca", planFile: "Plan guardado:",
    manDo: "Ejecuta en orden", manVerify: "Verificar", manBallast: "Luego desactiva el lastre",
    qStackFe: "¿Stack de frontend?", qStackBe: "¿Stack de backend?",
    wLsp: "saltos y tipos precisos", wLaravel: "kit Laravel (artisan, modelos…)",
    mCancel: "Cancelar", repTitle: "Tu informe personalizado", repProfile: "Tu perfil",
    scAi: "IA en esta máquina", scCli: "Asistentes CLI", scApps: "Apps de escritorio", scModels: "Modelos LLM", scCloud: "Claves cloud",
    scMcp: "Servidores MCP configurados", scProjects: "Proyectos", scNone: "nada encontrado",
    scPrivacy: "solo lee nombres de carpetas y manifiestos · no se envía nada",
    scGuess: "Parece tu stack — ya marcado abajo, confirma con Enter",
    dsTitle: "Encontrado para tu stack (sin verificar)", dsNone: "nada nuevo", dsHave: "ya configurado",
    dsNote: "estrellas · último commit — no lo verificamos, lee el README antes de instalar", dsSearching: "buscando en GitHub · npm · PyPI…",
    repFound: "Descubierto para tu stack", repUnverified: "sin verificar", repHave: "ya configurado",
    kMobile: "Móvil", kMl: "IA / ML / apps LLM", qStackMob: "¿Stack móvil?", mSwift: "Swift / iOS", mKotlin: "Kotlin / Android", mFlutter: "Flutter", mRn: "React Native",
    qAssist: "¿Qué asistentes de IA usas?", aClaude: "Claude Code (CLI / extensión IDE)", aCursor: "Cursor", aGemini: "Gemini (CLI / Code Assist / Antigravity)", aCodex: "Codex (CLI / extensión IDE)", aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "¿Qué te molesta más?", pContext: "Relee archivos, quema contexto", pStale: "APIs / versiones de librerías obsoletas", pQuality: "Rompe tests, código sucio",
    pSlow: "Lento, mucho ida y vuelta", pProject: "No conoce mi proyecto", pBrowser: "No llega al navegador / BD / servicios",
    qDb: "¿Con qué bases de datos trabajas?", dPg: "PostgreSQL", dMy: "MySQL / MariaDB", dMongo: "MongoDB", dRedis: "Redis", dSupa: "Supabase / Firebase", dSqlite: "SQLite",
    qSvc: "¿Qué servicios conectar?", vGit: "GitHub / GitLab", vFigma: "Figma", vTrack: "Jira / Linear", vDocs: "Notion / Confluence", vChat: "Slack / Discord", vCloud: "AWS / GCP / Azure", vDeploy: "Vercel / Netlify",
    qTeam: "¿Solo o en equipo?", tSolo: "Solo", tTeam: "Equipo — PRs, revisiones",
    rTeam: "equipo → revisión de PR + convenciones de commit mantienen el historial limpio", rMobile: "móvil → LSP preciso para la plataforma, sin herramientas de UI",
    wSoup: "afinar un LLM desde un YAML en la GPU del portátil",
    scCfg: "Configurados (sin CLI)", scFind: "Conclusiones", fNoMcp: "{host}: sin servidores MCP — el plan conectará los necesarios",
    fMcp: "{host}: {n} servidores MCP configurados", fCfgNoCli: "{name}: cuenta/config presente, CLI no instalado",
    fModelsNoRuntime: "modelos en caché HF pero sin runtime para ejecutarlos (Ollama / LM Studio)", fNoRules: "sin instrucciones de IA (CLAUDE.md / AGENTS.md / .cursorrules) en {n} de {m} proyectos",
    scNext: "qué añadir o quitar — lo decide el plan tras la encuesta · coste de contexto — `ai-kit doctor`",
    iTitle: "¿Conectar también lo encontrado? (marca)", iSkip: "— omitir —", iInto: "Conectando en", iDone: "conectado", iExists: "ya estaba", iFail: "falló",
    iNoHost: "no hay asistentes seleccionados en esta máquina — solo comandos:", iBackup: "las copias de los configs quedan junto a cada archivo (*.bak-<hora>)",
    iAutoSkip: "--yes instala solo el conjunto curado; lo encontrado requiere elección explícita",
    iResult: "Herramientas encontradas — resultado",
    support: "Hecho por una sola persona. Si te ahorró una hora, una ★ en github.com/hasabasa/ai-kit es como me entero.",
    repBecause: "elegido por", repFile: "Informe:",
  },
  zh: {
    tagline1: "为你的工作挑选合适的工具", tagline2: "更精准的AI · 更少token · 只装必需",
    hintMulti: "↑↓ 移动 · 空格 — 多选 · 回车 — 下一步 · esc — 返回",
    hintSingle: "↑↓ 移动 · 回车 — 下一步 · esc — 返回",
    own: "自定义", ownPrompt: "自定义: ", enFallback: "",
    qKind: "你做什么？", kFe: "前端 / UI", kBe: "后端 / API", kData: "数据 / 分析", kContent: "内容", kDevops: "DevOps / 服务器",
    qGoal: "主要目标？", gTokens: "节省token", gQuality: "代码质量", gSpeed: "速度",
    qUsage: "你用AI的频率？", uLight: "很少（<1小时/天）", uMed: "1–3小时/天", uHeavy: "3–6小时/天", uAllday: "全天（6小时+）",
    qSkill: "你手写代码的水平？", sPro: "高手（高/中级）", sLearn: "会写但常查资料", sVibe: "主要靠AI写代码", sNew: "初学者",
    recommend: "推荐安装", disable: "禁用 — 占用上下文的冗余插件",
    installQ: "全部安装？ ", installing: "安装中", done: "完成", nochange: "好的，什么都没改。", restart: "重启编辑器/会话",
    wPonytail: "更少代码 → 更少token和修改", wGraphify: "代码图谱替代重复读取文件",
    wContext7: "实时获取最新库文档", wTs: "精确的TS/JS类型跳转",
    wPy: "Python类型分析", wMatt: "工程化：TDD、代码审查、规格", wFrontend: "高质量UI，非模板化",
    dApprox: "粗略估算", dConfigs: "配置文件（所有助手）", dSkillsBox: "用户技能",
    dBallast: "冗余插件（对开发无用，消耗上下文）", dNone: "没有冗余 — 设置干净",
    dTotal: "每次请求的冗余", dTokens: "token", dBig: "太重！建议精简",
    pWhy: "为什么适合你", rHeavy: "每天在AI上花很多时间 → ponytail + graphify大幅节省token",
    rVibe: "AI写代码为主 → TDD/审查 + ponytail保障代码安全",
    rNew: "初学者 → 先做好防护：审查、测试、最少代码",
    rPro: "老手 → 精准工具（LSP），无需额外辅助",
    aFound: "检测到AI助手", aOk: "已支持", aSoon: "适配中",
    qStackFe: "前端技术栈？", qStackBe: "后端技术栈？",
    mHow: "如何安装？", mAuto: "自动 — 我来执行命令", mManual: "手动 — 给我步骤",
    mCancel: "取消", repTitle: "你的个人配置报告", repProfile: "你的档案",
    hintMultiN: "编号，逗号分隔",
    hintSingleN: "编号",
    qLang: "语言 / 技术栈？",
    lOther: "其他",
    needUv: "需要 uv：",
    needClaude: "需要 Claude CLI：",
    disabling: "正在禁用冗余插件",
    previewNote: "预览 · 演示档案",
    previewNext: "真实运行时的下一步",
    dClaudeMd: "CLAUDE.md 文件",
    dFix: "禁用：ai-kit doctor --fix",
    dFixing: "正在禁用冗余插件",
    dSkillsN: "个技能",
    wPr: "PR 审查代理：评论、测试、错误",
    wCommit: "git 工作流：commit/push 命令",
    wPlaywright: "浏览器 e2e 测试",
    wGo: "Go 的类型与跳转",
    wTerraform: "Terraform / IaC 集成",
    wMd: "审计并精简你的 CLAUDE.md",
    wSimplify: "简化代码，提高可读性",
    wFeature: "分阶段的功能开发流程",
    rContent: "内容工作 → 保留营销插件包",
    dDupes: "重复 / 冲突",
    dupSerena: "serena 与 graphify 重复 — 保留一个",
    dCostNote: "请求/天 · 按 Sonnet 输入价格，粗估",
    uNoProfile: "没有保存的档案 — 请先运行 `ai-kit`",
    pSaved: "档案已保存 → `ai-kit update` 可免调查重新规划",
    vTitle: "安装检查",
    vOk: "正常",
    vFail: "缺失",
    pUse: "如何使用",
    useAuto: "相关时自动启用",
    planFile: "方案已保存：",
    manDo: "按顺序执行",
    manVerify: "验证",
    manBallast: "然后禁用冗余插件",
    wLsp: "精确跳转与类型",
    wLaravel: "Laravel 工具包（artisan、模型…）",
    scAi: "本机上的 AI",
    scCli: "CLI 助手",
    scApps: "桌面应用",
    scModels: "LLM 模型",
    scCloud: "云端密钥",
    scMcp: "已配置的 MCP 服务器",
    scProjects: "项目",
    scNone: "未发现",
    scPrivacy: "只读取文件夹名和清单文件 · 不向任何地方发送",
    scGuess: "看起来这是你的技术栈 — 下面已预选，按 Enter 确认即可",
    dsTitle: "为你的技术栈找到（未经验证）",
    dsNone: "没有新发现",
    dsHave: "已配置",
    dsNote: "星标 · 最近提交 — 我们未审核，安装前请阅读 README",
    dsSearching: "正在搜索 GitHub · npm · PyPI…",
    repFound: "为你的技术栈发现",
    repUnverified: "未验证",
    repHave: "已配置",
    kMobile: "移动端",
    kMl: "AI / ML / LLM 应用",
    qStackMob: "移动端技术栈？",
    qAssist: "你在用哪些 AI 助手？",
    aClaude: "Claude Code（CLI / IDE 扩展）",
    aGemini: "Gemini（CLI / Code Assist / Antigravity）",
    aCodex: "Codex（CLI / IDE 扩展）",
    aCopilot: "GitHub Copilot（IDE / CLI）",
    qPain: "最让你烦的是什么？",
    pContext: "反复读文件，烧掉上下文",
    pStale: "过时的 API / 库版本",
    pQuality: "弄坏测试，代码粗糙",
    pSlow: "太慢，来回太多",
    pProject: "不了解我的项目",
    pBrowser: "碰不到浏览器 / 数据库 / 服务",
    qDb: "你使用哪些数据库？",
    qSvc: "要接入哪些服务？",
    qTeam: "单干还是团队？",
    tSolo: "单干",
    tTeam: "团队 — PR、代码审查",
    rTeam: "团队 → PR 审查 + 提交规范让历史保持干净",
    rMobile: "移动端 → 平台专用的精确 LSP，不装 UI 工具",
    wSoup: "用一个 YAML 在笔记本 GPU 上微调 LLM",
    scCfg: "已配置（无 CLI）",
    scFind: "结论",
    fNoMcp: "{host}：没有 MCP 服务器 — 方案会接入你需要的",
    fMcp: "{host}：已配置 {n} 个 MCP 服务器",
    fCfgNoCli: "{name}：有账号/配置，但未安装 CLI",
    fModelsNoRuntime: "HF 缓存里有模型，但没有运行环境（Ollama / LM Studio）",
    fNoRules: "{m} 个项目中有 {n} 个没有 AI 指令文件（CLAUDE.md / AGENTS.md / .cursorrules）",
    scNext: "装什么、去掉什么 — 调查后由方案决定 · 上下文成本 — `ai-kit doctor`",
    iTitle: "也接入找到的工具？（勾选）",
    iSkip: "— 跳过 —",
    iInto: "正在接入",
    iDone: "已接入",
    iExists: "已存在",
    iFail: "失败",
    iNoHost: "本机未找到所选助手 — 仅显示命令：",
    iBackup: "配置备份保存在各文件旁（*.bak-<时间>）",
    iAutoSkip: "--yes 只安装精选集；找到的工具需要明确勾选",
    iResult: "找到的工具 — 结果",
    support: "由一个人制作。如果它帮你省了一小时，github.com/hasabasa/ai-kit 上的一颗 ★ 就是我知道的方式。",
    repBecause: "选择原因", repFile: "报告：",
  },
  hi: {
    tagline1: "अपने काम के लिए सही टूल चुनें", tagline2: "बेहतर AI · कम टोकन · सिर्फ़ ज़रूरी",
    hintMulti: "↑↓ चलें · स्पेस — कई चुनें · एंटर — आगे · esc — पीछे",
    hintSingle: "↑↓ चलें · एंटर — आगे · esc — पीछे",
    own: "अपना विकल्प", ownPrompt: "अपना विकल्प: ", enFallback: "",
    qKind: "आप क्या बनाते हैं?", kFe: "फ़्रंटएंड / UI", kBe: "बैकएंड / API", kData: "डेटा / एनालिटिक्स", kContent: "कंटेंट", kDevops: "DevOps / सर्वर",
    qGoal: "मुख्य लक्ष्य?", gTokens: "टोकन बचाएँ", gQuality: "कोड क्वालिटी", gSpeed: "स्पीड",
    qUsage: "AI कितना इस्तेमाल करते हैं?", uLight: "कम (<1घंटा/दिन)", uMed: "1–3 घंटे/दिन", uHeavy: "3–6 घंटे/दिन", uAllday: "पूरा दिन (6+)",
    qSkill: "हाथ से कोड कितना अच्छा लिखते हैं?", sPro: "भरोसेमंद (सीनियर/मिड)", sLearn: "लिखता हूँ पर देखता भी हूँ", sVibe: "ज़्यादातर AI लिखता है", sNew: "नया हूँ",
    recommend: "इंस्टॉल की सिफ़ारिश", disable: "बंद करें — बेकार, कॉन्टेक्स्ट खाता है",
    installQ: "सब इंस्टॉल करें? ", installing: "इंस्टॉल हो रहा है", done: "हो गया", nochange: "ठीक है, कुछ नहीं बदला।", restart: "एडिटर/सेशन रीस्टार्ट करें",
    dApprox: "अनुमानित", dConfigs: "कॉन्फ़िग फ़ाइलें (सभी असिस्टेंट)", dSkillsBox: "यूज़र स्किल्स",
    pWhy: "आपके लिए क्यों", aFound: "AI असिस्टेंट मिले", aOk: "सपोर्टेड", aSoon: "जल्द आ रहा",
    mHow: "कैसे इंस्टॉल करें?", mAuto: "ऑटो — मैं कमांड चलाऊँगा", mManual: "मैन्युअल — स्टेप्स दो",
    mCancel: "रद्द करें", repTitle: "आपकी निजी सेटअप रिपोर्ट", repProfile: "आपकी प्रोफ़ाइल",
    hintMultiN: "नंबर, कॉमा से अलग",
    hintSingleN: "नंबर",
    qLang: "भाषाएँ / स्टैक?",
    lOther: "अन्य",
    needUv: "uv चाहिए: ",
    needClaude: "Claude CLI चाहिए: ",
    disabling: "फ़ालतू प्लगइन बंद कर रहा हूँ",
    previewNote: "पूर्वावलोकन · डेमो प्रोफ़ाइल",
    previewNext: "असली रन में अगला कदम",
    dClaudeMd: "CLAUDE.md फ़ाइलें",
    dFix: "बंद करें: ai-kit doctor --fix",
    dFixing: "फ़ालतू प्लगइन बंद कर रहा हूँ",
    dSkillsN: "स्किल",
    wPr: "PR रिव्यू एजेंट: टिप्पणियाँ, टेस्ट, एरर",
    wCommit: "git वर्कफ़्लो: commit/push कमांड",
    wPlaywright: "ब्राउज़र e2e टेस्ट",
    wGo: "Go के लिए टाइप और नेविगेशन",
    wTerraform: "Terraform / IaC इंटीग्रेशन",
    wMd: "CLAUDE.md की जाँच और छँटाई",
    wSimplify: "कोड को स्पष्ट बनाने के लिए सरल करता है",
    wFeature: "चरणबद्ध फ़ीचर डेवलपमेंट",
    rContent: "कंटेंट का काम → मार्केटिंग पैक चालू रहेगा",
    dDupes: "डुप्लिकेट / टकराव",
    dupSerena: "serena graphify की नकल है — एक रखें",
    dCostNote: "अनुरोध/दिन · Sonnet इनपुट कीमत, अनुमानित",
    uNoProfile: "कोई सहेजी प्रोफ़ाइल नहीं — पहले `ai-kit` चलाएँ",
    pSaved: "प्रोफ़ाइल सहेजी → `ai-kit update` बिना सर्वे दोबारा योजना बनाएगा",
    vTitle: "इंस्टॉल जाँच",
    vOk: "ठीक",
    vFail: "गायब",
    pUse: "कैसे इस्तेमाल करें",
    useAuto: "ज़रूरत पर खुद चालू होता है",
    planFile: "योजना सहेजी:",
    manDo: "क्रम से चलाएँ",
    manVerify: "जाँचें",
    manBallast: "फिर फ़ालतू प्लगइन बंद करें",
    wLsp: "सटीक नेविगेशन और टाइप",
    wLaravel: "Laravel टूलकिट (artisan, मॉडल…)",
    scAi: "इस मशीन पर AI",
    scCli: "CLI असिस्टेंट",
    scApps: "डेस्कटॉप ऐप",
    scModels: "LLM मॉडल",
    scCloud: "क्लाउड कुंजियाँ",
    scMcp: "कॉन्फ़िगर किए MCP सर्वर",
    scProjects: "प्रोजेक्ट",
    scNone: "कुछ नहीं मिला",
    scPrivacy: "सिर्फ़ फ़ोल्डर नाम और मैनिफ़ेस्ट पढ़ता है · कहीं कुछ नहीं भेजा जाता",
    scGuess: "लगता है यही आपका स्टैक है — नीचे पहले से चुना है, Enter से पुष्टि करें",
    dsTitle: "आपके स्टैक के लिए मिला (असत्यापित)",
    dsNone: "कुछ नया नहीं",
    dsHave: "पहले से कॉन्फ़िगर",
    dsNote: "स्टार · आख़िरी कमिट — हमने जाँचा नहीं, इंस्टॉल से पहले README पढ़ें",
    dsSearching: "GitHub · npm · PyPI में खोज रहा हूँ…",
    repFound: "आपके स्टैक के लिए खोजा गया",
    repUnverified: "असत्यापित",
    repHave: "पहले से कॉन्फ़िगर",
    kMobile: "मोबाइल",
    kMl: "AI / ML / LLM ऐप",
    qStackMob: "मोबाइल स्टैक?",
    qAssist: "कौन से AI असिस्टेंट इस्तेमाल करते हैं?",
    aClaude: "Claude Code (CLI / IDE एक्सटेंशन)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / IDE एक्सटेंशन)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "सबसे ज़्यादा क्या खलता है?",
    pContext: "फ़ाइलें दोबारा पढ़ता है, कॉन्टेक्स्ट खाता है",
    pStale: "पुराने API / लाइब्रेरी वर्ज़न",
    pQuality: "टेस्ट तोड़ता है, लापरवाह कोड",
    pSlow: "बहुत धीमा, बहुत आगे-पीछे",
    pProject: "मेरा प्रोजेक्ट नहीं जानता",
    pBrowser: "ब्राउज़र / DB / सेवाओं तक नहीं पहुँचता",
    qDb: "किन डेटाबेस के साथ काम करते हैं?",
    qSvc: "कौन सी सेवाएँ जोड़ें?",
    qTeam: "अकेले या टीम में?",
    tSolo: "अकेले",
    tTeam: "टीम — PR, रिव्यू",
    rTeam: "टीम → PR रिव्यू + कमिट नियम इतिहास साफ़ रखते हैं",
    rMobile: "मोबाइल → प्लेटफ़ॉर्म के लिए सटीक LSP, UI टूल नहीं",
    wSoup: "एक YAML से लैपटॉप GPU पर LLM फ़ाइन-ट्यून करें",
    scCfg: "कॉन्फ़िगर (CLI नहीं)",
    scFind: "निष्कर्ष",
    fNoMcp: "{host}: कोई MCP सर्वर नहीं — योजना ज़रूरी वाले जोड़ेगी",
    fMcp: "{host}: {n} MCP सर्वर कॉन्फ़िगर",
    fCfgNoCli: "{name}: खाता/कॉन्फ़िग है, CLI इंस्टॉल नहीं",
    fModelsNoRuntime: "HF कैश में मॉडल हैं पर चलाने का रनटाइम नहीं (Ollama / LM Studio)",
    fNoRules: "{m} में से {n} प्रोजेक्ट में AI निर्देश (CLAUDE.md / AGENTS.md / .cursorrules) नहीं",
    scNext: "क्या जोड़ना-हटाना है — सर्वे के बाद योजना तय करेगी · कॉन्टेक्स्ट लागत — `ai-kit doctor`",
    iTitle: "मिले टूल भी जोड़ें? (चुनें)",
    iSkip: "— छोड़ें —",
    iInto: "इनमें जोड़ रहा हूँ",
    iDone: "जुड़ गया",
    iExists: "पहले से था",
    iFail: "विफल",
    iNoHost: "चुना असिस्टेंट इस मशीन पर नहीं मिला — सिर्फ़ कमांड:",
    iBackup: "कॉन्फ़िग बैकअप हर फ़ाइल के पास हैं (*.bak-<समय>)",
    iAutoSkip: "--yes सिर्फ़ चुनिंदा सेट इंस्टॉल करता है; मिले टूल के लिए स्पष्ट चयन चाहिए",
    iResult: "मिले टूल — नतीजा",
    wPonytail: "कम कोड → कम टोकन और बदलाव",
    wGraphify: "फ़ाइलें दोबारा पढ़ने की जगह कोड ग्राफ़",
    wContext7: "ताज़ा लाइब्रेरी डॉक्स तुरंत",
    wTs: "TS/JS के लिए सटीक नेविगेशन और टाइप",
    wPy: "Python के लिए टाइप और विश्लेषण",
    wMatt: "इंजीनियरिंग: TDD, रिव्यू, स्पेक",
    wFrontend: "बढ़िया UI, टेम्पलेट नहीं",
    dBallast: "फ़ालतू प्लगइन (डेव के लिए बेकार, कॉन्टेक्स्ट खाते हैं)",
    dNone: "कोई फ़ालतू नहीं — सेटअप साफ़ है",
    dTotal: "हर अनुरोध पर फ़ालतू बोझ",
    dTokens: "टोकन",
    dBig: "भारी! छाँटने लायक",
    rHeavy: "रोज़ घंटों AI में → ponytail + graphify टोकन बहुत बचाते हैं",
    rVibe: "वाइब-कोडिंग → TDD/रिव्यू + ponytail कोड सुरक्षित रखते हैं",
    rNew: "शुरुआती → पहले सुरक्षा: रिव्यू, टेस्ट, न्यूनतम कोड",
    rPro: "अनुभवी → सटीक टूल (LSP), बिना हाथ पकड़े",
    qStackFe: "फ़्रंटएंड स्टैक?",
    qStackBe: "बैकएंड स्टैक?",
    support: "एक इंसान ने बनाया। अगर इसने आपका एक घंटा बचाया, तो github.com/hasabasa/ai-kit पर एक ★ ही मुझे बताएगा।",
    repBecause: "चुनने की वजह", repFile: "रिपोर्ट:",
  },
  pt: {
    tagline1: "Escolha as ferramentas certas para o seu trabalho", tagline2: "IA mais precisa · menos tokens · só o necessário",
    hintMulti: "↑↓ mover · espaço — marcar vários · enter — seguir · esc — voltar",
    hintSingle: "↑↓ mover · enter — seguir · esc — voltar",
    own: "sua opção", ownPrompt: "sua opção: ", enFallback: "",
    qKind: "O que você desenvolve?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Dados / análise", kContent: "Conteúdo", kDevops: "DevOps / servidor",
    qGoal: "Objetivo principal?", gTokens: "Economizar tokens", gQuality: "Qualidade do código", gSpeed: "Velocidade",
    qUsage: "Quanto usa IA?", uLight: "Pouco (<1h/dia)", uMed: "1–3h/dia", uHeavy: "3–6h/dia", uAllday: "O dia todo (6h+)",
    qSkill: "Sabe programar na mão?", sPro: "Seguro (sênior/pleno)", sLearn: "Programo mas consulto", sVibe: "Mais vibe-coding (IA escreve)", sNew: "Iniciante",
    recommend: "Recomendo instalar", disable: "Desativar — lastro, consome contexto",
    installQ: "Instalar tudo? ", installing: "Instalando", done: "Pronto", nochange: "Ok, nada mudou.", restart: "reinicie o editor/sessão",
    dApprox: "estimativa", dConfigs: "Arquivos de config (todos)", dSkillsBox: "Skills",
    pWhy: "Por que combina com você", aFound: "Assistentes detectados", aOk: "suportado", aSoon: "em breve",
    mHow: "Como instalar?", mAuto: "Automático — eu rodo os comandos", mManual: "Manual — me dê os passos",
    mCancel: "Cancelar", repTitle: "Seu relatório personalizado", repProfile: "Seu perfil",
    hintMultiN: "números separados por vírgula",
    hintSingleN: "número",
    qLang: "Linguagens / stack?",
    lOther: "Outro",
    needUv: "precisa de uv: ",
    needClaude: "precisa do Claude CLI: ",
    disabling: "Desativando lastro",
    previewNote: "prévia · perfil demo",
    previewNext: "próximo passo numa execução real",
    dClaudeMd: "Arquivos CLAUDE.md",
    dFix: "Desativar: ai-kit doctor --fix",
    dFixing: "Desativando lastro",
    dSkillsN: "skills",
    wPr: "agentes de revisão de PR: comentários, testes, erros",
    wCommit: "fluxo git: comandos de commit/push",
    wPlaywright: "testes e2e no navegador",
    wGo: "tipos e navegação para Go",
    wTerraform: "integração Terraform / IaC",
    wMd: "audita e enxuga seu CLAUDE.md",
    wSimplify: "simplifica o código para clareza",
    wFeature: "desenvolvimento de features guiado por etapas",
    rContent: "trabalho com conteúdo → mantendo o pacote de marketing ativo",
    dDupes: "Duplicatas / conflitos",
    dupSerena: "serena duplica o graphify — mantenha um",
    dCostNote: "req/dia · preço de entrada do Sonnet, aproximado",
    uNoProfile: "Sem perfil salvo — rode `ai-kit` primeiro",
    pSaved: "perfil salvo → `ai-kit update` replaneja sem a pesquisa",
    vTitle: "Verificação da instalação",
    vOk: "ok",
    vFail: "faltando",
    pUse: "Como usar",
    useAuto: "ativa-se sozinho quando relevante",
    planFile: "Plano salvo:",
    manDo: "Execute nesta ordem",
    manVerify: "Verificar",
    manBallast: "Depois desative o lastro",
    wLsp: "navegação e tipos precisos",
    wLaravel: "kit Laravel (artisan, models…)",
    scAi: "IA nesta máquina",
    scCli: "Assistentes CLI",
    scApps: "Apps de desktop",
    scModels: "Modelos LLM",
    scCloud: "Chaves de nuvem",
    scMcp: "Servidores MCP configurados",
    scProjects: "Projetos",
    scNone: "nada encontrado",
    scPrivacy: "lê apenas nomes de pastas e manifestos · nada é enviado",
    scGuess: "Parece seu stack — já marcado abaixo, confirme com Enter",
    dsTitle: "Encontrado para seu stack (não verificado)",
    dsNone: "nada novo",
    dsHave: "já configurado",
    dsNote: "estrelas · último commit — não verificamos, leia o README antes de instalar",
    dsSearching: "buscando em GitHub · npm · PyPI…",
    repFound: "Descoberto para seu stack",
    repUnverified: "não verificado",
    repHave: "já configurado",
    kMobile: "Mobile",
    kMl: "Apps de IA / ML / LLM",
    qStackMob: "Stack mobile?",
    qAssist: "Quais assistentes de IA você usa?",
    aClaude: "Claude Code (CLI / extensão IDE)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / extensão IDE)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "O que mais te irrita?",
    pContext: "Relê arquivos, queima contexto",
    pStale: "APIs / versões de bibliotecas desatualizadas",
    pQuality: "Quebra testes, código desleixado",
    pSlow: "Lento demais, muito vai-e-vem",
    pProject: "Não conhece meu projeto",
    pBrowser: "Não alcança navegador / BD / serviços",
    qDb: "Com quais bancos você trabalha?",
    qSvc: "Quais serviços conectar?",
    qTeam: "Sozinho ou em equipe?",
    tSolo: "Sozinho",
    tTeam: "Equipe — PRs, revisões",
    rTeam: "equipe → revisão de PR + convenções de commit mantêm o histórico limpo",
    rMobile: "mobile → LSP preciso para a plataforma, sem ferramentas de UI",
    wSoup: "ajuste fino de um LLM com um YAML na GPU do notebook",
    scCfg: "Configurados (sem CLI)",
    scFind: "Conclusões",
    fNoMcp: "{host}: sem servidores MCP — o plano conectará os necessários",
    fMcp: "{host}: {n} servidores MCP configurados",
    fCfgNoCli: "{name}: conta/config presente, CLI não instalado",
    fModelsNoRuntime: "modelos no cache do HF, mas sem runtime para rodá-los (Ollama / LM Studio)",
    fNoRules: "sem instruções de IA (CLAUDE.md / AGENTS.md / .cursorrules) em {n} de {m} projetos",
    scNext: "o que adicionar ou remover — o plano decide após a pesquisa · custo de contexto — `ai-kit doctor`",
    iTitle: "Conectar também o que foi encontrado? (marque)",
    iSkip: "— pular —",
    iInto: "Conectando em",
    iDone: "conectado",
    iExists: "já existia",
    iFail: "falhou",
    iNoHost: "nenhum assistente selecionado nesta máquina — só comandos:",
    iBackup: "backups dos configs ficam ao lado de cada arquivo (*.bak-<hora>)",
    iAutoSkip: "--yes instala só o conjunto curado; o encontrado exige escolha explícita",
    iResult: "Ferramentas encontradas — resultado",
    wPonytail: "menos código → menos tokens e edições",
    wGraphify: "grafo de código em vez de reler arquivos",
    wContext7: "docs de bibliotecas atualizados na hora",
    wTs: "navegação e tipos precisos para TS/JS",
    wPy: "tipos e análise para Python",
    wMatt: "engenharia: TDD, revisão, specs",
    wFrontend: "UI de qualidade, não genérica",
    dBallast: "Plugins lastro (inúteis para dev, consomem contexto)",
    dNone: "Sem lastro — instalação limpa",
    dTotal: "Lastro em CADA requisição",
    dTokens: "tokens",
    dBig: "pesado! vale enxugar",
    rHeavy: "horas de IA por dia → ponytail + graphify cortam muito os tokens",
    rVibe: "vibe-coding → TDD/revisão + ponytail protegem o código",
    rNew: "iniciante → primeiro as grades: revisão, testes, código mínimo",
    rPro: "experiente → ferramentas precisas (LSP), sem babá",
    qStackFe: "Stack de frontend?",
    qStackBe: "Stack de backend?",
    support: "Feito por uma pessoa. Se te poupou uma hora, uma ★ em github.com/hasabasa/ai-kit é como eu descubro.",
    repBecause: "escolhido por", repFile: "Relatório:",
  },
  fr: {
    tagline1: "Choisissez les bons outils pour votre travail", tagline2: "IA plus précise · moins de tokens · uniquement le nécessaire",
    hintMulti: "↑↓ déplacer · espace — sélectionner · entrée — suivant · esc — retour",
    hintSingle: "↑↓ déplacer · entrée — suivant · esc — retour",
    own: "votre choix", ownPrompt: "votre choix : ", enFallback: "",
    qKind: "Que développez-vous ?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Données / analyse", kContent: "Contenu", kDevops: "DevOps / serveur",
    qGoal: "Objectif principal ?", gTokens: "Économiser les tokens", gQuality: "Qualité du code", gSpeed: "Vitesse",
    qUsage: "Utilisation de l'IA ?", uLight: "Peu (<1h/jour)", uMed: "1–3h/jour", uHeavy: "3–6h/jour", uAllday: "Toute la journée (6h+)",
    qSkill: "Codez-vous à la main ?", sPro: "Confiant (senior/mid)", sLearn: "Je code mais je consulte", sVibe: "Surtout vibe-coding", sNew: "Débutant",
    recommend: "Recommandé", disable: "Désactiver — lest, consomme du contexte",
    installQ: "Tout installer ? ", installing: "Installation", done: "Terminé", nochange: "Ok, rien changé.", restart: "redémarrez l'éditeur/session",
    dApprox: "estimation", dConfigs: "Fichiers de config (tous)", dSkillsBox: "Skills",
    pWhy: "Pourquoi pour vous", aFound: "Assistants détectés", aOk: "compatible", aSoon: "bientôt",
    mHow: "Comment installer ?", mAuto: "Automatique — j'exécute", mManual: "Manuel — donnez-moi les étapes",
    mCancel: "Annuler", repTitle: "Votre rapport personnalisé", repProfile: "Votre profil",
    hintMultiN: "numéros séparés par des virgules",
    hintSingleN: "numéro",
    qLang: "Langages / stack ?",
    lOther: "Autre",
    needUv: "nécessite uv : ",
    needClaude: "nécessite Claude CLI : ",
    disabling: "Désactivation du lest",
    previewNote: "aperçu · profil démo",
    previewNext: "étape suivante en exécution réelle",
    dClaudeMd: "Fichiers CLAUDE.md",
    dFix: "Désactiver : ai-kit doctor --fix",
    dFixing: "Désactivation du lest",
    dSkillsN: "skills",
    wPr: "agents de revue de PR : commentaires, tests, erreurs",
    wCommit: "flux git : commandes commit/push",
    wPlaywright: "tests e2e navigateur",
    wGo: "types et navigation pour Go",
    wTerraform: "intégration Terraform / IaC",
    wMd: "audite et allège votre CLAUDE.md",
    wSimplify: "simplifie le code pour plus de clarté",
    wFeature: "développement de fonctionnalités guidé par étapes",
    rContent: "travail de contenu → le pack marketing reste activé",
    dDupes: "Doublons / conflits",
    dupSerena: "serena fait doublon avec graphify — gardez-en un",
    dCostNote: "req/jour · tarif d'entrée Sonnet, approximatif",
    uNoProfile: "Aucun profil enregistré — lancez d'abord `ai-kit`",
    pSaved: "profil enregistré → `ai-kit update` replanifie sans questionnaire",
    vTitle: "Vérification de l'installation",
    vOk: "ok",
    vFail: "manquant",
    pUse: "Utilisation",
    useAuto: "s'active seul quand c'est pertinent",
    planFile: "Plan enregistré :",
    manDo: "Exécutez dans l'ordre",
    manVerify: "Vérifier",
    manBallast: "Puis désactivez le lest",
    wLsp: "navigation et types précis",
    wLaravel: "kit Laravel (artisan, modèles…)",
    scAi: "IA sur cette machine",
    scCli: "Assistants CLI",
    scApps: "Apps de bureau",
    scModels: "Modèles LLM",
    scCloud: "Clés cloud",
    scMcp: "Serveurs MCP configurés",
    scProjects: "Projets",
    scNone: "rien trouvé",
    scPrivacy: "lit seulement les noms de dossiers et les manifestes · rien n'est envoyé",
    scGuess: "On dirait votre stack — déjà coché ci-dessous, confirmez avec Entrée",
    dsTitle: "Trouvé pour votre stack (non vérifié)",
    dsNone: "rien de nouveau",
    dsHave: "déjà configuré",
    dsNote: "étoiles · dernier commit — non vérifié par nous, lisez le README avant d'installer",
    dsSearching: "recherche sur GitHub · npm · PyPI…",
    repFound: "Découvert pour votre stack",
    repUnverified: "non vérifié",
    repHave: "déjà configuré",
    kMobile: "Mobile",
    kMl: "Apps IA / ML / LLM",
    qStackMob: "Stack mobile ?",
    qAssist: "Quels assistants IA utilisez-vous ?",
    aClaude: "Claude Code (CLI / extension IDE)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / extension IDE)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Qu'est-ce qui vous agace le plus ?",
    pContext: "Relit les fichiers, brûle le contexte",
    pStale: "APIs / versions de bibliothèques obsolètes",
    pQuality: "Casse les tests, code bâclé",
    pSlow: "Trop lent, trop d'allers-retours",
    pProject: "Ne connaît pas mon projet",
    pBrowser: "N'atteint pas navigateur / BD / services",
    qDb: "Quelles bases de données utilisez-vous ?",
    qSvc: "Quels services connecter ?",
    qTeam: "Seul ou en équipe ?",
    tSolo: "Seul",
    tTeam: "Équipe — PR, revues",
    rTeam: "équipe → revue de PR + conventions de commit gardent l'historique propre",
    rMobile: "mobile → LSP précis pour la plateforme, pas d'outils UI",
    wSoup: "affiner un LLM depuis un YAML sur le GPU d'un portable",
    scCfg: "Configurés (sans CLI)",
    scFind: "Constats",
    fNoMcp: "{host} : aucun serveur MCP — le plan connectera ceux qu'il vous faut",
    fMcp: "{host} : {n} serveurs MCP configurés",
    fCfgNoCli: "{name} : compte/config présent, CLI non installé",
    fModelsNoRuntime: "modèles dans le cache HF mais aucun runtime pour les lancer (Ollama / LM Studio)",
    fNoRules: "aucune instruction IA (CLAUDE.md / AGENTS.md / .cursorrules) dans {n} projets sur {m}",
    scNext: "quoi ajouter ou retirer — le plan décide après le questionnaire · coût du contexte — `ai-kit doctor`",
    iTitle: "Connecter aussi ce qui a été trouvé ? (cochez)",
    iSkip: "— passer —",
    iInto: "Connexion dans",
    iDone: "connecté",
    iExists: "déjà présent",
    iFail: "échec",
    iNoHost: "aucun assistant sélectionné sur cette machine — commandes seulement :",
    iBackup: "les sauvegardes des configs sont à côté de chaque fichier (*.bak-<heure>)",
    iAutoSkip: "--yes n'installe que la sélection vérifiée ; le reste demande un choix explicite",
    iResult: "Outils trouvés — résultat",
    wPonytail: "moins de code → moins de tokens et de corrections",
    wGraphify: "graphe de code au lieu de relire les fichiers",
    wContext7: "docs de bibliothèques à jour à la volée",
    wTs: "navigation et types précis pour TS/JS",
    wPy: "types et analyse pour Python",
    wMatt: "ingénierie : TDD, revue, specs",
    wFrontend: "UI de qualité, pas générique",
    dBallast: "Plugins lest (inutiles pour le dev, consomment du contexte)",
    dNone: "Pas de lest — installation propre",
    dTotal: "Lest à CHAQUE requête",
    dTokens: "tokens",
    dBig: "lourd ! à alléger",
    rHeavy: "des heures d'IA par jour → ponytail + graphify réduisent fortement les tokens",
    rVibe: "vibe-coding → TDD/revue + ponytail protègent le code",
    rNew: "débutant → d'abord des garde-fous : revue, tests, code minimal",
    rPro: "expérimenté → outils précis (LSP), sans assistanat",
    qStackFe: "Stack frontend ?",
    qStackBe: "Stack backend ?",
    support: "Fait par une seule personne. Si ça vous a fait gagner une heure, une ★ sur github.com/hasabasa/ai-kit me le dira.",
    repBecause: "choisi pour", repFile: "Rapport :",
  },
  de: {
    tagline1: "Die richtigen Tools für deine Arbeit", tagline2: "Präzisere KI · weniger Tokens · nur das Nötige",
    hintMulti: "↑↓ bewegen · Leertaste — mehrere · Enter — weiter · Esc — zurück",
    hintSingle: "↑↓ bewegen · Enter — weiter · Esc — zurück",
    own: "eigene Eingabe", ownPrompt: "eigene Eingabe: ", enFallback: "",
    qKind: "Was entwickelst du?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Daten / Analyse", kContent: "Inhalte", kDevops: "DevOps / Server",
    qGoal: "Hauptziel?", gTokens: "Tokens sparen", gQuality: "Code-Qualität", gSpeed: "Geschwindigkeit",
    qUsage: "Wie intensiv nutzt du KI?", uLight: "Selten (<1h/Tag)", uMed: "1–3h/Tag", uHeavy: "3–6h/Tag", uAllday: "Ganztags (6h+)",
    qSkill: "Wie gut codest du von Hand?", sPro: "Sicher (Senior/Mid)", sLearn: "Ich code, schaue aber nach", sVibe: "Hauptsächlich Vibe-Coding", sNew: "Anfänger",
    recommend: "Empfohlen", disable: "Deaktivieren — Ballast, frisst Kontext",
    installQ: "Alles installieren? ", installing: "Installiere", done: "Fertig", nochange: "Ok, nichts geändert.", restart: "Editor/Session neustarten",
    dApprox: "Schätzung", dConfigs: "Config-Dateien (alle)", dSkillsBox: "Skills",
    pWhy: "Warum für dich", aFound: "KI-Assistenten gefunden", aOk: "unterstützt", aSoon: "kommt bald",
    mHow: "Wie installieren?", mAuto: "Automatisch — ich führe aus", mManual: "Manuell — gib mir die Schritte",
    mCancel: "Abbrechen", repTitle: "Dein persönlicher Bericht", repProfile: "Dein Profil",
    hintMultiN: "Nummern, durch Komma getrennt",
    hintSingleN: "Nummer",
    qLang: "Sprachen / Stack?",
    lOther: "Andere",
    needUv: "braucht uv: ",
    needClaude: "braucht Claude CLI: ",
    disabling: "Ballast wird deaktiviert",
    previewNote: "Vorschau · Demo-Profil",
    previewNext: "nächster Schritt im echten Lauf",
    dClaudeMd: "CLAUDE.md-Dateien",
    dFix: "Deaktivieren: ai-kit doctor --fix",
    dFixing: "Ballast wird deaktiviert",
    dSkillsN: "Skills",
    wPr: "PR-Review-Agenten: Kommentare, Tests, Fehler",
    wCommit: "Git-Workflow: Commit-/Push-Befehle",
    wPlaywright: "Browser-E2E-Tests",
    wGo: "Typen & Navigation für Go",
    wTerraform: "Terraform-/IaC-Integration",
    wMd: "prüft und verschlankt deine CLAUDE.md",
    wSimplify: "vereinfacht Code für mehr Klarheit",
    wFeature: "geführte Feature-Entwicklung in Phasen",
    rContent: "Content-Arbeit → Marketing-Paket bleibt aktiv",
    dDupes: "Duplikate / Konflikte",
    dupSerena: "serena dupliziert graphify — behalte eins",
    dCostNote: "Anfragen/Tag · Sonnet-Eingabepreis, grob",
    uNoProfile: "Kein gespeichertes Profil — erst `ai-kit` ausführen",
    pSaved: "Profil gespeichert → `ai-kit update` plant ohne Umfrage neu",
    vTitle: "Installationsprüfung",
    vOk: "ok",
    vFail: "fehlt",
    pUse: "Verwendung",
    useAuto: "schaltet sich bei Bedarf selbst ein",
    planFile: "Plan gespeichert:",
    manDo: "In dieser Reihenfolge ausführen",
    manVerify: "Prüfen",
    manBallast: "Danach den Ballast deaktivieren",
    wLsp: "präzise Navigation & Typen",
    wLaravel: "Laravel-Toolkit (artisan, Models…)",
    scAi: "KI auf dieser Maschine",
    scCli: "CLI-Assistenten",
    scApps: "Desktop-Apps",
    scModels: "LLM-Modelle",
    scCloud: "Cloud-Schlüssel",
    scMcp: "Konfigurierte MCP-Server",
    scProjects: "Projekte",
    scNone: "nichts gefunden",
    scPrivacy: "liest nur Ordnernamen und Manifeste · nichts wird gesendet",
    scGuess: "Sieht nach deinem Stack aus — unten vorausgewählt, mit Enter bestätigen",
    dsTitle: "Für deinen Stack gefunden (ungeprüft)",
    dsNone: "nichts Neues",
    dsHave: "bereits konfiguriert",
    dsNote: "Sterne · letzter Commit — von uns ungeprüft, vor der Installation README lesen",
    dsSearching: "suche auf GitHub · npm · PyPI…",
    repFound: "Für deinen Stack entdeckt",
    repUnverified: "ungeprüft",
    repHave: "bereits konfiguriert",
    kMobile: "Mobile",
    kMl: "KI- / ML- / LLM-Apps",
    qStackMob: "Mobile-Stack?",
    qAssist: "Welche KI-Assistenten nutzt du?",
    aClaude: "Claude Code (CLI / IDE-Erweiterung)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / IDE-Erweiterung)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Was nervt dich am meisten?",
    pContext: "Liest Dateien erneut, verbrennt Kontext",
    pStale: "Veraltete APIs / Bibliotheksversionen",
    pQuality: "Macht Tests kaputt, schlampiger Code",
    pSlow: "Zu langsam, zu viel Hin und Her",
    pProject: "Kennt mein Projekt nicht",
    pBrowser: "Kommt nicht an Browser / DB / Dienste",
    qDb: "Mit welchen Datenbanken arbeitest du?",
    qSvc: "Welche Dienste anbinden?",
    qTeam: "Allein oder im Team?",
    tSolo: "Allein",
    tTeam: "Team — PRs, Reviews",
    rTeam: "Team → PR-Review + Commit-Konventionen halten die Historie sauber",
    rMobile: "Mobile → präzises LSP für die Plattform, keine UI-Tools",
    wSoup: "ein LLM mit einer YAML auf der Laptop-GPU feinabstimmen",
    scCfg: "Konfiguriert (ohne CLI)",
    scFind: "Befunde",
    fNoMcp: "{host}: keine MCP-Server — der Plan bindet die nötigen an",
    fMcp: "{host}: {n} MCP-Server konfiguriert",
    fCfgNoCli: "{name}: Konto/Konfig vorhanden, CLI nicht installiert",
    fModelsNoRuntime: "Modelle im HF-Cache, aber keine Laufzeit dafür (Ollama / LM Studio)",
    fNoRules: "keine KI-Anweisungen (CLAUDE.md / AGENTS.md / .cursorrules) in {n} von {m} Projekten",
    scNext: "was hinzu- oder wegkommt — entscheidet der Plan nach der Umfrage · Kontextkosten — `ai-kit doctor`",
    iTitle: "Gefundene Tools auch anbinden? (auswählen)",
    iSkip: "— überspringen —",
    iInto: "Verbinde mit",
    iDone: "verbunden",
    iExists: "schon da",
    iFail: "fehlgeschlagen",
    iNoHost: "kein ausgewählter Assistent auf dieser Maschine — nur Befehle:",
    iBackup: "Konfig-Backups liegen neben jeder Datei (*.bak-<Zeit>)",
    iAutoSkip: "--yes installiert nur das kuratierte Set; Gefundenes braucht eine explizite Auswahl",
    iResult: "Gefundene Tools — Ergebnis",
    wPonytail: "weniger Code → weniger Tokens und Änderungen",
    wGraphify: "Code-Graph statt Dateien neu zu lesen",
    wContext7: "aktuelle Bibliotheksdokumentation on the fly",
    wTs: "präzise Navigation & Typen für TS/JS",
    wPy: "Typen & Analyse für Python",
    wMatt: "Engineering: TDD, Review, Specs",
    wFrontend: "hochwertige UI, nicht von der Stange",
    dBallast: "Ballast-Plugins (nutzlos für Dev, fressen Kontext)",
    dNone: "Kein Ballast — saubere Installation",
    dTotal: "Ballast bei JEDER Anfrage",
    dTokens: "Tokens",
    dBig: "schwer! lohnt sich zu kürzen",
    rHeavy: "täglich Stunden in KI → ponytail + graphify sparen massiv Tokens",
    rVibe: "Vibe-Coding → TDD/Review + ponytail halten den Code sicher",
    rNew: "Anfänger → erst Leitplanken: Review, Tests, minimaler Code",
    rPro: "erfahren → präzise Werkzeuge (LSP), ohne Händchenhalten",
    qStackFe: "Frontend-Stack?",
    qStackBe: "Backend-Stack?",
    support: "Von einem Menschen gemacht. Hat es dir eine Stunde gespart, erfahre ich es durch einen ★ auf github.com/hasabasa/ai-kit.",
    repBecause: "gewählt wegen", repFile: "Bericht:",
  },
  ar: {
    tagline1: "اختر الأدوات المناسبة لعملك", tagline2: "ذكاء اصطناعي أدق · توكنات أقل · فقط ما تحتاجه",
    hintMulti: "↑↓ تنقل · مسافة — اختيار متعدد · إدخال — التالي · esc — رجوع",
    hintSingle: "↑↓ تنقل · إدخال — التالي · esc — رجوع",
    own: "خيارك", ownPrompt: "خيارك: ", enFallback: "",
    qKind: "ماذا تطوّر؟", kFe: "فرونت إند / UI", kBe: "باك إند / API", kData: "بيانات / تحليل", kContent: "محتوى", kDevops: "DevOps / سيرفر",
    qGoal: "الهدف الرئيسي؟", gTokens: "توفير التوكنات", gQuality: "جودة الكود", gSpeed: "السرعة",
    qUsage: "كم تستخدم الذكاء الاصطناعي؟", uLight: "نادراً (<1س/يوم)", uMed: "1–3 س/يوم", uHeavy: "3–6 س/يوم", uAllday: "طوال اليوم (6+)",
    qSkill: "مستوى البرمجة اليدوية؟", sPro: "واثق (سينيور/ميد)", sLearn: "أبرمج لكن أراجع", sVibe: "غالباً AI يكتب", sNew: "مبتدئ",
    recommend: "مُوصى بالتثبيت", disable: "تعطيل — ثقل يستهلك السياق",
    installQ: "تثبيت الكل؟ ", installing: "جارٍ التثبيت", done: "تم", nochange: "حسناً، لم يتغير شيء.", restart: "أعد تشغيل المحرر/الجلسة",
    dApprox: "تقدير تقريبي", dConfigs: "ملفات الإعداد (جميع المساعدين)", dSkillsBox: "المهارات",
    pWhy: "لماذا يناسبك", aFound: "تم اكتشاف مساعدين", aOk: "مدعوم", aSoon: "قريباً",
    mHow: "كيف نثبّت؟", mAuto: "تلقائياً", mManual: "يدوياً — أعطني الخطوات",
    mCancel: "إلغاء", repTitle: "تقريرك الشخصي", repProfile: "ملفك",
    hintMultiN: "أرقام مفصولة بفواصل",
    hintSingleN: "رقم",
    qLang: "اللغات / التقنيات؟",
    lOther: "أخرى",
    needUv: "يتطلب uv: ",
    needClaude: "يتطلب Claude CLI: ",
    disabling: "جارٍ تعطيل الإضافات الزائدة",
    previewNote: "معاينة · ملف تجريبي",
    previewNext: "الخطوة التالية في التشغيل الفعلي",
    dClaudeMd: "ملفات CLAUDE.md",
    dFix: "للتعطيل: ai-kit doctor --fix",
    dFixing: "جارٍ تعطيل الإضافات الزائدة",
    dSkillsN: "مهارة",
    wPr: "وكلاء مراجعة PR: تعليقات، اختبارات، أخطاء",
    wCommit: "سير عمل git: أوامر commit/push",
    wPlaywright: "اختبارات e2e في المتصفح",
    wGo: "الأنواع والتنقل لـ Go",
    wTerraform: "تكامل Terraform / IaC",
    wMd: "يدقق ويقلّص ملف CLAUDE.md",
    wSimplify: "يبسّط الكود للوضوح",
    wFeature: "تطوير الميزات على مراحل موجّهة",
    rContent: "عمل محتوى → حزمة التسويق تبقى مفعّلة",
    dDupes: "تكرارات / تعارضات",
    dupSerena: "serena تكرر graphify — أبقِ واحدة",
    dCostNote: "طلب/يوم · سعر إدخال Sonnet، تقريبي",
    uNoProfile: "لا يوجد ملف محفوظ — شغّل `ai-kit` أولاً",
    pSaved: "تم حفظ الملف → `ai-kit update` يعيد التخطيط دون استبيان",
    vTitle: "فحص التثبيت",
    vOk: "تم",
    vFail: "مفقود",
    pUse: "طريقة الاستخدام",
    useAuto: "يعمل تلقائياً عند الحاجة",
    planFile: "تم حفظ الخطة:",
    manDo: "نفّذ بالترتيب",
    manVerify: "تحقق",
    manBallast: "ثم عطّل الإضافات الزائدة",
    wLsp: "تنقل وأنواع دقيقة",
    wLaravel: "عدة Laravel (artisan، النماذج…)",
    scAi: "الذكاء الاصطناعي على هذا الجهاز",
    scCli: "مساعدو CLI",
    scApps: "تطبيقات سطح المكتب",
    scModels: "نماذج LLM",
    scCloud: "مفاتيح سحابية",
    scMcp: "خوادم MCP المهيأة",
    scProjects: "المشاريع",
    scNone: "لم يُعثر على شيء",
    scPrivacy: "يقرأ أسماء المجلدات وملفات التعريف فقط · لا يُرسل شيء",
    scGuess: "يبدو أنها تقنياتك — محددة أدناه، أكّد بـ Enter",
    dsTitle: "عُثر عليه لتقنياتك (غير متحقق)",
    dsNone: "لا جديد",
    dsHave: "مهيأ مسبقاً",
    dsNote: "نجوم · آخر commit — لم نتحقق منه، اقرأ README قبل التثبيت",
    dsSearching: "جارٍ البحث في GitHub · npm · PyPI…",
    repFound: "مكتشف لتقنياتك",
    repUnverified: "غير متحقق",
    repHave: "مهيأ مسبقاً",
    kMobile: "موبايل",
    kMl: "تطبيقات AI / ML / LLM",
    qStackMob: "تقنيات الموبايل؟",
    qAssist: "أي مساعدي ذكاء اصطناعي تستخدم؟",
    aClaude: "Claude Code (CLI / إضافة IDE)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / إضافة IDE)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "ما أكثر ما يزعجك؟",
    pContext: "يعيد قراءة الملفات ويستهلك السياق",
    pStale: "واجهات / إصدارات مكتبات قديمة",
    pQuality: "يكسر الاختبارات، كود مهمل",
    pSlow: "بطيء جداً، كثير من الذهاب والإياب",
    pProject: "لا يعرف مشروعي",
    pBrowser: "لا يصل إلى المتصفح / قاعدة البيانات / الخدمات",
    qDb: "ما قواعد البيانات التي تعمل معها؟",
    qSvc: "ما الخدمات التي تريد ربطها؟",
    qTeam: "وحدك أم في فريق؟",
    tSolo: "وحدي",
    tTeam: "فريق — PRs، مراجعات",
    rTeam: "فريق → مراجعة PR + قواعد commit تبقي السجل نظيفاً",
    rMobile: "موبايل → LSP دقيق للمنصة، بلا أدوات UI",
    wSoup: "ضبط LLM من ملف YAML واحد على GPU اللابتوب",
    scCfg: "مهيأة (بدون CLI)",
    scFind: "الخلاصة",
    fNoMcp: "{host}: لا خوادم MCP — الخطة ستربط ما تحتاجه",
    fMcp: "{host}: {n} خوادم MCP مهيأة",
    fCfgNoCli: "{name}: الحساب/الإعداد موجود، CLI غير مثبت",
    fModelsNoRuntime: "نماذج في ذاكرة HF لكن لا بيئة لتشغيلها (Ollama / LM Studio)",
    fNoRules: "لا تعليمات للذكاء الاصطناعي (CLAUDE.md / AGENTS.md / .cursorrules) في {n} من {m} مشاريع",
    scNext: "ما يُضاف أو يُزال — تقرره الخطة بعد الاستبيان · كلفة السياق — `ai-kit doctor`",
    iTitle: "ربط الأدوات المكتشفة أيضاً؟ (اختر)",
    iSkip: "— تخطّ —",
    iInto: "جارٍ الربط في",
    iDone: "تم الربط",
    iExists: "موجود مسبقاً",
    iFail: "فشل",
    iNoHost: "لم يُعثر على المساعدين المختارين في هذا الجهاز — الأوامر فقط:",
    iBackup: "نسخ الإعدادات الاحتياطية بجانب كل ملف (*.bak-<الوقت>)",
    iAutoSkip: "--yes يثبّت المجموعة المنتقاة فقط؛ المكتشف يحتاج اختياراً صريحاً",
    iResult: "الأدوات المكتشفة — النتيجة",
    wPonytail: "كود أقل → توكنات وتعديلات أقل",
    wGraphify: "رسم بياني للكود بدل إعادة قراءة الملفات",
    wContext7: "توثيق المكتبات المحدّث فوراً",
    wTs: "تنقل وأنواع دقيقة لـ TS/JS",
    wPy: "أنواع وتحليل لـ Python",
    wMatt: "هندسة: TDD، مراجعة، مواصفات",
    wFrontend: "واجهة عالية الجودة، ليست قالباً",
    dBallast: "إضافات زائدة (عديمة الفائدة للتطوير، تستهلك السياق)",
    dNone: "لا إضافات زائدة — الإعداد نظيف",
    dTotal: "الحمل الزائد في كل طلب",
    dTokens: "توكن",
    dBig: "ثقيل! يستحق التقليص",
    rHeavy: "ساعات يومياً مع الذكاء الاصطناعي → ponytail + graphify يقلّصان التوكنات كثيراً",
    rVibe: "vibe-coding → TDD/المراجعة + ponytail يحميان الكود",
    rNew: "مبتدئ → الحواجز أولاً: مراجعة، اختبارات، أقل كود",
    rPro: "خبير → أدوات دقيقة (LSP)، بلا وصاية",
    qStackFe: "تقنيات الواجهة الأمامية؟",
    qStackBe: "تقنيات الخلفية؟",
    support: "صنعه إنسان واحد. إن وفّر لك ساعة، فنجمة ★ على github.com/hasabasa/ai-kit هي طريقتي لأعرف.",
    repBecause: "تم الاختيار بسبب", repFile: "التقرير:",
  },
  ja: {
    tagline1: "あなたの仕事に合ったツールを選ぶ", tagline2: "より正確なAI · トークン節約 · 必要なものだけ",
    hintMulti: "↑↓ 移動 · スペース — 複数選択 · Enter — 次へ · Esc — 戻る",
    hintSingle: "↑↓ 移動 · Enter — 次へ · Esc — 戻る",
    own: "自由入力", ownPrompt: "自由入力: ", enFallback: "",
    qKind: "何を作っていますか？", kFe: "フロントエンド / UI", kBe: "バックエンド / API", kData: "データ / 分析", kContent: "コンテンツ", kDevops: "DevOps / サーバー",
    qGoal: "主な目標は？", gTokens: "トークン節約", gQuality: "コード品質", gSpeed: "スピード",
    qUsage: "AIの使用頻度は？", uLight: "少し（<1時間/日）", uMed: "1–3時間/日", uHeavy: "3–6時間/日", uAllday: "一日中（6時間+）",
    qSkill: "手書きコードの実力は？", sPro: "自信あり（シニア/ミドル）", sLearn: "書けるが調べる", sVibe: "ほぼAI任せ", sNew: "初心者",
    recommend: "インストール推奨", disable: "無効化 — バラスト、コンテキスト消費",
    installQ: "すべてインストール？ ", installing: "インストール中", done: "完了", nochange: "OK、変更なし。", restart: "エディタ/セッションを再起動",
    dApprox: "概算", dConfigs: "設定ファイル（全アシスタント）", dSkillsBox: "スキル",
    pWhy: "あなたに合う理由", aFound: "AIアシスタント検出", aOk: "対応済み", aSoon: "近日対応",
    mHow: "インストール方法は？", mAuto: "自動 — コマンドを実行します", mManual: "手動 — 手順をください",
    mCancel: "キャンセル", repTitle: "あなた専用のセットアップレポート", repProfile: "プロフィール",
    hintMultiN: "番号をカンマ区切りで",
    hintSingleN: "番号",
    qLang: "言語 / スタックは？",
    lOther: "その他",
    needUv: "uv が必要: ",
    needClaude: "Claude CLI が必要: ",
    disabling: "バラストを無効化中",
    previewNote: "プレビュー · デモプロフィール",
    previewNext: "実際の実行での次のステップ",
    dClaudeMd: "CLAUDE.md ファイル",
    dFix: "無効化: ai-kit doctor --fix",
    dFixing: "バラストを無効化中",
    dSkillsN: "スキル",
    wPr: "PR レビューエージェント: コメント、テスト、エラー",
    wCommit: "git ワークフロー: commit/push コマンド",
    wPlaywright: "ブラウザ e2e テスト",
    wGo: "Go の型とナビゲーション",
    wTerraform: "Terraform / IaC 連携",
    wMd: "CLAUDE.md を監査してスリム化",
    wSimplify: "コードを読みやすく簡素化",
    wFeature: "段階的な機能開発フロー",
    rContent: "コンテンツ業務 → マーケティングパックは有効のまま",
    dDupes: "重複 / 競合",
    dupSerena: "serena は graphify と重複 — どちらか一つに",
    dCostNote: "リクエスト/日 · Sonnet 入力価格、概算",
    uNoProfile: "保存されたプロフィールなし — まず `ai-kit` を実行",
    pSaved: "プロフィール保存済 → `ai-kit update` でアンケートなしに再計画",
    vTitle: "インストール確認",
    vOk: "OK",
    vFail: "未検出",
    pUse: "使い方",
    useAuto: "必要なときに自動で使われる",
    planFile: "プランを保存:",
    manDo: "この順で実行",
    manVerify: "確認",
    manBallast: "その後バラストを無効化",
    wLsp: "正確なジャンプと型",
    wLaravel: "Laravel ツールキット（artisan、モデル…）",
    scAi: "このマシンの AI",
    scCli: "CLI アシスタント",
    scApps: "デスクトップアプリ",
    scModels: "LLM モデル",
    scCloud: "クラウドのキー",
    scMcp: "設定済み MCP サーバー",
    scProjects: "プロジェクト",
    scNone: "見つかりません",
    scPrivacy: "フォルダ名とマニフェストのみ読み取り · どこにも送信しません",
    scGuess: "あなたのスタックのようです — 下で選択済み、Enter で確認",
    dsTitle: "あなたのスタック向けに発見（未検証）",
    dsNone: "新しいものはなし",
    dsHave: "設定済み",
    dsNote: "スター · 最終コミット — 当方未検証、インストール前に README を確認",
    dsSearching: "GitHub · npm · PyPI を検索中…",
    repFound: "あなたのスタック向けの発見",
    repUnverified: "未検証",
    repHave: "設定済み",
    kMobile: "モバイル",
    kMl: "AI / ML / LLM アプリ",
    qStackMob: "モバイルのスタックは？",
    qAssist: "どの AI アシスタントを使っていますか？",
    aClaude: "Claude Code（CLI / IDE 拡張）",
    aGemini: "Gemini（CLI / Code Assist / Antigravity）",
    aCodex: "Codex（CLI / IDE 拡張）",
    aCopilot: "GitHub Copilot（IDE / CLI）",
    qPain: "一番困っていることは？",
    pContext: "ファイルを読み直してコンテキストを浪費",
    pStale: "古い API / ライブラリのバージョン",
    pQuality: "テストを壊す、雑なコード",
    pSlow: "遅い、やり直しが多い",
    pProject: "自分のプロジェクトを知らない",
    pBrowser: "ブラウザ / DB / サービスに触れない",
    qDb: "使っているデータベースは？",
    qSvc: "接続したいサービスは？",
    qTeam: "一人かチームか？",
    tSolo: "一人",
    tTeam: "チーム — PR、レビュー",
    rTeam: "チーム → PR レビュー + コミット規約で履歴をきれいに",
    rMobile: "モバイル → プラットフォーム専用の正確な LSP、UI ツールは不要",
    wSoup: "YAML 一つでノート PC の GPU で LLM をファインチューニング",
    scCfg: "設定あり（CLI なし）",
    scFind: "所見",
    fNoMcp: "{host}: MCP サーバーなし — 必要なものはプランが接続します",
    fMcp: "{host}: MCP サーバー {n} 件設定済み",
    fCfgNoCli: "{name}: アカウント/設定はあるが CLI 未インストール",
    fModelsNoRuntime: "HF キャッシュにモデルはあるが実行環境がない（Ollama / LM Studio）",
    fNoRules: "{m} プロジェクト中 {n} に AI 向け指示（CLAUDE.md / AGENTS.md / .cursorrules）がない",
    scNext: "何を追加・削除するか — アンケート後にプランが決定 · コンテキストのコスト — `ai-kit doctor`",
    iTitle: "見つかったツールも接続しますか？（選択）",
    iSkip: "— スキップ —",
    iInto: "接続先",
    iDone: "接続済み",
    iExists: "既にあり",
    iFail: "失敗",
    iNoHost: "選択したアシスタントがこのマシンにありません — コマンドのみ:",
    iBackup: "設定のバックアップは各ファイルの隣に保存（*.bak-<時刻>）",
    iAutoSkip: "--yes はキュレーション済みセットのみ導入；発見ツールは明示的な選択が必要",
    iResult: "見つかったツール — 結果",
    wPonytail: "少ないコード → トークンも修正も少なく",
    wGraphify: "ファイル再読込の代わりにコードグラフ",
    wContext7: "最新のライブラリドキュメントをその場で",
    wTs: "TS/JS の正確なジャンプと型",
    wPy: "Python の型と解析",
    wMatt: "エンジニアリング: TDD、レビュー、仕様",
    wFrontend: "テンプレではない質の高い UI",
    dBallast: "バラストプラグイン（開発に不要、コンテキストを消費）",
    dNone: "バラストなし — クリーンな構成",
    dTotal: "毎リクエストのバラスト",
    dTokens: "トークン",
    dBig: "重い！削減の価値あり",
    rHeavy: "毎日長時間 AI → ponytail + graphify でトークンを大幅削減",
    rVibe: "バイブコーディング → TDD/レビュー + ponytail でコードを守る",
    rNew: "初心者 → まずガードレール: レビュー、テスト、最小コード",
    rPro: "経験者 → 正確なツール（LSP）、手取り足取りなし",
    qStackFe: "フロントエンドのスタックは？",
    qStackBe: "バックエンドのスタックは？",
    support: "一人で作っています。1 時間でも節約できたなら、github.com/hasabasa/ai-kit の ★ で教えてください。",
    repBecause: "選択理由", repFile: "レポート：",
  },
  ko: {
    tagline1: "작업에 맞는 도구를 고르세요", tagline2: "더 정확한 AI · 토큰 절약 · 필요한 것만",
    hintMulti: "↑↓ 이동 · 스페이스 — 여러 개 · 엔터 — 다음 · esc — 뒤로",
    hintSingle: "↑↓ 이동 · 엔터 — 다음 · esc — 뒤로",
    own: "직접 입력", ownPrompt: "직접 입력: ", enFallback: "",
    qKind: "무엇을 만드시나요?", kFe: "프론트엔드 / UI", kBe: "백엔드 / API", kData: "데이터 / 분석", kContent: "콘텐츠", kDevops: "DevOps / 서버",
    qGoal: "주요 목표?", gTokens: "토큰 절약", gQuality: "코드 품질", gSpeed: "속도",
    qUsage: "AI 사용 빈도?", uLight: "가끔 (<1시간/일)", uMed: "1–3시간/일", uHeavy: "3–6시간/일", uAllday: "하루 종일 (6시간+)",
    qSkill: "직접 코딩 실력은?", sPro: "자신 있음 (시니어/미들)", sLearn: "쓰지만 찾아봄", sVibe: "대부분 AI가 작성", sNew: "초보",
    recommend: "설치 추천", disable: "비활성화 — 불필요, 컨텍스트 소모",
    installQ: "전부 설치? ", installing: "설치 중", done: "완료", nochange: "변경 없음.", restart: "에디터/세션 재시작",
    dApprox: "대략적 추정", dConfigs: "설정 파일 (모든 어시스턴트)", dSkillsBox: "스킬",
    pWhy: "당신에게 맞는 이유", aFound: "AI 어시스턴트 감지", aOk: "지원됨", aSoon: "곧 지원",
    mHow: "설치 방법?", mAuto: "자동 — 명령 실행", mManual: "수동 — 단계별 안내",
    mCancel: "취소", repTitle: "맞춤 설정 리포트", repProfile: "프로필",
    hintMultiN: "번호를 쉼표로 구분",
    hintSingleN: "번호",
    qLang: "언어 / 스택은?",
    lOther: "기타",
    needUv: "uv 필요: ",
    needClaude: "Claude CLI 필요: ",
    disabling: "불필요 플러그인 비활성화 중",
    previewNote: "미리보기 · 데모 프로필",
    previewNext: "실제 실행 시 다음 단계",
    dClaudeMd: "CLAUDE.md 파일",
    dFix: "비활성화: ai-kit doctor --fix",
    dFixing: "불필요 플러그인 비활성화 중",
    dSkillsN: "스킬",
    wPr: "PR 리뷰 에이전트: 코멘트, 테스트, 오류",
    wCommit: "git 워크플로: commit/push 명령",
    wPlaywright: "브라우저 e2e 테스트",
    wGo: "Go 타입과 탐색",
    wTerraform: "Terraform / IaC 통합",
    wMd: "CLAUDE.md 점검 및 슬림화",
    wSimplify: "코드를 명확하게 단순화",
    wFeature: "단계별 기능 개발 흐름",
    rContent: "콘텐츠 작업 → 마케팅 팩은 유지",
    dDupes: "중복 / 충돌",
    dupSerena: "serena는 graphify와 중복 — 하나만 남기세요",
    dCostNote: "요청/일 · Sonnet 입력 단가, 대략",
    uNoProfile: "저장된 프로필 없음 — 먼저 `ai-kit` 실행",
    pSaved: "프로필 저장됨 → `ai-kit update`로 설문 없이 재계획",
    vTitle: "설치 확인",
    vOk: "정상",
    vFail: "없음",
    pUse: "사용법",
    useAuto: "필요할 때 자동으로 사용됨",
    planFile: "계획 저장:",
    manDo: "순서대로 실행",
    manVerify: "확인",
    manBallast: "그 다음 불필요 플러그인 비활성화",
    wLsp: "정확한 이동과 타입",
    wLaravel: "Laravel 툴킷(artisan, 모델…)",
    scAi: "이 기기의 AI",
    scCli: "CLI 어시스턴트",
    scApps: "데스크톱 앱",
    scModels: "LLM 모델",
    scCloud: "클라우드 키",
    scMcp: "설정된 MCP 서버",
    scProjects: "프로젝트",
    scNone: "발견되지 않음",
    scPrivacy: "폴더 이름과 매니페스트만 읽음 · 어디에도 전송하지 않음",
    scGuess: "당신의 스택인 듯 — 아래에 미리 선택됨, Enter로 확인",
    dsTitle: "당신의 스택에 맞게 발견(미검증)",
    dsNone: "새로운 것 없음",
    dsHave: "이미 설정됨",
    dsNote: "스타 · 마지막 커밋 — 저희가 검증하지 않음, 설치 전 README 확인",
    dsSearching: "GitHub · npm · PyPI 검색 중…",
    repFound: "당신의 스택을 위한 발견",
    repUnverified: "미검증",
    repHave: "이미 설정됨",
    kMobile: "모바일",
    kMl: "AI / ML / LLM 앱",
    qStackMob: "모바일 스택은?",
    qAssist: "어떤 AI 어시스턴트를 쓰시나요?",
    aClaude: "Claude Code(CLI / IDE 확장)",
    aGemini: "Gemini(CLI / Code Assist / Antigravity)",
    aCodex: "Codex(CLI / IDE 확장)",
    aCopilot: "GitHub Copilot(IDE / CLI)",
    qPain: "가장 짜증나는 건?",
    pContext: "파일을 다시 읽어 컨텍스트를 낭비",
    pStale: "오래된 API / 라이브러리 버전",
    pQuality: "테스트를 깨고 코드가 엉성함",
    pSlow: "너무 느리고 왕복이 많음",
    pProject: "내 프로젝트를 모름",
    pBrowser: "브라우저 / DB / 서비스에 접근 못 함",
    qDb: "사용하는 데이터베이스는?",
    qSvc: "연결할 서비스는?",
    qTeam: "혼자인가요, 팀인가요?",
    tSolo: "혼자",
    tTeam: "팀 — PR, 리뷰",
    rTeam: "팀 → PR 리뷰 + 커밋 규칙으로 깔끔한 히스토리",
    rMobile: "모바일 → 플랫폼용 정확한 LSP, UI 도구는 제외",
    wSoup: "YAML 하나로 노트북 GPU에서 LLM 파인튜닝",
    scCfg: "설정됨(CLI 없음)",
    scFind: "결론",
    fNoMcp: "{host}: MCP 서버 없음 — 계획이 필요한 것을 연결합니다",
    fMcp: "{host}: MCP 서버 {n}개 설정됨",
    fCfgNoCli: "{name}: 계정/설정은 있지만 CLI 미설치",
    fModelsNoRuntime: "HF 캐시에 모델은 있지만 실행 환경이 없음(Ollama / LM Studio)",
    fNoRules: "{m}개 프로젝트 중 {n}개에 AI 지침(CLAUDE.md / AGENTS.md / .cursorrules) 없음",
    scNext: "무엇을 추가·제거할지 — 설문 후 계획이 결정 · 컨텍스트 비용 — `ai-kit doctor`",
    iTitle: "발견한 도구도 연결할까요?(선택)",
    iSkip: "— 건너뛰기 —",
    iInto: "연결 대상",
    iDone: "연결됨",
    iExists: "이미 있음",
    iFail: "실패",
    iNoHost: "선택한 어시스턴트가 이 기기에 없음 — 명령만 표시:",
    iBackup: "설정 백업은 각 파일 옆에 저장(*.bak-<시간>)",
    iAutoSkip: "--yes는 큐레이션 세트만 설치; 발견한 도구는 명시적 선택 필요",
    iResult: "발견한 도구 — 결과",
    wPonytail: "코드 줄이기 → 토큰과 수정도 줄어듦",
    wGraphify: "파일 재읽기 대신 코드 그래프",
    wContext7: "최신 라이브러리 문서를 즉시",
    wTs: "TS/JS 정확한 이동과 타입",
    wPy: "Python 타입과 분석",
    wMatt: "엔지니어링: TDD, 리뷰, 스펙",
    wFrontend: "템플릿이 아닌 고품질 UI",
    dBallast: "불필요 플러그인(개발에 무용, 컨텍스트 소모)",
    dNone: "불필요 플러그인 없음 — 깔끔한 설정",
    dTotal: "매 요청마다의 부담",
    dTokens: "토큰",
    dBig: "무거움! 줄일 가치 있음",
    rHeavy: "매일 AI에 오랜 시간 → ponytail + graphify로 토큰 대폭 절감",
    rVibe: "바이브 코딩 → TDD/리뷰 + ponytail로 코드 보호",
    rNew: "초보 → 먼저 가드레일: 리뷰, 테스트, 최소 코드",
    rPro: "숙련자 → 정확한 도구(LSP), 잔소리 없이",
    qStackFe: "프론트엔드 스택은?",
    qStackBe: "백엔드 스택은?",
    support: "한 사람이 만들었습니다. 한 시간을 아껴줬다면 github.com/hasabasa/ai-kit 의 ★ 로 알려주세요.",
    repBecause: "선택 이유", repFile: "리포트:",
  },
  tr: {
    tagline1: "İşine uygun araçları seç", tagline2: "Daha doğru AI · daha az token · sadece gereken",
    hintMulti: "↑↓ gezin · boşluk — birden fazla · enter — ileri · esc — geri",
    hintSingle: "↑↓ gezin · enter — ileri · esc — geri",
    own: "kendi seçimin", ownPrompt: "kendi seçimin: ", enFallback: "",
    qKind: "Ne geliştiriyorsun?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Veri / analitik", kContent: "İçerik", kDevops: "DevOps / sunucu",
    qGoal: "Ana hedef?", gTokens: "Token tasarrufu", gQuality: "Kod kalitesi", gSpeed: "Hız",
    qUsage: "AI ne kadar kullanıyorsun?", uLight: "Az (<1s/gün)", uMed: "1–3s/gün", uHeavy: "3–6s/gün", uAllday: "Tüm gün (6s+)",
    qSkill: "Elle kod yazma seviyesi?", sPro: "Kendinden emin (kıdemli/orta)", sLearn: "Yazarım ama bakınırım", sVibe: "Çoğunlukla AI yazıyor", sNew: "Yeni başlayan",
    recommend: "Kurulumu önerilen", disable: "Devre dışı — gereksiz, bağlam yiyor",
    installQ: "Hepsini kur? ", installing: "Kuruluyor", done: "Tamam", nochange: "Değişiklik yok.", restart: "editörü/oturumu yeniden başlat",
    dApprox: "tahmini", dConfigs: "Yapılandırma dosyaları (tümü)", dSkillsBox: "Beceriler",
    pWhy: "Neden sana uygun", aFound: "AI asistanlar bulundu", aOk: "destekleniyor", aSoon: "yakında",
    mHow: "Nasıl kuralım?", mAuto: "Otomatik — komutları çalıştırırım", mManual: "Manuel — adımları ver",
    mCancel: "İptal", repTitle: "Kişisel kurulum raporun", repProfile: "Profilin",
    hintMultiN: "virgülle ayrılmış numaralar",
    hintSingleN: "numara",
    qLang: "Diller / stack?",
    lOther: "Diğer",
    needUv: "uv gerekli: ",
    needClaude: "Claude CLI gerekli: ",
    disabling: "Gereksiz eklentiler kapatılıyor",
    previewNote: "önizleme · demo profil",
    previewNext: "gerçek çalıştırmada sonraki adım",
    dClaudeMd: "CLAUDE.md dosyaları",
    dFix: "Kapat: ai-kit doctor --fix",
    dFixing: "Gereksiz eklentiler kapatılıyor",
    dSkillsN: "beceri",
    wPr: "PR inceleme ajanları: yorumlar, testler, hatalar",
    wCommit: "git akışı: commit/push komutları",
    wPlaywright: "tarayıcı e2e testleri",
    wGo: "Go için tipler ve gezinme",
    wTerraform: "Terraform / IaC entegrasyonu",
    wMd: "CLAUDE.md dosyanı denetler ve inceltir",
    wSimplify: "kodu netlik için sadeleştirir",
    wFeature: "aşamalı özellik geliştirme akışı",
    rContent: "içerik işi → pazarlama paketi açık kalıyor",
    dDupes: "Tekrarlar / çakışmalar",
    dupSerena: "serena graphify ile aynı işi yapıyor — birini tut",
    dCostNote: "istek/gün · Sonnet girdi fiyatı, kabaca",
    uNoProfile: "Kayıtlı profil yok — önce `ai-kit` çalıştır",
    pSaved: "profil kaydedildi → `ai-kit update` anketsiz yeniden planlar",
    vTitle: "Kurulum kontrolü",
    vOk: "tamam",
    vFail: "eksik",
    pUse: "Nasıl kullanılır",
    useAuto: "gerektiğinde kendisi devreye girer",
    planFile: "Plan kaydedildi:",
    manDo: "Sırayla çalıştır",
    manVerify: "Doğrula",
    manBallast: "Sonra gereksiz eklentileri kapat",
    wLsp: "hassas gezinme ve tipler",
    wLaravel: "Laravel araç seti (artisan, modeller…)",
    scAi: "Bu makinedeki AI",
    scCli: "CLI asistanlar",
    scApps: "Masaüstü uygulamalar",
    scModels: "LLM modelleri",
    scCloud: "Bulut anahtarları",
    scMcp: "Yapılandırılmış MCP sunucuları",
    scProjects: "Projeler",
    scNone: "bir şey bulunamadı",
    scPrivacy: "yalnızca klasör adları ve manifestler okunur · hiçbir yere gönderilmez",
    scGuess: "Stack'in bu gibi görünüyor — aşağıda önceden seçili, Enter ile onayla",
    dsTitle: "Stack'in için bulundu (doğrulanmamış)",
    dsNone: "yeni bir şey yok",
    dsHave: "zaten yapılandırılmış",
    dsNote: "yıldızlar · son commit — bizce doğrulanmadı, kurmadan önce README'yi oku",
    dsSearching: "GitHub · npm · PyPI'de aranıyor…",
    repFound: "Stack'in için keşfedildi",
    repUnverified: "doğrulanmamış",
    repHave: "zaten yapılandırılmış",
    kMobile: "Mobil",
    kMl: "AI / ML / LLM uygulamaları",
    qStackMob: "Mobil stack?",
    qAssist: "Hangi AI asistanları kullanıyorsun?",
    aClaude: "Claude Code (CLI / IDE eklentisi)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / IDE eklentisi)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "En çok ne sinir ediyor?",
    pContext: "Dosyaları tekrar okuyor, bağlamı yakıyor",
    pStale: "Eski API'ler / kütüphane sürümleri",
    pQuality: "Testleri bozuyor, özensiz kod",
    pSlow: "Çok yavaş, çok gidip gelme",
    pProject: "Projemi tanımıyor",
    pBrowser: "Tarayıcıya / DB'ye / servislere erişemiyor",
    qDb: "Hangi veritabanlarıyla çalışıyorsun?",
    qSvc: "Hangi servisler bağlansın?",
    qTeam: "Tek başına mı, ekip mi?",
    tSolo: "Tek başına",
    tTeam: "Ekip — PR'lar, incelemeler",
    rTeam: "ekip → PR incelemesi + commit kuralları geçmişi temiz tutar",
    rMobile: "mobil → platforma özel hassas LSP, UI araçları yok",
    wSoup: "tek bir YAML ile dizüstü GPU'sunda LLM ince ayarı",
    scCfg: "Yapılandırılmış (CLI yok)",
    scFind: "Bulgular",
    fNoMcp: "{host}: MCP sunucusu yok — plan gerekenleri bağlayacak",
    fMcp: "{host}: {n} MCP sunucusu yapılandırılmış",
    fCfgNoCli: "{name}: hesap/yapılandırma var, CLI kurulu değil",
    fModelsNoRuntime: "HF önbelleğinde modeller var ama çalıştıracak ortam yok (Ollama / LM Studio)",
    fNoRules: "{m} projeden {n} tanesinde AI talimatı yok (CLAUDE.md / AGENTS.md / .cursorrules)",
    scNext: "ne eklenip ne çıkarılacağına anketten sonra plan karar verir · bağlam maliyeti — `ai-kit doctor`",
    iTitle: "Bulunan araçlar da bağlansın mı? (seç)",
    iSkip: "— atla —",
    iInto: "Bağlanıyor",
    iDone: "bağlandı",
    iExists: "zaten vardı",
    iFail: "başarısız",
    iNoHost: "seçili asistan bu makinede bulunamadı — yalnızca komutlar:",
    iBackup: "yapılandırma yedekleri her dosyanın yanında (*.bak-<zaman>)",
    iAutoSkip: "--yes yalnızca seçilmiş seti kurar; bulunanlar açık seçim ister",
    iResult: "Bulunan araçlar — sonuç",
    wPonytail: "daha az kod → daha az token ve düzenleme",
    wGraphify: "dosyaları yeniden okumak yerine kod grafiği",
    wContext7: "güncel kütüphane dokümanları anında",
    wTs: "TS/JS için hassas gezinme ve tipler",
    wPy: "Python için tipler ve analiz",
    wMatt: "mühendislik: TDD, inceleme, spesifikasyon",
    wFrontend: "kaliteli UI, şablon değil",
    dBallast: "Gereksiz eklentiler (geliştirme için işe yaramaz, bağlam yer)",
    dNone: "Gereksiz eklenti yok — kurulum temiz",
    dTotal: "HER istekte gereksiz yük",
    dTokens: "token",
    dBig: "ağır! kısmaya değer",
    rHeavy: "her gün saatlerce AI → ponytail + graphify token'ı ciddi kısar",
    rVibe: "vibe-coding → TDD/inceleme + ponytail kodu güvende tutar",
    rNew: "yeni başlayan → önce korkuluklar: inceleme, testler, minimum kod",
    rPro: "deneyimli → hassas araçlar (LSP), el tutma yok",
    qStackFe: "Frontend stack?",
    qStackBe: "Backend stack?",
    support: "Tek bir insan yaptı. Sana bir saat kazandırdıysa, github.com/hasabasa/ai-kit'te bir ★ bunu öğrenmemin yolu.",
    repBecause: "seçim sebebi", repFile: "Rapor:",
  },
  id: {
    tagline1: "Pilih tools yang tepat untuk pekerjaanmu", tagline2: "AI lebih akurat · token lebih hemat · hanya yang dibutuhkan",
    hintMulti: "↑↓ geser · spasi — pilih beberapa · enter — lanjut · esc — kembali",
    hintSingle: "↑↓ geser · enter — lanjut · esc — kembali",
    own: "pilihan sendiri", ownPrompt: "pilihan sendiri: ", enFallback: "",
    qKind: "Apa yang kamu kembangkan?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Data / analitik", kContent: "Konten", kDevops: "DevOps / server",
    qGoal: "Tujuan utama?", gTokens: "Hemat token", gQuality: "Kualitas kode", gSpeed: "Kecepatan",
    qUsage: "Seberapa sering pakai AI?", uLight: "Jarang (<1j/hari)", uMed: "1–3j/hari", uHeavy: "3–6j/hari", uAllday: "Seharian (6j+)",
    qSkill: "Seberapa jago ngoding manual?", sPro: "Percaya diri (senior/mid)", sLearn: "Bisa tapi sering cari referensi", sVibe: "Kebanyakan AI yang nulis", sNew: "Pemula",
    recommend: "Rekomendasi install", disable: "Nonaktifkan — ballast, makan konteks",
    installQ: "Install semua? ", installing: "Menginstall", done: "Selesai", nochange: "Ok, tidak ada perubahan.", restart: "restart editor/sesi",
    dApprox: "perkiraan", dConfigs: "File konfigurasi (semua)", dSkillsBox: "Skills",
    pWhy: "Kenapa cocok untukmu", aFound: "Asisten AI terdeteksi", aOk: "didukung", aSoon: "segera",
    mHow: "Cara install?", mAuto: "Otomatis — saya jalankan", mManual: "Manual — beri saya langkahnya",
    mCancel: "Batal", repTitle: "Laporan setup pribadimu", repProfile: "Profilmu",
    hintMultiN: "nomor dipisah koma",
    hintSingleN: "nomor",
    qLang: "Bahasa / stack?",
    lOther: "Lainnya",
    needUv: "butuh uv: ",
    needClaude: "butuh Claude CLI: ",
    disabling: "Menonaktifkan plugin pemberat",
    previewNote: "pratinjau · profil demo",
    previewNext: "langkah berikutnya saat dijalankan sungguhan",
    dClaudeMd: "File CLAUDE.md",
    dFix: "Nonaktifkan: ai-kit doctor --fix",
    dFixing: "Menonaktifkan plugin pemberat",
    dSkillsN: "skill",
    wPr: "agen review PR: komentar, tes, error",
    wCommit: "alur git: perintah commit/push",
    wPlaywright: "tes e2e browser",
    wGo: "tipe & navigasi untuk Go",
    wTerraform: "integrasi Terraform / IaC",
    wMd: "audit & rampingkan CLAUDE.md-mu",
    wSimplify: "menyederhanakan kode agar jelas",
    wFeature: "alur pengembangan fitur bertahap",
    rContent: "kerja konten → paket marketing tetap aktif",
    dDupes: "Duplikat / konflik",
    dupSerena: "serena menduplikasi graphify — pilih salah satu",
    dCostNote: "permintaan/hari · harga input Sonnet, perkiraan",
    uNoProfile: "Tidak ada profil tersimpan — jalankan `ai-kit` dulu",
    pSaved: "profil tersimpan → `ai-kit update` merencanakan ulang tanpa survei",
    vTitle: "Pemeriksaan instalasi",
    vOk: "ok",
    vFail: "tidak ada",
    pUse: "Cara pakai",
    useAuto: "aktif sendiri saat relevan",
    planFile: "Rencana tersimpan:",
    manDo: "Jalankan berurutan",
    manVerify: "Verifikasi",
    manBallast: "Lalu nonaktifkan plugin pemberat",
    wLsp: "navigasi & tipe yang presisi",
    wLaravel: "toolkit Laravel (artisan, model…)",
    scAi: "AI di mesin ini",
    scCli: "Asisten CLI",
    scApps: "Aplikasi desktop",
    scModels: "Model LLM",
    scCloud: "Kunci cloud",
    scMcp: "Server MCP yang terkonfigurasi",
    scProjects: "Proyek",
    scNone: "tidak ditemukan",
    scPrivacy: "hanya membaca nama folder & manifest · tidak ada yang dikirim",
    scGuess: "Sepertinya ini stack-mu — sudah dipilih di bawah, konfirmasi dengan Enter",
    dsTitle: "Ditemukan untuk stack-mu (belum diverifikasi)",
    dsNone: "tidak ada yang baru",
    dsHave: "sudah terkonfigurasi",
    dsNote: "bintang · commit terakhir — belum kami periksa, baca README sebelum memasang",
    dsSearching: "mencari di GitHub · npm · PyPI…",
    repFound: "Ditemukan untuk stack-mu",
    repUnverified: "belum diverifikasi",
    repHave: "sudah terkonfigurasi",
    kMobile: "Mobile",
    kMl: "Aplikasi AI / ML / LLM",
    qStackMob: "Stack mobile?",
    qAssist: "Asisten AI apa yang kamu pakai?",
    aClaude: "Claude Code (CLI / ekstensi IDE)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / ekstensi IDE)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Apa yang paling mengganggu?",
    pContext: "Membaca ulang file, menghabiskan konteks",
    pStale: "API / versi library usang",
    pQuality: "Merusak tes, kode berantakan",
    pSlow: "Terlalu lambat, terlalu banyak bolak-balik",
    pProject: "Tidak mengenal proyekku",
    pBrowser: "Tidak bisa menyentuh browser / DB / layanan",
    qDb: "Database apa yang kamu pakai?",
    qSvc: "Layanan apa yang mau dihubungkan?",
    qTeam: "Sendiri atau tim?",
    tSolo: "Sendiri",
    tTeam: "Tim — PR, review",
    rTeam: "tim → review PR + konvensi commit menjaga riwayat tetap bersih",
    rMobile: "mobile → LSP presisi untuk platform, tanpa alat UI",
    wSoup: "fine-tune LLM dari satu YAML di GPU laptop",
    scCfg: "Terkonfigurasi (tanpa CLI)",
    scFind: "Temuan",
    fNoMcp: "{host}: belum ada server MCP — rencana akan menghubungkan yang diperlukan",
    fMcp: "{host}: {n} server MCP terkonfigurasi",
    fCfgNoCli: "{name}: akun/konfigurasi ada, CLI belum terpasang",
    fModelsNoRuntime: "ada model di cache HF tapi tidak ada runtime untuk menjalankannya (Ollama / LM Studio)",
    fNoRules: "tidak ada instruksi AI (CLAUDE.md / AGENTS.md / .cursorrules) di {n} dari {m} proyek",
    scNext: "apa yang ditambah atau dihapus — rencana memutuskan setelah survei · biaya konteks — `ai-kit doctor`",
    iTitle: "Hubungkan juga alat yang ditemukan? (pilih)",
    iSkip: "— lewati —",
    iInto: "Menghubungkan ke",
    iDone: "terhubung",
    iExists: "sudah ada",
    iFail: "gagal",
    iNoHost: "asisten yang dipilih tidak ada di mesin ini — hanya perintah:",
    iBackup: "cadangan konfigurasi disimpan di samping tiap file (*.bak-<waktu>)",
    iAutoSkip: "--yes hanya memasang set kurasi; alat yang ditemukan butuh pilihan eksplisit",
    iResult: "Alat yang ditemukan — hasil",
    wPonytail: "lebih sedikit kode → lebih sedikit token & perubahan",
    wGraphify: "graf kode alih-alih membaca ulang file",
    wContext7: "dokumentasi library terbaru secara langsung",
    wTs: "navigasi & tipe presisi untuk TS/JS",
    wPy: "tipe & analisis untuk Python",
    wMatt: "rekayasa: TDD, review, spesifikasi",
    wFrontend: "UI berkualitas, bukan template",
    dBallast: "Plugin pemberat (tak berguna untuk dev, memakan konteks)",
    dNone: "Tidak ada pemberat — instalasi bersih",
    dTotal: "Pemberat di SETIAP permintaan",
    dTokens: "token",
    dBig: "berat! layak dipangkas",
    rHeavy: "berjam-jam di AI tiap hari → ponytail + graphify memangkas token drastis",
    rVibe: "vibe-coding → TDD/review + ponytail menjaga kode tetap aman",
    rNew: "pemula → pagar dulu: review, tes, kode minimal",
    rPro: "berpengalaman → alat presisi (LSP), tanpa dituntun",
    qStackFe: "Stack frontend?",
    qStackBe: "Stack backend?",
    support: "Dibuat oleh satu orang. Kalau ini menghemat satu jammu, ★ di github.com/hasabasa/ai-kit adalah cara aku tahu.",
    repBecause: "dipilih karena", repFile: "Laporan:",
  },
  pl: {
    tagline1: "Dobierz narzędzia do swojej pracy", tagline2: "Dokładniejsze AI · mniej tokenów · tylko potrzebne",
    hintMulti: "↑↓ nawiguj · spacja — zaznacz · enter — dalej · esc — wróć",
    hintSingle: "↑↓ nawiguj · enter — dalej · esc — wróć",
    own: "własna opcja", ownPrompt: "własna opcja: ", enFallback: "",
    qKind: "Co tworzysz?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Dane / analityka", kContent: "Treści", kDevops: "DevOps / serwer",
    qGoal: "Główny cel?", gTokens: "Oszczędność tokenów", gQuality: "Jakość kodu", gSpeed: "Szybkość",
    qUsage: "Ile korzystasz z AI?", uLight: "Mało (<1h/dzień)", uMed: "1–3h/dzień", uHeavy: "3–6h/dzień", uAllday: "Cały dzień (6h+)",
    qSkill: "Jak dobrze kodujesz ręcznie?", sPro: "Pewnie (senior/mid)", sLearn: "Koduję, ale sprawdzam", sVibe: "Głównie AI pisze", sNew: "Początkujący",
    recommend: "Zalecane do instalacji", disable: "Wyłącz — balast, zjada kontekst",
    installQ: "Zainstalować wszystko? ", installing: "Instaluję", done: "Gotowe", nochange: "Ok, nic nie zmieniono.", restart: "zrestartuj edytor/sesję",
    dApprox: "przybliżenie", dConfigs: "Pliki konfiguracji (wszystkie)", dSkillsBox: "Umiejętności",
    pWhy: "Dlaczego pasuje do ciebie", aFound: "Wykryto asystentów AI", aOk: "obsługiwany", aSoon: "wkrótce",
    mHow: "Jak instalujemy?", mAuto: "Automatycznie — uruchamiam komendy", mManual: "Ręcznie — daj mi kroki",
    mCancel: "Anuluj", repTitle: "Twój personalny raport", repProfile: "Twój profil",
    hintMultiN: "numery po przecinku",
    hintSingleN: "numer",
    qLang: "Języki / stack?",
    lOther: "Inne",
    needUv: "wymaga uv: ",
    needClaude: "wymaga Claude CLI: ",
    disabling: "Wyłączam balast",
    previewNote: "podgląd · profil demo",
    previewNext: "następny krok w prawdziwym uruchomieniu",
    dClaudeMd: "Pliki CLAUDE.md",
    dFix: "Wyłącz: ai-kit doctor --fix",
    dFixing: "Wyłączam balast",
    dSkillsN: "skilli",
    wPr: "agenci review PR: komentarze, testy, błędy",
    wCommit: "workflow git: komendy commit/push",
    wPlaywright: "testy e2e w przeglądarce",
    wGo: "typy i nawigacja dla Go",
    wTerraform: "integracja Terraform / IaC",
    wMd: "audyt i odchudzenie CLAUDE.md",
    wSimplify: "upraszcza kod dla czytelności",
    wFeature: "prowadzony, etapowy rozwój funkcji",
    rContent: "praca z treścią → pakiet marketingowy zostaje włączony",
    dDupes: "Duplikaty / konflikty",
    dupSerena: "serena dubluje graphify — zostaw jedno",
    dCostNote: "zapytań/dzień · cena wejścia Sonnet, z grubsza",
    uNoProfile: "Brak zapisanego profilu — najpierw uruchom `ai-kit`",
    pSaved: "profil zapisany → `ai-kit update` planuje ponownie bez ankiety",
    vTitle: "Sprawdzenie instalacji",
    vOk: "ok",
    vFail: "brak",
    pUse: "Jak używać",
    useAuto: "włącza się sam, gdy trzeba",
    planFile: "Plan zapisany:",
    manDo: "Wykonaj po kolei",
    manVerify: "Sprawdź",
    manBallast: "Potem wyłącz balast",
    wLsp: "precyzyjna nawigacja i typy",
    wLaravel: "zestaw Laravel (artisan, modele…)",
    scAi: "AI na tej maszynie",
    scCli: "Asystenci CLI",
    scApps: "Aplikacje desktopowe",
    scModels: "Modele LLM",
    scCloud: "Klucze chmurowe",
    scMcp: "Skonfigurowane serwery MCP",
    scProjects: "Projekty",
    scNone: "nic nie znaleziono",
    scPrivacy: "czyta tylko nazwy folderów i manifesty · nic nie jest wysyłane",
    scGuess: "Wygląda na twój stack — zaznaczone poniżej, potwierdź Enterem",
    dsTitle: "Znalezione dla twojego stacku (niezweryfikowane)",
    dsNone: "nic nowego",
    dsHave: "już skonfigurowane",
    dsNote: "gwiazdki · ostatni commit — nie sprawdzaliśmy, przeczytaj README przed instalacją",
    dsSearching: "szukam na GitHub · npm · PyPI…",
    repFound: "Odkryte dla twojego stacku",
    repUnverified: "niezweryfikowane",
    repHave: "już skonfigurowane",
    kMobile: "Mobile",
    kMl: "Aplikacje AI / ML / LLM",
    qStackMob: "Stack mobilny?",
    qAssist: "Z jakich asystentów AI korzystasz?",
    aClaude: "Claude Code (CLI / rozszerzenie IDE)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / rozszerzenie IDE)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Co wkurza najbardziej?",
    pContext: "Czyta pliki od nowa, pali kontekst",
    pStale: "Przestarzałe API / wersje bibliotek",
    pQuality: "Psuje testy, niechlujny kod",
    pSlow: "Za wolno, za dużo tam i z powrotem",
    pProject: "Nie zna mojego projektu",
    pBrowser: "Nie dosięga przeglądarki / bazy / usług",
    qDb: "Z jakimi bazami pracujesz?",
    qSvc: "Jakie usługi podłączyć?",
    qTeam: "Solo czy zespół?",
    tSolo: "Solo",
    tTeam: "Zespół — PR-y, review",
    rTeam: "zespół → review PR + konwencje commitów trzymają historię w porządku",
    rMobile: "mobile → precyzyjny LSP pod platformę, bez narzędzi UI",
    wSoup: "dostrój LLM z jednego YAML-a na GPU laptopa",
    scCfg: "Skonfigurowane (bez CLI)",
    scFind: "Wnioski",
    fNoMcp: "{host}: brak serwerów MCP — plan podłączy potrzebne",
    fMcp: "{host}: skonfigurowanych serwerów MCP — {n}",
    fCfgNoCli: "{name}: konto/konfiguracja jest, CLI nie zainstalowane",
    fModelsNoRuntime: "modele w cache HF, ale brak środowiska do uruchomienia (Ollama / LM Studio)",
    fNoRules: "brak instrukcji dla AI (CLAUDE.md / AGENTS.md / .cursorrules) w {n} z {m} projektów",
    scNext: "co dodać, a co usunąć — zdecyduje plan po ankiecie · koszt kontekstu — `ai-kit doctor`",
    iTitle: "Podłączyć też znalezione? (zaznacz)",
    iSkip: "— pomiń —",
    iInto: "Podłączam do",
    iDone: "podłączone",
    iExists: "już było",
    iFail: "nie udało się",
    iNoHost: "wybranych asystentów nie ma na tej maszynie — tylko komendy:",
    iBackup: "kopie konfiguracji leżą obok każdego pliku (*.bak-<czas>)",
    iAutoSkip: "--yes instaluje tylko zestaw kuratorski; znalezione wymaga jawnego wyboru",
    iResult: "Znalezione narzędzia — wynik",
    wPonytail: "mniej kodu → mniej tokenów i poprawek",
    wGraphify: "graf kodu zamiast ponownego czytania plików",
    wContext7: "świeża dokumentacja bibliotek na bieżąco",
    wTs: "precyzyjna nawigacja i typy dla TS/JS",
    wPy: "typy i analiza dla Pythona",
    wMatt: "inżynieria: TDD, review, specyfikacje",
    wFrontend: "porządne UI, nie z szablonu",
    dBallast: "Pluginy-balast (bezużyteczne dla dev, zjadają kontekst)",
    dNone: "Brak balastu — czysta instalacja",
    dTotal: "Balast w KAŻDYM zapytaniu",
    dTokens: "tokenów",
    dBig: "ciężko! warto przyciąć",
    rHeavy: "godziny w AI codziennie → ponytail + graphify mocno tną tokeny",
    rVibe: "vibe-coding → TDD/review + ponytail chronią kod",
    rNew: "początkujący → najpierw barierki: review, testy, minimum kodu",
    rPro: "doświadczony → precyzyjne narzędzia (LSP), bez prowadzenia za rękę",
    qStackFe: "Stack frontendowy?",
    qStackBe: "Stack backendowy?",
    support: "Zrobił jeden człowiek. Jeśli oszczędziło ci godzinę, ★ na github.com/hasabasa/ai-kit da mi o tym znać.",
    repBecause: "wybrano z powodu", repFile: "Raport:",
  },
  sq: {
    tagline1: "Zgjidh mjetet e duhura për punën tënde", tagline2: "AI më i saktë · më pak tokena · vetëm ato që duhen",
    hintMulti: "↑↓ lëviz · hapësirë — disa · enter — tjetri · esc — prapa",
    hintSingle: "↑↓ lëviz · enter — tjetri · esc — prapa",
    own: "opsioni yt", ownPrompt: "opsioni yt: ", enFallback: "",
    qKind: "Çfarë zhvillon?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Të dhëna / analitikë", kContent: "Përmbajtje", kDevops: "DevOps / server",
    qGoal: "Qëllimi kryesor?", gTokens: "Kursim tokenash", gQuality: "Cilësia e kodit", gSpeed: "Shpejtësia",
    qUsage: "Sa e përdor AI-n?", uLight: "Pak (<1o/ditë)", uMed: "1–3o/ditë", uHeavy: "3–6o/ditë", uAllday: "Gjithë ditën (6o+)",
    qSkill: "Sa mirë kodon me dorë?", sPro: "I sigurt (senior/mid)", sLearn: "Kodoj por shikoj", sVibe: "Kryesisht AI shkruan", sNew: "Fillestar",
    recommend: "Rekomandohet", disable: "Çaktivizo — barrë, ha kontekstin",
    installQ: "Instalo të gjitha? ", installing: "Po instaloj", done: "U krye", nochange: "Ok, asgjë nuk ndryshoi.", restart: "rinis editorin/sesionin",
    dApprox: "përafërsisht", dConfigs: "Skedarë konfigurimi (të gjithë)", dSkillsBox: "Aftësi",
    pWhy: "Pse të përshtatet", aFound: "Asistentë AI u gjetën", aOk: "mbështetet", aSoon: "së shpejti",
    mHow: "Si instalojmë?", mAuto: "Automatikisht — unë ekzekutoj", mManual: "Manualisht — jep hapat",
    mCancel: "Anulo", repTitle: "Raporti yt personal", repProfile: "Profili yt",
    hintMultiN: "numra të ndarë me presje",
    hintSingleN: "numër",
    qLang: "Gjuhët / stack-u?",
    lOther: "Tjetër",
    needUv: "kërkon uv: ",
    needClaude: "kërkon Claude CLI: ",
    disabling: "Po çaktivizoj balastin",
    previewNote: "paraparje · profil demo",
    previewNext: "hapi tjetër në ekzekutim real",
    dClaudeMd: "Skedarët CLAUDE.md",
    dFix: "Çaktivizo: ai-kit doctor --fix",
    dFixing: "Po çaktivizoj balastin",
    dSkillsN: "aftësi",
    wPr: "agjentë rishikimi PR: komente, teste, gabime",
    wCommit: "rrjedha git: komanda commit/push",
    wPlaywright: "teste e2e në shfletues",
    wGo: "tipe dhe navigim për Go",
    wTerraform: "integrim Terraform / IaC",
    wMd: "auditon dhe hollon CLAUDE.md",
    wSimplify: "thjeshton kodin për qartësi",
    wFeature: "zhvillim i udhëhequr i veçorive me faza",
    rContent: "punë me përmbajtje → paketa e marketingut mbetet aktive",
    dDupes: "Dublikata / konflikte",
    dupSerena: "serena dublon graphify — mbaj njërin",
    dCostNote: "kërkesa/ditë · çmimi i hyrjes Sonnet, afërsisht",
    uNoProfile: "Nuk ka profil të ruajtur — ekzekuto fillimisht `ai-kit`",
    pSaved: "profili u ruajt → `ai-kit update` riplanifikon pa pyetësor",
    vTitle: "Kontrolli i instalimit",
    vOk: "ok",
    vFail: "mungon",
    pUse: "Si përdoret",
    useAuto: "aktivizohet vetë kur duhet",
    planFile: "Plani u ruajt:",
    manDo: "Ekzekuto me radhë",
    manVerify: "Verifiko",
    manBallast: "Pastaj çaktivizo balastin",
    wLsp: "navigim dhe tipe të sakta",
    wLaravel: "paketa Laravel (artisan, modele…)",
    scAi: "AI në këtë makinë",
    scCli: "Asistentë CLI",
    scApps: "Aplikacione desktop",
    scModels: "Modele LLM",
    scCloud: "Çelësa cloud",
    scMcp: "Serverë MCP të konfiguruar",
    scProjects: "Projekte",
    scNone: "asgjë nuk u gjet",
    scPrivacy: "lexon vetëm emrat e dosjeve dhe manifestet · asgjë nuk dërgohet",
    scGuess: "Duket si stack-u yt — i zgjedhur më poshtë, konfirmo me Enter",
    dsTitle: "U gjet për stack-un tënd (e paverifikuar)",
    dsNone: "asgjë e re",
    dsHave: "i konfiguruar tashmë",
    dsNote: "yje · commit-i i fundit — nuk e kemi verifikuar, lexo README para instalimit",
    dsSearching: "po kërkoj në GitHub · npm · PyPI…",
    repFound: "Zbuluar për stack-un tënd",
    repUnverified: "e paverifikuar",
    repHave: "i konfiguruar tashmë",
    kMobile: "Mobile",
    kMl: "Aplikacione AI / ML / LLM",
    qStackMob: "Stack-u mobile?",
    qAssist: "Cilët asistentë AI përdor?",
    aClaude: "Claude Code (CLI / shtesë IDE)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / shtesë IDE)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Çfarë të bezdis më shumë?",
    pContext: "Rilexon skedarët, djeg kontekstin",
    pStale: "API / versione librarish të vjetruara",
    pQuality: "Prish testet, kod i pakujdesshëm",
    pSlow: "Shumë i ngadaltë, shumë vajtje-ardhje",
    pProject: "Nuk e njeh projektin tim",
    pBrowser: "Nuk arrin shfletuesin / DB / shërbimet",
    qDb: "Me cilat baza të dhënash punon?",
    qSvc: "Cilat shërbime të lidhen?",
    qTeam: "Vetëm apo në ekip?",
    tSolo: "Vetëm",
    tTeam: "Ekip — PR, rishikime",
    rTeam: "ekip → rishikimi i PR + rregullat e commit-eve mbajnë historikun të pastër",
    rMobile: "mobile → LSP i saktë për platformën, pa mjete UI",
    wSoup: "rregullo imët një LLM nga një YAML në GPU-në e laptopit",
    scCfg: "Të konfiguruar (pa CLI)",
    scFind: "Përfundime",
    fNoMcp: "{host}: pa serverë MCP — plani do të lidhë ata që të duhen",
    fMcp: "{host}: {n} serverë MCP të konfiguruar",
    fCfgNoCli: "{name}: llogaria/konfigurimi ekziston, CLI nuk është instaluar",
    fModelsNoRuntime: "modele në cache-in HF por pa mjedis për t'i ekzekutuar (Ollama / LM Studio)",
    fNoRules: "pa udhëzime AI (CLAUDE.md / AGENTS.md / .cursorrules) në {n} nga {m} projekte",
    scNext: "çfarë të shtohet a hiqet — vendos plani pas pyetësorit · kostoja e kontekstit — `ai-kit doctor`",
    iTitle: "Të lidhen edhe mjetet e gjetura? (zgjidh)",
    iSkip: "— kapërce —",
    iInto: "Po lidh në",
    iDone: "u lidh",
    iExists: "ekzistonte",
    iFail: "dështoi",
    iNoHost: "asistentët e zgjedhur nuk gjenden në këtë makinë — vetëm komanda:",
    iBackup: "kopjet rezervë të konfigurimeve janë pranë çdo skedari (*.bak-<koha>)",
    iAutoSkip: "--yes instalon vetëm grupin e kuruar; të gjeturat kërkojnë zgjedhje të qartë",
    iResult: "Mjetet e gjetura — rezultati",
    wPonytail: "më pak kod → më pak token dhe ndryshime",
    wGraphify: "graf kodi në vend të rileximit të skedarëve",
    wContext7: "dokumentacion i freskët i librarive në çast",
    wTs: "navigim dhe tipe të sakta për TS/JS",
    wPy: "tipe dhe analizë për Python",
    wMatt: "inxhinieri: TDD, rishikim, specifikime",
    wFrontend: "UI cilësore, jo shabllon",
    dBallast: "Shtojca balast (të padobishme për dev, hanë kontekst)",
    dNone: "Pa balast — instalim i pastër",
    dTotal: "Balast në ÇDO kërkesë",
    dTokens: "token",
    dBig: "i rëndë! ia vlen të shkurtohet",
    rHeavy: "orë të tëra AI çdo ditë → ponytail + graphify ulin ndjeshëm token-ët",
    rVibe: "vibe-coding → TDD/rishikim + ponytail e mbajnë kodin të sigurt",
    rNew: "fillestar → fillimisht parmakët: rishikim, teste, kod minimal",
    rPro: "me përvojë → mjete të sakta (LSP), pa dorëmbajtje",
    qStackFe: "Stack-u frontend?",
    qStackBe: "Stack-u backend?",
    support: "E bëri një njeri i vetëm. Nëse të kurseu një orë, një ★ në github.com/hasabasa/ai-kit është mënyra si e marr vesh.",
    repBecause: "u zgjodh sepse", repFile: "Raporti:",
  },
  uz: {
    tagline1: "Ishingizga mos vositalarni tanlang", tagline2: "Aniqroq AI · kam token · faqat kerakli",
    hintMulti: "↑↓ ko'chirish · bo'sh joy — bir nechtasini · enter — keyingi · esc — orqaga",
    hintSingle: "↑↓ ko'chirish · enter — keyingi · esc — orqaga",
    own: "o'z variantingiz", ownPrompt: "o'z variantingiz: ", enFallback: "",
    qKind: "Nima qilasiz?", kFe: "Frontend / UI", kBe: "Backend / API", kData: "Ma'lumotlar / tahlil", kContent: "Kontent", kDevops: "DevOps / server",
    qGoal: "Asosiy maqsad?", gTokens: "Token tejash", gQuality: "Kod sifati", gSpeed: "Tezlik",
    qUsage: "AI qanchalik ishlatiladi?", uLight: "Kam (<1s/kun)", uMed: "1–3s/kun", uHeavy: "3–6s/kun", uAllday: "Kun bo'yi (6s+)",
    qSkill: "Qo'lda kodlash darajangiz?", sPro: "Ishonchli (senior/mid)", sLearn: "Yozaman, lekin qarayman", sVibe: "Ko'pincha AI yozadi", sNew: "Yangi boshlovchi",
    recommend: "O'rnatish tavsiya etiladi", disable: "O'chirish — ortiqcha, kontekst yeydi",
    installQ: "Hammasini o'rnatish? ", installing: "O'rnatilmoqda", done: "Tayyor", nochange: "Hech narsa o'zgarmadi.", restart: "muharrirni/seansni qayta ishga tushiring",
    dApprox: "taxminiy", dConfigs: "Konfiguratsiya fayllari (barchasi)", dSkillsBox: "Ko'nikmalar",
    pWhy: "Nima uchun sizga mos", aFound: "AI yordamchilar topildi", aOk: "qo'llab-quvvatlanadi", aSoon: "tez orada",
    mHow: "Qanday o'rnatamiz?", mAuto: "Avtomatik — buyruqlarni bajaraman", mManual: "Qo'lda — qadamlarni bering",
    mCancel: "Bekor qilish", repTitle: "Shaxsiy sozlash hisobotingiz", repProfile: "Profilingiz",
    hintMultiN: "raqamlar vergul bilan",
    hintSingleN: "raqam",
    qLang: "Tillar / stek?",
    lOther: "Boshqa",
    needUv: "uv kerak: ",
    needClaude: "Claude CLI kerak: ",
    disabling: "Keraksiz plaginlar o'chirilmoqda",
    previewNote: "ko'rib chiqish · demo profil",
    previewNext: "haqiqiy ishga tushirishda keyingi qadam",
    dClaudeMd: "CLAUDE.md fayllari",
    dFix: "O'chirish: ai-kit doctor --fix",
    dFixing: "Keraksiz plaginlar o'chirilmoqda",
    dSkillsN: "ko'nikma",
    wPr: "PR ko'rib chiqish agentlari: izohlar, testlar, xatolar",
    wCommit: "git oqimi: commit/push buyruqlari",
    wPlaywright: "brauzer e2e testlari",
    wGo: "Go uchun turlar va navigatsiya",
    wTerraform: "Terraform / IaC integratsiyasi",
    wMd: "CLAUDE.md ni tekshiradi va ixchamlashtiradi",
    wSimplify: "kodni aniqroq bo'lishi uchun soddalashtiradi",
    wFeature: "bosqichma-bosqich funksiya ishlab chiqish",
    rContent: "kontent ishi → marketing paketi yoqilgan qoladi",
    dDupes: "Takrorlar / ziddiyatlar",
    dupSerena: "serena graphify ni takrorlaydi — bittasini qoldiring",
    dCostNote: "so'rov/kun · Sonnet kirish narxi, taxminan",
    uNoProfile: "Saqlangan profil yo'q — avval `ai-kit` ni ishga tushiring",
    pSaved: "profil saqlandi → `ai-kit update` so'rovnomasiz qayta rejalashtiradi",
    vTitle: "O'rnatish tekshiruvi",
    vOk: "ok",
    vFail: "yo'q",
    pUse: "Qanday ishlatish",
    useAuto: "kerak bo'lganda o'zi ishga tushadi",
    planFile: "Reja saqlandi:",
    manDo: "Tartib bilan bajaring",
    manVerify: "Tekshirish",
    manBallast: "Keyin keraksiz plaginlarni o'chiring",
    wLsp: "aniq navigatsiya va turlar",
    wLaravel: "Laravel to'plami (artisan, modellar…)",
    scAi: "Bu mashinadagi AI",
    scCli: "CLI yordamchilar",
    scApps: "Desktop ilovalar",
    scModels: "LLM modellari",
    scCloud: "Bulut kalitlari",
    scMcp: "Sozlangan MCP serverlar",
    scProjects: "Loyihalar",
    scNone: "hech narsa topilmadi",
    scPrivacy: "faqat papka nomlari va manifestlar o'qiladi · hech qayerga yuborilmaydi",
    scGuess: "Sizning stekingizga o'xshaydi — quyida belgilangan, Enter bilan tasdiqlang",
    dsTitle: "Stekingiz uchun topildi (tekshirilmagan)",
    dsNone: "yangi narsa yo'q",
    dsHave: "allaqachon sozlangan",
    dsNote: "yulduzlar · oxirgi commit — biz tekshirmadik, o'rnatishdan oldin README ni o'qing",
    dsSearching: "GitHub · npm · PyPI da qidirilmoqda…",
    repFound: "Stekingiz uchun topilgan",
    repUnverified: "tekshirilmagan",
    repHave: "allaqachon sozlangan",
    kMobile: "Mobil",
    kMl: "AI / ML / LLM ilovalar",
    qStackMob: "Mobil stek?",
    qAssist: "Qaysi AI yordamchilardan foydalanasiz?",
    aClaude: "Claude Code (CLI / IDE kengaytmasi)",
    aGemini: "Gemini (CLI / Code Assist / Antigravity)",
    aCodex: "Codex (CLI / IDE kengaytmasi)",
    aCopilot: "GitHub Copilot (IDE / CLI)",
    qPain: "Eng ko'p nima bezovta qiladi?",
    pContext: "Fayllarni qayta o'qiydi, kontekstni yeydi",
    pStale: "Eskirgan API / kutubxona versiyalari",
    pQuality: "Testlarni buzadi, pala-partish kod",
    pSlow: "Juda sekin, ko'p u yoq-bu yoq",
    pProject: "Mening loyihamni bilmaydi",
    pBrowser: "Brauzer / DB / xizmatlarga yeta olmaydi",
    qDb: "Qaysi ma'lumotlar bazalari bilan ishlaysiz?",
    qSvc: "Qaysi xizmatlarni ulaymiz?",
    qTeam: "Yolg'izmi yoki jamoami?",
    tSolo: "Yolg'iz",
    tTeam: "Jamoa — PR, ko'rib chiqish",
    rTeam: "jamoa → PR ko'rib chiqish + commit qoidalari tarixni toza saqlaydi",
    rMobile: "mobil → platforma uchun aniq LSP, UI vositalari kerak emas",
    wSoup: "bitta YAML bilan noutbuk GPU sida LLM ni sozlash",
    scCfg: "Sozlangan (CLI yo'q)",
    scFind: "Xulosalar",
    fNoMcp: "{host}: MCP serverlar yo'q — reja keraklilarini ulaydi",
    fMcp: "{host}: {n} ta MCP server sozlangan",
    fCfgNoCli: "{name}: hisob/sozlama bor, CLI o'rnatilmagan",
    fModelsNoRuntime: "HF keshida modellar bor, lekin ishga tushirish muhiti yo'q (Ollama / LM Studio)",
    fNoRules: "{m} loyihadan {n} tasida AI ko'rsatmalari (CLAUDE.md / AGENTS.md / .cursorrules) yo'q",
    scNext: "nimani qo'shish yoki olib tashlash — so'rovnomadan keyin reja hal qiladi · kontekst narxi — `ai-kit doctor`",
    iTitle: "Topilgan vositalarni ham ulaymizmi? (belgilang)",
    iSkip: "— o'tkazib yuborish —",
    iInto: "Ulanmoqda",
    iDone: "ulandi",
    iExists: "allaqachon bor",
    iFail: "bo'lmadi",
    iNoHost: "tanlangan yordamchilar bu mashinada topilmadi — faqat buyruqlar:",
    iBackup: "sozlama nusxalari har bir fayl yonida (*.bak-<vaqt>)",
    iAutoSkip: "--yes faqat saralangan to'plamni o'rnatadi; topilganlar aniq tanlovni talab qiladi",
    iResult: "Topilgan vositalar — natija",
    wPonytail: "kamroq kod → kamroq token va tahrir",
    wGraphify: "fayllarni qayta o'qish o'rniga kod grafi",
    wContext7: "yangi kutubxona hujjatlari darhol",
    wTs: "TS/JS uchun aniq navigatsiya va turlar",
    wPy: "Python uchun turlar va tahlil",
    wMatt: "muhandislik: TDD, ko'rib chiqish, spetsifikatsiya",
    wFrontend: "sifatli UI, shablon emas",
    dBallast: "Keraksiz plaginlar (dev uchun foydasiz, kontekstni yeydi)",
    dNone: "Keraksiz plagin yo'q — o'rnatish toza",
    dTotal: "HAR so'rovda keraksiz yuk",
    dTokens: "token",
    dBig: "og'ir! qisqartirishga arziydi",
    rHeavy: "har kuni soatlab AI → ponytail + graphify tokenni keskin kamaytiradi",
    rVibe: "vibe-coding → TDD/ko'rib chiqish + ponytail kodni xavfsiz saqlaydi",
    rNew: "yangi boshlovchi → avval to'siqlar: ko'rib chiqish, testlar, minimal kod",
    rPro: "tajribali → aniq vositalar (LSP), ortiqcha g'amxo'rliksiz",
    qStackFe: "Frontend stek?",
    qStackBe: "Backend stek?",
    support: "Bir odam yasagan. Bir soat tejagan bo'lsa — github.com/hasabasa/ai-kit dagi ★ menga shuni bildiradi.",
    repBecause: "tanlash sababi", repFile: "Hisobot:",
  },
};
const tr = code => ({ ...UI.en, ...(UI[code] || {}) });
// техназвания (React / Next.js, PostgreSQL, Figma…) одни на все языки и нарочно не переводятся
const TECH_KEYS = new Set(["fReact", "fVue", "fAngular", "fSvelte", "fPlain", "bNode", "bPy", "bGo", "bPhp", "bJvm", "bCs", "bRuby", "bRust", "bSwift", "bC",
  "dPg", "dMy", "dMongo", "dRedis", "dSupa", "dSqlite", "vGit", "vFigma", "vTrack", "vDocs", "vChat", "vCloud", "vDeploy", "mSwift", "mKotlin", "mFlutter", "mRn", "aCursor", "lTs", "lPy", "lGo"]);
FULL = new Set(Object.keys(UI).filter(l => Object.keys(UI.en).filter(k => !TECH_KEYS.has(k) && !(k in UI[l])).length <= 5));

// ── Каталог ───────────────────────────────────────────────────────────────────
const CATALOG = [
  { id: "ponytail", why: "wPonytail", tags: ["always"], use: "/ponytail-help",
    repo: "DietrichGebert/ponytail", scope: "claude",
    demoB: "'add caching' → +120 lines, CacheManager class",
    demoA: "@lru_cache(maxsize=1000) — 1 line",
    install: ["claude plugin marketplace add DietrichGebert/ponytail", "claude plugin install ponytail@ponytail -y"] },
  { id: "graphify", why: "wGraphify", tags: ["code", "save-tokens"], needs: ["uv"], bin: "graphify",
    use: "graphify update .  →  /graphify", repo: "Graphify-Labs/graphify", scope: "any",
    demoB: "agent re-reads 40 files ≈ 60k tokens",
    demoA: "graph query ≈ 3k tokens",
    install: ["uv tool install graphifyy", "graphify install"] },
  { id: "context7", why: "wContext7", tags: ["code", "docs"], repo: "upstash/context7", scope: "mcp",
    demoB: "API from 2023 memory → deprecated code",
    demoA: "pulls today's docs before writing",
    install: ["claude plugin install context7@anthropic-plugin-directory -y"],
    altInstall: { cursor: "Add MCP server: npx -y @anthropic-ai/context7-mcp@latest", gemini: "gemini mcp add context7 -- npx -y @anthropic-ai/context7-mcp@latest" } },
  { id: "typescript-lsp", why: "wTs", tags: ["ts"],
    demoB: "grep usages across the repo",
    demoA: "exact refs & types in milliseconds",
    install: ["claude plugin install typescript-lsp@anthropic-plugin-directory -y"] },
  { id: "pyright-lsp", why: "wPy", tags: ["python"],
    demoB: "grep usages across the repo",
    demoA: "exact refs & types in milliseconds",
    install: ["claude plugin install pyright-lsp@anthropic-plugin-directory -y"] },
  { id: "mattpocock-skills", why: "wMatt", tags: ["ts", "quality"],
    use: "mattpocock-skills:tdd · :code-review · :to-spec", repo: "mattpocock/skills",
    demoB: "write tests → agent writes code first, tests after",
    demoA: "/tdd — tests first, code passes them",
    install: ["claude plugin marketplace add mattpocock/skills", "claude plugin install mattpocock-skills@mattpocock -y"] },
  { id: "frontend-design", why: "wFrontend", tags: ["frontend"],
    demoB: "generic Inter + purple gradient UI",
    demoA: "distinctive typography, original palette, memorable design",
    install: ["claude plugin install frontend-design@anthropic-plugin-directory -y"] },
  { id: "pr-review-toolkit", why: "wPr", tags: ["code", "quality", "team"],
    demoB: "manual PR review, miss edge cases",
    demoA: "automated comments on bugs, tests, style",
    install: ["claude plugin install pr-review-toolkit@anthropic-plugin-directory -y"] },
  { id: "commit-commands", why: "wCommit", tags: ["code", "team"],
    demoB: "git add . && git commit -m 'fix stuff'",
    demoA: "/commit — staged diff → meaningful message",
    install: ["claude plugin install commit-commands@anthropic-plugin-directory -y"] },
  { id: "playwright", why: "wPlaywright", tags: ["frontend", "browser"],
    demoB: "click through flows manually after each change",
    demoA: "e2e test suite runs on every commit",
    install: ["claude plugin install playwright@anthropic-plugin-directory -y"] },
  { id: "gopls-lsp", why: "wGo", tags: ["go"],
    demoB: "grep for function callers",
    demoA: "jump-to-definition, all references, rename",
    install: ["claude plugin install gopls-lsp@anthropic-plugin-directory -y"] },
  { id: "php-lsp", why: "wLsp", tags: ["php"],
    demoB: "grep for class/method usage",
    demoA: "exact refs, types, completion in ms",
    install: ["claude plugin install php-lsp@anthropic-plugin-directory -y"] },
  { id: "laravel-boost", why: "wLaravel", tags: ["php"],
    demoB: "manually check artisan, routes, models",
    demoA: "artisan commands, model relations, route list built-in",
    install: ["claude plugin install laravel-boost@anthropic-plugin-directory -y"] },
  { id: "jdtls-lsp", why: "wLsp", tags: ["java"],
    demoB: "grep for class usage across packages",
    demoA: "type hierarchy, all references, refactor",
    install: ["claude plugin install jdtls-lsp@anthropic-plugin-directory -y"] },
  { id: "kotlin-lsp", why: "wLsp", tags: ["kotlin"],
    demoB: "grep for function callers",
    demoA: "exact refs & types in milliseconds",
    install: ["claude plugin install kotlin-lsp@anthropic-plugin-directory -y"] },
  { id: "csharp-lsp", why: "wLsp", tags: ["csharp"],
    demoB: "grep for class usage",
    demoA: "exact refs & types in milliseconds",
    install: ["claude plugin install csharp-lsp@anthropic-plugin-directory -y"] },
  { id: "ruby-lsp", why: "wLsp", tags: ["ruby"],
    demoB: "grep for method callers",
    demoA: "exact refs & types in milliseconds",
    install: ["claude plugin install ruby-lsp@anthropic-plugin-directory -y"] },
  { id: "rust-analyzer-lsp", why: "wLsp", tags: ["rust"],
    demoB: "grep for trait implementors",
    demoA: "exact refs, types, lifetime analysis",
    install: ["claude plugin install rust-analyzer-lsp@anthropic-plugin-directory -y"] },
  { id: "swift-lsp", why: "wLsp", tags: ["swift"],
    demoB: "grep for protocol conformance",
    demoA: "exact refs & types in milliseconds",
    install: ["claude plugin install swift-lsp@anthropic-plugin-directory -y"] },
  { id: "clangd-lsp", why: "wLsp", tags: ["cpp"],
    demoB: "grep for symbol across headers/sources",
    demoA: "exact refs, includes, type info in ms",
    install: ["claude plugin install clangd-lsp@anthropic-plugin-directory -y"] },
  { id: "terraform", why: "wTerraform", tags: ["devops"],
    demoB: "manually validate HCL, check state drift",
    demoA: "plan/apply integration, state awareness",
    install: ["claude plugin install terraform@anthropic-plugin-directory -y"] },
  { id: "claude-md-management", why: "wMd", tags: ["save-tokens"],
    demoB: "168KB CLAUDE.md → 42k tokens every request",
    demoA: "audited & trimmed → 8k tokens, same coverage",
    install: ["claude plugin install claude-md-management@anthropic-plugin-directory -y"] },
  { id: "code-simplifier", why: "wSimplify", tags: ["quality"],
    demoB: "AbstractFactoryProviderImpl — 200 lines",
    demoA: "plain function — 12 lines, same result",
    install: ["claude plugin install code-simplifier@anthropic-plugin-directory -y"] },
  { id: "soup", why: "wSoup", tags: ["llm"], scope: "any", repo: "MakazhanAlpamys/Soup", bin: "soup", needs: ["python"],
    use: "soup init --template chat  →  soup train",
    demoB: "fine-tuning = rented GPU box, SSH, 24 GB VRAM, config hell",
    demoA: "one YAML, one command — 8B model on a 4 GB laptop GPU",
    install: ["pip install \"soup-cli[train]\""] },
  { id: "feature-dev", why: "wFeature", tags: ["code", "speed"],
    demoB: "'add auth' → agent writes everything at once, misses steps",
    demoA: "guided phases: plan → scaffold → implement → test",
    install: ["claude plugin install feature-dev@anthropic-plugin-directory -y"] },
];
const BALLAST = ["marketing", "legal", "human-resources", "operations", "product-management", "enterprise-search", "finance", "sales"];
const ballastFor = tags => BALLAST.filter(b => !(tags.has("content") && b === "marketing"));
const pick = tags => CATALOG.filter(it => it.tags.some(t => t === "always" || tags.has(t)));
// персональные причины: метка профиля → строка «почему тебе»
const REASONS = [["heavy", "rHeavy"], ["vibe", "rVibe"], ["newbie", "rNew"], ["pro", "rPro"], ["content", "rContent"], ["team", "rTeam"], ["mobile", "rMobile"]];
// свободный текст → метки (иначе «фулстек» не дал бы ничего)
const SYN = { "фулстек": ["code", "frontend", "backend", "ts"], "fullstack": ["code", "frontend", "backend", "ts"],
  "full-stack": ["code", "frontend", "backend", "ts"], "веб": ["code", "frontend"], "web": ["code", "frontend"],
  "сайт": ["code", "frontend"], "api": ["code", "backend"], "бэкенд": ["code", "backend"], "backend": ["code", "backend"],
  "данные": ["code", "python"], "data": ["code", "python"], "ml": ["code", "python"],
  "devops": ["code", "devops"], "сервер": ["code", "devops"], "инфра": ["code", "devops"],
  "контент": ["content"], "content": ["content"],
  "react": ["ts", "react"], "next": ["ts", "react"], "nextjs": ["ts", "react"], "vue": ["ts", "vue"],
  "nuxt": ["ts", "vue"], "angular": ["ts", "angular"], "svelte": ["ts", "svelte"],
  "laravel": ["php", "backend"], "php": ["php", "backend"], "django": ["python", "backend"],
  "fastapi": ["python", "backend"], "rails": ["ruby", "backend"], "ruby": ["ruby", "backend"],
  "java": ["java", "backend"], "kotlin": ["kotlin", "backend"], "rust": ["rust", "backend"],
  "swift": ["swift"], "ios": ["swift"], "flutter": ["code"], "node": ["ts", "backend"] };
const expandWord = (tags, w) => (SYN[w] || [w]).forEach(x => tags.add(x));

const QUESTIONS = [
  { q: "qKind", multi: true, items: [
    { k: "kFe", tags: ["code", "frontend"] }, { k: "kBe", tags: ["code", "backend"] }, { k: "kMobile", tags: ["code", "mobile"] },
    { k: "kData", tags: ["code", "python", "data"] }, { k: "kMl", tags: ["code", "python", "data", "llm"] },
    { k: "kDevops", tags: ["code", "devops"] }, { k: "kContent", tags: ["content"] } ] },
  // адаптивные: задаются только если выбрана соответствующая роль (when — любой из тегов)
  { q: "qStackFe", when: ["frontend"], multi: true, items: [
    { k: "fReact", tags: ["ts", "react"] }, { k: "fVue", tags: ["ts", "vue"] },
    { k: "fAngular", tags: ["ts", "angular"] }, { k: "fSvelte", tags: ["ts", "svelte"] },
    { k: "fPlain", tags: ["ts", "plain"] } ] },
  { q: "qStackBe", when: ["backend"], multi: true, items: [
    { k: "bNode", tags: ["ts"] }, { k: "bPy", tags: ["python"] }, { k: "bGo", tags: ["go"] },
    { k: "bPhp", tags: ["php"] }, { k: "bJvm", tags: ["java", "kotlin"] }, { k: "bCs", tags: ["csharp"] },
    { k: "bRuby", tags: ["ruby"] }, { k: "bRust", tags: ["rust"] }, { k: "bSwift", tags: ["swift"] },
    { k: "bC", tags: ["cpp"] } ] },
  { q: "qStackMob", when: ["mobile"], multi: true, items: [
    { k: "mSwift", tags: ["swift"] }, { k: "mKotlin", tags: ["kotlin"] }, { k: "mFlutter", tags: ["flutter"] }, { k: "mRn", tags: ["ts", "react"] } ] },
  { q: "qDb", when: ["backend", "data", "mobile"], multi: true, items: [
    { k: "dPg", tags: ["postgres"] }, { k: "dMy", tags: ["mysql"] }, { k: "dMongo", tags: ["mongodb"] },
    { k: "dRedis", tags: ["redis"] }, { k: "dSupa", tags: ["supabase"] }, { k: "dSqlite", tags: ["sqlite"] } ] },
  { q: "qSvc", multi: true, items: [
    { k: "vGit", tags: ["github"] }, { k: "vFigma", tags: ["figma"] }, { k: "vTrack", tags: ["jira"] }, { k: "vDocs", tags: ["notion"] },
    { k: "vChat", tags: ["slack"] }, { k: "vCloud", tags: ["cloud"] }, { k: "vDeploy", tags: ["vercel"] } ] },
  // боль вместо абстрактной «цели»: теги те же (save-tokens / quality / speed), но вопрос отвечается честнее
  { q: "qPain", multi: true, items: [
    { k: "pContext", tags: ["save-tokens", "context"] }, { k: "pStale", tags: ["docs"] }, { k: "pQuality", tags: ["quality"] },
    { k: "pSlow", tags: ["speed"] }, { k: "pProject", tags: ["context"] }, { k: "pBrowser", tags: ["browser"] } ] },
  { q: "qAssist", multi: true, items: [
    { k: "aClaude", tags: ["claude"] }, { k: "aCursor", tags: ["cursor"] }, { k: "aGemini", tags: ["gemini"] },
    { k: "aCodex", tags: ["codex"] }, { k: "aCopilot", tags: ["copilot"] } ] },
  { q: "qUsage", multi: false, items: [
    { k: "uLight", tags: [] }, { k: "uMed", tags: [] }, { k: "uHeavy", tags: ["save-tokens", "heavy"] }, { k: "uAllday", tags: ["save-tokens", "heavy"] } ] },
  { q: "qSkill", multi: false, items: [
    { k: "sPro", tags: ["pro"] }, { k: "sLearn", tags: ["quality"] }, { k: "sVibe", tags: ["quality", "save-tokens", "vibe"] }, { k: "sNew", tags: ["quality", "newbie"] } ] },
  { q: "qTeam", multi: false, items: [ { k: "tSolo", tags: ["solo"] }, { k: "tTeam", tags: ["team"] } ] },
];

// ── Ввод: строка (cooked) и меню (стрелки в TTY, иначе номера) ────────────────
const BACK = Symbol("back"); // esc/← в меню — вернуться на шаг
// вне TTY (pipe, CI) readline отдаёт все строки разом, и те, что пришли между вопросами, терялись — читаем stdin целиком в очередь
let pipeLines = null;
async function ask(q) {
  if (!input.isTTY) { pipeLines ??= (() => { try { return fs.readFileSync(0, "utf8").split(/\r?\n/); } catch { return []; } })();
    const a = pipeLines.length ? pipeLines.shift() : ""; output.write(q + a + "\n"); return a; }
  const rl = readline.createInterface({ input, output }); try { return await rl.question(q); } finally { rl.close(); } }

function menuTTY(title, hint, labels, multi, pre = []) {
  return new Promise(res => {
    let idx = pre[0] ?? 0; const sel = new Set(multi ? pre : []); let drawn = 0;
    const render = () => {
      const out = ["  " + c.b(title) + "  " + c.d("(" + hint + ")")];
      labels.forEach((l, i) => {
        const cur = i === idx, ptr = cur ? grad("❯") : " ";
        const mark = multi ? (sel.has(i) ? c.g("◉ ") : c.d("◯ ")) : "";
        out.push(`  ${ptr} ${mark}${cur ? c.b(l) : l}`);
      });
      if (drawn) output.write(`\x1b[${drawn}A`);
      output.write(out.map(l => "\x1b[2K" + l).join("\n") + "\n");
      drawn = out.length;
    };
    // одиночный Esc Node отдаёт только по таймауту (500 мс по умолчанию): нажал Esc и сразу стрелку —
    // склеились и потерялись. Декодер на stdin ставится один раз, поэтому таймаут задаём здесь.
    if (!menuTTY.keysOn) { rlcore.emitKeypressEvents(input, { escapeCodeTimeout: 40 }); menuTTY.keysOn = true; }
    input.setRawMode(true);
    input.resume(); // readline из ask() ставит stdin на паузу — без resume меню «умирает»
    render();
    const done = sel2 => { input.setRawMode(false); input.pause();
      input.removeListener("keypress", onKey); res(sel2); };
    const onKey = (s, k) => {
      if (k.name === "up") idx = (idx - 1 + labels.length) % labels.length;
      else if (k.name === "down") idx = (idx + 1) % labels.length;
      else if (k.name === "space" && multi) { sel.has(idx) ? sel.delete(idx) : sel.add(idx); }
      else if (k.ctrl && k.name === "c") { input.setRawMode(false); console.log(); process.exit(0); }
      else if (k.name === "escape" || k.name === "left") return done(BACK); // назад
      else if (k.name === "return") {
        if (!multi || sel.size === 0) sel.add(idx); // enter на пустом мультивыборе = взять подсвеченный
        return done(sel); }
      render();
    };
    input.on("keypress", onKey);
  });
}

async function menu(t, title, labels, multi, allowOwn = true, pre = []) {
  const rows = allowOwn ? [...labels, c.d("✎ " + t.own)] : [...labels];
  let sel;
  if (input.isTTY) {
    sel = await menuTTY(title, multi ? t.hintMulti : t.hintSingle, rows, multi, pre);
    if (sel === BACK) return { back: true, sel: new Set(), custom: false };
  } else {
    console.log("  " + c.b(title) + "  " + c.d("(" + (multi ? t.hintMultiN : t.hintSingleN) + (allowOwn ? "; 0 — " + t.own : "") + ")"));
    rows.forEach((l, i) => console.log(`   ${c.b(String(i + 1))} ${c.d("◦")} ${l}`));
    const raw = await ask("  " + grad("›") + " ");
    sel = new Set();
    for (const tok of raw.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
      if (allowOwn && tok === "0") sel.add(rows.length - 1);
      else { const n = parseInt(tok, 10); if (n >= 1 && n <= rows.length) sel.add(n - 1); }
    }
  }
  const custom = allowOwn && sel.has(rows.length - 1);
  if (allowOwn) sel.delete(rows.length - 1);
  return { sel, custom };
}

async function choose(t, def, guess = new Set()) {
  const pre = def.items.map((it, i) => it.tags.length && it.tags.every(x => guess.has(x)) ? i : -1).filter(i => i >= 0);
  const m = await menu(t, t[def.q], def.items.map(it => t[it.k]), def.multi, true, pre);
  if (m.back) return BACK;
  const tags = new Set(), src = []; // src: [метка, человекочитаемый ответ] — для отчёта «подобран из-за»
  for (const i of m.sel) { const it = def.items[i]; if (!it) continue;
    for (const x of it.tags) { tags.add(x); src.push([x, t[it.k]]); } }
  if (m.custom) { const txt = await ask("  " + grad("›") + c.d(" " + t.ownPrompt));
    for (const w of txt.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
      const before = new Set(tags); expandWord(tags, w);
      for (const x of tags) if (!before.has(x)) src.push([x, w]);
    } }
  return { tags, src };
}

async function chooseLang() {
  const title = "🌐 Choose language / Выбери язык";
  if (input.isTTY) { let sel;
    do { sel = await menuTTY(title, "↑↓ · enter", LANGS.map(l => l.name), false); } while (sel === BACK); // первый экран — назад некуда
    return LANGS[[...sel][0] ?? 0].code; }
  console.log("  " + c.b(title));
  LANGS.forEach((l, i) => console.log(`   ${c.b(String(i + 1).padStart(2))} ${c.d("◦")} ${l.name}`));
  const n = parseInt((await ask("  " + grad("›") + " ")).trim(), 10);
  return (n >= 1 && n <= LANGS.length) ? LANGS[n - 1].code : "en";
}

// ── Установка ────────────────────────────────────────────────────────────────
function have(bin) { try {
  execSync(process.platform === "win32" ? `where ${bin}` : `command -v ${bin}`, { stdio: "ignore" });
  return true; } catch { return false; } }

// ── Сеть: GitHub / npm / реестр MCP — best-effort, молча без сети ─────────────
const _fmtStars = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const UA = { accept: "application/json", "user-agent": "ai-kit/1" };
// свой токен (если задан) поднимает лимит поиска GitHub с 10 до 30 в минуту; только чтение публичного
const ghTok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const hdrs = url => ghTok && url.startsWith("https://api.github.com/") ? { ...UA, authorization: `Bearer ${ghTok}` } : UA;
async function getJson(url, signal) {
  try { const r = await fetch(url, { headers: hdrs(url), signal }); return r.ok ? await r.json() : null; } catch { return null; }
}
const withTimeout = async (ms, fn) => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fn(ac.signal); } finally { clearTimeout(t); } };

async function fetchMeta(catalog) {
  const meta = new Map();
  const repos = catalog.filter(it => it.repo);
  if (!repos.length || typeof globalThis.fetch !== "function") return meta;
  await withTimeout(6000, signal => Promise.allSettled(repos.map(async it => {
    const j = await getJson(`https://api.github.com/repos/${it.repo}`, signal);
    if (typeof j?.stargazers_count === "number") meta.set(it.id, { stars: j.stargazers_count });
  })));
  return meta;
}

// ── Discover: живой поиск под стек — GitHub по топикам, npm/PyPI для установки ──
// MCP-серверы ищем по сервисам (postgres, figma…), а не по языкам: «python» в имени даёт SDK, не инструмент
const MCP_KW = [["postgres", ["postgres"]], ["mysql", ["mysql"]], ["mongodb", ["mongodb"]], ["redis", ["redis"]], ["supabase", ["supabase"]], ["sqlite", ["sqlite"]],
  ["github", ["github"]], ["figma", ["figma"]], ["jira", ["jira", "linear"]], ["notion", ["notion"]], ["slack", ["slack"]], ["cloud", ["aws"]], ["vercel", ["vercel"]],
  ["browser", ["playwright", "puppeteer"]], ["context", ["memory"]], ["docs", ["docs"]], ["mobile", ["xcode", "android"]], ["llm", ["openai"]],
  ["backend", ["openapi"]], ["frontend", ["figma"]], ["devops", ["docker", "kubernetes", "terraform"]], ["data", ["jupyter"]], ["code", ["github"]],
  ["php", ["laravel"]], ["ruby", ["rails"]], ["swift", ["xcode"]]];
// плагины и скилы — экосистема маленькая: берём топ по звёздам и фильтруем у себя по словам стека
const LANG_KW = { react: "react", vue: "vue", angular: "angular", svelte: "svelte", python: "python", go: "golang", rust: "rust", php: "php", ruby: "ruby",
  java: "java", kotlin: "kotlin", csharp: "dotnet", swift: "swift", cpp: "cpp", ts: "typescript", frontend: "frontend", backend: "backend",
  devops: "devops", data: "data", "save-tokens": "token", quality: "review" };
const keywordsFor = (tags, n = ghTok ? 14 : 7) => { const out = []; for (const [tag, ws] of MCP_KW) if (tags.has(tag)) for (const w of ws) if (out.length < n && !out.includes(w)) out.push(w); return out; };
const CURATED_REPOS = new Set(CATALOG.map(it => it.repo).filter(Boolean));
const monthsAgo = iso => (Date.now() - Date.parse(iso)) / 2.63e9;

// ponytail: кэш ответов на час в одном файле — GitHub даёт 10 поисков/мин без токена, второй запуск подряд иначе пустой
const CACHE = path.join(os.tmpdir(), "ai-kit-net-cache.json");
let cacheAll = null; // один объект на процесс: параллельные запросы иначе затирали файл друг другу
async function cached(url, signal, text = false) {
  cacheAll ??= readJson(CACHE) || {}; const hit = cacheAll[url];
  if (hit && Date.now() - hit.at < 3600e3) return hit.v;
  let v = null;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000); signal?.addEventListener("abort", () => ac.abort(), { once: true });
  try { const r = await fetch(url, { headers: hdrs(url), signal: ac.signal }); if (r.ok) v = text ? await r.text() : await r.json(); } catch {} finally { clearTimeout(t); }
  if (v != null) { cacheAll[url] = { at: Date.now(), v }; try { fs.writeFileSync(CACHE, JSON.stringify(cacheAll)); } catch {} }
  return v;
}
const gh = (q, signal) => cached(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=20`, signal);

// команды подключения MCP в каждый хост. run: {pkg, py} — npx/uvx; {url} — удалённый сервер
function mcpInstall(name, run) {
  const argv = run.url ? null : run.py ? ["uvx", run.pkg] : ["npx", "-y", run.pkg];
  const sh = argv ? argv.join(" ") : null;
  return run.url ? {
    claude: `claude mcp add --transport http ${name} ${run.url}`,
    cursor: `~/.cursor/mcp.json → "mcpServers": {"${name}": {"url": "${run.url}"}}`,
    gemini: `gemini mcp add --transport http ${name} ${run.url}`,
    codex: `codex mcp add ${name} --url ${run.url}`,
  } : {
    claude: `claude mcp add ${name} -- ${sh}`,
    cursor: `~/.cursor/mcp.json → "mcpServers": {"${name}": {"command": "${argv[0]}", "args": ${JSON.stringify(argv.slice(1))}}}`,
    gemini: `gemini mcp add ${name} ${sh}`,
    codex: `codex mcp add ${name} -- ${sh}`,
  };
}
// как ставить найденный MCP: package.json с bin → npm; pyproject → PyPI; иначе — только ссылка
async function resolveInstall(f, signal) {
  const raw = `https://raw.githubusercontent.com/${f.repo}/HEAD/`;
  const pj = await cached(raw + "package.json", signal);
  if (pj?.name && pj.bin && await cached(`https://registry.npmjs.org/${encodeURIComponent(pj.name)}`, signal)) return { pkg: pj.name };
  const py = await cached(raw + "pyproject.toml", signal, true);
  const pn = py && py.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (pn && await cached(`https://pypi.org/pypi/${encodeURIComponent(pn)}/json`, signal)) return { pkg: pn, py: true };
  // реестр MCP не опрашиваем: 7 с на запрос и ни одного попадания за все пробы — сервер без пакета остаётся ссылкой
  return null;
}

async function discover(tags, haveMcp = new Set()) {
  if (typeof globalThis.fetch !== "function") return [];
  const kws = keywordsFor(tags);
  const langs = Object.entries(LANG_KW).filter(([t]) => tags.has(t)).map(([, w]) => w);
  const found = new Map();
  const add = (r, kind) => { if (found.has(r.full_name) || CURATED_REPOS.has(r.full_name) || /^awesome/i.test(r.name)) return;
    found.set(r.full_name, { name: r.name, repo: r.full_name, stars: r.stargazers_count, desc: r.description || "", pushed: r.pushed_at, kind, topics: r.topics || [] }); };
  const mentions = r => { const hay = (r.name + " " + (r.description || "") + " " + (r.topics || []).join(" ")).toLowerCase();
    return langs.some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(hay)); }; // по словам: «react» не должен ловить «reactive»
  await withTimeout(12000, async signal => {
    // GitHub: по сервису в имени репо для MCP + два топика экосистемы; ≤ 8 запросов — в лимит 10/мин укладываемся
    const [mcpRes, plugRes, skillRes] = await Promise.all([
      Promise.all(kws.map(k => gh(`topic:mcp-server ${k} in:name archived:false`, signal))), // скобки с OR рядом с in: GitHub молча отдаёт 0
      gh("topic:claude-code-plugin archived:false", signal),
      gh("topic:agent-skills archived:false", signal),
    ]);
    for (const res of mcpRes) for (const r of res?.items || []) add(r, "mcp");
    for (const r of plugRes?.items || []) if (mentions(r)) add(r, "plugin");
    for (const r of skillRes?.items || []) if (mentions(r)) add(r, "skill");
    const top = [...found.values()].filter(f => f.kind === "mcp" && f.stars >= 50).sort((a, b) => b.stars - a.stars).slice(0, 12);
    await Promise.all(top.map(async f => { const run = await resolveInstall(f, signal); if (run) { f.run = run; f.install = mcpInstall(f.name, run); } }));
  });
  // фильтр: живой, не игрушечный, не наш и не уже подключённый
  return [...found.values()]
    .filter(f => f.stars >= 50 && monthsAgo(f.pushed) <= 12)
    .map(f => ({ ...f, have: [...haveMcp].some(h => h.toLowerCase().includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(h.toLowerCase())) }))
    .sort((a, b) => b.stars - a.stars).slice(0, 30);
}

// ── Каталог (catalog.min.json.gz): свежий с GitHub раз в сутки, иначе встроенный ─────
const CATALOG_URL = "https://raw.githubusercontent.com/hasabasa/ai-kit/main/catalog.min.json.gz";
const CATALOG_CACHE = path.join(os.tmpdir(), "ai-kit-catalog.min.json.gz");
async function loadCatalog() {
  const parse = buf => { try { return JSON.parse(zlib.gunzipSync(buf).toString("utf8")).items; } catch { return null; } };
  try { const st = fs.statSync(CATALOG_CACHE); if (Date.now() - st.mtimeMs < 86400e3) { const v = parse(fs.readFileSync(CATALOG_CACHE)); if (v) return v; } } catch {}
  if (typeof globalThis.fetch === "function") {
    try { const r = await fetch(CATALOG_URL, { headers: UA, signal: AbortSignal.timeout(5000) });
      if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); const v = parse(buf); if (v) { try { fs.writeFileSync(CATALOG_CACHE, buf); } catch {} return v; } } } catch {}
  }
  try { return parse(fs.readFileSync(new URL("./catalog.min.json.gz", import.meta.url))) || []; } catch { return []; }
}

// метки профиля → слова для поиска. Только конкретные: «api», «ui», «python» ловят всё подряд и выносят наверх продукты на 100k★
const CAT_KW = { postgres: ["postgres", "postgresql"], mysql: ["mysql", "mariadb"], mongodb: ["mongodb", "mongo"], redis: ["redis"], supabase: ["supabase", "firebase"],
  sqlite: ["sqlite"], github: ["github", "gitlab"], figma: ["figma"], jira: ["jira", "linear"], notion: ["notion", "confluence"], slack: ["slack", "discord"],
  cloud: ["aws", "gcp", "azure"], vercel: ["vercel", "netlify"], browser: ["playwright", "puppeteer", "browser"], context: ["memory", "codebase", "knowledge-graph"],
  docs: ["documentation", "docs"], mobile: ["xcode", "android", "flutter", "ios"], llm: ["ollama", "rag", "embedding", "fine-tuning"],
  devops: ["docker", "kubernetes", "terraform", "k8s"], data: ["jupyter", "pandas", "duckdb"], react: ["react", "nextjs", "next.js"], vue: ["vue", "nuxt"],
  angular: ["angular"], svelte: ["svelte"], python: ["fastapi", "django", "pytest"], go: ["golang"], rust: ["rust"], php: ["laravel", "php"], ruby: ["rails"],
  java: ["java", "spring"], kotlin: ["kotlin"], csharp: ["dotnet", "csharp"], swift: ["swift", "swiftui"], cpp: ["cpp", "c++"], ts: ["typescript"],
  quality: ["code-review", "testing", "lint"], team: ["pull-request", "code-review"], "save-tokens": ["token", "compress"] };
const ASSIST_TAGS = ["claude", "cursor", "gemini", "codex", "copilot", "windsurf", "cline"];
// язык/фреймворк — признак для скилов и плагинов; у MCP-сервера «typescript» в топиках значит лишь, на чём он написан
const LANG_TAGS = new Set(["react", "vue", "angular", "svelte", "python", "go", "rust", "php", "ruby", "java", "kotlin", "csharp", "swift", "cpp", "ts"]);
const LANG_WORDS = new Set([...LANG_TAGS].flatMap(t => CAT_KW[t]));
const KIND_W = { mcp: 1, skill: 0.9, plugin: 0.9, rules: 0.6, tool: 0.25 }; // продукты (tool) — не то, что ставят к ассистенту; свои инструменты есть в курируемом
// ponytail: эвристика на данных сборщика вместо LLM — детерминированно и объяснимо; --ai на потом, если будет мазать
function rankCatalog(items, tags, haveMcp = new Set(), limit = 12) {
  const words = [...new Set([...tags].flatMap(t => CAT_KW[t] || []))];
  if (!words.length) return [];
  const hosts = ASSIST_TAGS.filter(h => tags.has(h));
  const curated = new Set(CATALOG.map(it => (it.repo || "").toLowerCase()).filter(Boolean));
  const hayOf = x => `${x.name} ${x.desc || ""} ${(x.topics || []).join(" ")} ${(x.tools || []).join(" ")}`.toLowerCase();
  const re = words.map(w => [w, new RegExp(`(^|[^a-z0-9+])${w.replace(/[+.]/g, "\\$&")}([^a-z0-9]|$)`)]);
  // вес слова — по редкости в каталоге: «postgres» стоит дороже «docs»
  const hays = items.map(hayOf), N = items.length;
  const idf = Object.fromEntries(re.map(([w, r]) => { let df = 0; for (const h of hays) if (r.test(h)) df++; return [w, Math.log((N + 1) / (df + 1))]; }));
  const out = [];
  items.forEach((x, i) => {
    if (curated.has((x.repo || "").toLowerCase()) || /^awesome/i.test(x.name)) return;
    if (hosts.length && x.hosts && !x.hosts.some(h => hosts.includes(h))) return;
    if (x.kind === "tool" && !x.install) return;
    const hit = re.filter(([w, r]) => r.test(hays[i]) && !(x.kind === "mcp" && LANG_WORDS.has(w))).map(([w]) => w).sort((p, q) => idf[q] - idf[p]);
    if (!hit.length) return;
    const nameHit = hit.some(w => x.name.toLowerCase().includes(w)); // слово в имени — это про него, а не упоминание в описании
    // одно точное попадание + популярность, а не сумма по топикам: иначе наверх лезут репо с двадцатью тегами
    const base = idf[hit[0]] * (1 + 0.15 * Math.min(hit.length - 1, 3)) * (nameHit ? 1.5 : 1);
    const pop = Math.log10((x.stars || 0) + 10) + 0.7 * Math.log10((x.dl || 0) + 1) + 0.7 * Math.log10((x.uses || 0) + 1) + 0.5 * Math.log10((x.hn || 0) + 1);
    let score = base * (1 + pop / 3) * (KIND_W[x.kind] ?? 0.5);
    const nameMcp = /mcp/i.test(x.name) || (x.topics || []).some(t => /mcp/.test(t));
    if (x.kind === "mcp" && !x.install && !nameMcp) score *= 0.4;           // «mcp-server» в топиках у продукта на 100k★ — не инструмент
    if (x.kind === "mcp" && (x.stars || 0) > 50000 && !x.install) score *= 0.3;
    if (x.pushed && (Date.now() - Date.parse(x.pushed)) / 2.63e9 > 12) score *= 0.5;
    const have = [...haveMcp].some(h => h.toLowerCase().includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(h.toLowerCase()));
    out.push({ name: x.name, repo: x.repo, stars: x.stars || 0, desc: x.desc || "", pushed: x.pushed || "", kind: x.kind, hosts: x.hosts, have, score, why: hit,
      dl: x.dl, uses: x.uses, hn: x.hn, tools: x.tools, run: x.install, install: catalogInstall(x) });
  });
  // не больше двух на одно слово — иначе выдачу забьют десять postgres-серверов
  out.sort((a, b) => b.score - a.score);
  const perWord = new Map(), res = [];
  for (const f of out) { const w = f.why[0]; if ((perWord.get(w) || 0) >= 2) continue; perWord.set(w, (perWord.get(w) || 0) + 1); res.push(f); if (res.length >= limit) break; }
  return res;
}
// команды установки по виду записи; без проверенного пакета — только ссылка
function catalogInstall(x) {
  if (x.kind === "mcp" && x.install) return mcpInstall(x.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-"), x.install);
  if (x.kind === "mcp" && x.url) return mcpInstall(x.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-"), { url: x.url });
  if (x.kind === "skill" && x.repo) return { claude: `npx skills add ${x.repo}`, cursor: `npx skills add ${x.repo}`, gemini: `npx skills add ${x.repo}`, codex: `npx skills add ${x.repo}` };
  if (x.kind === "plugin" && x.repo && (x.hosts || []).includes("claude")) return { claude: `claude plugin marketplace add ${x.repo}  # then: claude plugin install <name>@<marketplace> — see README` };
  if (x.kind === "tool" && x.install?.pkg) return { claude: x.install.py ? `uv tool install ${x.install.pkg}` : `npm i -g ${x.install.pkg}` };
  return null;
}
const signalLine = f => [f.dl ? `${_fmtStars(f.dl)} dl/wk` : "", f.uses ? `${_fmtStars(f.uses)} uses` : "", f.hn ? `${f.hn} HN` : ""].filter(Boolean).join(" · ");

// ── Слой 4: подключение найденного во все выбранные ассистенты ────────────────
// tag из опроса → куда писать. cli — через команду ассистента; json — правка его конфига с бэкапом; toml — Codex
const MCP_TARGETS = () => [
  { tag: "claude", label: "Claude Code", present: () => have("claude"), cli: (n, run) => mcpInstall(n, run).claude },
  { tag: "cursor", label: "Cursor", present: () => exists(path.join(H, ".cursor")), json: [path.join(H, ".cursor", "mcp.json"), "mcpServers"] },
  { tag: "gemini", label: "Gemini CLI", present: () => have("gemini"), cli: (n, run) => mcpInstall(n, run).gemini },
  { tag: "gemini", label: "Gemini (settings.json)", present: () => !have("gemini") && exists(path.join(H, ".gemini")), json: [path.join(H, ".gemini", "settings.json"), "mcpServers"] },
  { tag: "gemini", label: "Antigravity", present: () => exists(path.join(H, ".gemini", "antigravity")), json: [path.join(H, ".gemini", "antigravity", "mcp_config.json"), "mcpServers"] },
  { tag: "codex", label: "Codex CLI", present: () => have("codex"), cli: (n, run) => mcpInstall(n, run).codex },
  { tag: "codex", label: "Codex (config.toml)", present: () => !have("codex") && exists(path.join(H, ".codex")), toml: path.join(H, ".codex", "config.toml") },
  { tag: "copilot", label: "VS Code (Copilot)", present: () => exists(path.join(APPDATA, "Code", "User")), json: [path.join(APPDATA, "Code", "User", "mcp.json"), "servers"], vscode: true },
  { tag: "windsurf", label: "Windsurf", present: () => exists(path.join(H, ".codeium", "windsurf")), json: [path.join(H, ".codeium", "windsurf", "mcp_config.json"), "mcpServers"] },
  { tag: "cline", label: "Cline", present: () => exists(path.join(APPDATA, "Code", "User", "globalStorage", "saoudrizwan.claude-dev")),
    json: [path.join(APPDATA, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"), "mcpServers"] },
];
const targetsFor = tags => MCP_TARGETS().filter(x => tags.has(x.tag) && x.present()); // функция: H и APPDATA объявлены ниже
const mcpEntry = (run, vscode) => run.url ? (vscode ? { type: "http", url: run.url } : { url: run.url })
  : { ...(vscode ? { type: "stdio" } : {}), command: run.py ? "uvx" : "npx", args: run.py ? [run.pkg] : ["-y", run.pkg] };
const slug = n => n.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
// правка JSON-конфига: читаем, добавляем ключ, бэкап рядом, пишем. Уже есть — не трогаем
function writeJsonMerge(file, key, name, entry, dry) {
  const obj = readJson(file) || {}; obj[key] ??= {};
  if (obj[key][name]) return "exists";
  obj[key][name] = entry;
  console.log("  " + c.d(`$ ${file.replace(H, "~")} → ${key}.${name}`));
  if (dry) return "ok";
  try { fs.mkdirSync(path.dirname(file), { recursive: true });
    if (exists(file)) fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n"); return "ok"; } catch { return "fail"; }
}
function writeTomlMerge(file, name, run, dry) {
  let cur = ""; try { cur = fs.readFileSync(file, "utf8"); } catch {}
  if (cur.includes(`[mcp_servers.${name}]`)) return "exists";
  const body = run.url ? `url = ${JSON.stringify(run.url)}` : `command = ${JSON.stringify(run.py ? "uvx" : "npx")}\nargs = ${JSON.stringify(run.py ? [run.pkg] : ["-y", run.pkg])}`;
  console.log("  " + c.d(`$ ${file.replace(H, "~")} → [mcp_servers.${name}]`));
  if (dry) return "ok";
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); if (cur) fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
    fs.writeFileSync(file, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + `\n[mcp_servers.${name}]\n${body}\n`); return "ok"; } catch { return "fail"; }
}
// одна найденная запись → во все цели; возвращает [[хост, статус]]
function connectFound(f, targets, dry) {
  const name = slug(f.name);
  if (f.kind === "skill" && f.repo) return [["skills", run(`npx skills add ${f.repo}`, dry) ? "ok" : "fail"]];
  if (f.kind === "plugin" && f.repo) return [["Claude Code", run(`claude plugin marketplace add ${f.repo}`, dry) ? "ok" : "fail"]];
  if (f.kind === "tool" && f.run?.pkg) return [["cli", run(f.run.py ? `uv tool install ${f.run.pkg}` : `npm i -g ${f.run.pkg}`, dry) ? "ok" : "fail"]];
  if (f.kind !== "mcp" || !f.run) return [];
  return targets.map(tg => {
    if (tg.cli) return [tg.label, run(tg.cli(name, f.run), dry) ? "ok" : "fail"];
    if (tg.json) return [tg.label, writeJsonMerge(tg.json[0], tg.json[1], name, mcpEntry(f.run, tg.vscode), dry)];
    if (tg.toml) return [tg.label, writeTomlMerge(tg.toml, name, f.run, dry)];
    return [tg.label, "fail"];
  });
}

function printDiscover(t, found) {
  console.log();
  if (!found.length) return box(t.dsTitle, [c.d(t.dsNone)]);
  const kindTag = { mcp: "MCP", plugin: "plugin", skill: "skill" };
  box(t.dsTitle + " · " + found.length, found.slice(0, 12).map(f =>
    `${f.have ? c.g("✓") : c.d("·")} ${c.b(pad(f.name.slice(0, 22), 22))} ${c.d(pad("★ " + _fmtStars(f.stars), 7))} ${c.d(pad(kindTag[f.kind] || f.kind, 6))} ${f.have ? c.g(t.dsHave) : c.d((f.why ? f.why.join(", ") + " · " : "") + (signalLine(f) || f.desc.slice(0, 36)))}`), c.d);
  console.log("  " + c.d(t.dsNote));
}

// ── Ассистенты и профиль ─────────────────────────────────────────────────────
// [bin, label, supported, configFiles[]]
const ASSISTANTS = [
  ["claude", "Claude Code", true, [
    () => path.join(os.homedir(), ".claude", "CLAUDE.md"),
    () => path.join(process.cwd(), "CLAUDE.md")]],
  ["cursor", "Cursor", true, [
    () => path.join(process.cwd(), ".cursorrules"),
    () => path.join(process.cwd(), ".cursor", "rules.md")]],
  ["gemini", "Gemini CLI", true, [
    () => path.join(process.cwd(), "GEMINI.md")]],
  ["codex", "Codex CLI", true, [
    () => path.join(process.cwd(), "AGENTS.md"),
    () => path.join(process.cwd(), "codex.md")]],
];
const detectAssistants = () => ASSISTANTS.filter(([bin]) => have(bin));

// ── Scan: весь ИИ на машине + проекты. Читаются только имена папок и манифесты ──
const H = os.homedir();
const APPDATA = process.platform === "darwin" ? path.join(H, "Library", "Application Support")
  : process.platform === "win32" ? (process.env.APPDATA || path.join(H, "AppData", "Roaming")) : path.join(H, ".config");
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const lsDir = p => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// [label, dirs-признаки, папки расширений, встроенный ИИ]
const IDES = [
  ["VS Code", [path.join(H, ".vscode")], [path.join(H, ".vscode", "extensions")], null],
  ["Cursor", [path.join(H, ".cursor")], [path.join(H, ".cursor", "extensions")], "Cursor Agent"],
  ["Antigravity", [path.join(H, ".antigravity"), path.join(APPDATA, "Antigravity IDE"), "/Applications/Antigravity IDE.app"], [path.join(H, ".antigravity", "extensions")], "Gemini (built-in)"],
  ["Windsurf", [path.join(H, ".codeium", "windsurf")], [path.join(H, ".windsurf", "extensions")], "Cascade"],
  ["Zed", [path.join(APPDATA, "Zed"), path.join(H, ".config", "zed")], [], "Zed AI"],
  ["Kiro", [path.join(H, ".kiro")], [path.join(H, ".kiro", "extensions")], "Kiro Agent"],
  ["Trae", [path.join(H, ".trae")], [path.join(H, ".trae", "extensions")], "Trae AI"],
  ["JetBrains", [path.join(APPDATA, "JetBrains"), path.join(H, ".local", "share", "JetBrains")], [], null],
  ["Xcode", ["/Applications/Xcode.app"], [], null],
];
// аккаунты/конфиги ассистентов без бинарника: Gemini через Antigravity, Copilot CLI и т.п.
const ASSIST_CFG = [[path.join(H, ".gemini"), "Gemini"], [path.join(H, ".codex"), "Codex"], [path.join(H, ".copilot"), "GitHub Copilot"],
  [path.join(H, ".claude"), "Claude Code"], [path.join(H, ".aider"), "Aider"], [path.join(H, ".config", "opencode"), "OpenCode"]];
// publisher.name → человекочитаемо (VS Code-совместимые расширения)
const AI_EXT = { "github.copilot": "GitHub Copilot", "github.copilot-chat": "Copilot Chat", "anthropic.claude-code": "Claude Code",
  "continue.continue": "Continue", "saoudrizwan.claude-dev": "Cline", "rooveterinaryinc.roo-cline": "Roo Code", "kilocode.kilo-code": "Kilo Code",
  "codeium.codeium": "Codeium", "google.geminicodeassist": "Gemini Code Assist", "sourcegraph.cody-ai": "Cody", "tabnine.tabnine-vscode": "Tabnine",
  "amazonwebservices.amazon-q-vscode": "Amazon Q", "openai.chatgpt": "Codex (OpenAI)", "augment.vscode-augment": "Augment",
  "supermaven.supermaven": "Supermaven", "blackboxapp.blackbox": "Blackbox", "bito.bito": "Bito", "qodo.qodo-gen": "Qodo" };
const JB_AI = { "github-copilot": "GitHub Copilot", "codeium": "Codeium", "continue": "Continue", "junie": "Junie", "aiassistant": "JetBrains AI",
  "cline": "Cline", "tabnine": "Tabnine", "amazon-q": "Amazon Q", "gemini": "Gemini", "sourcegraph": "Cody" };
const AI_CLIS = [["claude", "Claude Code"], ["cursor-agent", "Cursor Agent"], ["gemini", "Gemini CLI"], ["codex", "Codex CLI"], ["aider", "Aider"],
  ["opencode", "OpenCode"], ["goose", "Goose"], ["amp", "Amp"], ["cline", "Cline CLI"], ["qwen", "Qwen Code"], ["kiro-cli", "Kiro CLI"],
  ["copilot", "Copilot CLI"], ["ollama", "Ollama"], ["lms", "LM Studio CLI"], ["llm", "llm (datasette)"], ["mlx_lm.generate", "MLX"]];
const CLOUD_KEYS = { ANTHROPIC_API_KEY: "Anthropic", OPENAI_API_KEY: "OpenAI", GEMINI_API_KEY: "Google Gemini", GOOGLE_API_KEY: "Google",
  OPENROUTER_API_KEY: "OpenRouter", GROQ_API_KEY: "Groq", MISTRAL_API_KEY: "Mistral", DEEPSEEK_API_KEY: "DeepSeek", XAI_API_KEY: "xAI",
  TOGETHER_API_KEY: "Together", FIREWORKS_API_KEY: "Fireworks", PERPLEXITY_API_KEY: "Perplexity", AZURE_OPENAI_API_KEY: "Azure OpenAI",
  COHERE_API_KEY: "Cohere", HF_TOKEN: "HuggingFace", HUGGINGFACE_HUB_TOKEN: "HuggingFace", CEREBRAS_API_KEY: "Cerebras" };
const DESKTOP_APPS = ["Claude", "ChatGPT", "Ollama", "LM Studio", "Jan", "Msty", "Cherry Studio", "Perplexity", "GPT4All", "AnythingLLM", "Open WebUI"];
// где лежат MCP-конфиги хостов: [хост, файл, путь до mcpServers]
const MCP_HOSTS = [
  ["Claude Code", path.join(H, ".claude.json"), j => j?.mcpServers],
  ["Claude Desktop", path.join(APPDATA, "Claude", "claude_desktop_config.json"), j => j?.mcpServers],
  ["Cursor", path.join(H, ".cursor", "mcp.json"), j => j?.mcpServers],
  ["Gemini CLI", path.join(H, ".gemini", "settings.json"), j => j?.mcpServers],
  ["Antigravity", path.join(H, ".gemini", "antigravity", "mcp_config.json"), j => j?.mcpServers],
  ["Gemini", path.join(H, ".gemini", "config", "mcp_config.json"), j => j?.mcpServers],
  ["VS Code", path.join(APPDATA, "Code", "User", "mcp.json"), j => j?.servers],
  ["Windsurf", path.join(H, ".codeium", "windsurf", "mcp_config.json"), j => j?.mcpServers],
  ["Zed", path.join(H, ".config", "zed", "settings.json"), j => j?.context_servers],
  ["Cline", path.join(APPDATA, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"), j => j?.mcpServers],
];

// манифест → [метки, подпись]; подпись идёт в отчёт «подобран из-за: Next.js ×7»
const DEPS = { next: [["ts", "react", "frontend"], "Next.js"], react: [["ts", "react", "frontend"], "React"], nuxt: [["ts", "vue", "frontend"], "Nuxt"],
  vue: [["ts", "vue", "frontend"], "Vue"], "@angular/core": [["ts", "angular", "frontend"], "Angular"], svelte: [["ts", "svelte", "frontend"], "Svelte"],
  express: [["ts", "backend"], "Express"], fastify: [["ts", "backend"], "Fastify"], "@nestjs/core": [["ts", "backend"], "NestJS"], hono: [["ts", "backend"], "Hono"],
  typescript: [["ts"], "TypeScript"], "@playwright/test": [["frontend", "browser"], "Playwright"], electron: [["ts"], "Electron"],
  "react-native": [["ts", "react", "mobile"], "React Native"], expo: [["ts", "react", "mobile"], "Expo"],
  pg: [["postgres"], "PostgreSQL"], postgres: [["postgres"], "PostgreSQL"], "@prisma/client": [["postgres"], "Prisma"], drizzle: [["postgres"], "Drizzle"],
  mysql2: [["mysql"], "MySQL"], mongoose: [["mongodb"], "MongoDB"], mongodb: [["mongodb"], "MongoDB"], ioredis: [["redis"], "Redis"], redis: [["redis"], "Redis"],
  "@supabase/supabase-js": [["supabase"], "Supabase"], firebase: [["supabase"], "Firebase"], "better-sqlite3": [["sqlite"], "SQLite"],
  "@octokit/rest": [["github"], "GitHub API"], "@slack/web-api": [["slack"], "Slack API"], "@notionhq/client": [["notion"], "Notion API"],
  "@aws-sdk/client-s3": [["cloud"], "AWS"], "aws-sdk": [["cloud"], "AWS"], "@vercel/node": [["vercel"], "Vercel"], openai: [["llm"], "OpenAI SDK"], "@anthropic-ai/sdk": [["llm"], "Anthropic SDK"], langchain: [["llm"], "LangChain"] };
const PY_FW = { django: "Django", fastapi: "FastAPI", flask: "Flask", torch: "PyTorch", pandas: "pandas", "scikit-learn": "scikit-learn", langchain: "LangChain" };
const PY_EXTRA = { psycopg: ["postgres"], asyncpg: ["postgres"], sqlalchemy: ["postgres"], pymysql: ["mysql"], pymongo: ["mongodb"], redis: ["redis"], supabase: ["supabase"],
  openai: ["llm"], anthropic: ["llm"], langchain: ["llm"], transformers: ["llm"], boto3: ["cloud"] };
function projectStack(dir, names) {
  const tags = new Set(), labels = new Set(), has = n => names.has(n);
  if (has("package.json")) { const pj = readJson(path.join(dir, "package.json")) || {};
    for (const d of Object.keys({ ...pj.dependencies, ...pj.devDependencies })) { const m = DEPS[d]; if (m) { m[0].forEach(x => tags.add(x)); labels.add(m[1]); } }
    if (!labels.size) { tags.add("ts"); labels.add("Node"); } }
  if (has("pyproject.toml") || has("requirements.txt") || has("Pipfile")) { tags.add("python");
    let txt = ""; for (const f of ["pyproject.toml", "requirements.txt", "Pipfile"]) { try { txt += fs.readFileSync(path.join(dir, f), "utf8").toLowerCase(); } catch {} }
    let hit = false; for (const [k, l] of Object.entries(PY_FW)) if (txt.includes(k)) { labels.add(l); hit = true;
      if (["django", "fastapi", "flask"].includes(k)) tags.add("backend"); else tags.add("data"); }
    if (!hit) labels.add("Python");
    for (const [k, tg] of Object.entries(PY_EXTRA)) if (txt.includes(k)) tg.forEach(x => tags.add(x)); }
  if (has("go.mod")) { tags.add("go"); tags.add("backend"); labels.add("Go"); }
  if (has("cargo.toml")) { tags.add("rust"); labels.add("Rust"); }
  if (has("composer.json")) { tags.add("php"); tags.add("backend"); const cj = readJson(path.join(dir, "composer.json")); labels.add(cj?.require?.["laravel/framework"] ? "Laravel" : "PHP"); }
  if (has("gemfile")) { tags.add("ruby"); tags.add("backend"); labels.add("Ruby"); }
  if (has("pom.xml") || has("build.gradle")) { tags.add("java"); tags.add("backend"); labels.add("Java"); }
  if (has("build.gradle.kts")) { tags.add("kotlin"); tags.add("backend"); labels.add("Kotlin"); }
  if ([...names].some(n => n.endsWith(".csproj") || n.endsWith(".sln"))) { tags.add("csharp"); labels.add("C#"); }
  if (has("package.swift") || [...names].some(n => n.endsWith(".xcodeproj"))) { tags.add("swift"); labels.add("Swift"); }
  if (has("pubspec.yaml")) { labels.add("Flutter"); }
  if (has("cmakelists.txt") || has("makefile") && [...names].some(n => /\.(c|cc|cpp|h)$/.test(n))) { tags.add("cpp"); labels.add("C/C++"); }
  if (has("dockerfile") || has("docker-compose.yml") || has("compose.yaml") || [...names].some(n => n.endsWith(".tf"))) { tags.add("devops"); labels.add("Docker/IaC"); }
  if (tags.size) tags.add("code");
  return { tags, labels };
}
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "venv", ".venv", "dist", "build", "target", "__pycache__", ".next", ".cache",
  "Library", "Applications", "Music", "Movies", "Pictures", "Public", ".Trash", "go", ".npm", ".cargo", ".rustup", "AppData", "snap"]);
const MANIFESTS = new Set(["package.json", "pyproject.toml", "requirements.txt", "pipfile", "go.mod", "cargo.toml", "composer.json", "gemfile",
  "pom.xml", "build.gradle", "build.gradle.kts", "package.swift", "pubspec.yaml", "cmakelists.txt", "dockerfile", "docker-compose.yml", "compose.yaml"]);
// ponytail: BFS по домашней на глубину 4 с лимитом времени — на ноуте с сотней репо укладывается в ~1 с
function scanProjects(root = H, { depth = 4, budgetMs = 3000 } = {}) {
  const t0 = Date.now(), projects = [], q = [[root, 0]];
  while (q.length && Date.now() - t0 < budgetMs) {
    const [dir, d] = q.shift(); const ents = lsDir(dir);
    const names = new Set(ents.filter(e => e.isFile()).map(e => e.name.toLowerCase()));
    const isProj = ents.some(e => e.name === ".git") || [...names].some(n => MANIFESTS.has(n) || n.endsWith(".csproj") || n.endsWith(".sln") || n.endsWith(".tf")) ||
      ents.some(e => e.isDirectory() && e.name.endsWith(".xcodeproj"));
    if (isProj && dir !== root) { const st = projectStack(dir, new Set([...names, ...ents.filter(e => e.isDirectory()).map(e => e.name.toLowerCase())]));
      const rules = ["claude.md", "agents.md", "gemini.md", ".cursorrules", ".windsurfrules"].some(n => names.has(n)) || ents.some(e => e.isDirectory() && [".cursor", ".claude", ".kiro"].includes(e.name));
      projects.push({ dir, rules, ...st }); continue; } // в проект глубже не идём
    if (d >= depth) continue;
    for (const e of ents) if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !(e.name.startsWith(".") && dir === root)) q.push([path.join(dir, e.name), d + 1]);
  }
  return { projects, truncated: q.length > 0, ms: Date.now() - t0 };
}

function scan() {
  const ides = IDES.filter(([, marks]) => marks.some(exists)).map(([label, , extDirs, builtin]) => {
    const ai = new Set(builtin ? [builtin] : []);
    for (const ed of extDirs) for (const e of lsDir(ed)) { const key = e.name.toLowerCase().replace(/-\d+[\d.]*.*$/, ""); if (AI_EXT[key]) ai.add(AI_EXT[key]); }
    if (label === "JetBrains") for (const ide of lsDir(path.join(APPDATA, "JetBrains"))) for (const pl of lsDir(path.join(APPDATA, "JetBrains", ide.name, "plugins")))
      for (const [k, v] of Object.entries(JB_AI)) if (pl.name.toLowerCase().includes(k)) ai.add(v);
    return { ide: label, ai: [...ai] };
  });
  const clis = AI_CLIS.filter(([bin]) => have(bin)).map(([, l]) => l);
  const configured = ASSIST_CFG.filter(([d]) => exists(d)).map(([, l]) => l).filter(l => !clis.includes(l));
  const local = [];
  for (const m of lsDir(path.join(process.env.OLLAMA_MODELS || path.join(H, ".ollama", "models"), "manifests", "registry.ollama.ai", "library")))
    for (const tag of lsDir(path.join(process.env.OLLAMA_MODELS || path.join(H, ".ollama", "models"), "manifests", "registry.ollama.ai", "library", m.name)))
      local.push({ runtime: "Ollama", model: `${m.name}:${tag.name}` });
  for (const base of [path.join(H, ".lmstudio", "models"), path.join(H, ".cache", "lm-studio", "models")])
    for (const pub of lsDir(base)) for (const m of lsDir(path.join(base, pub.name))) if (m.isDirectory()) local.push({ runtime: "LM Studio", model: `${pub.name}/${m.name}` });
  for (const e of lsDir(path.join(H, ".cache", "huggingface", "hub"))) if (e.name.startsWith("models--")) local.push({ runtime: "HF cache", model: e.name.slice(8).replace("--", "/") });
  for (const e of lsDir(path.join(H, "jan", "models"))) if (e.isDirectory()) local.push({ runtime: "Jan", model: e.name });
  const cloud = [...new Set(Object.entries(CLOUD_KEYS).filter(([k]) => process.env[k]).map(([, v]) => v))]; // только имена провайдеров, значения не читаем
  const apps = process.platform === "darwin" ? DESKTOP_APPS.filter(a => exists(`/Applications/${a}.app`))
    : process.platform === "win32" ? DESKTOP_APPS.filter(a => exists(path.join(process.env.LOCALAPPDATA || "", "Programs", a))) : [];
  const mcp = MCP_HOSTS.map(([host, file, get]) => ({ host, servers: Object.keys(get(readJson(file)) || {}) })).filter(x => x.servers.length);
  const pr = scanProjects();
  const tags = new Set(), counts = new Map();
  for (const p of pr.projects) { p.tags.forEach(x => tags.add(x)); p.labels.forEach(l => counts.set(l, (counts.get(l) || 0) + 1)); }
  const stack = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const ASSIST_TAG = { "Claude Code": "claude", "Cursor": "cursor", "Cursor Agent": "cursor", "Gemini CLI": "gemini", "Gemini": "gemini", "Gemini (built-in)": "gemini", "Gemini Code Assist": "gemini",
    "Antigravity": "gemini", "Codex CLI": "codex", "Codex": "codex", "Codex (OpenAI)": "codex", "GitHub Copilot": "copilot", "Copilot Chat": "copilot", "Copilot CLI": "copilot" };
  for (const n of [...clis, ...configured, ...ides.flatMap(i => i.ai), ...ides.map(i => i.ide)]) if (ASSIST_TAG[n]) tags.add(ASSIST_TAG[n]);
  // выводы — детерминированные правила по тому, что нашли
  const findings = [];
  const hostsWithMcp = new Set(mcp.map(m => m.host));
  for (const i of ides) if (i.ai.length && !hostsWithMcp.has(i.ide) && !(i.ide === "Antigravity" && hostsWithMcp.has("Gemini"))) findings.push(["fNoMcp", { host: i.ide }]);
  if (clis.includes("Claude Code") && !hostsWithMcp.has("Claude Code")) findings.push(["fNoMcp", { host: "Claude Code" }]);
  for (const m of mcp) findings.push(["fMcp", { host: m.host, n: m.servers.length }]);
  for (const l of configured) findings.push(["fCfgNoCli", { name: l }]);
  if (local.some(m => m.runtime === "HF cache") && !clis.some(x => ["Ollama", "LM Studio CLI", "MLX"].includes(x)) && !apps.some(a => ["Ollama", "LM Studio", "Jan"].includes(a))) findings.push(["fModelsNoRuntime", {}]);
  const noRules = pr.projects.filter(p => !p.rules).length;
  if (pr.projects.length && noRules) findings.push(["fNoRules", { n: noRules, m: pr.projects.length }]);
  return { ides, clis, configured, local, cloud, apps, mcp, projects: pr.projects.length, truncated: pr.truncated, stack, tags: [...tags], findings };
}
// метки → srcPairs для отчёта: «подобран из-за: Next.js ×7»
const scanSrc = s => s.stack.flatMap(([l, n]) => { const hit = Object.values(DEPS).find(d => d[1] === l); return (hit ? hit[0] : []).map(x => [x, `${l} ×${n}`]); });

function printScan(t, s) {
  console.log("\n  " + grad("✦ ai-kit scan") + "  " + c.d("(" + t.scPrivacy + ")"));
  const row = (a, b) => `${a ? grad("•") : " "} ${c.b(pad(a, 18))} ${c.d(b)}`;
  const L = [];
  for (const i of s.ides) L.push(row(i.ide, i.ai.length ? i.ai.join(", ") : c.d("—")));
  if (s.clis.length) L.push(row(t.scCli, s.clis.join(", ")));
  if (s.configured.length) L.push(row(t.scCfg, s.configured.join(", ")));
  if (s.apps.length) L.push(row(t.scApps, s.apps.join(", ")));
  console.log(); box(t.scAi, L.length ? L : [c.d(t.scNone)]);
  if (s.local.length || s.cloud.length) {
    const M = []; const byRt = new Map(); for (const m of s.local) byRt.set(m.runtime, [...(byRt.get(m.runtime) || []), m.model]);
    for (const [rt, ms] of byRt) M.push(...wrap(ms.join(", "), W - 24).map((l, i) => row(i ? "" : rt, l)));
    if (s.cloud.length) M.push(row(t.scCloud, s.cloud.join(", ")));
    console.log(); box(t.scModels, M);
  }
  if (s.mcp.length) { console.log(); box(t.scMcp, s.mcp.map(m => row(m.host, m.servers.join(", ")))); }
  console.log(); box(t.scProjects + " · " + s.projects + (s.truncated ? "+" : ""),
    s.stack.length ? wrap(s.stack.map(([l, n]) => `${l} ×${n}`).join(" · "), W - 4) : [c.d(t.scNone)]);
  const fmt = (k, v) => t[k].replace(/\{(\w+)\}/g, (_, x) => v[x]);
  if (s.findings.length) { console.log(); box(t.scFind, s.findings.flatMap(([k, v]) => wrap(fmt(k, v), W - 6).map((l, i) => (i ? "  " : k === "fMcp" ? c.g("✓ ") : c.y("• ")) + l))); }
  console.log("  " + c.d(t.scNext));
}
const PROFILE = path.join(os.homedir(), ".ai-kit.json");
function saveProfile(lang, tags, src = []) { try {
  fs.writeFileSync(PROFILE, JSON.stringify({ lang, tags: [...tags], src, at: new Date().toISOString() }, null, 2)); } catch {} }
function loadProfile() { try { return JSON.parse(fs.readFileSync(PROFILE, "utf8")); } catch { return null; } }
function run(cmd, dry) { console.log("  " + c.d("$ " + cmd)); if (dry) return true;
  try { execSync(cmd, { stdio: "inherit" }); return true; } catch { console.log("  " + c.r("⚠ " + cmd)); return false; } }
// Большой логотип (шрифт ANSI Shadow), градиент по диагонали; в узком терминале — прежняя рамка
const LOGO = [
  " █████╗ ██╗      ██╗  ██╗██╗████████╗",
  "██╔══██╗██║      ██║ ██╔╝██║╚══██╔══╝",
  "███████║██║█████╗█████╔╝ ██║   ██║   ",
  "██╔══██║██║╚════╝██╔═██╗ ██║   ██║   ",
  "██║  ██║██║      ██║  ██╗██║   ██║   ",
  "╚═╝  ╚═╝╚═╝      ╚═╝  ╚═╝╚═╝   ╚═╝   ",
];
function logoLine(line, row) {
  if (!COLOR) return line;
  const a = [96, 165, 250], z = [45, 212, 191], n = line.length + LOGO.length * 2; // сдвиг по строке даёт диагональ
  return [...line].map((ch, i) => { const k = (i + row * 2) / n; if (ch === " ") return ch;
    return `\x1b[1;38;2;${Math.round(a[0] + (z[0] - a[0]) * k)};${Math.round(a[1] + (z[1] - a[1]) * k)};${Math.round(a[2] + (z[2] - a[2]) * k)}m${ch}`; }).join("") + "\x1b[0m";
}
function banner(t) {
  console.log();
  if ((output.columns || 80) < LOGO[0].length + 4) { box(grad("✦ ai-kit"), [c.b(t.tagline1), c.d(t.tagline2)]); return; }
  LOGO.forEach((l, i) => console.log("  " + logoLine(l, i)));
  console.log("\n  " + c.b(t.tagline1) + "  " + c.d("· " + t.tagline2) + "  " + c.d("v" + VERSION));
}

function printPlan(t, chosen, needUv, tags = new Set(), meta = new Map()) {
  console.log();
  box(t.recommend, chosen.map(it => {
    const m = meta.get(it.id);
    const star = m ? c.d(" ★ " + _fmtStars(m.stars)) : "";
    return `${c.g("✓")} ${c.b(pad(it.id, 20))} ${c.d(t[it.why])}${star}`;
  }), c.g);
  const why = REASONS.filter(([tag]) => tags.has(tag)).map(([, k]) => `${grad("•")} ${t[k]}`);
  if (why.length) { console.log(); box(t.pWhy, why); }
  console.log();
  box(t.disable, wrap(ballastFor(tags).join(", "), W - 3).map(c.d), c.y);
  const notes = [];
  if (needUv) notes.push(c.y("⚠ " + t.needUv) + "brew install uv");
  if (chosen.some(it => (it.needs || []).includes("python")) && !have("python3") && !have("python")) notes.push(c.y("⚠ python: ") + "https://python.org/downloads");
  if (!have("claude")) notes.push(c.y("⚠ " + t.needClaude) + "npm i -g @anthropic-ai/claude-code");
  if (notes.length) { console.log(); notes.forEach(n => console.log("  " + n)); }
}

// ── Doctor: скан установки, подсчёт балласта, чистка ─────────────────────────
const BALLAST_SKILLS = { sales: 37, marketing: 8, legal: 9, "human-resources": 9,
  operations: 9, "product-management": 9, finance: 7, "enterprise-search": 5 };
const TOK_PER_SKILL = 70; // средняя цена описания одного скила в контексте

function parsePlugins(listing) {
  const occ = []; let cur = null;
  for (const line of listing.split("\n")) {
    const m = line.match(/[❯⚠]\s+([A-Za-z0-9_-]+)@([A-Za-z0-9_-]+)/);
    if (m) { cur = { name: m[1].toLowerCase(), enabled: true }; occ.push(cur); continue; }
    if (cur && /disabled/i.test(line)) cur.enabled = false;
  }
  const map = new Map();
  for (const o of occ) map.set(o.name, (map.get(o.name) || false) || o.enabled); // любой включённый вариант = грузится
  return [...map.entries()].map(([name, enabled]) => ({ name, enabled }));
}

async function doctor(t, opts) {
  const { fix, auto, json, reqs } = opts;
  const est = n => Math.round(n / 4);
  // — сбор данных: конфиги ВСЕХ найденных ассистентов —
  const md = [];
  const ass = detectAssistants();
  for (const [, label, , cfgFns] of ass) {
    for (const fn of cfgFns) { const p = fn(); try {
      md.push({ path: p.replace(os.homedir(), "~"), tok: est(fs.statSync(p).size), assistant: label });
    } catch {} }
  }
  // если Claude не найден, всё равно проверим его конфиги (могут быть файлы без CLI)
  if (!ass.some(([b]) => b === "claude")) {
    for (const p of [path.join(os.homedir(), ".claude", "CLAUDE.md"), path.join(process.cwd(), "CLAUDE.md")]) {
      try { md.push({ path: p.replace(os.homedir(), "~"), tok: est(fs.statSync(p).size), assistant: "Claude Code" }); } catch {} }
  }
  const mdTok = md.reduce((s, m) => s + m.tok, 0);
  let skN = 0, skTok = 0;
  try { const sd = path.join(os.homedir(), ".claude", "skills");
    for (const d of fs.readdirSync(sd, { withFileTypes: true })) { if (!d.isDirectory()) continue;
      try { const txt = fs.readFileSync(path.join(sd, d.name, "SKILL.md"), "utf8");
        skTok += est((txt.split("---")[1] || "").slice(0, 1200).length) + 10; skN++; } catch {} }
  } catch {}
  let listing = "";
  try { listing = execSync("claude plugin list", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
  const plugs = parsePlugins(listing);
  const bal = plugs.filter(p => p.enabled && BALLAST.includes(p.name))
    .map(p => ({ name: p.name, tok: (BALLAST_SKILLS[p.name] || 8) * TOK_PER_SKILL }));
  const balTok = bal.reduce((s, b) => s + b.tok, 0);
  const dupes = [];
  if (plugs.some(p => p.enabled && p.name === "serena") && have("graphify")) dupes.push(t.dupSerena);
  const total = balTok + mdTok + skTok;
  const usdMo = +(total * reqs * 30 * 3 / 1e6).toFixed(2); // вход Sonnet ~$3/M, грубо
  if (json) { console.log(JSON.stringify({ assistants: ass.map(([b, l]) => ({ bin: b, label: l })),
    configs: md, skills: { count: skN, tokens: skTok },
    ballast: bal, duplicates: dupes, tokensPerRequest: total,
    assumptions: { requestsPerDay: reqs, usdPerMTokIn: 3 }, estMonthlyUSD: usdMo }, null, 2)); return; }
  // — рендер —
  console.log("\n  " + grad("✦ ai-kit doctor") + "  " + c.d("(" + t.dApprox + ")"));
  if (ass.length) { console.log(); box(t.aFound, ass.map(([, label, ok2]) =>
    `${ok2 ? c.g("✓") : c.y("○")} ${c.b(pad(label, 14))} ${c.d(ok2 ? t.aOk : t.aSoon)}`)); }
  if (md.length) { console.log(); box(t.dConfigs, md.map(m =>
    `${m.tok > 2000 ? c.r("●") : c.g("●")} ${pad(m.path, 34)} ${c.b("~" + m.tok)} ${t.dTokens} ${c.d(m.assistant)}${m.tok > 2000 ? " " + c.r(t.dBig) : ""}`)); }
  console.log(); box(t.dSkillsBox, [`${c.b(skN)} ${t.dSkillsN} · ~${c.b(skTok)} ${t.dTokens}`]);
  console.log();
  if (bal.length) {
    box(t.dBallast, bal.map(b => `${c.r("✗")} ${c.b(pad(b.name, 22))} ~${b.tok} ${t.dTokens}`), c.r);
    console.log("\n  " + c.r(c.b(`Σ ~${balTok} ${t.dTokens}`)) + " " + c.b("— " + t.dTotal));
    if (!fix) console.log("  " + c.y(t.dFix));
  } else box(t.dNone, [c.g("✓")], c.g);
  if (dupes.length) { console.log(); box(t.dDupes, dupes.map(d => c.y("⚠ ") + d), c.y); }
  if (fix && bal.length) {
    const ok = auto ? "y" : (await ask("\n  " + c.b(t.installQ) + c.d("[y/N] "))).trim().toLowerCase();
    if (ok === "y") { console.log("\n  " + c.y(t.dFixing));
      for (const b of bal) { run(`claude plugin disable ${b.name}@synced`, false);
        run(`claude plugin disable ${b.name}@anthropic-plugin-directory`, false); } }
  }
  console.log("\n  " + grad("✦") + " " + c.b(`~${total} ${t.dTokens}/req`) +
    c.d(` (ballast ${balTok} · CLAUDE.md ${mdTok} · skills ${skTok})`));
  console.log("  " + c.r(c.b(`≈ $${usdMo}/mo`)) + c.d(` @ ${reqs} ${t.dCostNote}`));
}

function preview() {
  const t = tr("ru"); banner(t);
  console.log("\n  " + c.d(t.previewNote + ": frontend + TypeScript, вайбкодер, весь день в ИИ"));
  const demo = new Set(["code", "frontend", "ts", "save-tokens", "quality", "vibe", "heavy"]);
  printPlan(t, pick(demo), false, demo);
  console.log("\n  " + c.d(t.previewNext + ": ") + c.b(t.installQ + "[y/N]"));
}

const HELP = {
  en: `
  ${grad("✦ ai-kit")} — set up your AI coding assistant right

  ${c.b("Usage")}
    npx aidevkit                   survey → personal plan → install
    npx aidevkit scan              inventory: IDEs, AI extensions, CLIs, local/cloud LLMs, MCP, project stacks
    npx aidevkit doctor            audit your setup: ballast, heavy configs, tokens/req, $/mo
    npx aidevkit discover          live search for your stack: GitHub, npm, PyPI (unverified)
    npx aidevkit doctor --fix      same + disable ballast plugins (asks first)
    npx aidevkit update            re-plan from the saved profile, no survey

  ${c.b("Flags")}
    --lang <code>    interface language (en, ru, kk, es, zh, …); default: saved profile or $LANG
    --yes            no confirmations
    --dry-run        print commands, run nothing
    --no-open        don't open the HTML report in the browser
    --no-scan        skip the local scan before the survey
    --no-discover    skip the live search after the plan
    --json           doctor / scan / discover: machine-readable output
    --requests <n>   doctor: requests/day for the $ estimate (default 100)
    --help, -h       this screen
    --version, -v    version

  ${c.b("Files")}
    ~/.ai-kit.json          saved profile
    ./ai-kit-report.html    personal report (written where you run it)
    ./ai-kit-plan.md        step-by-step plan (manual mode)

  ${c.d("Nothing is installed or disabled without your explicit y. No telemetry.")}
`,
  ru: `
  ${grad("✦ ai-kit")} — настрой своего ИИ-ассистента правильно

  ${c.b("Использование")}
    npx aidevkit                   опрос → персональный план → установка
    npx aidevkit scan              инвентаризация: IDE, ИИ-расширения, CLI, локальные/облачные LLM, MCP, стек проектов
    npx aidevkit doctor            аудит установки: балласт, тяжёлые конфиги, токены/запрос, $/мес
    npx aidevkit discover          живой поиск под твой стек: GitHub, npm, PyPI (не проверено)
    npx aidevkit doctor --fix      то же + отключить балласт (спросит)
    npx aidevkit update            пересобрать план из сохранённого профиля, без опроса

  ${c.b("Флаги")}
    --lang <код>     язык интерфейса (en, ru, kk, es, zh, …); по умолчанию — из профиля или $LANG
    --yes            без подтверждений
    --dry-run        показать команды, ничего не выполнять
    --no-open        не открывать HTML-отчёт в браузере
    --no-scan        не сканировать машину перед опросом
    --no-discover    не искать в сети после плана
    --json           doctor / scan / discover: машиночитаемый вывод
    --requests <n>   doctor: запросов в день для оценки $ (по умолчанию 100)
    --help, -h       этот экран
    --version, -v    версия

  ${c.b("Файлы")}
    ~/.ai-kit.json          сохранённый профиль
    ./ai-kit-report.html    персональный отчёт (пишется туда, откуда запущен)
    ./ai-kit-plan.md        пошаговый план (ручной режим)

  ${c.d("Ничего не ставится и не отключается без твоего явного y. Телеметрии нет.")}
`,
  kk: `
  ${grad("✦ ai-kit")} — ИИ-ассистентіңді дұрыс баптап ал

  ${c.b("Қолдану")}
    npx aidevkit                   сауалнама → жеке жоспар → орнату
    npx aidevkit scan              түгендеу: IDE, ИИ-кеңейтімдер, CLI, жергілікті/бұлт LLM, MCP, жобалар стегі
    npx aidevkit doctor            орнатуды тексеру: балласт, ауыр конфигтер, токен/сұраныс, $/ай
    npx aidevkit doctor --fix      сол + балласт плагиндерін өшіру (алдымен сұрайды)
    npx aidevkit discover          стегіңе 20k+ құрал каталогы (MCP, скилдер, плагиндер) + GitHub тірі іздеу
    npx aidevkit update            сақталған профильден жоспарды қайта құру, сауалнамасыз

  ${c.b("Жалаулар")}
    --lang <код>     интерфейс тілі (en, ru, kk, es, zh, …); әдепкі — профильден немесе $LANG
    --yes            растаусыз (тек іріктелген жиын орнатылады)
    --dry-run        командаларды көрсету, ештеңе орындамау
    --no-open        HTML-есепті браузерде ашпау
    --no-scan        сауалнама алдында машинаны сканерлемеу
    --no-discover    жоспардан кейін каталог/желіден іздемеу
    --json           doctor / scan / discover: машина оқитын шығыс
    --requests <n>   doctor: $ бағалау үшін күндік сұраныс саны (әдепкі 100)
    --help, -h       осы экран
    --version, -v    нұсқа

  ${c.b("Файлдар")}
    ~/.ai-kit.json          сақталған профиль
    ./ai-kit-report.html    жеке есеп (іске қосылған қалтаға жазылады)
    ./ai-kit-plan.md        қадамдық жоспар (қолмен режимі)

  ${c.d("Сенің нақты y-сыз ештеңе орнатылмайды да, өшірілмейді де. Телеметрия жоқ.")}
`,
};

// язык для неинтерактивных команд: --lang → сохранённый профиль → $LANG → en
function langFor(args) {
  const li = args.indexOf("--lang");
  const l = li >= 0 ? args[li + 1] : (loadProfile()?.lang || (process.env.LANG || "").slice(0, 2).toLowerCase());
  return FULL.has(l) ? l : "en";
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
    return console.log(HELP[langFor(args)] || HELP.en);
  }
  if (args.includes("--version") || args.includes("-v")) return console.log(VERSION);
  if (args[0] === "discover") {
    const t2 = tr(langFor(args)); const s = scan(); const prof = loadProfile();
    const tags = new Set([...(prof?.tags || []), ...s.tags]);
    if (!args.includes("--json")) console.log("\n  " + c.d(t2.dsSearching));
    const haveMcp = new Set(s.mcp.flatMap(m => m.servers));
    const found = rankCatalog(await loadCatalog(), tags, haveMcp, 20);
    for (const f of await discover(tags, haveMcp)) if (!found.some(x => x.repo === f.repo)) found.push(f);
    if (args.includes("--json")) return console.log(JSON.stringify(found, null, 2));
    return printDiscover(t2, found);
  }
  if (args[0] === "scan") {
    const s = scan();
    if (args.includes("--json")) return console.log(JSON.stringify(s, null, 2));
    return printScan(tr(langFor(args)), s);
  }
  if (args[0] === "doctor") {
    const lang = langFor(args);
    const ri = args.indexOf("--requests");
    return doctor(tr(lang), {
      fix: args.includes("--fix"), auto: args.includes("--yes"),
      json: args.includes("--json"), reqs: ri >= 0 ? parseInt(args[ri + 1], 10) || 100 : 100 });
  }
  if (args[0] === "update") {
    const prof = loadProfile();
    const t2 = tr(prof?.lang && UI[prof.lang] ? prof.lang : "en");
    if (!prof) { console.log("\n  " + c.y(t2.uNoProfile)); return; }
    banner(t2);
    return planAndInstall(t2, new Set(prof.tags), prof.src || [], args.includes("--dry-run"), args.includes("--yes"));
  }
  if (args.includes("--preview")) return preview();
  if (args.includes("--test")) return test();
  const dry = args.includes("--dry-run"), auto = args.includes("--yes");
  const li = args.indexOf("--lang");

  const lang = li >= 0 ? args[li + 1] : await chooseLang();
  const t = tr(lang);
  if (!FULL.has(lang)) console.log("  " + c.d(t.enFallback));

  banner(t);
  // разведка: что уже стоит и какой стек в проектах → ответы предзаполнены, остаётся подтвердить
  let guess = new Set(), scanPairs = [];
  if (input.isTTY && !args.includes("--no-scan")) { const s = scan(); printScan(t, s);
    guess = new Set(s.tags); scanPairs = scanSrc(s);
    if (guess.size) console.log("\n  " + c.g("✓ ") + t.scGuess); }
  console.log();
  // опрос с «назад» (esc/←): ответы хранятся по-вопросно и пересобираются
  const perQ = []; let qi = 0;
  while (qi < QUESTIONS.length) {
    const def = QUESTIONS[qi];
    const sofar = new Set(perQ.slice(0, qi).filter(Boolean).flatMap(r => [...r.tags]));
    if (def.when && !def.when.some(w => sofar.has(w))) { perQ[qi] = null; qi++; continue; } // адаптивный — не для этой роли
    const r = await choose(t, def, guess);
    if (r === BACK) {
      if (qi > 0) { do { qi--; } while (qi > 0 && perQ[qi] === null); }
      console.log(); continue;
    }
    perQ[qi] = r; qi++; console.log();
  }
  const tags = new Set(), srcPairs = [...scanPairs];
  for (const r of perQ) if (r) { for (const x of r.tags) tags.add(x); srcPairs.push(...r.src); }

  saveProfile(lang, tags, srcPairs);
  console.log("  " + c.d(t.pSaved));
  await planAndInstall(t, tags, srcPairs, dry, auto);
}

const verifyLine = it => it.bin
  ? (process.platform === "win32" ? `where ${it.bin}` : `command -v ${it.bin}`)
  : `claude plugin list | grep ${it.id}`;

// Ручной режим: полный пошаговый план в файл — для тех, кто не даёт доступ на выполнение
function writePlanFile(t, chosen, tags) {
  const L = [`# ✦ ai-kit — ${t.recommend}`, "", `_${new Date().toISOString().slice(0, 10)}_`, "",
    `## ${t.manDo}`, ""];
  chosen.forEach((it, i) => {
    L.push(`### ${i + 1}. ${it.id} — ${t[it.why]}`, "");
    if (it.install.length) { L.push("```bash", ...it.install, "```", ""); }
    L.push(`${t.manVerify}: \`${verifyLine(it)}\``, "");
  });
  L.push(`## ${t.manBallast}`, "", "```bash",
    ...ballastFor(tags).map(b => `claude plugin disable ${b}@synced`), "```", "",
    `## ${t.pUse}`, "");
  for (const it of chosen) L.push(`- **${it.id}** — ${it.use || t.useAuto}`);
  L.push("", `_${t.restart}_`, "");
  return { p: path.join(process.cwd(), "ai-kit-plan.md"), content: L.join("\n") };
}

// Полный персональный разбор одной HTML-страницей
function writeReport(t, chosen, tags, srcPairs = [], meta = new Map(), found = []) {
  const esc2 = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const by = tag => srcPairs.filter(([x]) => x === tag).map(([, l]) => l);
  const cards = chosen.map((it, i) => {
    const because = [...new Set(it.tags.filter(x => tags.has(x)).flatMap(by))];
    const m = meta.get(it.id);
    const starsBadge = m ? `<span class="stars">★ ${_fmtStars(m.stars)}</span>` : "";
    const repoLink = it.repo ? `<a href="https://github.com/${esc2(it.repo)}" target="_blank" class="repo">${esc2(it.repo)}</a>${starsBadge}` : "";
    const demo = (it.demoB && it.demoA)
      ? `<div class="demo"><div class="demo-col bad"><span class="demo-tag">✗ without</span>${esc2(it.demoB)}</div>` +
        `<div class="demo-col good"><span class="demo-tag">✓ with</span>${esc2(it.demoA)}</div></div>`
      : "";
    const scopeLabel = { mcp: "MCP", any: "any assistant", claude: "Claude" }[it.scope || "claude"];
    const scopeCls = "scope scope-" + (it.scope || "claude");
    return `<div class="card" style="--i:${i}">` +
      `<div class="card-head"><span class="card-idx">${String(i + 1).padStart(2, "0")}</span>` +
      `<div><h3>${esc2(it.id)}<span class="${scopeCls}">${scopeLabel}</span></h3><p class="card-desc">${esc2(t[it.why])}</p></div></div>` +
      demo +
      (because.length ? `<p class="why"><span class="why-label">${esc2(t.repBecause)}</span> ${esc2(because.join(" · "))}</p>` : "") +
      `<div class="card-foot">${repoLink}` +
      `<code class="use">${esc2(it.use || t.useAuto)}</code></div>` +
      (it.install.length ? `<details><summary>install</summary><pre>${esc2(it.install.join("\n"))}</pre>` +
        (it.altInstall ? Object.entries(it.altInstall).map(([k, v]) => `<pre class="alt">${esc2(k)}: ${esc2(v)}</pre>`).join("") : "") +
        `</details>` : "") +
      `</div>`;
  }).join("\n");
  const prof = [...new Set(srcPairs.map(([, l]) => l))].join(" · ");
  const bal = ballastFor(tags);
  const kindTag = { mcp: "MCP", plugin: "plugin", skill: "skill" };
  const foundCards = found.slice(0, 12).map(f =>
    `<div class="fcard${f.have ? " fhave" : ""}"><div class="frow"><a href="https://github.com/${esc2(f.repo)}" target="_blank" class="fname">${esc2(f.name)}</a>` +
    `<span class="scope scope-${f.kind === "mcp" ? "mcp" : "claude"}">${kindTag[f.kind]}</span><span class="stars">★ ${_fmtStars(f.stars)}</span>` +
    `<span class="fage">${esc2(f.pushed.slice(0, 7))}</span>${f.have ? `<span class="fhv">✓ ${esc2(t.repHave)}</span>` : ""}</div>` +
    `<p class="fdesc">${esc2(f.desc)}</p>` +
    (f.why || signalLine(f) ? `<p class="why"><span class="why-label">${esc2(t.repBecause)}</span> ${esc2((f.why || []).join(" · "))}${f.why && signalLine(f) ? " · " : ""}<span class="fsig">${esc2(signalLine(f))}</span></p>` : "") +
    (f.install ? `<details><summary>install</summary><pre>${esc2(f.install.claude)}</pre>` +
      ["cursor", "gemini", "codex"].filter(k => f.install[k]).map(k => `<pre class="alt">${k}: ${esc2(f.install[k])}</pre>`).join("") + `</details>` : "") +
    `</div>`).join("\n");
  const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ai-kit — ${esc2(t.repTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0e0e;--surface:#161616;--border:#252525;--text:#c4c4c4;--text2:#767676;
  --accent:#daea6a;--bad:#d46d5c;--good:#64be78;--link:#7ab4e0;
  --mono:"JetBrains Mono",ui-monospace,monospace;
  --sans:"DM Sans",system-ui,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font:15px/1.55 var(--sans);
  max-width:820px;margin:0 auto;padding:32px 16px 64px;
  background-image:repeating-linear-gradient(0deg,transparent,transparent 59px,#ffffff03 59px,#ffffff03 60px)}
::selection{background:var(--accent);color:#0e0e0e}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}

/* header */
.head{border-bottom:1px solid var(--accent);padding:0 0 20px;margin:0 0 32px}
.head h1{font:700 13px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--accent);margin:0 0 8px}
.head .title{font:700 32px/1.1 var(--sans);color:#ececec;margin:0 0 12px}
.head .prof{font:13px var(--mono);color:var(--text2)}

/* grid of numbered cards */
.card{background:var(--surface);border:1px solid var(--border);padding:0;margin:0 0 2px;
  animation:slideIn .3s ease both;animation-delay:calc(var(--i) * 40ms)}
@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.card:first-child{border-radius:6px 6px 0 0}.card:last-child{border-radius:0 0 6px 6px}
.card-head{display:flex;align-items:flex-start;gap:14px;padding:16px 18px 12px}
.card-idx{font:700 22px/1 var(--mono);color:var(--accent);flex-shrink:0;width:34px;text-align:right;padding-top:2px}
.card h3{font:700 16px/1.2 var(--mono);color:#e8e8e8;margin:0 0 3px}
.card-desc{font-size:13px;color:var(--text2);margin:0}
.scope{font:700 9px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:2px;margin-left:8px;vertical-align:2px}
.scope-mcp{background:#1a1e28;color:var(--link);border:1px solid #253040}
.scope-any{background:#1a1e18;color:var(--good);border:1px solid #253020}
.scope-claude{background:#1e1a18;color:var(--text2);border:1px solid #302820}

.demo{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0 18px 12px 66px;border:1px solid var(--border);border-radius:4px;overflow:hidden;font:12px/1.4 var(--mono)}
.demo-col{padding:8px 10px;position:relative}
.demo-col.bad{background:#1c1414;color:#d4806e;border-right:1px solid var(--border)}
.demo-col.good{background:#141c16;color:#74c880}
.demo-tag{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;opacity:.6}

.why{font:12px var(--mono);color:var(--text2);padding:0 18px 10px 66px}
.why-label{color:var(--accent);text-transform:uppercase;font-size:10px;letter-spacing:.1em;margin-right:6px}

.card-foot{display:flex;align-items:center;gap:12px;padding:0 18px 14px 66px;flex-wrap:wrap}
.repo{font:12px var(--mono);color:var(--link);opacity:.7}.repo:hover{opacity:1}
.stars{font:700 11px var(--mono);color:var(--accent);margin-left:8px}
.use{font:12px var(--mono);color:var(--text2);background:#181818;padding:2px 8px;border-radius:3px;border:1px solid var(--border)}

details{border-top:1px solid var(--border);margin:0}
summary{font:500 12px var(--mono);padding:8px 18px 8px 66px;color:var(--text2);cursor:pointer;user-select:none}
summary:hover{color:var(--accent)}
pre{font:12px/1.5 var(--mono);color:#74c880;background:#0c0c0c;padding:10px 18px 10px 66px;margin:0;overflow-x:auto;border-top:1px solid var(--border)}
pre.alt{color:var(--link);background:#0e1014}

/* ballast */
.section{margin:32px 0 0}.section h2{font:700 11px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--bad);margin:0 0 10px}
.bal-list{font:13px var(--mono);color:var(--text2);display:flex;flex-wrap:wrap;gap:6px}
.bal-list span{background:#1a1212;border:1px solid #302020;padding:2px 8px;border-radius:3px;color:var(--bad)}

/* discovered */
.section.found h2{color:var(--link)}.unv{font-weight:400;color:var(--text2);margin-left:8px;letter-spacing:0}
.fnote{font:12px var(--mono);color:var(--text2);margin:0 0 12px}
.fcard{background:var(--surface);border:1px solid var(--border);padding:12px 16px 0;margin:0 0 2px}
.fcard.fhave{opacity:.55}
.frow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fname{font:700 14px var(--mono);color:#e8e8e8}.fage{font:11px var(--mono);color:var(--text2)}.fhv{font:11px var(--mono);color:var(--good)}
.fdesc{font-size:13px;color:var(--text2);margin:4px 0 12px}
.fcard details{margin:0 -16px}.fcard summary,.fcard pre{padding-left:16px}.fcard .why{padding:0 0 10px}.fsig{color:var(--good)}
.footer{margin:40px 0 0;font:12px var(--mono);color:var(--text2);border-top:1px solid var(--border);padding:16px 0 0}
.footer a{color:var(--accent)}

@media(max-width:600px){
  .demo{grid-template-columns:1fr;gap:0}.demo-col.bad{border-right:0;border-bottom:1px solid var(--border)}
  .card-head,.why,.card-foot,summary,pre{padding-left:18px}
  .demo{margin-left:18px}.card-idx{width:28px;font-size:18px}
  .head .title{font-size:24px}
}
</style></head><body>
<header class="head">
  <h1>ai-kit</h1>
  <div class="title">${esc2(t.repTitle)}</div>
  <div class="prof">${esc2(t.repProfile)}: ${esc2(prof || "—")}</div>
</header>
${cards}
${found.length ? `<div class="section found">
  <h2>${esc2(t.repFound)} <span class="unv">${esc2(t.repUnverified)}</span></h2>
  <p class="fnote">${esc2(t.dsNote)}</p>
  ${foundCards}
</div>` : ""}
<div class="section">
  <h2>${esc2(t.disable)}</h2>
  <div class="bal-list">${bal.map(b => `<span>✗ ${esc2(b)}</span>`).join("")}</div>
</div>
<div class="footer"><a href="https://github.com/hasabasa/ai-kit">ai-kit</a> · ${new Date().toISOString().slice(0, 10)} · ${esc2(t.restart)}</div>
</body></html>`;
  return { p: path.join(process.cwd(), "ai-kit-report.html"), content };
}

async function planAndInstall(t, tags, srcPairs, dry, auto) {
  const chosen = pick(tags);
  const needUv = chosen.some(it => (it.needs || []).includes("uv")) && !have("uv");
  const meta = await fetchMeta(chosen);
  printPlan(t, chosen, needUv, tags, meta);
  let found = [];
  if (!process.argv.includes("--no-discover")) {
    const haveMcp = new Set(MCP_HOSTS.flatMap(([, file, get]) => Object.keys(get(readJson(file)) || {})));
    found = rankCatalog(await loadCatalog(), tags, haveMcp);
    if (found.length < 5) { console.log("\n  " + c.d(t.dsSearching)); // редкий стек — добираем живым поиском
      const live = await discover(tags, haveMcp); for (const f of live) if (!found.some(x => x.repo === f.repo)) found.push(f); }
    printDiscover(t, found);
  }

  // полный HTML-разбор: что, почему именно тебе, как пользоваться
  const rep = writeReport(t, chosen, tags, srcPairs, meta, found);
  try { fs.writeFileSync(rep.p, rep.content);
    console.log("\n  " + grad("✦") + " " + c.b(t.repFile) + " " + c.d(rep.p));
    if (input.isTTY && !process.argv.includes("--no-open")) {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
      try { execSync(`${opener} ${JSON.stringify(rep.p)}`, { stdio: "ignore" }); } catch {}
    }
  } catch {}

  // режим: автоматически / вручную / отмена (esc — тоже отмена)
  let mode = auto ? 0 : null;
  if (mode === null) {
    console.log();
    const m = await menu(t, t.mHow, [t.mAuto, t.mManual, t.mCancel], false, false);
    mode = m.back ? 2 : ([...m.sel][0] ?? 2);
  }
  if (mode === 2) { console.log("  " + c.d(t.nochange)); return; }
  if (mode === 1) {
    const { p, content } = writePlanFile(t, chosen, tags);
    fs.writeFileSync(p, content);
    console.log("\n  " + c.g("✓ ") + c.b(t.planFile) + " " + p);
    return;
  }

  console.log("\n  " + c.b(t.installing) + "\n");
  for (const it of chosen) { if (it.install.length) console.log("  " + c.g("▸ ") + c.b(it.id)); for (const cmd of it.install) run(cmd, dry); }
  console.log("\n  " + c.y(t.disabling));
  for (const b of ballastFor(tags)) run(`claude plugin disable ${b}@synced`, dry);

  // найденное — только по явному выбору: с --yes не ставится, это чужой непроверенный код
  const installable = found.filter(f => f.install && !f.have);
  if (installable.length && !auto) {
    console.log();
    const m = await menu(t, t.iTitle, [c.d(t.iSkip), ...installable.map(f => `${pad(f.name.slice(0, 24), 24)} ${c.d("★" + _fmtStars(f.stars) + " · " + (f.why || []).slice(0, 2).join(", "))}`)], true, false);
    const picked = m.back ? [] : [...m.sel].filter(i => i > 0).map(i => installable[i - 1]);
    if (picked.length) {
      const targets = targetsFor(tags);
      if (!targets.length) { console.log("  " + c.y(t.iNoHost)); for (const f of picked) if (f.install) console.log("  " + c.d(f.install.claude || Object.values(f.install)[0])); }
      else {
        console.log("  " + c.b(t.iInto + ": ") + [...new Set(targets.map(x => x.label))].join(", ") + "\n");
        const rows = [];
        for (const f of picked) { console.log("  " + c.g("▸ ") + c.b(f.name));
          for (const [host, st] of connectFound(f, targets, dry)) rows.push(`${st === "ok" ? c.g("✓") : st === "exists" ? c.d("=") : c.r("✗")} ${c.b(pad(f.name.slice(0, 22), 22))} ${c.d(pad(host, 20))} ${st === "ok" ? c.d(t.iDone) : st === "exists" ? c.d(t.iExists) : c.r(t.iFail)}`); }
        console.log(); box(t.iResult, rows);
        console.log("  " + c.d(t.iBackup));
      }
    }
  } else if (installable.length && auto) console.log("\n  " + c.d(t.iAutoSkip));

  // проверка: встало ли на самом деле
  if (!dry) {
    let listing = "";
    try { listing = execSync("claude plugin list", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
    const on = new Set(parsePlugins(listing).filter(p2 => p2.enabled).map(p2 => p2.name));
    console.log(); box(t.vTitle, chosen.map(it => {
      const okI = it.bin ? have(it.bin) : (it.install.length ? on.has(it.id) : true);
      return `${okI ? c.g("✓") : c.r("✗")} ${c.b(pad(it.id, 22))} ${okI ? c.d(t.vOk) : c.r(t.vFail)}`;
    }));
  }
  console.log(); box(t.pUse, chosen.map(it => `${grad("•")} ${c.b(pad(it.id, 22))} ${c.d(it.use || t.useAuto)}`));
  console.log("\n  " + c.g("✓ " + t.done) + (dry ? c.d(" (dry-run)") : "") + c.d(" — " + t.restart));
  console.log("  " + c.d("♥ " + t.support));
}

function test() {
  const ok = (cond, m) => { if (!cond) { console.error("FAIL:", m); process.exit(1); } };
  const front = pick(new Set(["code", "frontend", "ts", "save-tokens"])).map(i => i.id);
  ok(front.includes("ponytail") && front.includes("typescript-lsp") && front.includes("frontend-design") && front.includes("graphify"), "frontend+ts");
  ok(!front.includes("pyright-lsp"), "без python нет pyright");
  ok(pick(new Set(["code", "python"])).map(i => i.id).includes("pyright-lsp"), "python → pyright");
  ok(pick(new Set(["quality"])).map(i => i.id).includes("mattpocock-skills"), "вайбкодер(quality) → mattpocock");
  ok(tr("ja").qKind === "何を作っていますか？", "ja перевод");
  ok(tr("xx").qKind === UI.en.qKind, "непереведённый → en");
  ok(FULL.size === LANGS.length && LANGS.every(l => FULL.has(l.code)), "все 17 языков полные");
  ok(tr("kk").qKind === "Немен айналысасың?", "kk перевод");
  ok(tr("es").qGoal === "¿Objetivo principal?", "es перевод");
  const pp = Object.fromEntries(parsePlugins(
    "  ❯ sales@synced\n    Scope: user\n  ❯ finance@anthropic-plugin-directory\n    disabled\n" +
    "  ❯ finance@synced\n    disabled\n  ❯ figma@anthropic-plugin-directory\n  ❯ figma@synced\n    disabled\n"
  ).map(p => [p.name, p.enabled]));
  ok(pp.sales === true, "doctor: sales включён");
  ok(pp.finance === false, "doctor: finance выключен в обоих вариантах");
  ok(pp.figma === true, "doctor: включённый вариант побеждает");
  ok(pick(new Set(["go"])).map(i => i.id).includes("gopls-lsp"), "go → gopls-lsp");
  ok(pick(new Set(["devops"])).map(i => i.id).includes("terraform"), "devops → terraform");
  ok(pick(new Set(["code", "speed"])).map(i => i.id).includes("feature-dev"), "speed → feature-dev");
  ok(pick(new Set(["code", "team"])).map(i => i.id).includes("pr-review-toolkit"), "team → pr-review");
  ok(pick(new Set(["code", "python", "data", "llm"])).map(i => i.id).includes("soup") && !pick(new Set(["code", "ts"])).map(i => i.id).includes("soup"), "llm → soup, ts → no soup");
  ok(verifyLine(CATALOG.find(i => i.id === "soup")).includes("soup") && verifyLine(CATALOG.find(i => i.id === "ponytail")).includes("plugin list"), "verify by bin");
  ok(QUESTIONS.find(q => q.q === "qDb").when.includes("data") && QUESTIONS.find(q => q.q === "qStackMob").when[0] === "mobile", "adaptive when[] on new questions");
  ok(tr("ru").qPain === "Что бесит больше всего?" && tr("kk").qAssist.length > 5 && tr("es").dSupa === "Supabase / Firebase", "new question strings ru/kk/es");
  ok(!ballastFor(new Set(["content"])).includes("marketing"), "контентщику маркетинг не сносим");
  ok(ballastFor(new Set(["code"])).includes("marketing"), "деву маркетинг сносим");
  ok(tr("kk").pWhy === "Неге дәл саған", "kk reasons");
  const tg = new Set(); expandWord(tg, "фулстек");
  ok(tg.has("code") && tg.has("frontend") && tg.has("ts"), "SYN: фулстек → code/frontend/ts");
  ok(pick(new Set(["php"])).map(i => i.id).join() .includes("php-lsp"), "php → php-lsp");
  ok(pick(new Set(["php"])).map(i => i.id).includes("laravel-boost"), "php → laravel-boost");
  ok(pick(new Set(["rust"])).map(i => i.id).includes("rust-analyzer-lsp"), "rust → rust-analyzer");
  ok(pick(new Set(["java", "kotlin"])).map(i => i.id).filter(x => x.includes("lsp")).length >= 2, "jvm → jdtls+kotlin");
  ok(tr("ru").bPhp === "PHP / Laravel", "техназвания падают на en");
  const sy = new Set(); expandWord(sy, "laravel");
  ok(sy.has("php") && sy.has("backend"), "SYN: laravel → php+backend");
  const rep = writeReport(tr("ru"), pick(new Set(["php"])), new Set(["php"]), [["php", "PHP / Laravel"]]);
  ok(rep.content.includes("php-lsp") && rep.content.includes("laravel-boost"), "report: карточки инструментов");
  ok(rep.content.includes("подобран из-за") && rep.content.includes("PHP / Laravel"), "report: причины из ответов");
  ok(rep.content.includes("✗ without") && rep.content.includes("✓ with"), "report: demo before/after");
  ok(rep.content.includes("JetBrains Mono"), "report: custom font");
  ok(_fmtStars(0) === "0", "stars: 0");
  ok(_fmtStars(999) === "999", "stars: 999");
  ok(_fmtStars(1000) === "1k", "stars: 1k");
  ok(_fmtStars(1500) === "1.5k", "stars: 1.5k");
  ok(_fmtStars(12300) === "12k", "stars: 12k");
  ok(_fmtStars(158318) === "158k", "stars: 158k");
  ok(_fmtStars(6679000) === "6.7M", "stars: 6.7M");
  ok(vlen("日本語") === 6 && vlen("abc") === 3 && vlen(pad("日本", 6)) === 6 && clip("日本語", 3) .replace(/\x1b\[0m/, "") === "日", "cjk width");
  const repMeta = writeReport(tr("en"), pick(new Set(["code", "save-tokens"])), new Set(["code", "save-tokens"]), [], new Map([["ponytail", { stars: 42 }]]));
  ok(repMeta.content.includes("★ 42"), "report: stars from meta");
  ok(tr("ru").mCancel === "Отмена", "mCancel ru");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aikit-"));
  fs.mkdirSync(path.join(tmp, "a")); fs.writeFileSync(path.join(tmp, "a", "package.json"), JSON.stringify({ dependencies: { next: "1" } }));
  fs.mkdirSync(path.join(tmp, "b")); fs.writeFileSync(path.join(tmp, "b", "requirements.txt"), "fastapi\n");
  fs.mkdirSync(path.join(tmp, "a", "node_modules", "x"), { recursive: true }); fs.writeFileSync(path.join(tmp, "a", "node_modules", "x", "go.mod"), "");
  const sp = scanProjects(tmp);
  ok(sp.projects.length === 2, "scan: два проекта, node_modules пропущен");
  const spTags = new Set(sp.projects.flatMap(p => [...p.tags]));
  ok(spTags.has("react") && spTags.has("frontend") && spTags.has("python") && spTags.has("backend") && !spTags.has("go"), "scan: next→react/frontend, fastapi→python/backend");
  ok(sp.projects.some(p => p.labels.has("Next.js")) && sp.projects.some(p => p.labels.has("FastAPI")), "scan: подписи стека");
  fs.rmSync(tmp, { recursive: true, force: true });
  const kw = keywordsFor(new Set(["code", "backend", "devops", "ts"]));
  ok(kw.includes("github") && kw.includes("openapi") && kw.includes("docker") && !kw.includes("typescript"), "discover: MCP keywords by service, not language");
  ok(keywordsFor(new Set(["postgres", "figma"]))[0] === "postgres", "discover: survey DB/service tags map to keywords");
  ok(mcpInstall("pg", { pkg: "@x/pg-mcp" }).claude === "claude mcp add pg -- npx -y @x/pg-mcp", "discover: claude mcp add npm");
  ok(mcpInstall("pg", { pkg: "pg-mcp", py: true }).gemini === "gemini mcp add pg uvx pg-mcp", "discover: uvx for python");
  ok(mcpInstall("gh", { url: "https://x/mcp" }).claude.includes("--transport http gh https://x/mcp"), "discover: remote");
  const fake = [
    { name: "pg-mcp", repo: "a/pg-mcp", kind: "mcp", desc: "PostgreSQL MCP server", stars: 800, pushed: "2026-09-01", install: { pkg: "pg-mcp" }, hosts: ["claude", "cursor"], topics: ["mcp-server", "postgres"] },
    { name: "BigProduct", repo: "b/big", kind: "mcp", desc: "Low-code platform with postgres support", stars: 120000, pushed: "2026-09-01", hosts: ["claude", "cursor"], topics: ["mcp-server"] },
    { name: "old-pg", repo: "c/old", kind: "mcp", desc: "postgres mcp", stars: 900, pushed: "2024-01-01", install: { pkg: "old-pg" }, hosts: ["claude"], topics: ["mcp"] },
    { name: "gemini-only", repo: "d/g", kind: "plugin", desc: "postgres helper for gemini", stars: 500, pushed: "2026-09-01", hosts: ["gemini"], topics: [] },
    { name: "figma-mcp", repo: "e/f", kind: "mcp", desc: "Figma", stars: 700, pushed: "2026-09-01", install: { pkg: "figma-mcp" }, hosts: ["claude"], topics: ["mcp-server"] },
  ];
  const rk = rankCatalog(fake, new Set(["postgres", "claude"]));
  ok(rk[0].name === "pg-mcp", "rank: real MCP with install beats a 120k★ product");
  ok(rk.findIndex(f => f.name === "BigProduct") > rk.findIndex(f => f.name === "old-pg"), "rank: product penalty stronger than age penalty");
  ok(!rk.some(f => f.name === "gemini-only"), "rank: host filter drops gemini-only for a claude user");
  ok(!rk.some(f => f.name === "figma-mcp"), "rank: no keyword hit → not shown");
  ok(rk[0].install.claude.startsWith("claude mcp add pg-mcp -- npx -y pg-mcp") && rk[0].why.includes("postgres"), "rank: install + why");
  ok(rankCatalog(fake, new Set(["postgres"])).some(f => f.name === "gemini-only"), "rank: no assistant chosen → all hosts");
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "aikit-mcp-"));
  const jf = path.join(tmp2, "mcp.json"); fs.writeFileSync(jf, JSON.stringify({ mcpServers: { old: { command: "x" } } }));
  ok(writeJsonMerge(jf, "mcpServers", "pg", mcpEntry({ pkg: "pg-mcp" }), false) === "ok", "l4: json merge ok");
  const jj = readJson(jf); ok(jj.mcpServers.old && jj.mcpServers.pg.args[1] === "pg-mcp" && fs.readdirSync(tmp2).some(n => n.startsWith("mcp.json.bak-")), "l4: old kept, new added, backup made");
  ok(writeJsonMerge(jf, "mcpServers", "pg", mcpEntry({ pkg: "pg-mcp" }), false) === "exists", "l4: no duplicate");
  ok(mcpEntry({ url: "https://x/mcp" }, true).type === "http" && mcpEntry({ pkg: "p", py: true }).command === "uvx", "l4: entry shapes");
  const tf = path.join(tmp2, "config.toml"); fs.writeFileSync(tf, "model = \"o3\"\n");
  ok(writeTomlMerge(tf, "pg", { pkg: "pg-mcp" }, false) === "ok" && fs.readFileSync(tf, "utf8").includes("[mcp_servers.pg]") && fs.readFileSync(tf, "utf8").startsWith("model"), "l4: toml append keeps existing");
  ok(writeTomlMerge(tf, "pg", { pkg: "pg-mcp" }, false) === "exists", "l4: toml no duplicate");
  ok(slug("Chrome DevTools MCP") === "chrome-devtools-mcp", "l4: slug");
  fs.rmSync(tmp2, { recursive: true, force: true });
  const repF = writeReport(tr("ru"), [], new Set(), [], new Map(), [{ name: "dbhub", repo: "bytebase/dbhub", stars: 3600, desc: "db", pushed: "2026-09-01T00:00:00Z", kind: "mcp", install: mcpInstall("dbhub", { pkg: "@bytebase/dbhub" }), have: false }]);
  ok(repF.content.includes("Найдено под твой стек") && repF.content.includes("claude mcp add dbhub"), "report: discovered section");
  const plan = writePlanFile(tr("ru"), pick(new Set(["code", "ts"])), new Set(["code"]));
  ok(plan.content.includes("ponytail") && plan.content.includes("claude plugin install"), "план: команды на месте");
  ok(plan.content.includes("claude plugin disable marketing@synced"), "план: балласт на месте");
  ok(plan.content.includes("command -v graphify") || plan.content.includes("where graphify"), "план: проверка graphify");
  console.log("OK: подбор + i18n + меню + doctor + reasons");
}

main();
