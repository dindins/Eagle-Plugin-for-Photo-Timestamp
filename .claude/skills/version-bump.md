---
name: version-bump
description: This skill should be used when the user asks to "bump version", "update version number", "release new version", "update changelog", "publish release", or needs guidance on the 3-file version sync protocol (manifest.json, changelog.md, README.md) for the Eagle Timestamp Plugin.
---

# 版本號更新流程

發布新版本、更新 changelog 或升版號時使用。

---

## 必須同步更新的三個地方

### 1. `manifest.json`
```json
{
  "version": "X.X.X"
}
```

### 2. `changelog.md`（頂部新增段落）
```markdown
## [X.X.X] - YYYY-MM-DD

### 新增 (Added)
- ...

### 修復 (Fixed)
- ...

### 變更 (Changed)
- ...

---

## [前一個版本] ...
```

### 3. `README.md`（第 3 行）
```markdown
> 版本：X.X.X ｜ YYYY-MM-DD
```

---

## 版本號規則（語意化版本）

| 情況 | 版本升級 | 範例 |
|------|---------|------|
| 重大 UI 重構 / 破壞性變更 | Major `X.0.0` | 1.0.0 → 2.0.0 |
| 新功能（向下相容） | Minor `x.X.0` | 1.5.0 → 1.6.0 |
| Bug 修復 / 小調整 | Patch `x.x.X` | 1.6.0 → 1.6.1 |

---

## 操作順序

1. 讀取 `manifest.json`（確認目前版本）
2. 讀取 `changelog.md`（確認最新版本 section）
3. 讀取 `README.md`（確認版本行）
4. 編輯三個檔案（changelog 在頂部插入新 section）
5. 確認三個檔案版本號一致

---

## 日期

使用當天日期（格式 `YYYY-MM-DD`），若使用者明確指定則遵從。

---

## Changelog 寫作規範

- **新增 (Added)**：全新功能或 UI 元件
- **修復 (Fixed)**：Bug fix（描述根本原因，不只是症狀）
- **變更 (Changed)**：既有功能的行為或外觀修改
- 每條以「**粗體標題**：說明」格式書寫
- 不要只寫 "fixed bug"，要說清楚是什麼 bug 以及怎麼修的
