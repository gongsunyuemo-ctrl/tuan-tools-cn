(function () {
  "use strict";

  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 24_000_000;
  const MAX_OUTPUT_PIXELS = 24_000_000;
  const MAX_SIDE = 8192;
  const MAX_ASPECT_RATIO = 40;

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  }

  function extensionFor(type) {
    return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type] || "bin";
  }

  function baseName(name) {
    const cleaned = (name || "image")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9\u3400-\u9fff_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return cleaned || "image";
  }

  function sanitizeVisibleText(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").trim();
  }

  function readAscii(view, offset, length) {
    let value = "";
    for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
      value += String.fromCharCode(view.getUint8(offset + i));
    }
    return value;
  }

  function sniffImage(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength >= 3 && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8 && view.getUint8(2) === 0xff) {
      return "image/jpeg";
    }
    if (view.byteLength >= 24 && view.getUint32(0, false) === 0x89504e47 && view.getUint32(4, false) === 0x0d0a1a0a) {
      return "image/png";
    }
    if (view.byteLength >= 16 && readAscii(view, 0, 4) === "RIFF" && readAscii(view, 8, 4) === "WEBP") {
      return "image/webp";
    }
    return "";
  }

  function parseJpegDimensions(view) {
    let offset = 2;
    let segments = 0;
    while (offset + 1 < view.byteLength && segments < 4096) {
      if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
      while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1;
      if (offset >= view.byteLength) break;
      const marker = view.getUint8(offset);
      offset += 1;
      if (marker === 0x00) continue;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > view.byteLength) break;
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > view.byteLength) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null;
        return { width: view.getUint16(offset + 5, false), height: view.getUint16(offset + 3, false), animated: false };
      }
      offset += length;
      segments += 1;
    }
    return null;
  }

  function parsePngDimensions(view) {
    if (view.byteLength < 33 || view.getUint32(8, false) !== 13 || readAscii(view, 12, 4) !== "IHDR") return null;
    let animated = false;
    let chunks = 0;
    for (let offset = 8; offset + 12 <= view.byteLength && chunks < 100000;) {
      const length = view.getUint32(offset, false);
      const end = offset + 12 + length;
      if (!Number.isSafeInteger(end) || end > view.byteLength) return null;
      const chunk = readAscii(view, offset + 4, 4);
      if (chunk === "acTL") animated = true;
      offset += 12 + length;
      chunks += 1;
      if (chunk === "IEND") break;
    }
    return { width: view.getUint32(16, false), height: view.getUint32(20, false), animated };
  }

  function parseWebpDimensions(view) {
    if (view.byteLength < 30) return null;
    const chunk = readAscii(view, 12, 4);
    if (chunk === "VP8X") {
      const flags = view.getUint8(20);
      const dimensions = {
        width: 1 + view.getUint8(24) + (view.getUint8(25) << 8) + (view.getUint8(26) << 16),
        height: 1 + view.getUint8(27) + (view.getUint8(28) << 8) + (view.getUint8(29) << 16),
        animated: Boolean(flags & 0x02)
      };
      for (let offset = 12, chunks = 0; offset + 8 <= view.byteLength && chunks < 100000; chunks += 1) {
        const size = view.getUint32(offset + 4, true);
        const end = offset + 8 + size + (size % 2);
        if (!Number.isSafeInteger(end) || end > view.byteLength) break;
        if (readAscii(view, offset, 4) === "ANIM") dimensions.animated = true;
        offset = end;
      }
      return dimensions;
    }
    if (chunk === "VP8L" && view.byteLength >= 25 && view.getUint8(20) === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated: false };
    }
    if (chunk === "VP8 " && view.byteLength >= 30) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, animated: false };
    }
    return null;
  }

  async function inspectFile(file) {
    if (!file || !Number.isFinite(file.size)) throw new Error("请选择一张图片。");
    if (file.size <= 0) throw new Error("图片文件为空。");
    if (file.size > MAX_FILE_BYTES) throw new Error("图片不能超过 30 MB。");
    const buffer = await file.arrayBuffer();
    const type = sniffImage(buffer);
    if (!type) throw new Error("文件内容不是受支持的 JPG、PNG 或 WebP 图片。");
    const view = new DataView(buffer);
    const dimensions = type === "image/jpeg" ? parseJpegDimensions(view) : type === "image/png" ? parsePngDimensions(view) : parseWebpDimensions(view);
    if (!dimensions || !dimensions.width || !dimensions.height) throw new Error("无法读取图片尺寸，文件可能损坏或格式不受支持。");
    if (dimensions.animated) throw new Error("暂不处理动画图片，请先导出为单帧 JPG、PNG 或 WebP。");
    validateDimensions(dimensions.width, dimensions.height, MAX_SOURCE_PIXELS, "原图");
    return { type, width: dimensions.width, height: dimensions.height };
  }

  function validateDimensions(width, height, maxPixels, label) {
    const name = label || "图片";
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error(name + "尺寸无效。");
    if (width > MAX_SIDE || height > MAX_SIDE) throw new Error(name + "单边不能超过 " + MAX_SIDE + " 像素。");
    if (width * height > maxPixels) throw new Error(name + "不能超过 " + Math.round(maxPixels / 1_000_000) + " 百万像素。");
    if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT_RATIO) throw new Error(name + "宽高比过大，请先裁剪超长图片。");
  }

  async function loadImage(file) {
    const inspected = await inspectFile(file);
    const sourceBlob = file.type === inspected.type ? file : file.slice(0, file.size, inspected.type);
    const url = URL.createObjectURL(sourceBlob);
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.decoding = "async";
      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) {
          URL.revokeObjectURL(url);
          reject(new Error("图片解码后尺寸无效。"));
          return;
        }
        try {
          validateDimensions(img.naturalWidth, img.naturalHeight, MAX_SOURCE_PIXELS, "原图");
          resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight, type: inspected.type });
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("浏览器无法解码这张图片，文件可能损坏。"));
      };
      img.src = url;
    });
  }

  function releaseImage(loaded) {
    if (loaded && loaded.url) URL.revokeObjectURL(loaded.url);
  }

  function makeCanvas(width, height, alpha) {
    validateDimensions(width, height, MAX_OUTPUT_PIXELS, "输出图片");
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d", { alpha: alpha !== false, willReadFrequently: false });
    if (!ctx || canvas.width !== Math.round(width) || canvas.height !== Math.round(height)) {
      throw new Error("当前浏览器无法创建该尺寸的画布，请减小图片尺寸。");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return { canvas, ctx };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error("浏览器无法导出图片。")); return; }
          if (blob.type !== type) { reject(new Error("当前浏览器不支持导出所选格式。")); return; }
          resolve(blob);
        }, type, quality);
      } catch (error) {
        reject(new Error("图片导出失败：" + error.message));
      }
    });
  }

  function drawImageFitted(ctx, img, width, height, mode, background, focalX, focalY) {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;
    if (mode === "stretch") {
      ctx.drawImage(img, 0, 0, width, height);
      return;
    }
    if (mode === "contain") {
      let dw = width, dh = height, dx = 0, dy = 0;
      if (sourceRatio > targetRatio) { dh = width / sourceRatio; dy = (height - dh) / 2; }
      else { dw = height * sourceRatio; dx = (width - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
      return;
    }
    let sw = sourceWidth, sh = sourceHeight;
    if (sourceRatio > targetRatio) sw = sourceHeight * targetRatio;
    else sh = sourceWidth / targetRatio;
    const fx = Math.max(0, Math.min(1, Number.isFinite(focalX) ? focalX : 0.5));
    const fy = Math.max(0, Math.min(1, Number.isFinite(focalY) ? focalY : 0.5));
    const sx = (sourceWidth - sw) * fx;
    const sy = (sourceHeight - sh) * fy;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  }

  function replaceObjectUrl(currentUrl, blob, image) {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    const nextUrl = URL.createObjectURL(blob);
    if (image) image.src = nextUrl;
    return nextUrl;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 60_000);
  }

  function setStatus(node, message, tone) {
    node.hidden = false;
    node.textContent = message;
    node.dataset.tone = tone || "ok";
  }

  function clearStatus(node) {
    node.hidden = true;
    node.textContent = "";
    node.dataset.tone = "ok";
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    if (label) button.textContent = label;
  }

  function focusResult(result) {
    result.hidden = false;
    result.setAttribute("tabindex", "-1");
    result.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function createTaskGate() {
    let version = 0;
    return {
      start: function () { version += 1; return version; },
      cancel: function () { version += 1; },
      active: function (token) { return token === version; }
    };
  }

  function nextFrame() {
    return new Promise(function (resolve) { window.setTimeout(resolve, 0); });
  }

  function wireDropzone(zone, input, onFile) {
    const trigger = zone.querySelector("[data-file-trigger]");
    if (trigger) trigger.addEventListener("click", function () { input.click(); });
    let dragDepth = 0;
    zone.addEventListener("dragenter", function (event) { event.preventDefault(); dragDepth += 1; zone.classList.add("is-over"); });
    zone.addEventListener("dragover", function (event) { event.preventDefault(); });
    zone.addEventListener("dragleave", function (event) { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove("is-over"); });
    zone.addEventListener("drop", function (event) {
      event.preventDefault();
      dragDepth = 0;
      zone.classList.remove("is-over");
      if (input.disabled) return;
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length) onFile(files[0]);
    });
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) onFile(input.files[0]);
      input.value = "";
    });
  }

  function enforceTopLevel() {
    if (window.top === window.self) return true;
    const workspace = document.querySelector(".workspace");
    const panel = document.querySelector(".tool-panel");
    if (panel) panel.setAttribute("inert", "");
    if (workspace && !document.querySelector("#embedding-warning")) {
      const notice = document.createElement("p");
      notice.id = "embedding-warning";
      notice.className = "notice embedding-warning";
      notice.setAttribute("role", "alert");
      notice.textContent = "为保护本地图片，本工具不能在其他网页的嵌入框架中运行。请直接打开本站页面。";
      workspace.insertBefore(notice, workspace.firstChild);
    }
    return false;
  }

  window.addEventListener("pagehide", function () {
    document.querySelectorAll("img[data-blob-preview]").forEach(function (img) { img.removeAttribute("src"); });
  });

  window.ImageCore = {
    MAX_OUTPUT_PIXELS,
    formatBytes,
    extensionFor,
    baseName,
    sanitizeVisibleText,
    inspectFile,
    loadImage,
    releaseImage,
    makeCanvas,
    canvasToBlob,
    drawImageFitted,
    replaceObjectUrl,
    downloadBlob,
    setStatus,
    clearStatus,
    setBusy,
    focusResult,
    createTaskGate,
    nextFrame,
    wireDropzone,
    enforceTopLevel
  };

  enforceTopLevel();
})();
