# Eagle Timestamp Plugin - Project Instructions

## Project Overview
Eagle 4 Window Plugin，為照片燒入視覺化時間戳記。Chromium 107 + Node 16 環境，零外部依賴。

## Tech Stack
- **Runtime**: Eagle 4 Electron (Chromium 107 / Node 16)
- **Language**: Vanilla JS (ES6+), HTML5, CSS3
- **Build**: None (直接載入，無 bundler)
- **Storage**: localStorage for settings

## File Structure
```
├── manifest.json       Plugin manifest (id, version, main window config)
├── index.html          UI entry (split layout: settings left, preview right)
├── js/
│   ├── main.js         Eagle lifecycle hooks, UI state, apply flow
│   ├── settings.js     Settings IIFE module, localStorage persistence
│   └── timestamp.js    Canvas burn engine, EXIF reader, formatDate
├── css/style.css       Dark theme styles
├── icons/icon.png      Plugin icon
├── changelog.md        Version history (Keep A Changelog format)
├── README.md           User documentation
└── prompt_for_next_session.md  AI handoff guide
```

## Critical Rules

### Eagle API Constraints
- `item.filePath`, `item.name` etc. are READ-ONLY getters - never assign
- Use `eagle.item.addFromPath(path, options)` to create copies (2-arg format)
- `addFromPath` options MUST include `folders: item.folders` to keep in same folder
- `getSelected()` may timeout on startup - use Promise.race + retry pattern
- TIFF not supported (Chromium Canvas limitation)
- Supported formats: .jpg .jpeg .png .webp .gif .bmp

### DevTools Prevention
- `manifest.json`: `"devTools": false`
- First `getSelected()` call: delay 1s after `onPluginCreate`
- Dual-layer unhandled rejection interceptors (window + process)
- `eagle.plugin.closeDevTools()` after init

### Version Bump Protocol
Every version change MUST sync 3 files:
1. `manifest.json` -> `"version"`
2. `changelog.md` -> new section at top
3. `README.md` -> line 3 version string

### Bug Prevention Checklist
- `autoFillDate()`: ONLY call when `getTimeSource() === 'original'` (3 locations)
- `_savedManualDatetime`: set BEFORE btn.click() in loadSettings()
- `formatDate()`: always use `/g` regex flag
- `timeoutId`: declare OUTSIDE try-catch for cleanup access
- `fetchPromise.catch(() => {})`: attach immediately after Promise.race creation
- Canvas shadow: reset in `finally` block
- `ctx.setTransform(1,0,0,1,0,0)` at start of drawTimestampToContext()

### Skills (in .claude/skills/)
| Skill | When to Use |
|-------|-------------|
| `eagle-api.md` | Eagle API queries, addFromPath usage |
| `version-bump.md` | Version updates, changelog |
| `bug-audit.md` | Full feature audit, regression check |
| `settings-patterns.md` | Adding new settings items |
