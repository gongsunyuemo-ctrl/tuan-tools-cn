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
