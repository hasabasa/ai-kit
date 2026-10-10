#!/usr/bin/env node
/**
 * harvest — сборщик большого каталога инструментов. В npm-пакет НЕ входит, гоняется нами.
 *
 *   node scripts/harvest.mjs [--out catalog.json] [--quick] [--only topics,awesome,smithery,hn,install] [--merge]
 *   --only    гнать только эти фазы;  --merge  начать с записей уже лежащего --out (дособрать, не затирая)
 *
 * Источники: GitHub (топики + awesome-листы), Smithery (MCP), Hacker News (buzz), npm / PyPI (скачивания).
 * Токен GitHub: GITHUB_TOKEN / GH_TOKEN или `gh auth token` — без него поиск 10/мин и ядро 60/час, сбор не доедет.
 * Только stdlib. Полный прогон ~15–25 минут, лог в stderr, результат — один JSON.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const OUT = args[args.indexOf("--out") + 1] && args.includes("--out") ? args[args.indexOf("--out") + 1] : "catalog.json";
const QUICK = args.includes("--quick");
const ONLY = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const MERGE = args.includes("--merge");
const phase = name => !ONLY || ONLY.has(name);
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || (() => { try { return execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } })();
const UA = "ai-kit-harvest/0.1 (+https://github.com/hasabasa/ai-kit)";
const t0 = Date.now();
const log = (...a) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HTTP с уважением к лимитам: 429/403 → ждём до reset, 5xx → три попытки ───
async function req(url, { headers = {}, method = "GET", body, text = false } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let r; try { r = await fetch(url, { method, body, signal: AbortSignal.timeout(30000), headers: { "user-agent": UA, accept: text ? "*/*" : "application/json", ...headers } }); }
    catch (e) { log(`${e.name || "err"} ${url.slice(0, 80)} (try ${attempt + 1})`); if (attempt === 3) return null; await sleep(1500 * (attempt + 1)); continue; }
    if (r.status === 429 || (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0")) {
      const reset = +r.headers.get("x-ratelimit-reset") * 1000, ra = +r.headers.get("retry-after") * 1000;
      const wait = Math.max(1000, Math.min(120000, ra || (reset ? reset - Date.now() + 1000 : 20000)));
      log(`limit on ${new URL(url).host} → sleep ${(wait / 1000).toFixed(0)}s`); await sleep(wait); continue;
    }
    if (r.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) return null;
    try { return text ? await r.text() : await r.json(); } catch { return null; } // пустое/битое тело → null, а не падение
  }
  return null;
}
const gh = url => req(url, { headers: TOKEN ? { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json" } : {} });
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

// ── Каталог: ключ — репо (owner/name в нижнем регистре) или smithery:<qualifiedName> ───
const cat = new Map();
const KIND_BY_TOPIC = t => /skill|agents-md/.test(t) ? "skill" : /plugin|extension/.test(t) ? "plugin" : /rules/.test(t) ? "rules" : /mcp|model-context/.test(t) ? "mcp" : "tool";
function upsert(key, data) { const cur = cat.get(key) || { key, sources: [] }; for (const [k, v] of Object.entries(data)) {
  if (k === "sources") { for (const s of v) if (!cur.sources.includes(s)) cur.sources.push(s); }
  else if (k === "topics") cur.topics = [...new Set([...(cur.topics || []), ...v])];
  else if (v != null && (cur[k] == null || k === "stars" || k === "pushed")) cur[k] = v; }
  cat.set(key, cur); return cur; }
const fromRepo = (r, kind, source) => upsert(r.full_name.toLowerCase(), { name: r.name, repo: r.full_name, kind, desc: r.description || "", stars: r.stargazers_count,
  pushed: r.pushed_at, topics: r.topics || [], lang: r.language, archived: r.archived, fork: r.fork, license: r.license?.spdx_id, sources: [source] });

// ── 1. GitHub по топикам, срезами по звёздам (поиск отдаёт максимум 1000 на запрос) ───
const TOPICS = ["mcp-server", "mcp-servers", "model-context-protocol",
  "claude-code", "claude-code-plugin", "claude-code-plugins", "claude-skills", "claude-code-skills", "agent-skills", "agents-md",
  "cursor-rules", "cursorrules", "cursor-ai", "windsurf-rules", "windsurf", "gemini-cli", "gemini-cli-extension", "codex-cli", "openai-codex",
  "github-copilot", "copilot-extensions", "cline", "continue-dev", "opencode", "aider", "roo-code", "kilo-code",
  "ai-coding-assistant", "coding-agent", "llm-tools", "ai-agents-tools", "ai-devtools"];
// кому подходит: открытые стандарты (MCP, agent-skills, AGENTS.md) — всем; остальное по топику
const ALL_HOSTS = ["claude", "cursor", "gemini", "codex", "copilot", "windsurf", "cline"];
const HOSTS_BY_TOPIC = t => /mcp|model-context|agent-skills|agents-md/.test(t) ? ALL_HOSTS : /claude/.test(t) ? ["claude"] : /cursor/.test(t) ? ["cursor"]
  : /windsurf/.test(t) ? ["windsurf"] : /gemini/.test(t) ? ["gemini"] : /codex/.test(t) ? ["codex"] : /copilot/.test(t) ? ["copilot"]
  : /cline|roo-code|kilo/.test(t) ? ["cline"] : /continue/.test(t) ? ["continue"] : /opencode/.test(t) ? ["opencode"] : /aider/.test(t) ? ["aider"] : [];
const SLICES = ["stars:>=2000", "stars:500..1999", "stars:100..499", "stars:30..99"];
async function harvestTopics() {
  for (const topic of TOPICS) {
    let got = 0;
    for (const slice of SLICES) {
      for (let page = 1; page <= (QUICK ? 1 : 10); page++) {
        const d = await gh(`https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${topic} ${slice} archived:false fork:false`)}&sort=stars&per_page=100&page=${page}`);
        if (!d?.items) break;
        for (const r of d.items) fromRepo(r, KIND_BY_TOPIC(topic), `topic:${topic}`);
        got += d.items.length;
        if (d.items.length < 100 || page * 100 >= Math.min(d.total_count, 1000)) break;
      }
      if (QUICK) break;
    }
    log(`topic ${topic}: ${got}`);
  }
}

// ── 2. awesome-листы: сами находятся поиском, из README вынимаем ссылки на репо ───
async function harvestAwesome() {
  const lists = new Set();
  for (const q of ["awesome mcp in:name", "awesome claude in:name", "awesome cursor in:name", "awesome ai coding in:name", "awesome agent skills in:name",
    "awesome gemini in:name", "awesome codex in:name", "awesome copilot in:name", "awesome windsurf in:name", "awesome cline in:name", "awesome ai agents in:name"]) {
    const d = await gh(`https://api.github.com/search/repositories?q=${encodeURIComponent(q + " stars:>=100")}&sort=stars&per_page=${QUICK ? 3 : 15}`);
    for (const r of d?.items || []) lists.add(r.full_name);
  }
  log(`awesome lists: ${lists.size}`);
  const linked = new Map(); // repo → из каких списков
  await pool([...lists], 6, async full => {
    const md = await req(`https://raw.githubusercontent.com/${full}/HEAD/README.md`, { text: true });
    if (!md) return;
    for (const m of md.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
      const repo = m[1].replace(/\.git$/, "").replace(/[.)\]]+$/, "");
      if (repo.toLowerCase() === full.toLowerCase() || repo.split("/")[1]?.match(/^(issues|pull|blob|tree)$/)) continue;
      const k = repo.toLowerCase(); if (!linked.has(k)) linked.set(k, new Set()); linked.get(k).add(full);
    }
  });
  const fresh = [...linked.keys()].filter(k => !cat.has(k));
  log(`awesome links: ${linked.size} repos, ${fresh.length} new → GraphQL enrich`);
  // GraphQL: 100 репо за запрос вместо 100 REST-вызовов
  const chunks = []; for (let i = 0; i < fresh.length; i += 100) chunks.push(fresh.slice(i, i + 100));
  await pool(chunks.slice(0, QUICK ? 2 : Infinity), 2, async chunk => {
    const q = `{ ${chunk.map((k, i) => { const [o, n] = k.split("/"); return `r${i}: repository(owner:${JSON.stringify(o)}, name:${JSON.stringify(n)}) { nameWithOwner name description stargazerCount pushedAt isArchived isFork primaryLanguage{name} licenseInfo{spdxId} repositoryTopics(first:10){nodes{topic{name}}} }`; }).join("\n")} }`;
    const d = await req("https://api.github.com/graphql", { method: "POST", body: JSON.stringify({ query: q }), headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" } });
    for (const r of Object.values(d?.data || {})) if (r && !r.isArchived) {
      const topics = r.repositoryTopics.nodes.map(x => x.topic.name);
      const kind = topics.map(KIND_BY_TOPIC).find(k => k !== "tool") || (/mcp/i.test(r.name + r.description) ? "mcp" : /skill/i.test(r.name) ? "skill" : "tool");
      const it = upsert(r.nameWithOwner.toLowerCase(), { name: r.name, repo: r.nameWithOwner, kind, desc: r.description || "", stars: r.stargazerCount, pushed: r.pushedAt,
        topics, lang: r.primaryLanguage?.name, fork: r.isFork, license: r.licenseInfo?.spdxId, sources: [] });
      it.awesome = [...(linked.get(r.nameWithOwner.toLowerCase()) || [])]; it.sources.push("awesome");
    }
  });
  for (const [k, lists2] of linked) { const it = cat.get(k); if (it && !it.awesome) { it.awesome = [...lists2]; if (!it.sources.includes("awesome")) it.sources.push("awesome"); } }
}

// ── 3. Smithery: выдача обрезана 500 записями на запрос (totalPages = 500/pageSize) — дробим по словам ───
const SMITHERY_Q = ["", "database", "postgres", "mysql", "sqlite", "mongodb", "redis", "supabase", "firebase", "sql", "vector", "search", "web", "browser", "scrape",
  "crawl", "fetch", "http", "api", "openapi", "graphql", "rest", "file", "filesystem", "git", "github", "gitlab", "code", "shell", "terminal", "docker", "kubernetes",
  "aws", "azure", "gcp", "cloud", "deploy", "vercel", "netlify", "cloudflare", "slack", "discord", "telegram", "whatsapp", "email", "gmail", "calendar", "notion",
  "jira", "linear", "confluence", "trello", "asana", "todo", "docs", "pdf", "markdown", "obsidian", "memory", "knowledge", "rag", "embedding", "llm", "openai",
  "anthropic", "gemini", "ollama", "huggingface", "model", "agent", "workflow", "automation", "n8n", "zapier", "test", "playwright", "puppeteer", "selenium",
  "figma", "design", "image", "video", "audio", "speech", "ocr", "translate", "youtube", "twitter", "reddit", "spotify", "maps", "weather", "news", "finance",
  "stock", "crypto", "stripe", "payment", "shopify", "ecommerce", "wordpress", "seo", "analytics", "sentry", "datadog", "grafana", "prometheus", "monitoring",
  "logs", "security", "auth", "oauth", "excel", "sheets", "csv", "json", "airtable", "python", "node", "typescript", "rust", "golang", "java", "kotlin", "swift",
  "php", "ruby", "react", "vue", "flutter", "android", "ios", "linux", "windows", "macos", "home", "iot", "math", "science", "health", "education", "game", "3d"];
async function harvestSmithery() {
  let total = 0; const seen = new Set();
  for (const q of QUICK ? SMITHERY_Q.slice(0, 3) : SMITHERY_Q) {
    for (let page = 1; page <= 5; page++) {
      const d = await req(`https://registry.smithery.ai/servers?pageSize=100&page=${page}${q ? "&q=" + encodeURIComponent(q) : ""}`);
      if (!d?.servers?.length) break;
      for (const sv of d.servers) { if (sv.inactive || sv.unlisted || seen.has(sv.qualifiedName)) continue; seen.add(sv.qualifiedName); total++;
        const repoM = (sv.homepage || "").match(/github\.com\/([^/\s]+\/[^/\s#?]+)/i);
        const key = repoM ? repoM[1].replace(/\.git$/, "").toLowerCase() : `smithery:${sv.qualifiedName}`;
        upsert(key, { name: sv.displayName || sv.qualifiedName, repo: repoM ? repoM[1].replace(/\.git$/, "") : undefined, kind: "mcp", desc: sv.description || "", sources: ["smithery"],
          smithery: { id: sv.qualifiedName, uses: sv.useCount, verified: !!sv.verified, remote: !!sv.remote, homepage: sv.homepage || null } });
      }
      if (page >= (d.pagination?.totalPages || 1)) break;
      await sleep(250); // Smithery режет частые запросы — идём спокойно
    }
  }
  log(`smithery: ${total} unique live servers via ${SMITHERY_Q.length} queries`);
  const hot = [...cat.values()].filter(it => it.smithery && it.smithery.uses >= 200 && !it.tools);
  await pool(hot.slice(0, QUICK ? 20 : Infinity), 2, async it => {
    await sleep(300);
    const d = await req(`https://registry.smithery.ai/servers/${encodeURIComponent(it.smithery.id)}`);
    if (!d) return;
    it.tools = (d.tools || []).map(x => x.name).slice(0, 40);
    const http = (d.connections || []).find(x => x.type === "http" && x.deploymentUrl);
    if (http) it.smithery.url = http.deploymentUrl;
  });
  log(`smithery details: ${hot.length}`);
}

// ── 4. Hacker News: очки и обсуждения по ссылке на репо — buzz, отдельно от звёзд ───
async function harvestHN() {
  const byRepo = new Map(), byName = new Map();
  for (const q of ["mcp server", "model context protocol", "claude code", "cursor ai", "agent skills", "codex cli", "gemini cli", "ai coding agent", "claude plugin"]) {
    const d = await req(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=1000`);
    for (const h of d?.hits || []) {
      const m = (h.url || "").match(/github\.com\/([^/\s]+\/[^/\s#?]+)/i);
      const rec = { points: h.points || 0, comments: h.num_comments || 0, title: h.title, id: h.objectID };
      if (m) { const k = m[1].replace(/\.git$/, "").toLowerCase(); (byRepo.get(k) || byRepo.set(k, []).get(k)).push(rec); }
      for (const w of (h.title || "").toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || []) (byName.get(w) || byName.set(w, []).get(w)).push(rec);
    }
  }
  let hit = 0;
  for (const it of cat.values()) {
    const recs = byRepo.get(it.key) || (it.name && it.name.length >= 5 && byName.get(it.name.toLowerCase())) || [];
    if (!recs.length) continue; hit++;
    const top = recs.sort((a, b) => b.points - a.points)[0];
    it.buzz = { ...(it.buzz || {}), hn_points: recs.reduce((s, r) => s + r.points, 0), hn_stories: recs.length, hn_comments: recs.reduce((s, r) => s + r.comments, 0), hn_top: `https://news.ycombinator.com/item?id=${top.id}` };
  }
  log(`hn: ${hit} items with buzz`);
}

// ── 5. Как ставить: package.json с bin → npm, pyproject → PyPI; скачивания за неделю ───
async function resolveInstall() {
  // только то, что может попасть в выдачу: ≥100★ или из Smithery; npm режет частые запросы — 4 потока с паузой
  const todo = [...cat.values()].filter(it => it.repo && !it.install && (it.kind === "mcp" || it.kind === "tool") && ((it.stars || 0) >= 100 || it.smithery));
  log(`resolve install for ${todo.length} repos`);
  await pool(todo.slice(0, QUICK ? 40 : Infinity), 4, async it => {
    const raw = `https://raw.githubusercontent.com/${it.repo}/HEAD/`;
    const pj = await req(raw + "package.json");
    if (pj?.name && pj.bin) { await sleep(150); if (await req(`https://registry.npmjs.org/${encodeURIComponent(pj.name)}`)) { it.install = { pkg: pj.name }; return; } }
    const py = await req(raw + "pyproject.toml", { text: true });
    const pn = py && py.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    if (pn && await req(`https://pypi.org/pypi/${encodeURIComponent(pn)}/json`)) { it.install = { pkg: pn, py: true }; return; }
    if (it.smithery?.url) it.install = { url: it.smithery.url };
  });
  for (const it of cat.values()) if (!it.install && it.smithery?.url) it.install = { url: it.smithery.url };
  const npmPkgs = [...cat.values()].filter(it => it.install?.pkg && !it.install.py);
  const unscoped = npmPkgs.filter(it => !it.install.pkg.startsWith("@")), scoped = npmPkgs.filter(it => it.install.pkg.startsWith("@"));
  for (let i = 0; i < unscoped.length; i += 100) { const chunk = unscoped.slice(i, i + 100);
    const d = await req(`https://api.npmjs.org/downloads/point/last-week/${chunk.map(it => it.install.pkg).join(",")}`);
    for (const it of chunk) { const v = chunk.length === 1 ? d : d?.[it.install.pkg]; if (v?.downloads != null) it.dl_week = v.downloads; } }
  await pool(scoped, 3, async it => { await sleep(200); const d = await req(`https://api.npmjs.org/downloads/point/last-week/${it.install.pkg}`); if (d?.downloads != null) it.dl_week = d.downloads; });
  await pool([...cat.values()].filter(it => it.install?.py), 4, async it => { const d = await req(`https://pypistats.org/api/packages/${it.install.pkg.toLowerCase()}/recent`); if (d?.data?.last_week != null) it.dl_week = d.data.last_week; });
  log(`install: npm ${npmPkgs.length}, pypi ${[...cat.values()].filter(it => it.install?.py).length}, remote ${[...cat.values()].filter(it => it.install?.url).length}`);
}

// ── Сборка ─────────────────────────────────────────────────────────────────────
function write(file) {
  const items = [...cat.values()].filter(it => !it.archived && !it.fork && !/^awesome[-_ ]/i.test(it.name || ""))
    .map(({ key, ...it }) => ({ ...it, hosts: [...new Set((it.topics || []).flatMap(HOSTS_BY_TOPIC).concat(it.kind === "mcp" || it.smithery ? ALL_HOSTS : []))] }))
    .sort((a, b) => (b.stars || 0) + (b.smithery?.uses || 0) / 10 - (a.stars || 0) - (a.smithery?.uses || 0) / 10);
  fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), count: items.length, sources: ["github-topics", "awesome-lists", "smithery", "hn", "npm", "pypi"], items }));
  return items;
}
// тонкий каталог для рантайма: только то, что может попасть в выдачу, без лишних полей, gzip (~0.5 МБ)
function writeSlim(items, file) {
  const keep = items.filter(x => x.install || ((x.stars || 0) >= 100 && ["mcp", "plugin", "skill", "rules"].includes(x.kind)));
  const slim = keep.map(x => ({ name: x.name, repo: x.repo, kind: x.kind, desc: (x.desc || "").slice(0, 160), stars: x.stars || 0, pushed: (x.pushed || "").slice(0, 10),
    install: x.install, hosts: x.hosts, dl: x.dl_week, uses: x.smithery?.uses, hn: x.buzz?.hn_points, tools: (x.tools || []).slice(0, 8),
    topics: (x.topics || []).filter(t => t.length <= 24).slice(0, 10), url: x.smithery?.url }));
  for (const o of slim) for (const k of Object.keys(o)) if (o[k] == null || (Array.isArray(o[k]) && !o[k].length)) delete o[k];
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ generated: new Date().toISOString(), count: slim.length, items: slim }), { level: 9 }));
  log(`slim: ${slim.length} items → ${file} (${(fs.statSync(file).size / 1e3).toFixed(0)} KB)`);
}
async function main() {
  if (!TOKEN) log("⚠ нет токена GitHub — будет медленно и не полно");
  if (MERGE && fs.existsSync(OUT)) { const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    for (const it of prev.items) cat.set(it.repo ? it.repo.toLowerCase() : `smithery:${it.smithery.id}`, { key: it.repo ? it.repo.toLowerCase() : `smithery:${it.smithery.id}`, ...it });
    log(`merge: ${prev.items.length} existing items loaded`); }
  const steps = [["topics", harvestTopics], ["awesome", harvestAwesome], ["smithery", harvestSmithery], ["hn", harvestHN], ["install", resolveInstall]];
  for (const [name, fn] of steps) if (phase(name)) { await fn(); write(OUT + ".partial"); } // падение фазы не теряет предыдущие
  const items = write(OUT); try { fs.unlinkSync(OUT + ".partial"); } catch {}
  writeSlim(items, OUT.replace(/\.json$/, "") + ".min.json.gz");
  const by = k => items.filter(it => it.kind === k).length;
  log(`done: ${items.length} items → ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB) · mcp ${by("mcp")} plugin ${by("plugin")} skill ${by("skill")} rules ${by("rules")} tool ${by("tool")} · installable ${items.filter(it => it.install).length} · buzz ${items.filter(it => it.buzz).length}`);
}
main().catch(e => { console.error(e); process.exit(1); });
