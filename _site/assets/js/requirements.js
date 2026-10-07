(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const summary = document.querySelector("#file-summary");
  const preview = document.querySelector("#preview");
  const empty = document.querySelector("#preview-empty");
  const widthInput = document.querySelector("#target-width");
  const heightInput = document.querySelector("#target-height");
  const sizeInput = document.querySelector("#target-kb");
  const formatInput = document.querySelector("#output-format");
  const fitInput = document.querySelector("#fit-mode");
  const backgroundInput = document.querySelector("#background");
  const focalXInput = document.querySelector("#focal-x");
  const focalYInput = document.querySelector("#focal-y");
  const runButton = document.querySelector("#run");
  const resetButton = document.querySelector("#reset");
  const status = document.querySelector("#status");
  const result = document.querySelector("#result");
  const resultPreview = document.querySelector("#result-preview");
  const gate = C.createTaskGate();

  let loaded = null;
  let sourceFile = null;
  let outputBlob = null;
  let outputUrl = "";

  C.wireDropzone(zone, input, selectFile);
  runButton.addEventListener("click", processImage);
  resetButton.addEventListener("click", reset);

  document.querySelectorAll("[data-requirement-preset]").forEach(function (button) {
    button.addEventListener("click", function () {
      const values = button.dataset.requirementPreset.split("x");
      widthInput.value = values[0];
      heightInput.value = values[1];
      sizeInput.value = button.dataset.kb || "100";
      formatInput.value = button.dataset.format || "image/jpeg";
      invalidate();
      widthInput.focus();
    });
  });

  [widthInput, heightInput, sizeInput, formatInput, fitInput, backgroundInput, focalXInput, focalYInput].forEach(function (node) {
    node.addEventListener("input", invalidate);
  });

  document.querySelector("#download").addEventListener("click", function () {
    if (!outputBlob || !sourceFile) return;
    window.TuanAnalytics?.track("tool_download", "photo-requirements");
    C.downloadBlob(outputBlob, C.baseName(sourceFile.name) + "-ready." + C.extensionFor(outputBlob.type));
  });

  document.querySelector("#open-result").addEventListener("click", function () {
    if (outputUrl) window.open(outputUrl, "_blank", "noopener");
  });

  async function selectFile(file) {
    const token = gate.start();
    releaseSource();
    clearResult();
    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;
    summary.textContent = "正在检查：" + file.name;
    runButton.disabled = true;
    resetButton.hidden = true;
    C.clearStatus(status);

    try {
      const next = await C.loadImage(file);
      if (!gate.active(token)) {
        C.releaseImage(next);
        return;
      }
      loaded = next;
      sourceFile = file;
      preview.src = loaded.url;
      preview.hidden = false;
      empty.hidden = true;
      summary.textContent = file.name + " · " + loaded.width + " × " + loaded.height + " · " + C.formatBytes(file.size);
      runButton.disabled = false;
      resetButton.hidden = false;
      window.TuanAnalytics?.track("tool_file_selected", "photo-requirements");
    } catch (error) {
      if (gate.active(token)) {
        summary.textContent = "";
        C.setStatus(status, error.message, "danger");
      }
    }
  }

  function invalidate() {
    if (runButton.getAttribute("aria-busy") === "true") return;
    clearResult();
  }

  function requirements() {
    const width = Math.round(Number(widthInput.value));
    const height = Math.round(Number(heightInput.value));
    const targetKB = Number(sizeInput.value);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
      throw new Error("目标宽高请输入 1～8192 像素之间的整数。");
    }
    if (width * height > C.MAX_OUTPUT_PIXELS) throw new Error("目标总像素不能超过 2400 万。");
    if (Math.max(width, height) / Math.min(width, height) > 40) throw new Error("目标宽高比例过于极端，请重新核对平台要求。");
    if (!Number.isFinite(targetKB) || targetKB < 5 || targetKB > 10240) throw new Error("最大文件大小请输入 5～10240 KB 之间的数值。");
    return { width, height, targetKB, targetBytes: Math.round(targetKB * 1024), type: formatInput.value, fit: fitInput.value, background: backgroundInput.value };
  }

  async function findBest(canvas, type, targetBytes, token) {
    let low = 0.05;
    let high = 0.96;
    let best = null;
    for (let i = 0; i < 7; i += 1) {
      if (!gate.active(token)) throw new Error("任务已取消。");
      const quality = (low + high) / 2;
      const blob = await C.canvasToBlob(canvas, type, quality);
      if (blob.size <= targetBytes) {
        best = blob;
        low = quality;
      } else {
        high = quality;
      }
      await C.nextFrame();
    }
    return best || C.canvasToBlob(canvas, type, 0.04);
  }

  async function processImage() {
    if (!loaded) {
      C.setStatus(status, "请先选择一张图片。", "warn");
      return;
    }

    let req;
    try {
      req = requirements();
    } catch (error) {
      C.setStatus(status, error.message, "danger");
      return;
    }

    const token = gate.start();
    const controls = [input, widthInput, heightInput, sizeInput, formatInput, fitInput, backgroundInput, focalXInput, focalYInput, resetButton];
    controls.forEach(function (node) { node.disabled = true; });
    document.querySelectorAll("[data-requirement-preset]").forEach(function (node) { node.disabled = true; });
    clearResult();
    C.setBusy(runButton, true, "正在按要求处理…");
    C.setStatus(status, "正在调整像素、格式和文件大小，请稍候…", "ok");
    window.TuanAnalytics?.track("tool_run", "photo-requirements");

    try {
      const made = C.makeCanvas(req.width, req.height, req.type !== "image/jpeg");
      const background = req.type === "image/jpeg" ? req.background : null;
      C.drawImageFitted(made.ctx, loaded.img, req.width, req.height, req.fit, background, Number(focalXInput.value) / 100, Number(focalYInput.value) / 100);

      let blob;
      if (req.type === "image/png") blob = await C.canvasToBlob(made.canvas, req.type);
      else blob = await findBest(made.canvas, req.type, req.targetBytes, token);

      if (!gate.active(token)) throw new Error("任务已取消。");
      outputBlob = blob;
      outputUrl = C.replaceObjectUrl(outputUrl, blob, resultPreview);

      const sizeOk = blob.size <= req.targetBytes;
      const dimensionsOk = made.canvas.width === req.width && made.canvas.height === req.height;
      const formatOk = blob.type === req.type;
      const allOk = sizeOk && dimensionsOk && formatOk;

      document.querySelector("#requirement-target").textContent = req.width + " × " + req.height + " · ≤ " + req.targetKB + " KB · " + labelType(req.type);
      document.querySelector("#requirement-output").textContent = made.canvas.width + " × " + made.canvas.height + " · " + C.formatBytes(blob.size) + " · " + labelType(blob.type);
      document.querySelector("#requirement-dimensions").textContent = dimensionsOk ? "已满足" : "未满足";
      document.querySelector("#requirement-size").textContent = sizeOk ? "已满足" : "未满足";
      document.querySelector("#requirement-format").textContent = formatOk ? "已满足" : "未满足";
      document.querySelector("#requirement-status").textContent = allOk ? "全部满足" : "仍有条件未满足";
      document.querySelector("#requirement-note").textContent = resultNote(req, sizeOk);

      C.focusResult(result);
      window.TuanAnalytics?.track("tool_success", "photo-requirements");
      C.setStatus(status, allOk ? "处理完成：当前输出满足你填写的宽高、格式和文件大小要求。" : "处理完成，但仍有条件未满足，请查看结果说明后调整要求。", allOk ? "ok" : "warn");
    } catch (error) {
      if (gate.active(token) && error.message !== "任务已取消。") C.setStatus(status, "处理失败：" + error.message, "danger");
    } finally {
      if (gate.active(token)) {
        controls.forEach(function (node) { node.disabled = false; });
        document.querySelectorAll("[data-requirement-preset]").forEach(function (node) { node.disabled = false; });
        C.setBusy(runButton, false, "按要求处理");
        runButton.disabled = !loaded;
      }
    }
  }

  function resultNote(req, sizeOk) {
    if (sizeOk) return "当前输出满足填写的最大文件大小。下载后仍建议在目标平台实际上传确认。";
    if (req.type === "image/png") return "PNG 没有类似 JPG/WebP 的有损质量参数。在宽高和 PNG 格式都必须固定时，浏览器无法保证压到这个 KB 上限；可提高 KB 上限，或在平台允许时改用 JPG/WebP。";
    return "在保持目标宽高和输出格式的前提下，最低质量附近仍超过 KB 上限。请提高最大 KB，或重新核对平台是否允许更小的像素尺寸。";
  }

  function labelType(type) {
    return { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" }[type] || type;
  }

  function clearResult() {
    outputBlob = null;
    result.hidden = true;
    resultPreview.removeAttribute("src");
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = "";
  }

  function releaseSource() {
    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;
  }

  function reset() {
    gate.cancel();
    releaseSource();
    clearResult();
    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;
    summary.textContent = "";
    widthInput.value = "295";
    heightInput.value = "413";
    sizeInput.value = "100";
    formatInput.value = "image/jpeg";
    fitInput.value = "cover";
    backgroundInput.value = "#ffffff";
    focalXInput.value = "50";
    focalYInput.value = "42";
    runButton.disabled = true;
    resetButton.hidden = true;
    C.clearStatus(status);
  }

  window.addEventListener("pagehide", function () {
    gate.cancel();
    releaseSource();
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });
})();
