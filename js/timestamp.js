/**
 * timestamp.js
 * 本地 Canvas 時間戳記燒入引擎
 * 採用 Eagle 官方範例模式，錯誤直接顯示在 UI
 */

'use strict';

// ── 日誌安全引用（_log 由 main.js 定義並掛載到 window._log） ──
// 本檔案比 main.js 先載入，但所有函式在實際執行時 main.js 已就緒
const _tsNoop = () => {};
function _getLog() {
    return window._log || { info: _tsNoop, warn: _tsNoop, error: _tsNoop };
}

// ── 常數定義 ─────────────────────────────
const JPEG_QUALITY = 0.95;
const EXIF_SCAN_BYTES = 65536;
const MIN_FONT_SIZE_PX = 10;
// MAX_PREVIEW_SIZE 定義在 renderPreview 內部（1200），保持不變

/** MIME 類型對照表 */
const MIME_MAP = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.bmp': 'image/bmp',
};

/** 格式化日期字串 */
function formatDate(date, fmt) {
    const pad = (n) => String(n).padStart(2, '0');
    return fmt
        .replace(/YYYY/g, date.getFullYear())
        .replace(/MM/g, pad(date.getMonth() + 1))
        .replace(/DD/g, pad(date.getDate()))
        .replace(/HH/g, pad(date.getHours()))
        .replace(/mm/g, pad(date.getMinutes()))
        .replace(/ss/g, pad(date.getSeconds()))
        .replace(/M/g, String(date.getMonth() + 1))
        .replace(/D/g, String(date.getDate()));
}

/** 取得副檔名 */
function getExt(filePath) {
    const i = filePath.lastIndexOf('.');
    return i !== -1 ? filePath.slice(i).toLowerCase() : '.jpg';
}

/** 本地圖片路徑 → HTMLImageElement（file:// 優先，base64 fallback） */
function loadImage(filePath) {
    return new Promise((resolve, reject) => {
        if (!filePath) return reject(new Error('圖片路徑為空'));
        const fs = require('fs');
        if (!fs.existsSync(filePath)) return reject(new Error('檔案不存在'));

        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            // file:// 失敗時 fallback 到 base64
            _loadImageBase64(filePath).then(resolve).catch(reject);
        };
        img.src = 'file:///' + filePath.replace(/\\/g, '/');
    });
}

/** base64 fallback 載入方式 */
function _loadImageBase64(filePath) {
    return new Promise((resolve, reject) => {
        try {
            const fs = require('fs');
            const buf = fs.readFileSync(filePath);
            const ext = getExt(filePath);
            const mime = MIME_MAP[ext] || 'image/jpeg';
            const img = new window.Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('base64 載入失敗'));
            img.src = `data:${mime};base64,${buf.toString('base64')}`;
        } catch (e) {
            reject(new Error(`載入圖片失敗: ${e.message}`));
        }
    });
}

/** 位置座標計算（支援分離 X/Y 邊距） */
function calcPos(pos, W, H, marginX, marginY) {
    if (marginY === undefined) marginY = marginX; // 向後相容
    const tbl = {
        'top-left': { x: marginX, y: marginY, ta: 'left', tb: 'top' },
        'top-center': { x: W / 2, y: marginY, ta: 'center', tb: 'top' },
        'top-right': { x: W - marginX, y: marginY, ta: 'right', tb: 'top' },
        'middle-left': { x: marginX, y: H / 2, ta: 'left', tb: 'middle' },
        'center': { x: W / 2, y: H / 2, ta: 'center', tb: 'middle' },
        'middle-right': { x: W - marginX, y: H / 2, ta: 'right', tb: 'middle' },
        'bottom-left': { x: marginX, y: H - marginY, ta: 'left', tb: 'bottom' },
        'bottom-center': { x: W / 2, y: H - marginY, ta: 'center', tb: 'bottom' },
        'bottom-right': { x: W - marginX, y: H - marginY, ta: 'right', tb: 'bottom' },
    };
    return tbl[pos] || tbl['bottom-right'];
}

/**
 * 讀取圖片 EXIF 日期（無相依，掃描 buffer 找日期格式）
 * 尋找格式如 '2026:01:16 12:34:56'
 */
function readExifDate(filePath) {
    let fd = null;
    try {
        const fs = require('fs');
        const stats = fs.statSync(filePath);
        const readSize = Math.min(EXIF_SCAN_BYTES, stats.size);
        if (readSize === 0) return null;

        fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(readSize);
        const bytesRead = fs.readSync(fd, buf, 0, readSize, 0);

        const str = buf.toString('ascii', 0, bytesRead);
        const match = str.match(/(20\d{2}|19\d{2}):(0[1-9]|1[0-2]):(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)/);
        if (match) {
            const dStr = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
            return new Date(dStr);
        }
    } catch (e) {
        _getLog().warn('[TimestampTool] EXIF 讀取例外:', e);
    } finally {
        if (fd !== null) {
            try { require('fs').closeSync(fd); } catch (_) { }
        }
    }
    return null;
}

/**
 * 統一 EXIF 日期讀取入口
 * 優先讀取 EXIF，fallback 到檔案建立時間，最後使用當前時間
 * @returns {{ date: Date, hadExif: boolean }}
 */
function getDateForFile(filePath) {
    let date = readExifDate(filePath);
    const hadExif = !!date;
    if (!date) {
        try {
            date = require('fs').statSync(filePath).birthtime;
        } catch (_) {
            date = new Date();
        }
    }
    return { date, hadExif };
}

/**
 * 共用的繪製邏輯
 */
function drawTimestampToContext(ctx, canvas, img, opts) {
    const {
        date = new Date(),
        format = 'YYYY/M/D',
        position = 'bottom-right',
        fontSize = 4,
        textColor = '#FF9900',
        bgColor = '#000000',
        bgOpacity = 0,
        paddingX, paddingY, padding,
        shadow = true,
    } = opts;

    // 重置 transform，防止不同 DPI 設定的 PC 上 transform 累積導致渲染偏移
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // ── 計算等比例大小（支援分離 X/Y 邊距，向後相容舊版 padding） ──
    const baseSize = Math.min(canvas.width, canvas.height);
    const actualFontSize = Math.max(MIN_FONT_SIZE_PX, Math.floor(baseSize * (fontSize / 100)));
    const pxVal = paddingX ?? padding ?? 3;
    const pyVal = paddingY ?? padding ?? 3;
    const actualPaddingX = Math.floor(baseSize * (pxVal / 100));
    const actualPaddingY = Math.floor(baseSize * (pyVal / 100));

    // ── 準備文字 ──
    const text = formatDate(date, format);
    const font = `bold ${actualFontSize}px "Microsoft JhengHei", Arial, sans-serif`;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(text).width;
    const th = actualFontSize;
    const inner = Math.max(6, actualFontSize * 0.2);

    const p = calcPos(position, canvas.width, canvas.height, actualPaddingX, actualPaddingY);
    ctx.textAlign = p.ta;
    ctx.textBaseline = p.tb;

    // ── 背景框座標 ──
    const bw = tw + inner * 2;
    const bh = th + inner * 2;
    let bx, by;
    switch (p.ta) {
        case 'left': bx = p.x - inner; break;
        case 'center': bx = p.x - bw / 2; break;
        case 'right': bx = p.x - bw + inner; break;
        default: bx = p.x - inner;
    }
    switch (p.tb) {
        case 'top': by = p.y - inner; break;
        case 'middle': by = p.y - bh / 2; break;
        case 'bottom': by = p.y - th - inner; break;
        default: by = p.y - inner;
    }

    // ── 繪製背景 ──
    if (bgOpacity > 0) {
        const [r, g, b] = [
            parseInt(bgColor.slice(1, 3), 16),
            parseInt(bgColor.slice(3, 5), 16),
            parseInt(bgColor.slice(5, 7), 16),
        ];
        ctx.fillStyle = `rgba(${r},${g},${b},${bgOpacity / 100})`;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(bx, by, bw, bh, 6);
        } else {
            ctx.rect(bx, by, bw, bh);
        }
        ctx.fill();
    }

    // ── 繪製文字 ──
    try {
        ctx.font = font;
        ctx.fillStyle = textColor;
        ctx.textAlign = p.ta;
        ctx.textBaseline = p.tb;

        if (shadow !== false) {
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = Math.max(2, Math.floor(actualFontSize * 0.25));
            ctx.shadowOffsetX = Math.max(1, Math.floor(actualFontSize * 0.05));
            ctx.shadowOffsetY = Math.max(1, Math.floor(actualFontSize * 0.05));
        } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        ctx.fillText(text, p.x, p.y);
    } catch (e) {
        throw new Error('Canvas 繪製文字時發生錯誤: ' + e.message);
    } finally {
        // 無論成功或失敗，都必須重置陰影，避免殘留狀態影響下一次繪製
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
}

/**
 * 即時預覽：將結果縮放繪製到指定的 canvas 上
 */
async function renderPreview(filePath, opts, targetCanvas) {
    try {
        if (!targetCanvas) throw new Error('RenderPreview 缺少 targetCanvas');
        const img = await loadImage(filePath);
        if (!img) throw new Error('RenderPreview 載入圖片回傳為空');

        const MAX_PREVIEW_SIZE = 1200;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) throw new Error('讀取不到圖片長寬資訊');

        if (w > MAX_PREVIEW_SIZE || h > MAX_PREVIEW_SIZE) {
            const ratio = Math.min(MAX_PREVIEW_SIZE / w, MAX_PREVIEW_SIZE / h);
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
        }

        targetCanvas.width = w;
        targetCanvas.height = h;
        const ctx = targetCanvas.getContext('2d');
        if (!ctx) throw new Error('無法取得 Canvas 2D Context');

        drawTimestampToContext(ctx, targetCanvas, img, opts);
    } catch (err) {
        _getLog().warn('[TimestampTool] renderPreview 發生錯誤:', err);
        throw err;
    }
}

/**
 * 核心：燒入時間戳記
 * @returns {Promise<string>} 暫存檔路徑
 */
async function burnTimestamp(filePath, opts) {
    const img = await loadImage(filePath);
    const canvas = document.getElementById('workCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 600;

    drawTimestampToContext(ctx, canvas, img, opts);

    // ── 輸出暫存檔 ──
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const ext = getExt(filePath);
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    const tmp = path.join(os.tmpdir(), `eagle_ts_${Date.now()}_${uniqueSuffix}${ext}`);

    await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('canvas.toBlob 回傳 null'));
            const fr = new FileReader();
            fr.onload = () => {
                try {
                    fs.writeFileSync(tmp, Buffer.from(fr.result));
                    resolve();
                } catch (e) {
                    reject(new Error(`fs.writeFileSync 寫入暫存檔失敗: ${e.message}`));
                }
            };
            fr.onerror = () => reject(new Error('FileReader 讀取 Blob 失敗'));
            fr.readAsArrayBuffer(blob);
        }, mime, JPEG_QUALITY);
    });

    return tmp;
}

/** 清理暫存 */
function cleanupTemp(f) {
    try {
        const fs = require('fs');
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) { }
}

window.TimestampEngine = {
    burnTimestamp,
    renderPreview,
    readExifDate,
    getDateForFile,
    formatDate,
    cleanupTemp,
};
