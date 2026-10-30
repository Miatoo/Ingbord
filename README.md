<div align="center">

# Ingbord

**Storyboards for people who can't draw.**

Block the shot with 3D mannequins or generate it with your own image API, annotate it, reorder the board, export Excel or PDF.

[**▶ Open the web app**](https://miatoo.github.io/Ingbord/) · [Download](#install) · **English** · [中文](README-zh.md)

</div>

<img width="2752" height="1536" alt="Ingbord storyboard workspace" src="https://github.com/user-attachments/assets/2ee8e0ad-f5e9-4f7c-aecb-c2351a1c6998" />

---

## What this is

Ingbord is a storyboard and shot-list editor that runs in your browser. Open the page and it works — nothing to install.

It does not assume you can draw. Frames come from two places: pose 3D mannequins and cameras and capture the result, or fill in your own image API in settings and generate from a prompt. Either way you can draw arrows and notes on top, reorder the shots, and export Excel or PDF.

What you export is a shot list: each shot has a number, a frame, shot size, action and notes, ready to hand to the camera operator, editor or producer.

Where people tend to use it:

| Situation | Description |
|---|---|
| **Short drama and short-form** | Lock the shots before the shoot day and hand a list to camera and editing |
| **Commercials and pitches** | Explain each shot in a PDF instead of a folder of loose images |
| **Student films and shorts** | Finish a board without learning to draw first |
| **Pre-vis** | Check camera position, framing and screen direction in 3D |

---

## Quick start (nothing to install)

1. Open **https://miatoo.github.io/Ingbord/**
2. Add shots in **Board**, upload or replace frames
3. Select a shot → switch to **3D Pose** to block the mannequin and camera → generate the frame → draw notes in **Annotation**
4. Back in Board, drag to reorder → export Excel / PDF


---

## Features

| Feature | What it does |
|---|---|
| **Board** | Manage every shot, upload or replace frames, drag to reorder, see the whole sequence at once |
| **3D Pose** | Pose mannequins and cameras to set framing, shot size and screen direction; generate the shot in one click |
| **Annotation** | Brush, line, rectangle, ellipse, arrow, text, fill; layers and undo/redo |
| **AI Image** | Built-in channel (beta) **or** bring your own API. Prompt or reference based, with version history |
| **Export** | Project files (`.clapboard` / JSON), Excel, CSV, image ZIP, PDF |
| **Project library** | Projects stay in your browser and survive a refresh; manage several at once |
| **Chinese + English UI, themes** | Switch language and theme from the top bar |

### Inside 3D Pose

- Mannequins: adult male and female, teen male and female, child, baby — with swappable hair, expressions and hand poses
- Props and sets: chairs, tables, beds, doors, windows, vehicles, trees, lights; import your own `.glb` models too
- Cameras: preset cameras and scene camera positions; orbit, pan and wheel-zoom
- Editing: move, rotate and scale any selected object. **Generate shot image** writes straight into the current shot

### Inside Annotation

- Brush engine with pressure curve, brush presets and `.abr` import; brushes can be exported and reused
- Layer management, undo and redo (`Ctrl+Z` / `Ctrl+Y`)
- `Tab` collapses and restores the floating panels
- Annotations are saved with the shot and composited into exports

### Inside AI Image

Two ways to generate:

**1. Built-in channel (beta).** The hosted web app and the packaged desktop builds ship with a built-in image channel, so you can generate without setting up an API key first.

> This channel is still in beta. Expect queues, rate limits, model changes and occasional interruption. **For real work, switch to bring-your-own-API — don't put a delivery deadline on a test channel.**

**2. Bring your own API (recommended).** Enter your own endpoint, key and model. Billing goes straight to your model provider, never through me. Three common API shapes are detected automatically:

| API style | Endpoint pattern |
|---|---|
| OpenAI-style | `/v1/images/generations`, `/v1/chat/completions` |
| Gemini | `/v1beta/models/...:generateContent` |
| Nano Banana | `/v1/draw/...` |

Other OpenAI-compatible endpoints generally work as well. A single request can carry up to **3 character references and 3 scene references** alongside the current board frame, so you aren't charged for several separate jobs. Results can be saved as new versions and compared within the same shot.

> Builds compiled from this repository include the bring-your-own-API path only. The built-in channel belongs to the official releases, so fill in the AI Image panel before generating from a local build.

---

## Export

A board is only useful if it leaves the app. Current formats:

| Format | What it's for |
|---|---|
| **PDF** | Clients, pitch decks, printing for the wall (a small Ingbord credit sits at the page foot) |
| **Excel** | Scheduling and budget for the producer; columns line up with a call sheet |
| **CSV** | Feed another spreadsheet or your own stats |
| **Image ZIP** | Grab every frame at once for Keynote or PowerPoint |
| **Project file (`.clapboard` / JSON)** | Full backup; restores on another device or browser |

**Excel import is supported too**, so an existing shot list can be brought in and edited instead of retyped.

---

## Install

### Option 1 — Web app (simplest, recommended)

Open **https://miatoo.github.io/Ingbord/**. No account, no download.

### Option 2 — Standalone window (no installer)

In Edge: *Apps → Install this site as an app*. In Chrome: *More tools → Create shortcut*, tick *Open as window*.

You get a window without an address bar and an entry in the Start menu, which is close enough to a desktop app. **No installer involved.**

### Option 3 — Native packages

Download from [Releases](https://github.com/Miatoo/Ingbord/releases). Current version: **v1.0.1-beta**.

| Platform | File | Size |
|---|---|---|
| Windows x64 (recommended) | `Ingbord-Setup-1.0.1-beta-x64.zip` | 90 MB |
| Windows ia32 | `Ingbord-Setup-1.0.1-beta-ia32.zip` | 85 MB |
| Windows portable x64 | `Ingbord-Portable-1.0.1-beta-x64.zip` | 90 MB |
| Windows portable ia32 | `Ingbord-Portable-1.0.1-beta-ia32.zip` | 85 MB |
| Android (test build) | `Ingbord-1.0.1-beta-debug.apk` | 25 MB |

> The Windows archives contain a `.exe` — **unzip first**. The portable builds run without installing and don't touch the registry.

#### One small note for first launch

Independently built open-source projects usually don't have a code-signing certificate, so Windows may show a blue prompt the first time you run the installer. It takes two clicks:

1. **More info**
2. **Run anyway**

That's it — it won't come back. This is Windows' default behaviour for any executable without a signing certificate, and it says nothing about whether the software is safe.

> Don't want to see it at all? Use the web app, or install it as a standalone window (Option 2). Identical feature set.

<details>
<summary>Want to verify the download? (optional)</summary>

SHA-256 for each file:

| File | SHA-256 |
|---|---|
| `Ingbord-Setup-1.0.1-beta-x64.zip` | `2dfca07e3a789ce69dec5d71b77b16b958eb098a1abf24f715b578e749d68377` |
| `Ingbord-Setup-1.0.1-beta-ia32.zip` | `ca71d1431f9d46fea515bf90f1fba1a8a1083af3ea41dba6532445b46572e701` |
| `Ingbord-Portable-1.0.1-beta-x64.zip` | `59b69ce9cac623678bf4df52038e5a59971add7cb2ba139ae09e4efce228eed8` |
| `Ingbord-Portable-1.0.1-beta-ia32.zip` | `8a72b84a3b6d89750add49d28c0b5be754b9bb2a8160f5b18a31253827d28ad9` |
| `Ingbord-1.0.1-beta-debug.apk` | `d447dffd687e5edec3955179614bef5db377dc08061974c559a47d0cd5054fcf` |

On Windows: `certutil -hashfile <file> SHA256`
On macOS / Linux: `shasum -a 256 <file>`

</details>

---

## Where your data lives

**Everything stays in your browser's local storage. Nothing is uploaded, no account is needed.** Once the page has loaded you can keep editing with the network down — except AI generation, which needs a connection.

Two consequences worth knowing:

- Good: no cloud exposure, and you can keep working offline.
- Careful: another computer, another browser, or clearing site data means your local projects won't be there. **Export a `.clapboard` project file for anything that matters** — that is currently the only way to move work between devices.

With bring-your-own-API, your key is stored locally and never sent anywhere except your provider. The built-in channel doesn't ask for a key at all.

---

## FAQ

**Do I need to sign up?**
No. Open it and work.

**Do I need to be able to draw?**
No. Frames can come from 3D posing, from an image API, or from drawing on top of an existing image.

**Can I use it commercially?**
Ingbord itself is licensed CC BY-NC-SA 4.0 — **free to use, modify and redistribute for non-commercial purposes**. For commercial use (client work at a company, paid services), contact the author for a license. **Boards you create with Ingbord are entirely yours and are not affected by this.**

**Do I have to have my own API for AI generation?**
Not necessarily. The web app and the desktop builds include a built-in channel you can try immediately, but **it is still in beta** and may queue, rate-limit or drop out. For steady output and batch work, use your own key — OpenAI-style, Gemini and Nano Banana endpoints are all supported, billed directly by your provider.

**Will the built-in channel stay free?**
Terms may change during the beta, and no quota, speed or uptime is promised. Treat it as a trial entry point, not a production tool.

**Is bring-your-own-API more expensive?**
Pricing is whatever your provider charges. Ingbord adds no markup and takes no cut. You can also draft with a cheap model and re-render the keepers on a better one.

**Which languages does the UI support?**
Chinese and English, switchable from the top bar.

**macOS or iOS builds?**
Not packaged yet. The web app runs in any browser on any OS, and on macOS you can install it as a standalone window from Edge.

**Found a bug, or want a feature?**
Open an [issue](https://github.com/Miatoo/Ingbord/issues) with your OS, browser version and reproduction steps. It'll be seen.

---

## Build locally

Node.js 18+ required (20 / 22 recommended).

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # static output in dist/
```

`dist/` is plain static files — Nginx, Cloudflare Pages, Vercel or GitHub Pages all work. See [DEPLOY.md](DEPLOY.md) for deployment notes.

> Warnings like `vulnerabilities` or `looking for funding` after `npm install` are usually **warnings, not failures**. If you see `audited … packages` and `npm run dev` starts, you're fine. **Don't run `npm audit fix --force`** — it reshuffles dependency versions and breaks the build.

Stack: React 18, TypeScript, Vite, Zustand, Three.js, Tailwind CSS.

---

## Roadmap

- [ ] Cloud backup for project files (today it's local export only)
- [ ] Batch printing and pagination control for board pages
- [ ] More built-in sets and props
- [ ] macOS packaging

No dates promised, but this reflects priority. If you need something badly, open an issue and describe the situation — a concrete scenario moves things more than a vote.

---

## Feedback

- Bugs and requests: [GitHub Issues](https://github.com/Miatoo/Ingbord/issues)
- Chat: Telegram https://t.me/+7AU5WrfdDZtlMTll
- Author: [@Miatoo](https://github.com/Miatoo)

If Ingbord is useful to you, a ⭐ is enough.

---

## License

Everything in this repository (source, docs, config) is under [**CC BY-NC-SA 4.0**](LICENSE).

| | |
|---|---|
| **Permitted** | Share and adapt for non-commercial purposes |
| **Conditions** | Attribution; adaptations shared under the same license |
| **Limitations** | No commercial use; no warranty |

Full text: [LICENSE](LICENSE). For commercial licensing, contact the author.

**Work you create with Ingbord belongs entirely to you.** The license covers the software, not your boards.

---

[中文版 README →](README-zh.md)
