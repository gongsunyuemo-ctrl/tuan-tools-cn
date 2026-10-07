(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const summary = document.querySelector("#file-summary");
  const preview = document.querySelector("#preview");
  const empty = document.querySelector("#preview-empty");
  const report = document.querySelector("#inspection-report");
  const status = document.querySelector("#status");
  const resetButton = document.querySelector("#reset");
  const copyReportButton = document.querySelector("#copy-report");
  const gate = C.createTaskGate();

  let loaded = null;

  C.wireDropzone(zone, input, selectFile);
  resetButton.addEventListener("click", reset);
  copyReportButton.addEventListener("click", copyReport);

  async function selectFile(file) {
    const token = gate.start();
    C.releaseImage(loaded);
    loaded = null;
    report.hidden = true;
    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;
    summary.textContent = "正在检查：" + file.name;
    C.clearStatus(status);
    window.TuanAnalytics?.track("tool_run", "inspect");

    try {
      const next = await C.loadImage(file);
      if (!gate.active(token)) {
        C.releaseImage(next);
        return;
      }
      loaded = next;
      window.TuanAnalytics?.track("tool_file_selected", "inspect");

      preview.src = loaded.url;
      preview.hidden = false;
      empty.hidden = true;

      const pixels = loaded.width * loaded.height;
      const ratio = simplifyRatio(loaded.width, loaded.height);
      const orientation = loaded.width === loaded.height ? "正方形" : loaded.width > loaded.height ? "横向" : "竖向";
      const typeName = loaded.type === "image/jpeg" ? "JPG" : loaded.type === "image/png" ? "PNG" : "WebP";
      const hasTransparency = await C.detectTransparency(loaded);
      if (!gate.active(token)) return;

      document.querySelector("#inspect-format").textContent = typeName;
      document.querySelector("#inspect-size").textContent = C.formatBytes(file.size);
      document.querySelector("#inspect-dimensions").textContent = loaded.width + " × " + loaded.height + " px";
      document.querySelector("#inspect-megapixels").textContent = (pixels / 1000000).toFixed(2) + " MP";
      document.querySelector("#inspect-memory").textContent = "约 " + C.formatBytes(pixels * 4) + "（RGBA 粗略估算）";
      document.querySelector("#inspect-ratio").textContent = ratio;
      document.querySelector("#inspect-orientation").textContent = orientation;
      document.querySelector("#inspect-transparency").textContent = loaded.type === "image/jpeg" ? "不支持透明" : hasTransparency ? "检测到透明像素" : "未检测到透明像素";

      const sizeSuggestion = document.querySelector("#suggest-compress");
      const dimensionSuggestion = document.querySelector("#suggest-resize");
      const formatSuggestion = document.querySelector("#suggest-format");
      const privacySuggestion = document.querySelector("#suggest-privacy");

      sizeSuggestion.hidden = file.size <= 1024 * 1024;
      dimensionSuggestion.hidden = Math.max(loaded.width, loaded.height) <= 2000;
      formatSuggestion.hidden = loaded.type === "image/jpeg";
      privacySuggestion.hidden = false;
      document.querySelector("#suggest-transparency").hidden = !hasTransparency;

      summary.textContent = file.name + " · " + loaded.width + " × " + loaded.height + " · " + C.formatBytes(file.size);
      report.hidden = false;
      resetButton.hidden = false;
      window.TuanAnalytics?.track("tool_success", "inspect");
      C.setStatus(status, pixels * 4 > 64 * 1024 * 1024 ? "检查完成。这张图解码后可能占用较多内存；在手机上继续压缩或转换时，建议关闭其他占内存较高的页面。" : "检查完成。下面的建议只根据文件格式、体积和像素尺寸生成，不会替代具体平台的上传要求。", pixels * 4 > 64 * 1024 * 1024 ? "warn" : "ok");
      report.setAttribute("tabindex", "-1");
      report.focus({ preventScroll: true });
    } catch (error) {
      if (gate.active(token)) {
        summary.textContent = "";
        C.setStatus(status, error.message, "danger");
      }
    }
  }

  async function copyReport() {
    if (!loaded || report.hidden) return;
    const lines = [
      "图安工具 - 图片检查结果",
      "格式：" + document.querySelector("#inspect-format").textContent,
      "文件大小：" + document.querySelector("#inspect-size").textContent,
      "像素尺寸：" + document.querySelector("#inspect-dimensions").textContent,
      "总像素：" + document.querySelector("#inspect-megapixels").textContent,
      "预计解码内存：" + document.querySelector("#inspect-memory").textContent,
      "宽高比：" + document.querySelector("#inspect-ratio").textContent,
      "方向：" + document.querySelector("#inspect-orientation").textContent,
      "透明像素：" + document.querySelector("#inspect-transparency").textContent
    ];
    const text = lines.join("\n");
    const previous = copyReportButton.textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyReportButton.textContent = "检查结果已复制";
    } catch (_) {
      window.prompt("复制检查结果：", text);
    }
    window.setTimeout(function () { copyReportButton.textContent = previous; }, 1600);
  }

  function simplifyRatio(width, height) {
    let a = width;
    let b = height;
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    const divisor = a || 1;
    return width / divisor + ":" + height / divisor;
  }

  function reset() {
    gate.cancel();
    C.releaseImage(loaded);
    loaded = null;
    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;
    summary.textContent = "";
    report.hidden = true;
    resetButton.hidden = true;
    C.clearStatus(status);
  }

  window.addEventListener("pagehide", function () {
    gate.cancel();
    C.releaseImage(loaded);
  });
})();
