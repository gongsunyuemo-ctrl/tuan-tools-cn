(function () {
  "use strict";
  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const summary = document.querySelector("#file-summary");
  const preview = document.querySelector("#preview");
  const empty = document.querySelector("#preview-empty");
  const targetInput = document.querySelector("#target-kb");
  const formatInput = document.querySelector("#output-format");
  const resizeInput = document.querySelector("#allow-resize");
  const runButton = document.querySelector("#run");
  const resetButton = document.querySelector("#reset");
  const status = document.querySelector("#status");
  const result = document.querySelector("#result");
  const resultPreview = document.querySelector("#result-preview");
  const gate = C.createTaskGate();
  let loaded = null;
  let sourceFile = null;
  let outputBlob = null;
  let outputType = "";
  let outputUrl = "";

  C.wireDropzone(zone, input, selectFile);
  runButton.addEventListener("click", compress);
  resetButton.addEventListener("click", reset);
  [targetInput, formatInput, resizeInput].forEach(function (node) {
    node.addEventListener("input", function () {
      if (runButton.getAttribute("aria-busy") === "true") return;
      else clearResult();
    });
  });
  document.querySelector("#download").addEventListener("click", function () {
    if (outputBlob) C.downloadBlob(outputBlob, C.baseName(sourceFile.name) + "-compressed." + C.extensionFor(outputType || outputBlob.type));
  });
  document.querySelector("#open-result").addEventListener("click", function () {
    if (outputUrl) window.open(outputUrl, "_blank", "noopener");
  });

  async function selectFile(file) {
    const token = gate.start();
    [targetInput, formatInput, resizeInput, input].forEach(function (node) { node.disabled = false; });
    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;
    clearResult();
    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;
    summary.textContent = "正在检查：" + file.name;
    C.setBusy(runButton, false, "开始压缩");
    runButton.disabled = true;
    C.clearStatus(status);
    try {
      const next = await C.loadImage(file);
      if (!gate.active(token)) { C.releaseImage(next); return; }
      loaded = next;
      sourceFile = file;
      clearResult();
      preview.src = loaded.url;
      preview.hidden = false;
      empty.hidden = true;
      summary.textContent = file.name + " · " + loaded.width + " × " + loaded.height + " · " + C.formatBytes(file.size);
      C.setBusy(runButton, false, "开始压缩");
      runButton.disabled = false;
      resetButton.hidden = false;
    } catch (error) {
      if (gate.active(token)) { summary.textContent = ""; C.setStatus(status, error.message, "danger"); }
    }
  }

  function clearResult() {
    outputBlob = null;
    outputType = "";
    result.hidden = true;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = "";
    resultPreview.removeAttribute("src");
  }

  function reset() {
    gate.cancel();
    [targetInput, formatInput, resizeInput, input].forEach(function (node) { node.disabled = false; });
    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;
    clearResult();
    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;
    summary.textContent = "";
    targetInput.value = "100";
    formatInput.value = "image/jpeg";
    resizeInput.checked = true;
    runButton.disabled = true;
    resetButton.hidden = true;
    C.clearStatus(status);
  }

  async function findBest(canvas, type, targetBytes, token) {
    let low = 0.08;
    let high = 0.96;
    let best = null;
    for (let i = 0; i < 6; i += 1) {
      if (!gate.active(token)) throw new Error("任务已取消。");
      const quality = (low + high) / 2;
      const blob = await C.canvasToBlob(canvas, type, quality);
      if (blob.size <= targetBytes) { best = blob; low = quality; }
      else high = quality;
      await C.nextFrame();
    }
    return best || C.canvasToBlob(canvas, type, 0.06);
  }

  async function compress() {
    if (!loaded) { C.setStatus(status, "请先选择一张图片。", "warn"); return; }
    const targetKB = Number(targetInput.value);
    if (!Number.isFinite(targetKB) || targetKB < 5 || targetKB > 10240) {
      C.setStatus(status, "目标大小请输入 5–10240 KB。", "danger");
      return;
    }
    const targetBytes = Math.round(targetKB * 1024);
    const type = formatInput.value;
    const controls = [targetInput, formatInput, resizeInput, input, resetButton];
    const token = gate.start();
    clearResult();
    C.setBusy(runButton, true, "压缩处理中…");
    controls.forEach(function (node) { node.disabled = true; });
    C.setStatus(status, "正在计算压缩参数，处理大图可能需要一些时间。", "ok");
    try {
      let width = loaded.width;
      let height = loaded.height;
      let blob = null;
      let canvas = null;
      let reused = false;
      if (loaded.type === type && sourceFile.size <= targetBytes) {
        blob = sourceFile.slice(0, sourceFile.size, loaded.type);
        canvas = { width, height };
        reused = true;
      } else {
        for (let pass = 0; pass < 4; pass += 1) {
          if (!gate.active(token)) throw new Error("任务已取消。");
          C.setStatus(status, "正在压缩：第 " + (pass + 1) + " 轮，共最多 4 轮。", "ok");
          const made = C.makeCanvas(width, height, type !== "image/jpeg");
          canvas = made.canvas;
          if (type === "image/jpeg") {
            made.ctx.fillStyle = "#ffffff";
            made.ctx.fillRect(0, 0, width, height);
          }
          made.ctx.drawImage(loaded.img, 0, 0, width, height);
          blob = await findBest(canvas, type, targetBytes, token);
          if (blob.size <= targetBytes || !resizeInput.checked || Math.max(width, height) <= 640 || width * height <= 120000) break;
          const scale = Math.max(0.45, Math.min(0.86, Math.sqrt(targetBytes / blob.size) * 0.92));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
      }
      if (!gate.active(token)) throw new Error("任务已取消。");
      outputBlob = blob;
      outputType = blob.type;
      outputUrl = C.replaceObjectUrl(outputUrl, blob, resultPreview);
      document.querySelector("#original-size").textContent = C.formatBytes(sourceFile.size);
      document.querySelector("#output-size").textContent = C.formatBytes(blob.size);
      document.querySelector("#output-dimensions").textContent = canvas.width + " × " + canvas.height;
      const delta = (1 - blob.size / sourceFile.size) * 100;
      document.querySelector("#saving-label").textContent = delta >= 0 ? "体积减少" : "体积变化";
      document.querySelector("#saving").textContent = delta >= 0 ? delta.toFixed(1) + "%" : "增加 " + Math.abs(delta).toFixed(1) + "%";
      const reached = blob.size <= targetBytes;
      C.focusResult(result);
      if (reused) C.setStatus(status, "原图已经满足目标大小，下载时不会再次编码。", "ok");
      else C.setStatus(status, reached ? "处理完成，输出未超过目标大小。" : "已达到当前尺寸和画质下限，但仍高于目标值。", reached ? "ok" : "warn");
    } catch (error) {
      if (gate.active(token) && error.message !== "任务已取消。") C.setStatus(status, "压缩失败：" + error.message, "danger");
    } finally {
      if (gate.active(token)) {
        C.setBusy(runButton, false, "开始压缩");
        runButton.disabled = !loaded;
        controls.forEach(function (node) { node.disabled = false; });
      }
    }
  }

  window.addEventListener("pagehide", function () {
    gate.cancel();
    C.releaseImage(loaded);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });
})();
