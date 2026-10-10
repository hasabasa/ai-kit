<p align="center">
  <img src="assets/logo.png" alt="ai-kit" width="200">
</p>

<h1 align="center">ai-kit</h1>

<p align="center">
  <strong>Yapay zeka asistanını doğru şekilde kur — 2 dakikada</strong>
</p>

<p align="center">
  🌍 <a href="README.md">English</a> |
  <a href="README.kk.md">Қазақша</a> |
  <a href="README.es.md">Español</a> |
  <strong>Türkçe</strong> |
  <a href="README.zh.md">中文</a> |
  <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/v/aidevkit?color=60a5fa&style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/dm/aidevkit?color=2dd4bf&style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/hasabasa/ai-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-daea6a?style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-60a5fa?style=flat-square" alt="node version">
  <img src="https://img.shields.io/badge/ba%C4%9F%C4%B1ml%C4%B1l%C4%B1k-0-2dd4bf?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/dil-17-daea6a?style=flat-square" alt="17 languages">
</p>

---

> ```
> ✦ ~45 562 token/istek (balast 2 590 · CLAUDE.md 42 088 · beceriler 884)
> ≈ $47,67/ay, 150 istek/gün
> ```
> Gerçek bir makineden gerçek çıktı. Şişirilmiş yapılandırmanın maliyeti bu kadar.

<p align="center"><img src="assets/demo-tr.gif" alt="ai-kit demo" width="700"></p>

---

## Bu ne?

**Sıfır bağımlılık**, yalnızca Node stdlib. Bir CLI aracı:

1. **Tarar** — IDE'ler, yapay zeka eklentileri, CLI araçları, LLM'ler, MCP sunucuları, proje yığınları
2. **Sorar** — ok tuşlarıyla ~10 soru, çoğu taramadan doldurulmuş
3. **Önerir** — **20 669 araçlık** katalogdan, her biri için nedenini açıklar
4. **Kurar** — tek bir onay ile, tokenlerinizi yiyen balastı devre dışı bırakır
5. **Denetler** — `doctor`: token/istek, $/ay, şişirilmiş yapılandırmalar

**Claude Code** ile çalışır, **Cursor**, **Gemini CLI**, **Codex** algılar. **17 dile** çevrilmiş arayüz.

## Hızlı başlangıç

```bash
npx aidevkit
```

Ya da global kurulum:

```bash
npm i -g aidevkit
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `ai-kit` | Tam döngü: tarama → anket → plan → kurulum |
| `ai-kit scan` | Yalnızca envanter: IDE'ler, eklentiler, CLI'lar, LLM'ler, MCP, yığınlar |
| `ai-kit discover` | 20k+ araç katalogu, yığınınıza göre sıralanmış + GitHub araması |
| `ai-kit doctor` | Denetim: balast eklentiler, şişirilmiş CLAUDE.md, token/istek, $/ay |
| `ai-kit doctor --fix` | Aynısı + balastı devre dışı bırakma (önce sorar) |
| `ai-kit update` | Kaydedilmiş profilden planı yeniden oluştur, anketsiz |

## Bayraklar

| Bayrak | Etkisi |
|---|---|
| `--dry-run` | Planı göster, hiçbir şeyi değiştirme |
| `--yes` | Onay sormadan |
| `--lang tr` | Dil seçimini atla |
| `--no-open` | HTML raporu açma |
| `--json` | CI için makine tarafından okunabilir çıktı |
| `--requests N` | Maliyet tahmini için özel istek/gün |

Tam liste: `npx aidevkit --help`

## Nasıl çalışır

### 1. Tarama

ai-kit herhangi bir şey sormadan önce makinenizi tarar:

- **IDE'ler**: VS Code, Cursor, Zed, Neovim, JetBrains, Xcode, Android Studio
- **Yapay zeka araçları**: Claude Code, Cursor, Gemini CLI, Codex, Cline, Windsurf, Copilot
- **Yapılandırmalar**: `.claude/`, MCP yapılandırmaları, CLAUDE.md, beceriler, eklentiler
- **Proje yığını**: `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` vb.
- **LLM'ler**: Ollama modelleri, LM Studio, bulut API anahtarları

### 2. Anket

Ok tuşlarıyla ~10 soru. Yanıtların çoğu taramadan doldurulmuş:

- Rol ve deneyim seviyesi
- Diller ve framework'ler
- Veritabanları ve bulut hizmetleri
- Çalışma tarzı: elle kod mu yoksa vibe-coding mi, günde kaç saat
- Mevcut yapılandırmanızda en çok ne rahatsız ediyor
- Her soruda serbest metin seçeneği var

### 3. Plan

Her önerilen araç:
- **Tek satır** — neden gerekli
- **«Neden size uygun»** — yanıtlarınıza bağlı açıklama
- **Çakışmalar** — birbiriyle çelişen iki aracı kurmaz

Balast işaretlenir: her istekte yüklenen ve geliştiriciye hiçbir şey katmayan iş becerileri (satış, hukuk, İK, finans...).

### 4. Kurulum

Tek bir `y` her şeyi kurar. Araçların kendi komutlarıyla (`claude mcp add`, `uv tool install` vb.). Açık onayınız olmadan hiçbir şey çalışmaz.

### 5. Doktor

```
✦ ~45 562 token/istek (balast 2 590 · CLAUDE.md 42 088 · beceriler 884)
≈ $47,67/ay, 150 istek/gün

Balast (her istekte yüklenir, faydası sıfır):
  ✗ sales-navigator         1 240 token
  ✗ legal-review               850 token
  ✗ hr-toolkit                 500 token
```

`doctor --fix` balastı devre dışı bırakır, önce ne yapacağını gösterir. `--json` CI için makine tarafından okunabilir çıktı verir.

## Katalog

**20 669 araç**, kategorilere göre:

- **MCP sunucuları** — veritabanı bağlayıcıları, API entegrasyonları, dosya araçları, bulut hizmetleri
- **Claude Code becerileri** — kod inceleme, test, dağıtım, dokümantasyon
- **Cursor kuralları** — framework'e göre, dile göre, iş akışına göre
- **Eklentiler** — linter'lar, formatlayıcılar, hata ayıklayıcılar, profiler'lar
- **CLI araçları** — npm, pip, cargo, brew ile kurulabilir geliştirme araçları

## Desteklenen asistanlar

| Asistan | Tarama | Kurulum (otomatik) | Kurulum (manuel) | Doktor |
|---|:---:|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ `claude mcp add` | ✅ | ✅ balast + yapılandırma |
| Cursor | ✅ | ✅ `mcp.json` yazar | ✅ | ✅ yapılandırma |
| Gemini CLI | ✅ | ✅ `gemini mcp add` | ✅ | ✅ yapılandırma |
| Antigravity | ✅ | ✅ `mcp_config.json` yazar | ✅ | ✅ yapılandırma |
| Codex | ✅ | ✅ `codex mcp add` | ✅ | ✅ yapılandırma |
| Windsurf | ✅ | ✅ `mcp_config.json` yazar | ✅ | ✅ yapılandırma |
| Cline | ✅ | ✅ `mcp_settings.json` yazar | ✅ | ✅ yapılandırma |

## Diller

🇺🇸 English · 🇷🇺 Русский · 🇰🇿 Қазақша · 🇪🇸 Español · 🇧🇷 Português · 🇫🇷 Français · 🇩🇪 Deutsch · 🇹🇷 Türkçe · 🇮🇩 Bahasa · 🇵🇱 Polski · 🇨🇳 中文 · 🇯🇵 日本語 · 🇰🇷 한국어 · 🇮🇳 हिन्दी · 🇸🇦 العربية · 🇺🇿 O'zbek · 🇦🇱 Shqip

## Güvenlik

- Açık `y` onayınız olmadan hiçbir şey kurulmaz veya devre dışı bırakılmaz
- `doctor` rakamları dürüst tahminlerdir, uydurma hassasiyet değil
- Telemetri yok. Kendi ağ istekleri yok — yalnızca `claude`, `uv` vb. çağrılır
- Sıfır bağımlılık — yalnızca Node stdlib

## Lisans

[MIT](LICENSE) © [hasabasa](https://github.com/hasabasa)
