(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const canvas = document.querySelector("#canvas");
  const summary = document.querySelector("#file-summary");
  const empty = document.querySelector("#preview-empty");
  const status = document.querySelector("#status");
  const textInput = document.querySelector("#watermark-text");
  const sizeInput = document.querySelector("#font-size");
  const opacityInput = document.querySelector("#opacity");
  const angleInput = document.querySelector("#angle");
  const colorInput = document.querySelector("#color");
  const repeatInput = document.querySelector("#repeat");
  const formatInput = document.querySelector("#output-format");
  const runButton = document.querySelector("#run");
  const result = document.querySelector("#result");
  const resultPreview = document.querySelector("#result-preview");
  const gate = C.createTaskGate();

  let loaded = null;
  let sourceFile = null;
  let outputBlob = null;
  let outputUrl = "";
  let renderFrame = 0;
  let layoutValid = true;

  C.wireDropzone(zone, input, selectFile);

  [
    textInput,
    sizeInput,
    opacityInput,
    angleInput,
    colorInput,
    repeatInput,
    formatInput
  ].forEach(function (node) {
    node.addEventListener("input", function () {
      syncValues();
      invalidate();
      schedulePreview();
    });
  });

  runButton.addEventListener("click", exportImage);

  document.querySelector("#reset").addEventListener("click", reset);

  document.querySelector("#download").addEventListener("click", function () {
    if (!outputBlob) return;

    C.downloadBlob(
      outputBlob,
      C.baseName(sourceFile.name) +
        "-watermarked." +
        C.extensionFor(outputBlob.type)
    );
  });

  document
    .querySelector("#open-result")
    .addEventListener("click", function () {
      if (outputUrl) {
        window.open(outputUrl, "_blank", "noopener");
      }
    });

  syncValues();

  async function selectFile(file) {
    const token = gate.start();

    [
      textInput,
      sizeInput,
      opacityInput,
      angleInput,
      colorInput,
      repeatInput,
      formatInput,
      input
    ].forEach(function (node) {
      node.disabled = false;
    });

    C.releaseImage(loaded);

    loaded = null;
    sourceFile = null;

    clearResult();

    canvas.width = 1;
    canvas.height = 1;
    canvas.hidden = true;
    empty.hidden = false;

    summary.textContent = "正在检查：" + file.name;

    C.setBusy(
      runButton,
      false,
      "生成水印图片"
    );

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

      summary.textContent =
        file.name +
        " · " +
        loaded.width +
        " × " +
        loaded.height +
        " · " +
        C.formatBytes(file.size);

      empty.hidden = true;
      canvas.hidden = false;

      C.setBusy(
        runButton,
        false,
        "生成水印图片"
      );

      runButton.disabled = false;

      document.querySelector(
        "#reset"
      ).hidden = false;

      C.clearStatus(status);

      schedulePreview();
    } catch (error) {
      if (gate.active(token)) {
        summary.textContent = "";

        C.setStatus(
          status,
          error.message,
          "danger"
        );
      }
    }
  }

  function syncValues() {
    document.querySelector(
      "#font-size-value"
    ).textContent =
      sizeInput.value;

    document.querySelector(
      "#opacity-value"
    ).textContent =
      opacityInput.value + "%";

    document.querySelector(
      "#angle-value"
    ).textContent =
      angleInput.value + "°";
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
    if (
      runButton.getAttribute("aria-busy") ===
      "true"
    ) {
      gate.cancel();

      C.setBusy(
        runButton,
        false,
        "生成水印图片"
      );

      runButton.disabled = !loaded;

      C.setStatus(
        status,
        "参数已改变，已取消之前的处理任务。",
        "warn"
      );
    }

    clearResult();
  }

  function schedulePreview() {
    if (!loaded) return;

    window.cancelAnimationFrame(
      renderFrame
    );

    renderFrame =
      window.requestAnimationFrame(
        renderPreview
      );
  }

  function wrapText(
    ctx,
    text,
    maxWidth,
    maxLines
  ) {
    const lines = [];
    let current = "";

    for (
      const character of
      Array.from(text)
    ) {
      const next =
        current + character;

      if (
        current &&
        ctx.measureText(next).width >
          maxWidth
      ) {
        lines.push(current);
        current = character;
      } else {
        current = next;
      }
    }

    if (current) {
      lines.push(current);
    }

    return {
      lines,
      valid:
        lines.length <= maxLines
    };
  }

  function textLayout(
    ctx,
    text,
    width,
    height,
    previewScale
  ) {
    let fontSize =
      Math.max(
        10,
        Number(sizeInput.value) *
          Math.min(
            loaded.width,
            loaded.height
          ) /
          900
      ) *
      previewScale;

    const maxWidth =
      width *
      (repeatInput.checked
        ? 0.48
        : 0.82);

    let wrapped;

    for (
      let attempt = 0;
      attempt < 18;
      attempt += 1
    ) {
      ctx.font =
        "700 " +
        fontSize +
        "px sans-serif";

      wrapped = wrapText(
        ctx,
        text,
        maxWidth,
        3
      );

      if (wrapped.valid) {
        break;
      }

      fontSize *= 0.9;
    }

    const lineHeight =
      fontSize * 1.25;

    const widest =
      Math.max.apply(
        null,
        wrapped.lines.map(
          function (line) {
            return ctx.measureText(
              line
            ).width;
          }
        )
      );

    const blockHeight =
      wrapped.lines.length *
      lineHeight;

    const visible =
      widest >= 1 &&
      blockHeight <=
        height * 0.9 &&
      widest <=
        width * 0.9;

    return {
      lines: wrapped.lines,
      fontSize,
      lineHeight,
      valid:
        wrapped.valid &&
        visible
    };
  }

  function visibleText() {
    return C.sanitizeVisibleText(
      textInput.value
    );
  }

  function drawWatermark(
    targetCanvas,
    targetCtx,
    img,
    width,
    height,
    outputType,
    previewScale
  ) {
    if (
      outputType ===
      "image/jpeg"
    ) {
      targetCtx.fillStyle =
        "#ffffff";

      targetCtx.fillRect(
        0,
        0,
        width,
        height
      );
    } else {
      targetCtx.clearRect(
        0,
        0,
        width,
        height
      );
    }

    targetCtx.drawImage(
      img,
      0,
      0,
      width,
      height
    );

    const text = visibleText();

    if (!text) {
      return {
        valid: false,
        reason: "请输入水印文字。"
      };
    }

    const layout =
      textLayout(
        targetCtx,
        text,
        width,
        height,
        previewScale || 1
      );

    if (!layout.valid) {
      return {
        valid: false,
        reason:
          "当前水印文字无法完整显示，请缩短文字、减小字号或换用更大的图片。"
      };
    }

    targetCtx.save();

    targetCtx.fillStyle =
      colorInput.value;

    targetCtx.globalAlpha =
      Number(
        opacityInput.value
      ) / 100;

    targetCtx.font =
      "700 " +
      layout.fontSize +
      "px sans-serif";

    targetCtx.textAlign =
      "center";

    targetCtx.textBaseline =
      "middle";

    const angle =
      Number(
        angleInput.value
      ) *
      Math.PI /
      180;

    function drawBlock(x, y) {
      const startY =
        y -
        (layout.lines.length - 1) *
          layout.lineHeight /
          2;

      layout.lines.forEach(
        function (line, index) {
          targetCtx.fillText(
            line,
            x,
            startY +
              index *
                layout.lineHeight
          );
        }
      );
    }

    if (repeatInput.checked) {
      const widest =
        Math.max.apply(
          null,
          layout.lines.map(
            function (line) {
              return targetCtx.measureText(
                line
              ).width;
            }
          )
        );

      let gapX =
        widest +
        layout.fontSize * 3;

      let gapY =
        layout.lineHeight *
        (
          layout.lines.length +
          2.4
        );

      targetCtx.translate(
        width / 2,
        height / 2
      );

      targetCtx.rotate(angle);

      const radius =
        Math.hypot(
          width,
          height
        );

      const estimatedLabels =
        (
          radius * 2 /
            gapX +
          1
        ) *
        (
          radius * 2 /
            gapY +
          1
        );

      if (
        estimatedLabels >
        500
      ) {
        const spacingFactor =
          Math.sqrt(
            estimatedLabels /
              500
          );

        gapX *= spacingFactor;
        gapY *= spacingFactor;
      }

      for (
        let y = -radius;
        y <= radius;
        y += gapY
      ) {
        for (
          let x = -radius;
          x <= radius;
          x += gapX
        ) {
          drawBlock(x, y);
        }
      }
    } else {
      targetCtx.translate(
        width / 2,
        height / 2
      );

      targetCtx.rotate(angle);

      drawBlock(0, 0);
    }

    targetCtx.restore();

    return {
      valid: true
    };
  }

  function renderPreview() {
    if (!loaded) return;

    const scale =
      Math.min(
        1,
        1100 /
          Math.max(
            loaded.width,
            loaded.height
          )
      );

    const width =
      Math.max(
        1,
        Math.round(
          loaded.width *
            scale
        )
      );

    const height =
      Math.max(
        1,
        Math.round(
          loaded.height *
            scale
        )
      );

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      C.setStatus(
        status,
        "当前浏览器无法生成水印预览。",
        "danger"
      );
      return;
    }

    const outcome =
      drawWatermark(
        canvas,
        ctx,
        loaded.img,
        width,
        height,
        formatInput.value,
        scale
      );

    layoutValid =
      outcome.valid;

    if (
      !outcome.valid &&
      textInput.value.trim()
    ) {
      C.setStatus(
        status,
        outcome.reason,
        "warn"
      );
    } else {
      C.clearStatus(status);
    }
  }

  async function exportImage() {
    if (!loaded) {
      C.setStatus(
        status,
        "请先选择图片。",
        "warn"
      );
      return;
    }

    if (!visibleText()) {
      C.setStatus(
        status,
        "请输入水印文字。",
        "warn"
      );
      return;
    }

    renderPreview();

    if (!layoutValid) {
      return;
    }

    const token = gate.start();

    const controls = [
      textInput,
      sizeInput,
      opacityInput,
      angleInput,
      colorInput,
      repeatInput,
      formatInput,
      input,
      document.querySelector(
        "#reset"
      )
    ];

    C.setBusy(
      runButton,
      true,
      "处理中…"
    );

    controls.forEach(
      function (node) {
        node.disabled = true;
      }
    );

    C.setStatus(
      status,
      "正在生成水印图片。",
      "ok"
    );

    try {
      const made =
        C.makeCanvas(
          loaded.width,
          loaded.height,
          formatInput.value !==
            "image/jpeg"
        );

      const outcome =
        drawWatermark(
          made.canvas,
          made.ctx,
          loaded.img,
          loaded.width,
          loaded.height,
          formatInput.value
        );

      if (!outcome.valid) {
        throw new Error(
          outcome.reason
        );
      }

      const blob =
        await C.canvasToBlob(
          made.canvas,
          formatInput.value,
          formatInput.value ===
            "image/png"
            ? undefined
            : 0.9
        );

      if (
        !gate.active(token)
      ) {
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
        "#output-size"
      ).textContent =
        C.formatBytes(
          blob.size
        );

      document.querySelector(
        "#output-dimensions"
      ).textContent =
        loaded.width +
        " × " +
        loaded.height;

      C.focusResult(result);

      C.setStatus(
        status,
        "水印图片已生成。请检查文字是否完整、清晰，并确认没有遮挡重要内容。",
        "ok"
      );
    } catch (error) {
      if (
        gate.active(token)
      ) {
        C.setStatus(
          status,
          "生成失败：" +
            error.message,
          "danger"
        );
      }
    } finally {
      if (
        gate.active(token)
      ) {
        controls.forEach(
          function (node) {
            node.disabled = false;
          }
        );

        C.setBusy(
          runButton,
          false,
          "生成水印图片"
        );

        runButton.disabled =
          !loaded;
      }
    }
  }

  function reset() {
    gate.cancel();

    [
      textInput,
      sizeInput,
      opacityInput,
      angleInput,
      colorInput,
      repeatInput,
      formatInput,
      input
    ].forEach(function (node) {
      node.disabled = false;
    });

    C.releaseImage(loaded);

    loaded = null;
    sourceFile = null;

    clearResult();

    canvas.width = 1;
    canvas.height = 1;
    canvas.hidden = true;
    empty.hidden = false;

    summary.textContent = "";

    textInput.value =
      "仅供资料审核使用";

    sizeInput.value = "48";
    opacityInput.value = "38";
    angleInput.value = "-25";
    colorInput.value = "#b3261e";
    repeatInput.checked = true;
    formatInput.value =
      "image/jpeg";

    runButton.disabled = true;

    document.querySelector(
      "#reset"
    ).hidden = true;

    syncValues();
    C.clearStatus(status);
  }

  window.addEventListener(
    "pagehide",
    function () {
      gate.cancel();

      C.releaseImage(loaded);

      if (outputUrl) {
        URL.revokeObjectURL(
          outputUrl
        );
      }
    }
  );
})();
