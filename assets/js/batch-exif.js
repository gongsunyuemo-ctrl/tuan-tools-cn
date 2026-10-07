(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#batch-input");
  const zone = document.querySelector("#batch-dropzone");
  const trigger = document.querySelector("#batch-trigger");
  const summary = document.querySelector("#batch-summary");
  const list = document.querySelector("#batch-file-list");
  const formatInput = document.querySelector("#output-format");
  const qualityInput = document.querySelector("#quality");
  const qualityValue = document.querySelector("#quality-value");
  const runButton = document.querySelector("#run");
  const resetButton = document.querySelector("#reset");
  const cancelButton = document.querySelector("#cancel");
  const progressWrap = document.querySelector("#batch-progress-wrap");
  const progress = document.querySelector("#batch-progress");
  const progressText = document.querySelector("#batch-progress-text");
  const status = document.querySelector("#status");
  const results = document.querySelector("#batch-results");
  const resultList = document.querySelector("#batch-result-list");
  const downloadAllButton = document.querySelector("#download-all");
  const retryFailedButton = document.querySelector("#retry-failed");
  const gate = C.createTaskGate();
  const MAX_FILES = 10;
  const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
  let files = [];
  let outputs = [];
  let failedEntries = [];

  trigger.addEventListener("click", function () { input.click(); });
  input.addEventListener("change", function () { chooseFiles(Array.from(input.files || [])); input.value = ""; });
  let dragDepth = 0;
  zone.addEventListener("dragenter", function (event) { event.preventDefault(); dragDepth += 1; zone.classList.add("is-over"); });
  zone.addEventListener("dragover", function (event) { event.preventDefault(); });
  zone.addEventListener("dragleave", function (event) { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove("is-over"); });
  zone.addEventListener("drop", function (event) { event.preventDefault(); dragDepth = 0; zone.classList.remove("is-over"); if (!input.disabled) chooseFiles(Array.from(event.dataTransfer.files || [])); });

  [formatInput, qualityInput].forEach(function (node) { node.addEventListener("input", function () { syncControls(); clearOutputs(); }); });
  runButton.addEventListener("click", runBatch);
  resetButton.addEventListener("click", reset);
  cancelButton.addEventListener("click", cancelBatch);
  downloadAllButton.addEventListener("click", downloadAll);
  retryFailedButton.addEventListener("click", retryFailed);
  syncControls();

  function syncControls() {
    qualityInput.disabled = formatInput.value === "image/png";
    qualityValue.textContent = qualityInput.value + "%";
  }

  async function chooseFiles(nextFiles) {
    gate.cancel(); clearOutputs(); C.clearStatus(status); files = []; list.textContent = "";
    if (!nextFiles.length) return;
    if (nextFiles.length > MAX_FILES) { C.setStatus(status, "一次最多选择 10 张图片，请分批处理。", "danger"); return; }
    const total = nextFiles.reduce(function (sum, file) { return sum + (Number(file.size) || 0); }, 0);
    if (total > MAX_TOTAL_BYTES) { C.setStatus(status, "所选文件总大小不能超过 80 MB，请分批处理。", "danger"); return; }
    summary.textContent = "正在检查 " + nextFiles.length + " 张图片…";
    input.disabled = true; trigger.disabled = true;
    try {
      let rejected = 0;
      let acceptedBytes = 0;
      for (const file of nextFiles) {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        const meta = document.createElement("span");
        let removeButton = null;
        name.textContent = file.name;
        try {
          const inspected = await C.inspectFile(file);
          const entry = { file, inspected };
          files.push(entry);
          acceptedBytes += file.size;
          meta.textContent = inspected.width + " × " + inspected.height + " · " + C.formatBytes(file.size);
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "batch-remove-file";
          remove.textContent = "移除";
          remove.setAttribute("aria-label", "移除 " + file.name);
          remove.addEventListener("click", function () {
            if (runButton.getAttribute("aria-busy") === "true") return;
            files = files.filter(function (candidate) { return candidate !== entry; });
            item.remove();
            clearOutputs();
            const remainingBytes = files.reduce(function (sum, candidate) { return sum + candidate.file.size; }, 0);
            summary.textContent = files.length ? "已选择 " + files.length + " 张可处理图片 · 共 " + C.formatBytes(remainingBytes) : "没有已选择的可处理图片";
            runButton.disabled = !files.length;
            resetButton.hidden = !files.length;
            C.setStatus(status, files.length ? "已移除该图片，其余图片仍可继续清理元数据。" : "已移除全部可处理图片。", files.length ? "ok" : "warn");
          });
          removeButton = remove;
        } catch (error) {
          rejected += 1;
          item.classList.add("is-invalid");
          meta.textContent = "已跳过：" + error.message;
        }
        item.append(name, meta); if (removeButton) item.append(removeButton); list.appendChild(item); await C.nextFrame();
      }
      if (!files.length) {
        summary.textContent = "没有可处理的图片";
        runButton.disabled = true; resetButton.hidden = false;
        C.setStatus(status, "所选文件都无法处理，请检查格式、文件大小或图片是否损坏。", "danger");
        return;
      }
      summary.textContent = "已选择 " + files.length + " 张可处理图片 · 共 " + C.formatBytes(acceptedBytes) + (rejected ? " · 跳过 " + rejected + " 张" : "");
      runButton.disabled = false; resetButton.hidden = false;
      if (rejected) C.setStatus(status, "已跳过 " + rejected + " 张不支持或无效的文件，其余图片可以继续清理元数据。", "warn");
      window.TuanAnalytics?.track("tool_file_selected", "batch-exif");
    } finally { input.disabled = false; trigger.disabled = false; }
  }

  function clearOutputs() { outputs = []; failedEntries = []; progressWrap.hidden = true; progress.value = 0; progress.max = 1; progressText.textContent = "0 / 0"; cancelButton.hidden = true; resultList.textContent = ""; results.hidden = true; downloadAllButton.hidden = true; downloadAllButton.disabled = false; retryFailedButton.hidden = true; retryFailedButton.disabled = false; }

  function reset() {
    gate.cancel(); files = []; clearOutputs(); list.textContent = ""; summary.textContent = "";
    formatInput.value = "image/jpeg"; qualityInput.value = "92"; syncControls();
    runButton.disabled = true; resetButton.hidden = true; C.clearStatus(status);
  }

  function cancelBatch() {
    window.TuanAnalytics?.track("tool_cancel", "batch-exif");
    gate.cancel();
    cancelButton.disabled = true;
    cancelButton.textContent = "正在停止…";
    C.setStatus(status, "正在停止当前任务；已完成的结果会保留。", "warn");
  }

  async function cleanOne(entry, type, quality, token) {
    const loaded = await C.loadImage(entry.file);
    try {
      if (!gate.active(token)) throw new Error("任务已取消。");
      const made = C.makeCanvas(loaded.width, loaded.height, type !== "image/jpeg");
      if (type === "image/jpeg") { made.ctx.fillStyle = "#ffffff"; made.ctx.fillRect(0, 0, made.canvas.width, made.canvas.height); }
      made.ctx.drawImage(loaded.img, 0, 0);
      const blob = await C.canvasToBlob(made.canvas, type, type === "image/png" ? undefined : quality);
      return { file: entry.file, blob, width: made.canvas.width, height: made.canvas.height };
    } finally { C.releaseImage(loaded); }
  }

  async function runBatch() {
    if (!files.length) { C.setStatus(status, "请先选择图片。", "warn"); return; }
    const type = formatInput.value;
    const quality = Math.max(0.4, Math.min(1, Number(qualityInput.value) / 100));
    const token = gate.start(); outputs = []; failedEntries = []; resultList.textContent = ""; results.hidden = true; progressWrap.hidden = false; progress.max = files.length; progress.value = 0; progressText.textContent = "0 / " + files.length; cancelButton.hidden = false; cancelButton.disabled = false; cancelButton.textContent = "停止处理";
    window.TuanAnalytics?.track("tool_run", "batch-exif");
    const controls = [input, trigger, formatInput, qualityInput, resetButton, ...list.querySelectorAll(".batch-remove-file")];
    controls.forEach(function (node) { node.disabled = true; });
    C.setBusy(runButton, true, "批量清理中…");
    let successCount = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        if (!gate.active(token)) throw new Error("任务已取消。");
        C.setStatus(status, "正在处理第 " + (i + 1) + " / " + files.length + " 张：" + files[i].file.name, "ok");
        try {
          const output = await cleanOne(files[i], type, quality, token);
          outputs.push(output); renderResult(output); successCount += 1;
        } catch (error) {
          if (error.message === "任务已取消。") throw error;
          failedEntries.push({ entry: files[i], index: i, message: error.message });
          renderFailure(files[i].file, error.message, i);
        }
        progress.value = i + 1; progressText.textContent = (i + 1) + " / " + files.length;
        await C.nextFrame();
      }
      results.hidden = false; results.setAttribute("tabindex", "-1"); results.focus({ preventScroll: true });
      if (successCount > 0) { window.TuanAnalytics?.track("tool_success", "batch-exif"); downloadAllButton.hidden = false; }
      retryFailedButton.hidden = failedEntries.length === 0;
      C.setStatus(status, successCount === files.length ? "批量重新编码完成。请下载并重新检查重要图片。" : "批量处理完成，部分图片失败；成功结果仍可下载。", successCount === files.length ? "ok" : "warn");
    } catch (error) {
      if (error.message === "任务已取消。") {
        results.hidden = successCount === 0;
        downloadAllButton.hidden = successCount === 0;
        retryFailedButton.hidden = failedEntries.length === 0;
        C.setStatus(status, successCount ? "已停止处理。已完成 " + successCount + " 张，成功结果仍可下载。" : "已停止处理，没有生成结果。", "warn");
      } else if (gate.active(token)) {
        C.setStatus(status, "批量处理失败：" + error.message, "danger");
      }
    } finally {
      controls.forEach(function (node) { node.disabled = false; }); syncControls(); C.setBusy(runButton, false, "批量清除元数据"); runButton.disabled = !files.length;
      cancelButton.hidden = true; cancelButton.disabled = false; cancelButton.textContent = "停止处理";
    }
  }

  function renderResult(output) {
    const row = document.createElement("article"); row.className = "batch-result-item";
    const main = document.createElement("div"); main.className = "batch-result-main";
    const title = document.createElement("strong"); title.textContent = output.file.name;
    const meta = document.createElement("span"); meta.textContent = C.formatBytes(output.file.size) + " → " + C.formatBytes(output.blob.size) + " · " + output.width + " × " + output.height;
    const badge = document.createElement("span"); badge.className = "batch-status is-ok"; badge.textContent = "已重新编码";
    main.append(title, meta, badge);
    const button = document.createElement("button"); button.type = "button"; button.className = "button secondary batch-download"; button.textContent = "下载";
    button.addEventListener("click", function () { window.TuanAnalytics?.track("tool_download", "batch-exif"); C.downloadBlob(output.blob, C.baseName(output.file.name) + "-metadata-removed." + C.extensionFor(output.blob.type)); });
    row.append(main, button); resultList.appendChild(row);
  }

  function renderFailure(file, message, index) {
    const row = document.createElement("article"); row.className = "batch-result-item is-failed"; row.dataset.failedIndex = String(index);
    const main = document.createElement("div"); main.className = "batch-result-main";
    const title = document.createElement("strong"); title.textContent = file.name;
    const meta = document.createElement("span"); meta.textContent = message;
    const badge = document.createElement("span"); badge.className = "batch-status is-danger"; badge.textContent = "失败";
    main.append(title, meta, badge); row.appendChild(main); resultList.appendChild(row);
  }

  async function retryFailed() {
    if (!failedEntries.length) return;
    const pending = failedEntries.slice();
    failedEntries = [];
    retryFailedButton.hidden = true;
    retryFailedButton.disabled = true;
    const type = formatInput.value;
    const quality = Math.max(0.4, Math.min(1, Number(qualityInput.value) / 100));
    const token = gate.start();
    const controls = [input, trigger, formatInput, qualityInput, resetButton, runButton, ...list.querySelectorAll(".batch-remove-file")];
    controls.forEach(function (node) { node.disabled = true; });
    cancelButton.hidden = false; cancelButton.disabled = false; cancelButton.textContent = "停止处理";
    progressWrap.hidden = false; progress.max = pending.length; progress.value = 0; progressText.textContent = "0 / " + pending.length;
    window.TuanAnalytics?.track("tool_run", "batch-exif");
    C.setStatus(status, "正在重新处理失败项。", "ok");
    let retriedSuccess = 0;
    let processedCount = 0;
    try {
      for (let i = 0; i < pending.length; i += 1) {
        if (!gate.active(token)) throw new Error("任务已取消。");
        const failed = pending[i];
        const oldRow = resultList.querySelector('[data-failed-index="' + failed.index + '"]');
        if (oldRow) oldRow.remove();
        try {
          const output = await cleanOne(failed.entry, type, quality, token);
          outputs.push(output); renderResult(output); retriedSuccess += 1;
        } catch (error) {
          if (error.message === "任务已取消。") throw error;
          failedEntries.push({ entry: failed.entry, index: failed.index, message: error.message });
          renderFailure(failed.entry.file, error.message, failed.index);
        }
        progress.value = i + 1; progressText.textContent = (i + 1) + " / " + pending.length;
        processedCount = i + 1;
        await C.nextFrame();
      }
      if (retriedSuccess) { window.TuanAnalytics?.track("tool_success", "batch-exif"); downloadAllButton.hidden = false; }
      retryFailedButton.hidden = failedEntries.length === 0;
      C.setStatus(status, failedEntries.length ? "重试完成，仍有 " + failedEntries.length + " 张失败；其余结果可继续下载。" : "失败项已全部重新处理完成。", failedEntries.length ? "warn" : "ok");
    } catch (error) {
      if (error.message === "任务已取消。") {
        for (let i = processedCount; i < pending.length; i += 1) {
          if (!failedEntries.some(function (item) { return item.index === pending[i].index; })) failedEntries.push(pending[i]);
        }
        C.setStatus(status, "已停止重试；已完成的结果和未重试失败项都会保留。", "warn");
      } else if (gate.active(token)) C.setStatus(status, "重试失败：" + error.message, "danger");
      retryFailedButton.hidden = failedEntries.length === 0;
    } finally {
      controls.forEach(function (node) { node.disabled = false; }); syncControls(); runButton.disabled = !files.length;
      retryFailedButton.disabled = false; cancelButton.hidden = true; cancelButton.disabled = false; cancelButton.textContent = "停止处理";
    }
  }

  async function downloadAll() {
    if (!outputs.length) return;
    downloadAllButton.disabled = true; downloadAllButton.textContent = "正在打包…";
    try {
      const zip = await C.createZip(outputs.map(function (output) { return { name: C.baseName(output.file.name) + "-metadata-removed." + C.extensionFor(output.blob.type), blob: output.blob }; }));
      window.TuanAnalytics?.track("tool_download", "batch-exif"); C.downloadBlob(zip, "tuan-metadata-removed.zip");
    } catch (error) { C.setStatus(status, "打包失败：" + error.message + "。仍可逐项下载结果。", "danger"); }
    finally { downloadAllButton.disabled = false; downloadAllButton.textContent = "下载全部 ZIP"; }
  }
})();
