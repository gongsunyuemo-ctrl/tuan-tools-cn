(function () {
  "use strict";

  const C = window.ImageCore;
  const input = document.querySelector("#file-input");
  const zone = document.querySelector("#dropzone");
  const preview = document.querySelector("#preview");
  const empty = document.querySelector("#preview-empty");
  const summary = document.querySelector("#file-summary");
  const status = document.querySelector("#status");
  const table = document.querySelector("#meta-body");
  const format = document.querySelector("#output-format");
  const quality = document.querySelector("#quality");
  const runButton = document.querySelector("#run");
  const result = document.querySelector("#result");
  const resultPreview = document.querySelector("#result-preview");
  const gate = C.createTaskGate();

  let loaded = null;
  let sourceFile = null;
  let outputBlob = null;
  let outputUrl = "";

  C.wireDropzone(zone, input, selectFile);

  [format, quality].forEach(function (node) {
    node.addEventListener("input", function () {
      syncControls();
      invalidate();
    });
  });

  runButton.addEventListener("click", clean);

  document.querySelector("#reset").addEventListener("click", reset);

  document.querySelector("#download").addEventListener("click", function () {
    if (outputBlob) {
      C.downloadBlob(
        outputBlob,
        C.baseName(sourceFile.name) +
          "-metadata-removed." +
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

    [format, quality, input].forEach(function (node) {
      node.disabled = false;
    });

    C.releaseImage(loaded);
    loaded = null;
    sourceFile = null;

    clearResult();

    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;

    table.textContent = "";
    document.querySelector("#metadata").hidden = true;

    summary.textContent = "正在检查：" + file.name;

    C.setBusy(
      runButton,
      false,
      "清除照片信息"
    );

    runButton.disabled = true;

    try {
      const next = await C.loadImage(file);

      if (!gate.active(token)) {
        C.releaseImage(next);
        return;
      }

      const metadata = await readExif(file);

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

      renderMeta(metadata, file);

      C.setBusy(
        runButton,
        false,
        "清除照片信息"
      );

      runButton.disabled = false;

      document.querySelector("#reset").hidden = false;
      document.querySelector("#metadata").hidden = false;

      const message = metadata.damaged
        ? "检测到照片信息，但部分内容损坏或不完整，可能无法完整显示。仍可以生成清理后的新图片。"
        : metadata.rows.length
          ? "已读取可识别的照片信息。GPS 坐标默认隐藏。"
          : "未发现可识别的常见照片信息，仍可以生成新的图片副本。";

      C.setStatus(
        status,
        message,
        metadata.damaged
          ? "danger"
          : metadata.rows.length
            ? "ok"
            : "warn"
      );
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

  function formatName(type) {
    if (type === "image/jpeg") return "JPG";
    if (type === "image/png") return "PNG";
    if (type === "image/webp") return "WebP";
    return type || "未知";
  }

  function syncControls() {
    quality.disabled =
      format.value === "image/png";

    document.querySelector(
      "#quality-value"
    ).textContent =
      quality.value + "%";
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
        "清除照片信息"
      );

      runButton.disabled = !loaded;

      C.setStatus(
        status,
        "参数已改变，已取消旧任务。",
        "warn"
      );
    }

    clearResult();
  }

  function renderMeta(metadata, file) {
    const base = [
      {
        label: "文件名",
        value: file.name
      },
      {
        label: "文件类型",
        value: formatName(loaded.type)
      },
      {
        label: "文件大小",
        value: C.formatBytes(file.size)
      },
      {
        label: "像素尺寸",
        value:
          loaded.width +
          " × " +
          loaded.height
      }
    ];

    table.textContent = "";

    base
      .concat(metadata.rows)
      .forEach(function (row) {
        const tr =
          document.createElement("tr");

        const th =
          document.createElement("th");

        const td =
          document.createElement("td");

        th.scope = "row";
        th.textContent = row.label;

        if (row.sensitive) {
          const button =
            document.createElement(
              "button"
            );

          button.type = "button";
          button.className =
            "text-button";

          button.textContent =
            "已检测到，显示坐标";

          button.addEventListener(
            "click",
            function () {
              td.textContent =
                row.value;

              const hide =
                document.createElement(
                  "button"
                );

              hide.type = "button";

              hide.className =
                "text-button metadata-hide";

              hide.textContent =
                "隐藏";

              hide.addEventListener(
                "click",
                function () {
                  td.textContent = "";
                  td.appendChild(
                    button
                  );
                  button.focus();
                }
              );

              td.appendChild(
                document.createTextNode(
                  " "
                )
              );

              td.appendChild(hide);
            }
          );

          td.appendChild(button);
        } else {
          td.textContent =
            String(row.value);
        }

        tr.append(th, td);
        table.appendChild(tr);
      });
  }

  async function readExif(blob) {
    const buffer =
      await blob.arrayBuffer();

    return parseExif(buffer);
  }

  function parseExif(buffer) {
    const view =
      new DataView(buffer);

    const emptyResult = {
      rows: [],
      foundExif: false
    };

    if (
      view.byteLength < 4 ||
      view.getUint16(0, false) !==
        0xffd8
    ) {
      return emptyResult;
    }

    let offset = 2;
    let segments = 0;

    while (
      offset + 1 <
        view.byteLength &&
      segments < 4096
    ) {
      if (
        view.getUint8(offset) !==
        0xff
      ) {
        offset += 1;
        continue;
      }

      while (
        offset <
          view.byteLength &&
        view.getUint8(offset) ===
          0xff
      ) {
        offset += 1;
      }

      if (
        offset >=
        view.byteLength
      ) {
        break;
      }

      const marker =
        view.getUint8(offset);

      offset += 1;

      if (marker === 0x00) {
        continue;
      }

      if (
        marker === 0xd9 ||
        marker === 0xda
      ) {
        break;
      }

      if (
        marker === 0x01 ||
        marker === 0xd8 ||
        (marker >= 0xd0 &&
          marker <= 0xd7)
      ) {
        continue;
      }

      if (
        offset + 2 >
        view.byteLength
      ) {
        break;
      }

      const length =
        view.getUint16(
          offset,
          false
        );

      if (length < 2) {
        break;
      }

      const segmentStart =
        offset + 2;

      const segmentEnd =
        offset + length;

      if (
        segmentEnd >
        view.byteLength
      ) {
        break;
      }

      if (
        marker === 0xe1 &&
        segmentEnd -
          segmentStart >=
          6 &&
        ascii(
          view,
          segmentStart,
          6,
          segmentEnd
        ) === "Exif"
      ) {
        try {
          return {
            rows: parseTiff(
              view,
              segmentStart + 6,
              segmentEnd
            ),
            foundExif: true
          };
        } catch (_) {
          return {
            rows: [],
            foundExif: true,
            damaged: true
          };
        }
      }

      offset = segmentEnd;
      segments += 1;
    }

    return emptyResult;
  }

  function assertRange(
    offset,
    length,
    start,
    end
  ) {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < start ||
      length < 0 ||
      offset + length > end
    ) {
      throw new Error(
        "EXIF 字段越界"
      );
    }
  }

  function ascii(
    view,
    offset,
    length,
    end
  ) {
    assertRange(
      offset,
      length,
      0,
      end
    );

    const limit =
      Math.min(length, 256);

    let value = "";

    for (
      let i = 0;
      i < limit;
      i += 1
    ) {
      const code =
        view.getUint8(
          offset + i
        );

      if (!code) {
        break;
      }

      value +=
        String.fromCharCode(code);
    }

    return value;
  }

  function parseTiff(
    view,
    start,
    end
  ) {
    assertRange(
      start,
      8,
      start,
      end
    );

    const byteOrder =
      view.getUint16(
        start,
        false
      );

    if (
      byteOrder !== 0x4949 &&
      byteOrder !== 0x4d4d
    ) {
      throw new Error(
        "无效字节序"
      );
    }

    const little =
      byteOrder === 0x4949;

    if (
      view.getUint16(
        start + 2,
        little
      ) !== 42
    ) {
      throw new Error(
        "无效 TIFF 标记"
      );
    }

    const labels = {
      0x010f: "相机品牌",
      0x0110: "相机型号",
      0x0112: "图像方向",
      0x0132: "修改时间",
      0x829a: "曝光时间",
      0x829d: "光圈",
      0x8827: "ISO",
      0x9003: "拍摄时间",
      0x920a: "焦距",
      0xa434: "镜头型号",
      0xa002: "原始宽度",
      0xa003: "原始高度"
    };

    const rows = [];
    const visited = new Set();

    function absolute(
      relative,
      length
    ) {
      if (
        !Number.isSafeInteger(
          relative
        )
      ) {
        throw new Error(
          "无效偏移"
        );
      }

      const position =
        start + relative;

      assertRange(
        position,
        length,
        start,
        end
      );

      return position;
    }

    function valueAt(
      entry,
      type,
      count
    ) {
      const sizes = {
        1: 1,
        2: 1,
        3: 2,
        4: 4,
        5: 8,
        7: 1,
        9: 4,
        10: 8
      };

      if (
        !sizes[type] ||
        count < 1 ||
        count > 256
      ) {
        return "";
      }

      const size =
        sizes[type] * count;

      let position =
        entry + 8;

      if (size > 4) {
        position = absolute(
          view.getUint32(
            entry + 8,
            little
          ),
          size
        );
      } else {
        assertRange(
          position,
          size,
          start,
          end
        );
      }

      if (type === 2) {
        return ascii(
          view,
          position,
          count,
          end
        ).replace(/\0+$/g, "");
      }

      if (type === 3) {
        const values = [];

        for (
          let i = 0;
          i < count;
          i += 1
        ) {
          values.push(
            view.getUint16(
              position + i * 2,
              little
            )
          );
        }

        return values.join(", ");
      }

      if (type === 4) {
        const values = [];

        for (
          let i = 0;
          i < count;
          i += 1
        ) {
          values.push(
            view.getUint32(
              position + i * 4,
              little
            )
          );
        }

        return values.join(", ");
      }

      if (
        type === 5 ||
        type === 10
      ) {
        const values = [];

        for (
          let i = 0;
          i < count;
          i += 1
        ) {
          const signed =
            type === 10;

          const numerator =
            signed
              ? view.getInt32(
                  position +
                    i * 8,
                  little
                )
              : view.getUint32(
                  position +
                    i * 8,
                  little
                );

          const denominator =
            signed
              ? view.getInt32(
                  position +
                    i * 8 +
                    4,
                  little
                )
              : view.getUint32(
                  position +
                    i * 8 +
                    4,
                  little
                );

          values.push(
            denominator
              ? formatRational(
                  numerator,
                  denominator
                )
              : "0"
          );
        }

        return values.join(", ");
      }

      return "";
    }

    function walk(relative) {
      if (
        !relative ||
        visited.has(relative) ||
        visited.size >= 8
      ) {
        return;
      }

      visited.add(relative);

      const directory =
        absolute(relative, 2);

      const count =
        Math.min(
          view.getUint16(
            directory,
            little
          ),
          256
        );

      assertRange(
        directory + 2,
        count * 12,
        start,
        end
      );

      for (
        let i = 0;
        i < count;
        i += 1
      ) {
        const entry =
          directory +
          2 +
          i * 12;

        const tag =
          view.getUint16(
            entry,
            little
          );

        const type =
          view.getUint16(
            entry + 2,
            little
          );

        const itemCount =
          view.getUint32(
            entry + 4,
            little
          );

        if (tag === 0x8769) {
          walk(
            view.getUint32(
              entry + 8,
              little
            )
          );
          continue;
        }

        if (tag === 0x8825) {
          rows.push.apply(
            rows,
            parseGps(
              view,
              start,
              end,
              view.getUint32(
                entry + 8,
                little
              ),
              little
            )
          );

          continue;
        }

        if (!labels[tag]) {
          continue;
        }

        const value =
          valueAt(
            entry,
            type,
            itemCount
          );

        if (value !== "") {
          rows.push({
            label: labels[tag],
            value:
              tag === 0x0112
                ? orientationName(
                    value
                  )
                : value
          });
        }
      }
    }

    walk(
      view.getUint32(
        start + 4,
        little
      )
    );

    return rows;
  }

  function formatRational(
    numerator,
    denominator
  ) {
    if (
      numerator === 1 &&
      denominator > 1
    ) {
      return (
        "1/" +
        denominator
      );
    }

    return (
      numerator / denominator
    )
      .toFixed(4)
      .replace(/0+$/, "")
      .replace(/\.$/, "");
  }

  function orientationName(
    value
  ) {
    const names = {
      1: "正常",
      2: "水平翻转",
      3: "旋转 180°",
      4: "垂直翻转",
      5: "转置",
      6: "顺时针旋转 90°",
      7: "横向转置",
      8: "逆时针旋转 90°"
    };

    return (
      names[Number(value)] ||
      value
    );
  }

  function parseGps(
    view,
    start,
    end,
    relative,
    little
  ) {
    const rows = [];

    try {
      const directory =
        start + relative;

      assertRange(
        directory,
        2,
        start,
        end
      );

      const count =
        Math.min(
          view.getUint16(
            directory,
            little
          ),
          64
        );

      assertRange(
        directory + 2,
        count * 12,
        start,
        end
      );

      const data = {};

      for (
        let i = 0;
        i < count;
        i += 1
      ) {
        const entry =
          directory +
          2 +
          i * 12;

        const tag =
          view.getUint16(
            entry,
            little
          );

        const type =
          view.getUint16(
            entry + 2,
            little
          );

        const itemCount =
          view.getUint32(
            entry + 4,
            little
          );

        if (
          (tag === 1 ||
            tag === 3) &&
          type === 2 &&
          itemCount <= 4
        ) {
          data[tag] =
            ascii(
              view,
              entry + 8,
              itemCount,
              end
            );
        }

        if (
          (tag === 2 ||
            tag === 4) &&
          type === 5 &&
          itemCount === 3
        ) {
          const position =
            start +
            view.getUint32(
              entry + 8,
              little
            );

          assertRange(
            position,
            24,
            start,
            end
          );

          const values = [];

          for (
            let j = 0;
            j < 3;
            j += 1
          ) {
            const numerator =
              view.getUint32(
                position +
                  j * 8,
                little
              );

            const denominator =
              view.getUint32(
                position +
                  j * 8 +
                  4,
                little
              );

            values.push(
              denominator
                ? numerator /
                    denominator
                : 0
            );
          }

          data[tag] = values;
        }
      }

      if (data[2]) {
        rows.push({
          label: "GPS 纬度",
          value:
            toDegree(data[2]) +
            (data[1] || ""),
          sensitive: true
        });
      }

      if (data[4]) {
        rows.push({
          label: "GPS 经度",
          value:
            toDegree(data[4]) +
            (data[3] || ""),
          sensitive: true
        });
      }
    } catch (_) {
      return [];
    }

    return rows;
  }

  function toDegree(values) {
    return (
      (
        values[0] +
        values[1] / 60 +
        values[2] / 3600
      ).toFixed(6) + "° "
    );
  }

  async function clean() {
    if (!loaded) {
      C.setStatus(
        status,
        "请先选择图片。",
        "warn"
      );
      return;
    }

    const token = gate.start();

    const controls = [
      format,
      quality,
      input,
      document.querySelector(
        "#reset"
      )
    ];

    clearResult();

    C.setBusy(
      runButton,
      true,
      "处理中…"
    );

    controls.forEach(function (node) {
      node.disabled = true;
    });

    C.setStatus(
      status,
      "正在生成清理后的图片。",
      "ok"
    );

    try {
      const alpha =
        format.value !==
        "image/jpeg";

      const made =
        C.makeCanvas(
          loaded.width,
          loaded.height,
          alpha
        );

      if (!alpha) {
        made.ctx.fillStyle =
          "#ffffff";

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
          format.value ===
            "image/png"
            ? undefined
            : Number(
                quality.value
              ) / 100
        );

      if (
        !gate.active(token)
      ) {
        return;
      }

      const verification =
        await readExif(blob);

      if (
        !gate.active(token)
      ) {
        return;
      }

      if (
        blob.type ===
          "image/jpeg" &&
        verification.foundExif
      ) {
        throw new Error(
          "生成的新图片仍检测到照片信息，请更换浏览器后重试。"
        );
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
        "#output-format-name"
      ).textContent =
        formatName(
          blob.type
        );

      document.querySelector(
        "#verification"
      ).textContent =
        blob.type ===
        "image/jpeg"
          ? "已检查：未发现常见 EXIF 信息"
          : "已生成新文件：未复制原照片的常见元数据";

      C.focusResult(result);

      C.setStatus(
        status,
        "处理完成。分享前仍建议检查画面中的人脸、地址、文字等可见信息。",
        "ok"
      );
    } catch (error) {
      if (
        gate.active(token)
      ) {
        C.setStatus(
          status,
          "处理失败：" +
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
          "清除照片信息"
        );

        runButton.disabled =
          !loaded;
      }
    }
  }

  function reset() {
    gate.cancel();

    [format, quality, input].forEach(
      function (node) {
        node.disabled = false;
      }
    );

    C.releaseImage(loaded);

    loaded = null;
    sourceFile = null;

    clearResult();

    preview.removeAttribute("src");
    preview.hidden = true;
    empty.hidden = false;

    summary.textContent = "";
    table.textContent = "";

    document.querySelector(
      "#metadata"
    ).hidden = true;

    format.value = "image/jpeg";
    quality.value = "92";

    runButton.disabled = true;

    document.querySelector(
      "#reset"
    ).hidden = true;

    syncControls();
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
