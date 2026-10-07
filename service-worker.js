"use strict";
const CACHE_NAME = "tuan-tools-aa6b9f5bc1f0";
const OFFLINE_URLS = ["/tuan-tools-cn/","/tuan-tools-cn/photo-requirements/","/tuan-tools-cn/inspect/","/tuan-tools-cn/compress/","/tuan-tools-cn/batch-compress/","/tuan-tools-cn/batch-exif/","/tuan-tools-cn/watermark/","/tuan-tools-cn/resize/","/tuan-tools-cn/convert/","/tuan-tools-cn/remove-exif/","/tuan-tools-cn/guides/","/tuan-tools-cn/methodology/","/tuan-tools-cn/404.html","/tuan-tools-cn/manifest.webmanifest","/tuan-tools-cn/assets/css/styles.css","/tuan-tools-cn/assets/js/image-core.js","/tuan-tools-cn/assets/js/site.js","/tuan-tools-cn/assets/js/requirements.js","/tuan-tools-cn/assets/js/inspect.js","/tuan-tools-cn/assets/js/compress.js","/tuan-tools-cn/assets/js/batch-compress.js","/tuan-tools-cn/assets/js/batch-exif.js","/tuan-tools-cn/assets/js/watermark.js","/tuan-tools-cn/assets/js/resize.js","/tuan-tools-cn/assets/js/convert.js","/tuan-tools-cn/assets/js/exif.js","/tuan-tools-cn/assets/img/favicon.png","/tuan-tools-cn/assets/img/apple-touch-icon.png","/tuan-tools-cn/assets/img/hero-workbench.webp","/tuan-tools-cn/assets/img/huyue-logo.png","/tuan-tools-cn/assets/img/icon-192.png","/tuan-tools-cn/assets/img/icon-512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)));
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tuan-tools-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/tuan-tools-cn/"))));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
