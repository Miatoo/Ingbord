# Ingbord

A professional storyboard / shot-list editor.

**Live demo:** https://miatoo.github.io/Ingbord/

English · [中文](README-zh.md)

Built for short-form and commercial boards, class scripts, practice boards, and indie production.

## Features

| Feature | Description |
|------|------|
| **Board** | Manage shots, upload/replace images, drag to reorder, overview the sequence |
| **3D Pose** | Pose 3D mannequins and cameras, then generate a shot sketch |
| **Annotation** | Draw brushes, arrows, shapes, and text as visual notes |
| **AI Image** | Configure your image API, then generate frames from prompts / references |
| **Import / Export** | Project files (`.clapboard` / JSON), Excel, CSV, image ZIP, PDF |
| **Local library** | Projects stay in the browser; keep editing after refresh |

---

## Releases

Download packages from [Releases](https://github.com/Miatoo/Ingbord/releases). Current status:

| Platform | Status |
|------|------|
| **Windows desktop** | Coming soon |
| **Android** | Coming soon |
| **macOS** | Planned |
| **iOS** | Planned |
| **Linux** | Planned |

You can also build the web app and host it statically (see below).

---

## Quick start

Requires Node.js 18+ (20 / 22 recommended).

### Development

```bash
npm install
npm run dev
```

Open the URL printed in the terminal (default `http://localhost:5173`).

Messages like `vulnerabilities`, `looking for funding`, or `allow-scripts` after `npm install` are usually **warnings**, not failures. If you see `audited … packages` and can run `npm run dev` / `npm run build`, you are fine. Avoid `npm audit fix --force` (it can break dependency versions).

### Production build / static hosting

```bash
npm install
npm run build
```

Serve `dist/` with Nginx, Cloudflare Pages, etc. See [DEPLOY.md](DEPLOY.md).

---

## UI overview

You start in the **project library** (create or open a project). In the editor:

- **Top:** project name, back to library, new/save, import/export, tutorial, properties, language, theme, settings
- **Left:** shot list (create, switch, …)
- **Center:** tabs — **Board / 3D Pose / Annotation / AI Image**
- **Right:** shot properties and director notes

---

## First storyboard (recommended flow)

### 1. Create a project and shots

1. Click **New** in the library.
2. Click **New shot** on the left; add as many as you need.
3. Select a shot from the list.

### 2. Add an image (pick one)

| View | Best for |
|------|----------|
| **Board** | Upload images; overview / reorder |
| **3D Pose** | Pose characters/cameras, then “Generate shot image” |
| **Annotation** | Draw on an existing frame |
| **AI Image** | Prompt / reference generation via your API |

Simplest path: **upload an image** on a Board card.

### 3. Director notes (recommended)

With a shot selected, fill framing, camera, duration, notes on the right. They appear in PDF export.

### 4. Reorder

Drag cards on the **Board** view. Export order follows this list.

### 5. Save and export

- **Save / Save as** — local library or project file
- **Import / Export** menu:
  - **PDF** — print / client handoff
  - **Image ZIP** — packed frames
  - **Excel / CSV** — shot lists
  - **Project file** — full backup / migrate

Export project files regularly; clearing site data wipes the local library.

---

## Four workspace views

### Board

Overview all shots; upload/replace images; drag to reorder; select a shot to edit properties.

### 3D Pose

- **Orbit:** left-drag  
- **Pan:** right- or middle-drag  
- **Zoom:** scroll wheel  
- Move / rotate / scale selected mannequins  
- **Generate shot image** writes into the current shot  
- Add characters from the library, or import custom models  

### Annotation

Draw on the current frame: brush, line, rect, ellipse, arrow, text, fill, etc. Layers and undo/redo (Ctrl+Z / Ctrl+Y). **Tab** toggles floating panels. Annotations save with the shot and export together.

### AI Image

1. Configure **endpoint, API key, model**.  
2. Select a shot (with a base image if needed), enter a prompt; optional character/scene references.  
3. **Generate**, then **save as a new version** and switch versions as needed.

---

## Settings and more

- **Aspect ratio / safe frame / PDF header** — settings or metadata entries  
- **Theme / language** — top bar  
- **Shortcuts** — open the shortcut list from the top bar  

---

## FAQ

**Will I lose data?**  
Projects live in the browser by default. Another machine, cleared cache, or another browser will not see them — export a project file for backup.

**How do I use AI Image?**  
Enter your image API endpoint, key, and model name in the AI Image panel.

**Models under `public/models`?**  
If any assets are restricted, replace them with freely usable ones before redistribution.

---

## One-line summary

**New shots → Board upload (or 3D / Annotation / AI) → notes on the right → drag to order → export PDF / ZIP / Excel / project file.**

Deployment notes: [DEPLOY.md](DEPLOY.md).

---

## License

**The entire repository** (source, docs, and config) is released under one license: [**CC BY-NC-SA 4.0**](LICENSE).  
You may share and adapt it freely for **non-commercial** use, provided **attribution** is retained and adaptations are shared alike.

| | |
|---|---|
| **Permissions** | Share and adapt (non-commercial) |
| **Conditions** | Attribution; ShareAlike |
| **Limitations** | NonCommercial; no warranty |

Full text: [LICENSE](LICENSE).  
Telegram: https://t.me/+7AU5WrfdDZtlMTll · [Repository](https://github.com/Miatoo/Ingbord)
