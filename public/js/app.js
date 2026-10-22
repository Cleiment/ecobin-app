// Perilaku kecil yang dipakai di semua halaman
(function () {
  "use strict";

  // Konfirmasi sebelum aksi yang mengubah data: <form data-confirm="...">
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (form.dataset && form.dataset.confirm && !window.confirm(form.dataset.confirm)) e.preventDefault();
  });

  // Menu admin di layar kecil
  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector("[data-nav-toggle]");
    var nav = document.querySelector("[data-nav]");
    if (!toggle || !nav) return;
    var label = toggle.querySelector(".visually-hidden");

    function setOpen(open) {
      document.body.classList.add("nav-animated");
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
      label.textContent = open ? "Tutup menu" : "Buka menu";
      toggle.querySelector("use").setAttribute("href", open ? "#i-x" : "#i-menu");
    }
    toggle.addEventListener("click", function () { setOpen(toggle.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
    });
    // Tutup menu tanpa animasi saat layar dilebarkan ke ukuran desktop
    window.matchMedia("(min-width: 901px)").addEventListener("change", function (e) {
      if (!e.matches) return;
      document.body.classList.remove("nav-animated");
      if (nav.classList.contains("is-open")) setOpen(false);
      document.body.classList.remove("nav-animated");
    });
  });
})();
