(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const preview = document.querySelector("#preview");
  const empty = document.querySelector("#preview-empty");
  const summary = document.querySelector("#file-summary");
  const status = document.querySelector("#status");
  const format = document.querySelector("#output-format");
  const quality = document.querySelector("#quality");
  const qualityValue = document.querySelector("#quality-value");
  const background = document.querySelector("#background");
  const runButton = document.querySelector("#run");
  const result = document.querySelector("#result");
  const resultPreview = document.querySelector("#result-preview");
  const gate = C.createTaskGate();

  let loaded = null;
  let sourceFile = null;
  let outputBlob = null;
  let outputUrl = "";

  C.wireDropzone(zone, input, selectFile);

  quality.addEventListener("input", function () {
    qualityValue.textContent = quality.value + "%";
    invalidate();
  });

  [format, background].forEach(function (node) {
    node.addEventListener("input", function () {
      syncControls();
      invalidate();
    });
  });

  runButton.addEventListener("click", convert);

  document.querySelector("#reset").addEventListener("click", reset);

  document.querySelector("#download").addEventListener("click", function () {
    if (outputBlob) {
      C.downloadBlob(
        outputBlob,
        C.baseName(sourceFile.name) +
          "-converted." +
          C.extensionFor(outputBlob.type)
      );
    }
  });

  document
    .querySelector("#open-result")
    .addEventListener("click", function () {
      if (outputUrl) {
        window.open(outputUrl, "_blank", "noopener");
      }
    });

  window.addEventListener("pageshow", syncControls);

  syncControls();

  async function selectFile(file) {
    const token = gate.start();

    [format, quality, background, input].forEach(function (node) {
      node.disabled = false;
    });

    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;

    clearResult();

    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;

    summary.textContent = "正在检查：" + file.name;

    C.setBusy(runButton, false, "开始转换");
    runButton.disabled = true;

    try {
      const next = await C.loadImage(file);

      if (!gate.active(token)) {
        C.releaseImage(next);
        return;
      }

      loaded = next;
      sourceFile = file;

      clearResult();

      preview.src = loaded.url;
      preview.hidden = false;
      empty.hidden = true;

      summary.textContent =
        file.name +
        " · " +
        loaded.width +
        " × " +
        loaded.height +
        " · " +
        C.formatBytes(file.size);

      C.setBusy(runButton, false, "开始转换");
      runButton.disabled = false;

      document.querySelector("#reset").hidden = false;

      C.clearStatus(status);
    } catch (error) {
      if (gate.active(token)) {
        summary.textContent = "";
        C.setStatus(status, error.message, "danger");
      }
    }
  }

  function formatName(type) {
    if (type === "image/jpeg") return "JPG";
    if (type === "image/png") return "PNG";
    if (type === "image/webp") return "WebP";
    return type || "未知";
  }

  function syncControls() {
    const png = format.value === "image/png";
    const jpeg = format.value === "image/jpeg";

    quality.disabled = png;
    background.disabled = !jpeg;
  }

  function clearResult() {
    outputBlob = null;
    result.hidden = true;

    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
    }

    outputUrl = "";
    resultPreview.removeAttribute("src");
  }

  function invalidate() {
    if (runButton.getAttribute("aria-busy") === "true") {
      gate.cancel();

      C.setBusy(runButton, false, "开始转换");
      runButton.disabled = !loaded;

      C.setStatus(
        status,
        "参数已改变，已取消旧任务。",
        "warn"
      );
    }

    clearResult();
  }

  function reset() {
    gate.cancel();

    [format, quality, background, input].forEach(function (node) {
      node.disabled = false;
    });

    C.releaseImage(loaded);

    loaded = null;
    sourceFile = null;

    clearResult();

    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;

    summary.textContent = "";

    format.value = "image/jpeg";
    quality.value = "90";
    qualityValue.textContent = "90%";
    background.value = "#ffffff";

    runButton.disabled = true;

    document.querySelector("#reset").hidden = true;

    syncControls();
    C.clearStatus(status);
  }

  async function convert() {
    if (!loaded) {
      C.setStatus(
        status,
        "请先选择图片。",
        "warn"
      );
      return;
    }

    if (format.value === loaded.type) {
      C.setStatus(
        status,
        "源格式与目标格式相同。请选择另一种格式；需要减小体积可使用图片压缩。",
        "warn"
      );
      return;
    }

    const token = gate.start();

    const controls = [
      format,
      quality,
      background,
      input,
      document.querySelector("#reset")
    ];

    clearResult();

    C.setBusy(
      runButton,
      true,
      "转换处理中…"
    );

    controls.forEach(function (node) {
      node.disabled = true;
    });

    C.setStatus(
      status,
      "正在转换格式。",
      "ok"
    );

    try {
      const alpha =
        format.value !== "image/jpeg";

      const made = C.makeCanvas(
        loaded.width,
        loaded.height,
        alpha
      );

      if (!alpha) {
        made.ctx.fillStyle =
          background.value;

        made.ctx.fillRect(
          0,
          0,
          made.canvas.width,
          made.canvas.height
        );
      }

      made.ctx.drawImage(
        loaded.img,
        0,
        0
      );

      const blob =
        await C.canvasToBlob(
          made.canvas,
          format.value,
          format.value === "image/png"
            ? undefined
            : Number(quality.value) / 100
        );

      if (!gate.active(token)) {
        return;
      }

      outputBlob = blob;

      outputUrl =
        C.replaceObjectUrl(
          outputUrl,
          blob,
          resultPreview
        );

      document.querySelector(
        "#original-format"
      ).textContent =
        formatName(loaded.type);

      document.querySelector(
        "#output-format-name"
      ).textContent =
        formatName(blob.type);

      document.querySelector(
        "#output-size"
      ).textContent =
        C.formatBytes(blob.size);

      document.querySelector(
        "#output-dimensions"
      ).textContent =
        loaded.width +
        " × " +
        loaded.height;

      C.focusResult(result);

      C.setStatus(
        status,
        "格式转换完成，请检查结果后下载。",
        "ok"
      );
    } catch (error) {
      if (gate.active(token)) {
        C.setStatus(
          status,
          "转换失败：" + error.message,
          "danger"
        );
      }
    } finally {
      if (gate.active(token)) {
        controls.forEach(function (node) {
          node.disabled = false;
        });

        C.setBusy(
          runButton,
          false,
          "开始转换"
        );

        runButton.disabled = !loaded;
      }
    }
  }

  window.addEventListener(
    "pagehide",
    function () {
      gate.cancel();
      C.releaseImage(loaded);

      if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
      }
    }
  );
})();
