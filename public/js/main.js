(function () {
  var ads = [
    { tag: "Advertisement", title: "Esar Worlds", text: "Social, Rides, Chat, Video and Market — one house, five doors.", href: "worlds.html" },
    { tag: "Partner", title: "Safe rides week", text: "Verified drivers and live trip sharing inside Esar Rides.", href: "worlds.html#rides" },
    { tag: "House note", title: "Creators desk", text: "Upload family-friendly videos to Esar Play and keep the comments kind.", href: "journal.html" }
  ];

  // Pull in any live sponsor ad set via /api/ad (same system used across the ESAR backend).
  // Falls back silently to the three house ads above if none is active or the request fails.
  fetch("/api/ad").then(function (r) { return r.json(); }).then(function (ad) {
    if (ad && ad.active && ad.headline) {
      ads.unshift({
        tag: "Sponsored",
        title: ad.headline,
        text: ad.description || "",
        href: ad.linkUrl || "#"
      });
    }
  }).catch(function () {});

    var banner = document.querySelector("[data-ad-text]");
  var tagEl = document.querySelector("[data-ad-tag]");
  var ctaEl = document.querySelector("[data-ad-cta]");
  var mediaEl = document.querySelector("[data-ad-media]");
  var adIndex = 0;
  var adItems = [];
  var defaultAds = [
    {tag:"ESAR",title:"Discover ESAR Worlds",text:"Social, Rides, Chat, Video and Market.",href:"worlds.html"}
  ];

  function safeUrl(value){
    try{
      var u = new URL(value, window.location.href);
      if(u.protocol === "https:" || u.protocol === "http:") return u.href;
    }catch(e){}
    return "";
  }

  function paintAd(){
    if(!banner) return;
    var a = adItems[adIndex % adItems.length];
    if(tagEl) tagEl.textContent = a.tag || "Sponsored";
    banner.textContent = "";
    var strong = document.createElement("strong");
    strong.textContent = a.title || "Discover ESAR";
    banner.appendChild(strong);
    if(a.text){
      banner.appendChild(document.createTextNode(" — " + a.text));
    }
    if(ctaEl){
      ctaEl.href = safeUrl(a.href) || "worlds.html";
      ctaEl.textContent = "Explore";
    }
    if(mediaEl){
      mediaEl.replaceChildren();
      var videoUrl = safeUrl(a.videoUrl);
      var imageUrl = safeUrl(a.imageUrl);
      if(videoUrl){
        var video = document.createElement("video");
        video.src = videoUrl;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.controls = true;
        video.preload = "metadata";
        mediaEl.appendChild(video);
        video.play().catch(function(){});
      }else if(imageUrl){
        var img = document.createElement("img");
        img.src = imageUrl;
        img.alt = a.title || "ESAR advertisement";
        img.loading = "eager";
        mediaEl.appendChild(img);
      }
    }
    adIndex++;
  }

  fetch("/api/ad").then(function(r){
    if(!r.ok) throw new Error("Advertisement request failed");
    return r.json();
  }).then(function(ad){
    if(ad && ad.active && ad.headline){
      adItems = [{
        tag:"Sponsored",
        title:ad.headline,
        text:ad.description || "",
        href:ad.linkUrl || "worlds.html",
        imageUrl:ad.imageUrl || "",
        videoUrl:ad.videoUrl || ""
      }];
    }else{
      adItems = defaultAds;
    }
    paintAd();
  }).catch(function(){
    adItems = defaultAds;
    paintAd();
  });

  var close = document.querySelector("[data-ad-close]");
  if(close){
    close.addEventListener("click",function(){
      document.body.classList.add("ad-hidden");
      try{sessionStorage.setItem("esar-ad-closed","1");}catch(e){}
    });
  }
  try{
    if(sessionStorage.getItem("esar-ad-closed")==="1"){
      document.body.classList.add("ad-hidden");
    }
  }catch(e){}
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
