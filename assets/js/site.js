(function () {
  "use strict";
  document.documentElement.classList.add("js");
  const menuButton = document.querySelector(".menu-button");
  const nav = document.querySelector(".nav-links");

  function setMenu(open) {
    if (!menuButton || !nav) return;
    nav.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  }

  if (menuButton && nav) {
    menuButton.addEventListener("click", function () { setMenu(!nav.classList.contains("is-open")); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); menuButton.focus(); }
    });
    document.addEventListener("click", function (event) {
      if (nav.classList.contains("is-open") && !nav.contains(event.target) && !menuButton.contains(event.target)) setMenu(false);
    });
    nav.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", function () { setMenu(false); }); });
  }

  document.querySelectorAll("[data-year]").forEach(function (node) { node.textContent = new Date().getFullYear(); });

  const offlineNotice = document.querySelector("[data-offline-notice]");
  function syncNetworkStatus() {
    if (!offlineNotice) return;
    offlineNotice.hidden = navigator.onLine;
  }
  window.addEventListener("online", syncNetworkStatus);
  window.addEventListener("offline", syncNetworkStatus);
  syncNetworkStatus();

  const installButton = document.querySelector("[data-install-app]");
  let deferredInstallPrompt = null;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  if (installButton && !isStandalone) {
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
    });
    installButton.addEventListener("click", async function () {
      if (!deferredInstallPrompt) return;
      installButton.disabled = true;
      try {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
      } catch (_) {
        /* Installation is optional; failure does not affect the site. */
      } finally {
        deferredInstallPrompt = null;
        installButton.hidden = true;
        installButton.disabled = false;
      }
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });
  }

  const allowedAnalyticsEvents = new Set(["tool_file_selected", "tool_run", "tool_success", "tool_download", "tool_cancel", "guide_copy_link", "guide_share"]);
  window.TuanAnalytics = Object.freeze({
    track: function (eventName, toolName) {
      if (!allowedAnalyticsEvents.has(eventName) || typeof window.gtag !== "function") return;
      const params = {};
      if (typeof toolName === "string" && /^[a-z-]{2,24}$/.test(toolName)) params.tool_name = toolName;
      window.gtag("event", eventName, params);
    }
  });

  document.querySelectorAll("[data-share-page]").forEach(function (button) {
    button.addEventListener("click", async function () {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: document.title, url: window.location.href });
          window.TuanAnalytics.track("guide_share");
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(window.location.href);
        const previous = button.textContent;
        button.textContent = "链接已复制";
        window.TuanAnalytics.track("guide_copy_link");
        window.setTimeout(function () { button.textContent = previous; }, 1600);
      } catch (_) {
        window.prompt("复制这个页面地址：", window.location.href);
      }
    });
  });

  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    window.addEventListener("load", async function () {
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (!manifestLink) return;
      const workerUrl = new URL("service-worker.js", manifestLink.href);
      try {
        const registration = await navigator.serviceWorker.register(workerUrl.pathname);
        let reloadForUpdate = false;

        function showUpdate(worker) {
          if (!worker || document.querySelector(".update-notice")) return;
          const notice = document.createElement("div");
          notice.className = "update-notice";
          notice.setAttribute("role", "region");
          notice.setAttribute("aria-label", "站点更新");
          const text = document.createElement("span");
          text.setAttribute("aria-live", "polite");
          text.textContent = "图安工具有新版本可用。";
          const actions = document.createElement("div");
          actions.className = "update-notice-actions";
          const laterButton = document.createElement("button");
          laterButton.type = "button";
          laterButton.className = "button ghost";
          laterButton.textContent = "稍后";
          laterButton.addEventListener("click", function () { notice.remove(); });
          const button = document.createElement("button");
          button.type = "button";
          button.className = "button secondary";
          button.textContent = "刷新使用新版";
          button.addEventListener("click", function () {
            reloadForUpdate = true;
            button.disabled = true;
            laterButton.disabled = true;
            button.textContent = "正在更新…";
            worker.postMessage({ type: "SKIP_WAITING" });
          });
          actions.append(laterButton, button);
          notice.append(text, actions);
          document.body.appendChild(notice);
        }

        if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
        registration.addEventListener("updatefound", function () {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", function () {
          if (reloadForUpdate) window.location.reload();
        });
      } catch (_) {
        /* Offline support is progressive enhancement; page remains usable without it. */
      }
    });
  }

  window.addEventListener("pageshow", function (event) { if (event.persisted) window.location.reload(); });
  const nodes = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.08 });
    nodes.forEach(function (node) { observer.observe(node); });
  } else nodes.forEach(function (node) { node.classList.add("is-visible"); });
})();
