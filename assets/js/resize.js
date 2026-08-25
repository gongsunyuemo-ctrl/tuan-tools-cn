(function () {
  "use strict";
  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const canvas = document.querySelector("#canvas");
  const status = document.querySelector("#status");
  const summary = document.querySelector("#file-summary");
  const empty = document.querySelector("#preview-empty");
  const widthInput = document.querySelector("#width");
  const heightInput = document.querySelector("#height");
  const lockInput = document.querySelector("#lock-ratio");
  const modeInput = document.querySelector("#fit-mode");
  const formatInput = document.querySelector("#output-format");
  const backgroundInput = document.querySelector("#background");
  const transparentInput = document.querySelector("#transparent-background");
  const focalX = document.querySelector("#focal-x");
  const focalY = document.querySelector("#focal-y");
  const quality = document.querySelector("#quality");
  const runButton = document.querySelector("#run");
  const result = document.querySelector("#result");
  const resultPreview = document.querySelector("#result-preview");
  const gate = C.createTaskGate();
  let loaded = null;
  let sourceFile = null;
  let ratio = 1;
  let outputBlob = null;
  let outputUrl = "";
  let changing = false;
  let renderFrame = 0;

  C.wireDropzone(zone, input, selectFile);
  widthInput.addEventListener("input", function () { syncRatio("width"); invalidate(); });
  heightInput.addEventListener("input", function () { syncRatio("height"); invalidate(); });
  [lockInput, modeInput, formatInput, backgroundInput, transparentInput, focalX, focalY, quality].forEach(function (node) { node.addEventListener("input", invalidate); });
  document.querySelectorAll("[data-preset]").forEach(function (button) {
    button.addEventListener("click", function () {
      const parts = button.dataset.preset.split("x");
      widthInput.value = parts[0];
      heightInput.value = parts[1];
      lockInput.checked = false;
      invalidate();
    });
  });
  runButton.addEventListener("click", exportImage);
  document.querySelector("#reset").addEventListener("click", reset);
  document.querySelector("#download").addEventListener("click", function () {
    if (outputBlob) {
      const target = dimensions();
      C.downloadBlob(outputBlob, C.baseName(sourceFile.name) + "-" + target.width + "x" + target.height + "." + C.extensionFor(outputBlob.type));
    }
  });
  document.querySelector("#open-result").addEventListener("click", function () { if (outputUrl) window.open(outputUrl, "_blank", "noopener"); });
  window.addEventListener("pageshow", syncControls);
  syncControls();

  async function selectFile(file) {
    const token = gate.start();
    [widthInput, heightInput, lockInput, modeInput, formatInput, backgroundInput, transparentInput, focalX, focalY, quality, input].forEach(function (node) { node.disabled = false; });
    document.querySelectorAll("[data-preset]").forEach(function (node) { node.disabled = false; });
    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;
    clearResult();
    canvas.width = 1;
    canvas.height = 1;
    canvas.hidden = true;
    empty.hidden = false;
    summary.textContent = "正在检查：" + file.name;
    C.setBusy(runButton, false, "生成新尺寸图片");
    runButton.disabled = true;
    try {
      const next = await C.loadImage(file);
      if (!gate.active(token)) { C.releaseImage(next); return; }
      loaded = next;
      sourceFile = file;
      ratio = loaded.width / loaded.height;
      widthInput.value = loaded.width;
      heightInput.value = loaded.height;
      summary.textContent = file.name + " · " + loaded.width + " × " + loaded.height + " · " + C.formatBytes(file.size);
      empty.hidden = true;
      canvas.hidden = false;
      C.setBusy(runButton, false, "生成新尺寸图片");
      runButton.disabled = false;
      document.querySelector("#reset").hidden = false;
      clearResult();
      C.clearStatus(status);
      schedulePreview();
    } catch (error) {
      if (gate.active(token)) { summary.textContent = ""; C.setStatus(status, error.message, "danger"); }
    }
  }

  function syncRatio(changed) {
    if (!lockInput.checked || changing || !loaded) return;
    changing = true;
    if (changed === "width") heightInput.value = Math.max(1, Math.round(Number(widthInput.value) / ratio));
    else widthInput.value = Math.max(1, Math.round(Number(heightInput.value) * ratio));
    changing = false;
  }

  function dimensions() {
    const width = Math.round(Number(widthInput.value));
    const height = Math.round(Number(heightInput.value));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
      throw new Error("宽高请输入 1–8192 像素。");
    }
    if (width * height > C.MAX_OUTPUT_PIXELS) throw new Error("输出不能超过 2400 万像素。");
    if (Math.max(width, height) / Math.min(width, height) > 40) throw new Error("输出宽高比过大，请缩短长边。");
    widthInput.value = String(width);
    heightInput.value = String(height);
    return { width, height };
  }

  function syncControls() {
    const canAlpha = formatInput.value !== "image/jpeg";
    transparentInput.disabled = !canAlpha;
    if (!canAlpha) transparentInput.checked = false;
    backgroundInput.disabled = canAlpha && transparentInput.checked;
    quality.disabled = formatInput.value === "image/png";
    document.querySelector("#quality-value").textContent = quality.value + "%";
    const cropping = modeInput.value === "cover";
    document.querySelector("#crop-controls").hidden = !cropping;
  }

  function backgroundValue() {
    return formatInput.value !== "image/jpeg" && transparentInput.checked ? null : backgroundInput.value;
  }

  function invalidate() {
    if (runButton.getAttribute("aria-busy") === "true") {
      gate.cancel();
      C.setBusy(runButton, false, "生成新尺寸图片");
      runButton.disabled = !loaded;
      C.setStatus(status, "参数已改变，已取消旧任务。", "warn");
    }
    syncControls();
    clearResult();
    schedulePreview();
  }

  function clearResult() {
    outputBlob = null;
    result.hidden = true;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = "";
    resultPreview.removeAttribute("src");
  }

  function schedulePreview() {
    if (!loaded) return;
    window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(renderPreview);
  }

  function renderPreview() {
    if (!loaded) return;
    try {
      const target = dimensions();
      const scale = Math.min(1, 900 / Math.max(target.width, target.height));
      const width = Math.max(1, Math.round(target.width * scale));
      const height = Math.max(1, Math.round(target.height * scale));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("当前浏览器无法生成预览。");
      ctx.clearRect(0, 0, width, height);
      C.drawImageFitted(ctx, loaded.img, width, height, modeInput.value, backgroundValue(), Number(focalX.value) / 100, Number(focalY.value) / 100);
      C.clearStatus(status);
    } catch (error) {
      C.setStatus(status, error.message, "danger");
    }
  }

  async function exportImage() {
    if (!loaded) { C.setStatus(status, "请先选择图片。", "warn"); return; }
    let target;
    try { target = dimensions(); }
    catch (error) { C.setStatus(status, error.message, "danger"); return; }
    const token = gate.start();
    const controls = [widthInput, heightInput, lockInput, modeInput, formatInput, backgroundInput, transparentInput, focalX, focalY, quality, input, document.querySelector("#reset"), ...document.querySelectorAll("[data-preset]")];
    C.setBusy(runButton, true, "生成处理中…");
    controls.forEach(function (node) { node.disabled = true; });
    C.setStatus(status, "正在按目标尺寸生成图片。", "ok");
    try {
      const alpha = formatInput.value !== "image/jpeg";
      const made = C.makeCanvas(target.width, target.height, alpha);
      C.drawImageFitted(made.ctx, loaded.img, target.width, target.height, modeInput.value, backgroundValue(), Number(focalX.value) / 100, Number(focalY.value) / 100);
      const blob = await C.canvasToBlob(made.canvas, formatInput.value, formatInput.value === "image/png" ? undefined : Number(quality.value) / 100);
      if (!gate.active(token)) return;
      outputBlob = blob;
      outputUrl = C.replaceObjectUrl(outputUrl, blob, resultPreview);
      document.querySelector("#output-size").textContent = C.formatBytes(blob.size);
      document.querySelector("#output-dimensions").textContent = target.width + " × " + target.height;
      C.focusResult(result);
      C.setStatus(status, "尺寸处理完成，请检查裁剪位置和清晰度。", "ok");
    } catch (error) {
      if (gate.active(token)) C.setStatus(status, "处理失败：" + error.message, "danger");
    } finally {
      if (gate.active(token)) { controls.forEach(function (node) { node.disabled = false; }); syncControls(); C.setBusy(runButton, false, "生成新尺寸图片"); runButton.disabled = !loaded; }
    }
  }

  function reset() {
    gate.cancel();
    [widthInput, heightInput, lockInput, modeInput, formatInput, backgroundInput, transparentInput, focalX, focalY, quality, input].forEach(function (node) { node.disabled = false; });
    document.querySelectorAll("[data-preset]").forEach(function (node) { node.disabled = false; });
    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;
    clearResult();
    canvas.width = 1;
    canvas.height = 1;
    canvas.hidden = true;
    empty.hidden = false;
    summary.textContent = "";
    widthInput.value = "800";
    heightInput.value = "600";
    lockInput.checked = true;
    modeInput.value = "contain";
    formatInput.value = "image/jpeg";
    backgroundInput.value = "#ffffff";
    transparentInput.checked = false;
    focalX.value = "50";
    focalY.value = "50";
    quality.value = "90";
    runButton.disabled = true;
    document.querySelector("#reset").hidden = true;
    syncControls();
    C.clearStatus(status);
  }

  window.addEventListener("pagehide", function () {
    gate.cancel();
    C.releaseImage(loaded);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  });
})();
