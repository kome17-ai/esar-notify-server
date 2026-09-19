(function () {
  var ads = [
    { tag: "Advertisement", title: "Esar Worlds", text: "Social, Rides, Chat, Video and Market — one house, five doors.", href: "worlds.html" },
    { tag: "Partner", title: "Safe rides week", text: "Verified drivers and live trip sharing inside Esar Rides.", href: "worlds.html#rides" },
    { tag: "House note", title: "Creators desk", text: "Upload family-friendly videos to Esar Play and keep the comments kind.", href: "journal.html" }
  ];

  fetch("/api/ad").then(function (r) { return r.json(); }).then(function (ad) {
    if (!ad || !ad.active) return;

    if (ad.headline) {
      ads.unshift({
        tag: "Sponsored",
        title: ad.headline,
        text: ad.description || "",
        href: ad.linkUrl || "#"
      });
    }

    if (ad.videoUrl || ad.imageUrl) {
      renderFloatingAd(ad);
    }
  }).catch(function () {});

  function renderFloatingAd(ad) {
    try {
      if (sessionStorage.getItem("esar-float-ad-closed") === "1") return;
    } catch (e) {}

    var card = document.createElement("div");
    card.className = "float-ad";

    var mediaHtml = ad.videoUrl
      ? '<video class="media" src="' + ad.videoUrl + '" autoplay muted loop playsinline></video>'
      : '<img class="media" src="' + ad.imageUrl + '" alt="Sponsored" />';

    card.innerHTML =
      mediaHtml +
      '<div class="float-close" data-float-close>×</div>' +
      '<div class="body">' +
        '<span class="tag">Sponsored</span>' +
        '<h4>' + (ad.headline || "") + '</h4>' +
        (ad.description ? '<p>' + ad.description + '</p>' : '') +
        '<a class="float-cta" href="' + (ad.linkUrl || "#") + '" target="_blank">Learn more</a>' +
      '</div>';

    document.body.appendChild(card);

    card.querySelector("[data-float-close]").addEventListener("click", function () {
      card.remove();
      try { sessionStorage.setItem("esar-float-ad-closed", "1"); } catch (e) {}
    });
  }

  var banner = document.querySelector("[data-ad-text]");
  var tagEl = document.querySelector("[data-ad-tag]");
  var ctaEl = document.querySelector("[data-ad-cta]");
  var i = 0;
  function paintAd() {
    if (!banner) return;
    var a = ads[i % ads.length];
    if (tagEl) tagEl.textContent = a.tag;
    banner.innerHTML = "<strong>" + a.title + "</strong> — " + a.text;
    if (ctaEl) ctaEl.setAttribute("href", a.href);
    i += 1;
  }
  paintAd();
  setInterval(paintAd, 6500);

  var close = document.querySelector("[data-ad-close]");
  if (close) {
    close.addEventListener("click", function () {
      document.body.classList.add("ad-hidden");
      try { sessionStorage.setItem("esar-ad-closed", "1"); } catch (e) {}
    });
  }
  try {
    if (sessionStorage.getItem("esar-ad-closed") === "1") {
      document.body.classList.add("ad-hidden");
    }
  } catch (e) {}

  var burger = document.querySelector("[data-burger]");
  var nav = document.querySelector(".nav");
  if (burger && nav) burger.addEventListener("click", function () { nav.classList.toggle("open"); });

  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter]").forEach(function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      var key = btn.getAttribute("data-filter");
      document.querySelectorAll("[data-world]").forEach(function (card) {
        card.style.display = (key === "all" || card.getAttribute("data-world") === key) ? "" : "none";
      });
    });
  });

  var form = document.querySelector("[data-contact]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = form.querySelector(".form-ok");
      if (ok) ok.style.display = "block";
      form.reset();
    });
  }

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();
})();
