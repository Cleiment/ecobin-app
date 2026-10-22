(function () {
  "use strict";

  var config = JSON.parse(document.getElementById("station-config").textContent);
  var root = document.querySelector("[data-kiosk]");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CODE_PATTERN = /^ECO-[A-Z0-9]{6}$/;
  var IDLE_MS = 60000;

  var state = { member: null, category: null, itemId: null, quantity: 1 };
  var idleTimer = null;

  function $(sel) { return root.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function number(n) { return Number(n).toLocaleString("id-ID"); }
  function kg(n) { return Number(n).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " kg"; }

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Permintaan gagal.");
        return data;
      });
    });
  }

  /* ---------- Layar ---------- */

  function show(name) {
    $all("[data-screen]").forEach(function (screen) { screen.hidden = screen.dataset.screen !== name; });
    var heading = $('[data-screen="' + name + '"] .k-title');
    if (heading && name !== "scan") { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    if (name === "scan") startCamera(); else stopCamera();
    resetIdle(name);
  }

  // Kembali ke layar scan jika tidak ada aktivitas, seperti kios sungguhan
  function resetIdle(name) {
    clearTimeout(idleTimer);
    if (name !== "scan" && name !== "checking") idleTimer = setTimeout(finish, IDLE_MS);
  }

  function finish() {
    state = { member: null, category: null, itemId: null, quantity: 1 };
    $("[data-scan-error]").textContent = "";
    $("[data-manual]").reset();
    show("scan");
  }

  function updateMeter(current, capacity) {
    var pct = Math.round((current / capacity) * 100);
    $("[data-meter] span").style.width = Math.min(pct, 100) + "%";
    $("[data-meter]").setAttribute("aria-valuenow", Math.min(pct, 100));
    $("[data-meter-label]").textContent = "Isi " + pct + "%";
  }

  /* ---------- Kamera dan QR ---------- */

  var video = $("[data-video]");
  var cameraMsg = $("[data-camera-msg]");
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });
  var stream = null;
  var scanning = false;

  function startCamera() {
    if (stream) { scanning = true; requestAnimationFrame(tick); return; }
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraMsg.textContent = "Kamera hanya bisa dipakai di localhost atau HTTPS. Ketik kode member di bawah.";
      return;
    }
    cameraMsg.textContent = "Menyalakan kamera…";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .then(function () {
        cameraMsg.textContent = "Arahkan QR ke kotak";
        scanning = true;
        requestAnimationFrame(tick);
      })
      .catch(function (err) {
        cameraMsg.textContent = err && err.name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan kamera di browser, atau ketik kode member di bawah."
          : "Kamera tidak ditemukan. Ketik kode member di bawah.";
      });
  }

  function stopCamera() {
    scanning = false;
  }

  function tick() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
      var width = 640;
      var height = Math.round((video.videoHeight / video.videoWidth) * width) || 480;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);
      var image = ctx.getImageData(0, 0, width, height);
      var result = window.jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
      if (result && CODE_PATTERN.test(result.data.trim().toUpperCase())) {
        scanning = false;
        identify(result.data);
        return;
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------- Identifikasi member ---------- */

  function identify(code) {
    var error = $("[data-scan-error]");
    code = String(code || "").trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      error.textContent = "Format kode belum benar. Contoh: ECO-7F3K92";
      return;
    }
    error.textContent = "";
    cameraMsg.textContent = "Memeriksa kode…";
    post("/admin/stasiun/api/member", { code: code })
      .then(function (data) {
        state.member = data.member;
        renderSlots();
        show("slot");
      })
      .catch(function (err) {
        error.textContent = err.message;
        cameraMsg.textContent = "Arahkan QR ke kotak";
        if (stream) { scanning = true; setTimeout(function () { requestAnimationFrame(tick); }, 1200); }
      });
  }

  $("[data-manual]").addEventListener("submit", function (e) {
    e.preventDefault();
    identify(e.target.elements.code.value);
  });

  /* ---------- Pilih lubang dan barang ---------- */

  function renderSlots() {
    $("[data-member-line]").innerHTML = "Halo, <strong>" + escapeHtml(state.member.name) + "</strong> · " + number(state.member.points) + " Eco Point";
    $("[data-slots]").innerHTML = config.categories.map(function (c) {
      return '<button class="k-slot" type="button" data-category="' + c.id + '" style="--cat: ' + escapeHtml(c.color) + '">' +
        '<span class="k-slot-hole" aria-hidden="true"></span><span class="k-slot-name">' + escapeHtml(c.name) + "</span></button>";
    }).join("");
  }

  function renderItems() {
    state.itemId = null;
    state.quantity = 1;
    $("[data-qty-value]").textContent = "1";
    $('[data-action="submit"]').disabled = true;
    $("[data-submit-error]").textContent = "";
    $("[data-slot-line]").innerHTML = "Lubang <strong>" + escapeHtml(state.category.name) + "</strong>";
    $("[data-items]").innerHTML = config.items.map(function (item) {
      return '<button class="k-item" type="button" role="radio" aria-checked="false" data-item="' + item.id + '">' + escapeHtml(item.name) + "</button>";
    }).join("");
  }

  $("[data-slots]").addEventListener("click", function (e) {
    var button = e.target.closest("[data-category]");
    if (!button) return;
    state.category = config.categories.filter(function (c) { return String(c.id) === button.dataset.category; })[0];
    renderItems();
    show("item");
  });

  $("[data-items]").addEventListener("click", function (e) {
    var button = e.target.closest("[data-item]");
    if (!button) return;
    state.itemId = Number(button.dataset.item);
    $all("[data-item]").forEach(function (b) { b.setAttribute("aria-checked", String(b === button)); });
    $('[data-action="submit"]').disabled = false;
    resetIdle("item");
  });

  $all("[data-qty]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.quantity = Math.min(Math.max(state.quantity + Number(button.dataset.qty), 1), config.maxQuantity);
      $("[data-qty-value]").textContent = state.quantity;
      resetIdle("item");
    });
  });

  /* ---------- Kirim setoran ---------- */

  function submit() {
    show("checking");
    var started = Date.now();
    post("/admin/stasiun/" + config.location.id + "/setor", {
      code: state.member.code, categoryId: state.category.id, itemId: state.itemId, quantity: state.quantity
    })
      .then(function (data) {
        var wait = Math.max(0, (reduceMotion ? 200 : 1400) - (Date.now() - started));
        setTimeout(function () { renderResult(data); }, wait);
      })
      .catch(function (err) {
        show("item");
        $("[data-submit-error]").textContent = err.message;
      });
  }

  function renderResult(data) {
    var box = $("[data-result]");
    if (data.status === "diterima") {
      state.member.points = data.balance;
      if (data.location) updateMeter(data.location.current, data.location.capacity);
      box.className = "k-result k-result--ok";
      box.innerHTML =
        '<span class="k-result-icon" aria-hidden="true"><svg class="icon"><use href="#i-check"/></svg></span>' +
        '<h1 class="k-title">Diterima</h1>' +
        '<p class="k-big">+' + number(data.points) + " Eco Point</p>" +
        '<p class="k-lead">' + kg(data.weight) + " sampah " + escapeHtml(data.category.toLowerCase()) + " masuk ke penyimpanan.</p>" +
        '<p class="k-lead">Saldo ' + escapeHtml(data.member.name) + ": <strong>" + number(data.balance) + " Eco Point</strong></p>";
    } else {
      box.className = "k-result k-result--bad";
      box.innerHTML =
        '<span class="k-result-icon" aria-hidden="true"><svg class="icon"><use href="#i-x"/></svg></span>' +
        '<h1 class="k-title">Ditolak</h1>' +
        '<p class="k-lead k-lead--strong">' + escapeHtml(data.reason) + "</p>" +
        '<p class="k-lead">Setoran ini tidak menghasilkan poin.</p>';
    }
    show("result");
  }

  root.addEventListener("click", function (e) {
    var action = e.target.closest("[data-action]");
    if (!action) return;
    var name = action.dataset.action;
    if (name === "done") finish();
    if (name === "back-slot") show("slot");
    if (name === "again") { renderSlots(); show("slot"); }
    if (name === "submit" && state.itemId) submit();
  });

  /* ---------- Layar penuh ---------- */

  var fullscreenButton = $("[data-fullscreen]");
  if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
  fullscreenButton.addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  document.addEventListener("fullscreenchange", function () {
    fullscreenButton.textContent = document.fullscreenElement ? "Keluar layar penuh" : "Layar penuh";
  });

  window.addEventListener("pagehide", function () {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  });

  show("scan");
})();
