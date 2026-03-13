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

## v1.8.0 Key Patterns

### Separate X/Y Padding (v1.7.0)
- `calcPos(pos, W, H, marginX, marginY)` — 5 params, marginY fallback to marginX
- `drawTimestampToContext()` uses `??` chain: `paddingX ?? padding ?? 3`
- Settings: `paddingX`/`paddingY` sliders (default 3%), old `padding` auto-migrates in `loadSettings()`

### Custom Filename Suffix (v1.7.0)
- `suffixInput` text field → `getAll().suffix` (trimmed)
- Empty → auto-generate `YYYY-MM-DD` via `TimestampEngine.formatDate(new Date(), 'YYYY-MM-DD')`
- Sanitized: `.replace(/[\/\\:*?"<>|]/g, '_')`

### Naming Pattern & Batch Token (v1.8.0)
- `namePatternInput` → `opts.namePattern` (default `{name}_{suffix}_{token}`)
- `batchTokenLengthInput` → `opts.batchTokenLength` (clamped 4~12, default 6)
- `createBatchToken(len)` — Math.random + Date.now, sliced to len
- `buildStampedBaseName(origBase, fileSuffix, opts)`:
  - Compute `fixedPart` (pattern with `{name}` removed, suffix+token filled)
  - `maxNameLen = max(FILE_NAME_BASE_MAX_LENGTH - fixedPart.length, 10)`
  - Truncate `origBase` to `maxNameLen` before substitution
  - `FILE_NAME_BASE_MAX_LENGTH = 200`

### TAG Management (v1.8.0)
- `tagOriginalEnabled` + `originalTagInput` → add TAG to original item after stamp
- `newPhotoUseOriginalTags` → inherit original item's tags for new photo
- `tagGeneratedEnabled` + `generatedTagInput` → append extra TAG to new photo
- `appendTagToOriginalItemIfNeeded(item, opts)` — tries `update` → `modify` → `set` (3-layer fallback)
- `buildGeneratedTags(item, opts)` — merges original tags + extra tag via Set dedup
- `getPrimaryFolder(item)` — returns `[item.folders[0]]` only (design decision)

### Conflict-Safe File Addition (v1.8.0)
- `addStampedItemWithUniqueName(tmpPath, payload)` — retries up to 20 times
- Conflict detection: `/exist|duplicate|重複|已存在|same name/i` on error message
- On conflict: appends `_2`, `_3`, ... to baseName

## Critical Rules

### Eagle API Constraints
- `item.filePath`, `item.name` etc. are READ-ONLY getters - never assign
- Use `eagle.item.addFromPath(path, options)` to create copies (2-arg format)
- `addFromPath` uses `getPrimaryFolder(item)` → only first folder (design decision, not a bug)
- `getSelected()` may timeout on startup - use Promise.race + retry pattern
- TIFF not supported (Chromium Canvas limitation)
- Supported formats: .jpg .jpeg .png .webp .gif .bmp

### DevTools Prevention
- `manifest.json`: `"devTools": false`
- First `getSelected()` call: delay 1s after `onPluginCreate`
- Dual-layer unhandled rejection interceptors (window + process)
- `eagle.plugin.closeDevTools()` after init

### Version Bump Protocol
Every version change MUST sync 4 files:
1. `manifest.json` -> `"version"`
2. `changelog.md` -> new section at top
3. `README.md` -> line 3 version string
4. `prompt_for_next_session.md` -> header version + feature list

### Bug Prevention Checklist
- `autoFillDate()`: ONLY call when `getTimeSource() === 'original'` (3 locations)
- `_savedManualDatetime`: set BEFORE btn.click() in loadSettings()
- `formatDate()`: always use `/g` regex flag
- `timeoutId`: declare OUTSIDE try-catch for cleanup access
- `fetchPromise.catch(() => {})`: attach immediately after Promise.race creation
- Canvas shadow: reset in `finally` block
- `ctx.setTransform(1,0,0,1,0,0)` at start of drawTimestampToContext()
- `loadSettings()` migration: check `opts.padding !== undefined && opts.paddingX === undefined`
- `calcPos()` backward compat: `if (marginY === undefined) marginY = marginX`
- Suffix sanitization: must strip `\/\\:*?"<>|` before use in filename
- `buildStampedBaseName`: compute fixedPart length FIRST, then truncate origBase (token/suffix must never be cut)
- TAG comparison: `JSON.stringify(mergedTags) !== JSON.stringify(item.tags || [])` — order-sensitive, safe because mergeTags preserves insertion order

### Skills (in .claude/skills/)
| Skill | When to Use |
|-------|-------------|
| `eagle-api.md` | Eagle API queries, addFromPath usage |
| `version-bump.md` | Version updates, changelog |
| `bug-audit.md` | Full feature audit, regression check |
| `settings-patterns.md` | Adding new settings items |
