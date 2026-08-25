import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { loadConfig } from "../scripts/config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); passed += 1; }

const coreSource = await readFile(resolve(root, "assets/js/image-core.js"), "utf8");
const windowStub = { addEventListener() {}, setTimeout, matchMedia() { return { matches: true }; } };
const documentStub = { querySelectorAll() { return []; }, createElement() { return {}; } };
const coreContext = { window: windowStub, document: documentStub, URL, Blob, File, Image: function () {} };
vm.createContext(coreContext);
vm.runInContext(coreSource, coreContext);
const C = coreContext.window.ImageCore;

const png = new Uint8Array(33);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
new DataView(png.buffer).setUint32(8, 13, false);
png.set(Array.from("IHDR", (character) => character.charCodeAt(0)), 12);
new DataView(png.buffer).setUint32(16, 800, false);
new DataView(png.buffer).setUint32(20, 600, false);
const inspectedPng = await C.inspectFile(new File([png], "sample.bin", { type: "application/octet-stream" }));
assert(inspectedPng.type === "image/png", "应按文件签名识别 PNG");
assert(inspectedPng.width === 800 && inspectedPng.height === 600, "应读取 PNG 尺寸");

let rejected = false;
try { await C.inspectFile(new File(["not an image"], "fake.jpg", { type: "image/jpeg" })); }
catch (_) { rejected = true; }
assert(rejected, "应拒绝伪装成 JPG 的文本文件");

const huge = png.slice();
new DataView(huge.buffer).setUint32(16, 9000, false);
rejected = false;
try { await C.inspectFile(new File([huge], "huge.png", { type: "image/png" })); }
catch (_) { rejected = true; }
assert(rejected, "应在解码前拒绝超长单边");

const webp = new Uint8Array(30);
for (const [offset, text] of [[0, "RIFF"], [8, "WEBP"], [12, "VP8X"]]) {
  for (const [index, character] of Array.from(text).entries()) webp[offset + index] = character.charCodeAt(0);
}
webp[24] = 0x1f;
webp[27] = 0x0f;
const inspectedWebp = await C.inspectFile(new File([webp], "static.webp", { type: "image/webp" }));
assert(inspectedWebp.width === 32 && inspectedWebp.height === 16, "应读取 VP8X 尺寸");
const animatedWebp = webp.slice();
animatedWebp[20] = 0x02;
rejected = false;
try { await C.inspectFile(new File([animatedWebp], "animated.webp", { type: "image/webp" })); }
catch (_) { rejected = true; }
assert(rejected, "应拒绝动画 WebP");

const jpegSof = Uint8Array.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x0a, 0x00, 0x14, 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
const jpegWithFill = new File([Uint8Array.from([0xff, 0xd8, 0xff]), jpegSof], "fill.jpg", { type: "image/jpeg" });
const inspectedFill = await C.inspectFile(jpegWithFill);
assert(inspectedFill.width === 20 && inspectedFill.height === 10, "应跳过 JPEG 标记填充字节");

const largeApp = new Uint8Array(65535);
largeApp.set([0xff, 0xef, 0xff, 0xfd]);
const longJpegParts = [Uint8Array.from([0xff, 0xd8])];
for (let i = 0; i < 17; i += 1) longJpegParts.push(largeApp);
longJpegParts.push(jpegSof);
const inspectedLongJpeg = await C.inspectFile(new File(longJpegParts, "long-header.jpg", { type: "image/jpeg" }));
assert(inspectedLongJpeg.width === 20 && inspectedLongJpeg.height === 10, "应读取尺寸标记位于 1 MiB 之后的合法 JPEG");

const paddingLength = 1024 * 1024 + 32;
const lateApng = new Uint8Array(8 + 25 + 12 + paddingLength + 20);
lateApng.set(png.slice(0, 33), 0);
let pngOffset = 33;
new DataView(lateApng.buffer).setUint32(pngOffset, paddingLength, false);
lateApng.set(Array.from("ruSt", (character) => character.charCodeAt(0)), pngOffset + 4);
pngOffset += 12 + paddingLength;
new DataView(lateApng.buffer).setUint32(pngOffset, 8, false);
lateApng.set(Array.from("acTL", (character) => character.charCodeAt(0)), pngOffset + 4);
rejected = false;
try { await C.inspectFile(new File([lateApng], "late-apng.png", { type: "image/png" })); }
catch (_) { rejected = true; }
assert(rejected, "应拒绝动画控制块位于 1 MiB 之后的 APNG");

assert(C.sanitizeVisibleText("\u200b\u200d\u2060") === "", "应把纯零宽字符视为空水印");
assert(C.sanitizeVisibleText("  仅供审核\u200b ") === "仅供审核", "应保留水印中的可见文字");

let exifSource = await readFile(resolve(root, "assets/js/exif.js"), "utf8");
exifSource = exifSource.replace(/\}\)\(\);\s*$/, "window.__parseExif=parseExif;})();");
const node = { addEventListener() {}, hidden: false, textContent: "", appendChild() {}, removeAttribute() {}, value: "image/jpeg", disabled: false };
const exifWindow = { ImageCore: { wireDropzone() {}, createTaskGate() { return { start() { return 1; }, active() { return true; }, cancel() {} }; } }, addEventListener() {} };
const exifContext = { window: exifWindow, document: { querySelector() { return node; } }, console, URL };
vm.createContext(exifContext);
vm.runInContext(exifSource, exifContext);

const validExif = new ArrayBuffer(96);
const validView = new DataView(validExif);
validView.setUint16(0, 0xffd8, false);
validView.setUint16(2, 0xffe1, false);
validView.setUint16(4, 80, false);
for (const [index, character] of Array.from("Exif").entries()) validView.setUint8(6 + index, character.charCodeAt(0));
validView.setUint16(12, 0x4949, false);
validView.setUint16(14, 42, true);
validView.setUint32(16, 8, true);
validView.setUint16(20, 1, true);
validView.setUint16(22, 0x010f, true);
validView.setUint16(24, 2, true);
validView.setUint32(26, 6, true);
validView.setUint32(30, 40, true);
for (const [index, code] of Array.from("Canon\0").entries()) validView.setUint8(52 + index, code.charCodeAt(0));
const validParsed = exifContext.window.__parseExif(validExif);
assert(validParsed.rows.some((row) => row.label === "相机品牌" && row.value === "Canon"), "应读取段内合法 EXIF 字段");

const fillExif = new Uint8Array(97);
fillExif.set(new Uint8Array(validExif, 0, 2), 0);
fillExif[2] = 0xff;
fillExif.set(new Uint8Array(validExif, 2), 3);
const fillExifParsed = exifContext.window.__parseExif(fillExif.buffer);
assert(fillExifParsed.rows.some((row) => row.label === "相机品牌"), "EXIF 扫描应跳过 JPEG 填充字节");

const lateExifParts = [Uint8Array.from([0xff, 0xd8])];
for (let i = 0; i < 33; i += 1) lateExifParts.push(largeApp);
lateExifParts.push(new Uint8Array(validExif, 2));
const lateExifFile = new File(lateExifParts, "late-exif.jpg", { type: "image/jpeg" });
const lateExifBuffer = await lateExifFile.arrayBuffer();
const lateExifParsed = exifContext.window.__parseExif(lateExifBuffer);
assert(lateExifParsed.rows.some((row) => row.label === "相机品牌"), "应读取位于 2 MiB 之后的 EXIF 段");

const malicious = new ArrayBuffer(200256);
const view = new DataView(malicious);
view.setUint16(0, 0xffd8, false);
view.setUint16(2, 0xffe1, false);
view.setUint16(4, 100, false);
for (const [index, character] of Array.from("Exif").entries()) view.setUint8(6 + index, character.charCodeAt(0));
view.setUint16(12, 0x4949, false);
view.setUint16(14, 42, true);
view.setUint32(16, 8, true);
view.setUint16(20, 1, true);
view.setUint16(22, 0x010f, true);
view.setUint16(24, 2, true);
view.setUint32(26, 200000, true);
view.setUint32(30, 100, true);
const parsed = exifContext.window.__parseExif(malicious);
assert(parsed.foundExif === true, "应识别 EXIF APP1 段");
assert(parsed.rows.length === 0, "不得读取 APP1 段外的伪造字段");

const toolScripts = ["compress.js", "watermark.js", "resize.js", "convert.js", "exif.js"];
for (const script of toolScripts) {
  const source = await readFile(resolve(root, "assets/js", script), "utf8");
  const genericNode = {
    addEventListener() {}, removeAttribute() {}, setAttribute() {}, getAttribute() { return "false"; },
    querySelector() { return this; }, querySelectorAll() { return []; }, appendChild() {}, focus() {},
    hidden: false, disabled: false, checked: false, textContent: "", value: "50", dataset: {}, files: []
  };
  const coreStub = new Proxy({
    wireDropzone() {},
    createTaskGate() { return { start() { return 1; }, active() { return true; }, cancel() {} }; }
  }, { get(target, property) { return property in target ? target[property] : function () {}; } });
  const context = {
    window: { ImageCore: coreStub, addEventListener() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, matchMedia() { return { matches: true }; }, setTimeout },
    document: { querySelector() { return genericNode; }, querySelectorAll() { return []; }, createElement() { return { ...genericNode }; }, createTextNode() { return {}; } },
    URL, console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  assert(true, `${script} 应能完成初始绑定`);
  assert(source.indexOf("loaded = null") < source.indexOf("await C.loadImage(file)"), `${script} 选择新文件前应清除旧文件状态`);
}

const compressSource = await readFile(resolve(root, "assets/js/compress.js"), "utf8");
assert(compressSource.includes("sourceFile.slice(0, sourceFile.size, loaded.type)"), "复用压缩源文件时应修正 Blob MIME");
const watermarkSource = await readFile(resolve(root, "assets/js/watermark.js"), "utf8");
assert(watermarkSource.includes("blockHeight <= height * 0.9"), "水印布局应验证垂直安全区域");

const configDirectory = await mkdtemp(resolve(tmpdir(), "tuan-config-test-"));
const config = JSON.parse(await readFile(resolve(root, "site.config.json"), "utf8"));
config.productionReady = "false";
await writeFile(resolve(configDirectory, "site.config.json"), JSON.stringify(config));
rejected = false;
try { await loadConfig(configDirectory, true); } catch (_) { rejected = true; }
assert(rejected, "字符串 false 不得通过生产配置校验");
config.productionReady = false;
await writeFile(resolve(configDirectory, "site.config.json"), JSON.stringify(config));
rejected = false;
try { await loadConfig(configDirectory, true); } catch (_) { rejected = true; }
assert(rejected, "布尔值 false 不得通过生产部署校验");
config.productionReady = true;
await writeFile(resolve(configDirectory, "site.config.json"), JSON.stringify(config));
assert((await loadConfig(configDirectory, true)).productionReady === true, "布尔值 true 应通过完整生产配置校验");
await rm(configDirectory, { recursive: true, force: true });

console.log(`逻辑测试通过：${passed} 项断言。`);
