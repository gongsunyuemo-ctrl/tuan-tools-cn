(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#batch-input");
  const zone = document.querySelector("#batch-dropzone");
  const trigger = document.querySelector("#batch-trigger");
  const summary = document.querySelector("#batch-summary");
  const list = document.querySelector("#batch-file-list");
  const targetInput = document.querySelector("#target-kb");
  const formatInput = document.querySelector("#output-format");
  const resizeInput = document.querySelector("#allow-resize");
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
  input.addEventListener("change", function () {
    chooseFiles(Array.from(input.files || []));
    input.value = "";
  });

  let dragDepth = 0;
  zone.addEventListener("dragenter", function (event) { event.preventDefault(); dragDepth += 1; zone.classList.add("is-over"); });
  zone.addEventListener("dragover", function (event) { event.preventDefault(); });
  zone.addEventListener("dragleave", function (event) { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove("is-over"); });
  zone.addEventListener("drop", function (event) {
    event.preventDefault();
    dragDepth = 0;
    zone.classList.remove("is-over");
    if (!input.disabled) chooseFiles(Array.from(event.dataTransfer.files || []));
  });

  document.querySelectorAll("[data-target-kb]").forEach(function (button) {
    button.addEventListener("click", function () {
      targetInput.value = button.getAttribute("data-target-kb");
      clearOutputs();
    });
  });

  [targetInput, formatInput, resizeInput].forEach(function (node) {
    node.addEventListener("input", function () {
      if (runButton.getAttribute("aria-busy") !== "true") clearOutputs();
    });
  });

  runButton.addEventListener("click", runBatch);
  resetButton.addEventListener("click", reset);
  cancelButton.addEventListener("click", cancelBatch);
  downloadAllButton.addEventListener("click", downloadAll);
  retryFailedButton.addEventListener("click", retryFailed);

  async function chooseFiles(nextFiles) {
    gate.cancel();
    clearOutputs();
    C.clearStatus(status);
    files = [];
    list.textContent = "";

    if (!nextFiles.length) return;
    if (nextFiles.length > MAX_FILES) {
      C.setStatus(status, "一次最多选择 " + MAX_FILES + " 张图片，请减少文件数量后重试。", "danger");
      return;
    }
    const total = nextFiles.reduce(function (sum, file) { return sum + (Number(file.size) || 0); }, 0);
    if (total > MAX_TOTAL_BYTES) {
      C.setStatus(status, "所选文件总大小不能超过 80 MB，请分批处理。", "danger");
      return;
    }

    summary.textContent = "正在检查 " + nextFiles.length + " 张图片…";
    input.disabled = true;
    trigger.disabled = true;

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
            C.setStatus(status, files.length ? "已移除该图片，其余图片仍可继续压缩。" : "已移除全部可处理图片。", files.length ? "ok" : "warn");
          });
          removeButton = remove;
        } catch (error) {
          rejected += 1;
          item.classList.add("is-invalid");
          meta.textContent = "已跳过：" + error.message;
        }
        item.append(name, meta);
        if (removeButton) item.append(removeButton);
        list.appendChild(item);
        await C.nextFrame();
      }
      if (!files.length) {
        summary.textContent = "没有可处理的图片";
        runButton.disabled = true;
        resetButton.hidden = false;
        C.setStatus(status, "所选文件都无法处理，请检查格式、文件大小或图片是否损坏。", "danger");
        return;
      }
      summary.textContent = "已选择 " + files.length + " 张可处理图片 · 共 " + C.formatBytes(acceptedBytes) + (rejected ? " · 跳过 " + rejected + " 张" : "");
      runButton.disabled = false;
      resetButton.hidden = false;
      if (rejected) C.setStatus(status, "已跳过 " + rejected + " 张不支持或无效的文件，其余图片可以继续压缩。", "warn");
      window.TuanAnalytics?.track("tool_file_selected", "batch-compress");
    } finally {
      input.disabled = false;
      trigger.disabled = false;
    }
  }

  function clearOutputs() {
    outputs = [];
    failedEntries = [];
    progressWrap.hidden = true;
    progress.value = 0;
    progress.max = 1;
    progressText.textContent = "0 / 0";
    cancelButton.hidden = true;
    resultList.textContent = "";
    results.hidden = true;
    downloadAllButton.hidden = true;
    downloadAllButton.disabled = false;
    retryFailedButton.hidden = true;
    retryFailedButton.disabled = false;
  }

  function reset() {
    gate.cancel();
    files = [];
    clearOutputs();
    list.textContent = "";
    summary.textContent = "";
    targetInput.value = "200";
    formatInput.value = "image/jpeg";
    resizeInput.checked = true;
    runButton.disabled = true;
    resetButton.hidden = true;
    C.clearStatus(status);
  }


  function cancelBatch() {
    window.TuanAnalytics?.track("tool_cancel", "batch-compress");
    gate.cancel();
    cancelButton.disabled = true;
    cancelButton.textContent = "正在停止…";
    C.setStatus(status, "正在停止当前任务；已完成的结果会保留。", "warn");
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

  async function compressOne(entry, targetBytes, type, allowResize, token) {
    const file = entry.file;
    const loaded = await C.loadImage(file);
    try {
      let width = loaded.width;
      let height = loaded.height;
      let blob = null;
      let outWidth = width;
      let outHeight = height;

      if (loaded.type === type && file.size <= targetBytes) {
        blob = file.slice(0, file.size, loaded.type);
      } else {
        for (let pass = 0; pass < 4; pass += 1) {
          if (!gate.active(token)) throw new Error("任务已取消。");
          const made = C.makeCanvas(width, height, type !== "image/jpeg");
          if (type === "image/jpeg") {
            made.ctx.fillStyle = "#ffffff";
            made.ctx.fillRect(0, 0, width, height);
          }
          made.ctx.drawImage(loaded.img, 0, 0, width, height);
          blob = await findBest(made.canvas, type, targetBytes, token);
          outWidth = made.canvas.width;
          outHeight = made.canvas.height;
          if (blob.size <= targetBytes || !allowResize || Math.max(width, height) <= 640 || width * height <= 120000) break;
          const scale = Math.max(0.45, Math.min(0.86, Math.sqrt(targetBytes / blob.size) * 0.92));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          await C.nextFrame();
        }
      }
      return { file, blob, width: outWidth, height: outHeight, reached: blob.size <= targetBytes };
    } finally {
      C.releaseImage(loaded);
    }
  }

  async function runBatch() {
    if (!files.length) {
      C.setStatus(status, "请先选择图片。", "warn");
      return;
    }
    const targetKB = Number(targetInput.value);
    if (!Number.isFinite(targetKB) || targetKB < 5 || targetKB > 10240) {
      C.setStatus(status, "目标大小请输入 5～10240 KB 之间的数值。", "danger");
      return;
    }

    const targetBytes = Math.round(targetKB * 1024);
    const type = formatInput.value;
    const token = gate.start();
    outputs = [];
    failedEntries = [];
    progressWrap.hidden = false;
    progress.max = files.length;
    progress.value = 0;
    progressText.textContent = "0 / " + files.length;
    cancelButton.hidden = false;
    cancelButton.disabled = false;
    cancelButton.textContent = "停止处理";
    resultList.textContent = "";
    results.hidden = true;
    window.TuanAnalytics?.track("tool_run", "batch-compress");

    const controls = [input, trigger, targetInput, formatInput, resizeInput, resetButton, ...list.querySelectorAll(".batch-remove-file")];
    controls.forEach(function (node) { node.disabled = true; });
    C.setBusy(runButton, true, "批量压缩中…");
    C.setStatus(status, "正在按顺序处理第 1 / " + files.length + " 张图片。为了控制内存，图片会逐张解码和压缩。", "ok");

    let successCount = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (!gate.active(token)) throw new Error("任务已取消。");
        C.setStatus(status, "正在处理第 " + (index + 1) + " / " + files.length + " 张：" + files[index].file.name, "ok");
        try {
          const output = await compressOne(files[index], targetBytes, type, resizeInput.checked, token);
          outputs.push(output);
          renderResult(output, index, targetKB, type);
          successCount += 1;
        } catch (error) {
          if (error.message === "任务已取消。") throw error;
          failedEntries.push({ entry: files[index], index, message: error.message });
          renderFailure(files[index].file, error.message, index);
        }
        progress.value = index + 1;
        progressText.textContent = (index + 1) + " / " + files.length;
        await C.nextFrame();
      }

      results.hidden = false;
      results.setAttribute("tabindex", "-1");
      results.focus({ preventScroll: true });
      results.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      if (successCount > 0) {
        window.TuanAnalytics?.track("tool_success", "batch-compress");
        downloadAllButton.hidden = false;
      }
      retryFailedButton.hidden = failedEntries.length === 0;
      if (successCount === files.length) C.setStatus(status, "批量压缩完成。请逐项检查是否达到目标并下载需要的文件。", "ok");
      else C.setStatus(status, "批量处理完成，其中 " + (files.length - successCount) + " 张失败。成功结果仍可下载。", "warn");
    } catch (error) {
      if (error.message === "任务已取消。") {
        results.hidden = successCount === 0;
        downloadAllButton.hidden = successCount === 0;
        retryFailedButton.hidden = failedEntries.length === 0;
        C.setStatus(status, successCount ? "已停止处理。已完成 " + successCount + " 张，成功结果仍可下载。" : "已停止处理，没有生成结果。", "warn");
      } else if (gate.active(token)) {
        C.setStatus(status, "批量压缩失败：" + error.message, "danger");
      }
    } finally {
      controls.forEach(function (node) { node.disabled = false; });
      C.setBusy(runButton, false, "开始批量压缩");
      runButton.disabled = !files.length;
      cancelButton.hidden = true;
      cancelButton.disabled = false;
      cancelButton.textContent = "停止处理";
    }
  }

  async function retryFailed() {
    if (!failedEntries.length) return;
    const targetKB = Number(targetInput.value);
    if (!Number.isFinite(targetKB) || targetKB < 5 || targetKB > 10240) {
      C.setStatus(status, "目标大小请输入 5～10240 KB 之间的数值。", "danger");
      return;
    }
    const pending = failedEntries.slice();
    failedEntries = [];
    retryFailedButton.hidden = true;
    retryFailedButton.disabled = true;
    const targetBytes = Math.round(targetKB * 1024);
    const type = formatInput.value;
    const token = gate.start();
    const controls = [input, trigger, targetInput, formatInput, resizeInput, resetButton, runButton, ...list.querySelectorAll(".batch-remove-file")];
    controls.forEach(function (node) { node.disabled = true; });
    cancelButton.hidden = false;
    cancelButton.disabled = false;
    cancelButton.textContent = "停止处理";
    progressWrap.hidden = false;
    progress.max = pending.length;
    progress.value = 0;
    progressText.textContent = "0 / " + pending.length;
    window.TuanAnalytics?.track("tool_run", "batch-compress");
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
          const output = await compressOne(failed.entry, targetBytes, type, resizeInput.checked, token);
          outputs.push(output);
          renderResult(output, failed.index, targetKB, type);
          retriedSuccess += 1;
        } catch (error) {
          if (error.message === "任务已取消。") throw error;
          failedEntries.push({ entry: failed.entry, index: failed.index, message: error.message });
          renderFailure(failed.entry.file, error.message, failed.index);
        }
        progress.value = i + 1;
        progressText.textContent = (i + 1) + " / " + pending.length;
        processedCount = i + 1;
        await C.nextFrame();
      }
      if (retriedSuccess) {
        window.TuanAnalytics?.track("tool_success", "batch-compress");
        downloadAllButton.hidden = false;
      }
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
      controls.forEach(function (node) { node.disabled = false; });
      runButton.disabled = !files.length;
      retryFailedButton.disabled = false;
      cancelButton.hidden = true;
      cancelButton.disabled = false;
      cancelButton.textContent = "停止处理";
    }
  }

  async function downloadAll() {
    const successful = outputs.filter(function (output) { return output && output.blob; });
    if (!successful.length) return;
    downloadAllButton.disabled = true;
    downloadAllButton.textContent = "正在打包…";
    try {
      const zip = await C.createZip(successful.map(function (output) {
        return { name: C.baseName(output.file.name) + "-compressed." + C.extensionFor(output.blob.type), blob: output.blob };
      }));
      window.TuanAnalytics?.track("tool_download", "batch-compress");
      C.downloadBlob(zip, "tuan-batch-compressed.zip");
    } catch (error) {
      C.setStatus(status, "打包失败：" + error.message + "。仍可逐项下载结果。", "danger");
    } finally {
      downloadAllButton.disabled = false;
      downloadAllButton.textContent = "下载全部 ZIP";
    }
  }

  function renderResult(output, index, targetKB, type) {
    const row = document.createElement("article");
    row.className = "batch-result-item";
    const heading = document.createElement("div");
    heading.className = "batch-result-main";
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const badge = document.createElement("span");
    title.textContent = output.file.name;
    meta.textContent = C.formatBytes(output.file.size) + " → " + C.formatBytes(output.blob.size) + " · " + output.width + " × " + output.height;
    badge.className = "batch-status " + (output.reached ? "is-ok" : "is-warn");
    badge.textContent = output.reached ? "≤ " + targetKB + " KB" : "高于 " + targetKB + " KB";
    heading.append(title, meta, badge);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button secondary batch-download";
    button.textContent = "下载";
    button.addEventListener("click", function () {
      window.TuanAnalytics?.track("tool_download", "batch-compress");
      C.downloadBlob(output.blob, C.baseName(output.file.name) + "-compressed." + C.extensionFor(type));
    });
    row.append(heading, button);
    resultList.appendChild(row);
    output.index = index;
  }

  function renderFailure(file, message, index) {
    const row = document.createElement("article");
    row.className = "batch-result-item is-failed";
    row.dataset.failedIndex = String(index);
    const heading = document.createElement("div");
    heading.className = "batch-result-main";
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const badge = document.createElement("span");
    title.textContent = file.name;
    meta.textContent = message;
    badge.className = "batch-status is-danger";
    badge.textContent = "失败";
    heading.append(title, meta, badge);
    row.appendChild(heading);
    resultList.appendChild(row);
  }

  window.addEventListener("pagehide", function () {
    gate.cancel();
    outputs = [];
  });
})();
