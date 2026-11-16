/*
 * Signoff page logic: the form, photo cropper, live preview, copy and download buttons.
 * The signature HTML itself comes from src/signature.js (window.Signoff).
 *
 * Privacy: photos are read with an object URL, cropped on a <canvas> and kept in memory
 * as data URLs. Nothing is stored (no cookies, no localStorage) and nothing is sent.
 */
(function(){
"use strict";
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

const {
  GMAIL_LIMIT, PALETTES, ACCENTS, TEMPLATES, PHOTO_SPEC, BLANK, SAMPLE, EXAMPLES,
  normHex, safeUrl, slug, build, plainText
} = window.Signoff;

let state = Object.assign({}, SAMPLE);
let isSample = true;
const media = { portrait: null, square: null, portraitCanvas: null, squareCanvas: null, logo: null, logoAspect: 0, userPhoto: false };
const crop = { img: null, w: 0, h: 0, zoom: 1, cx: 0, cy: 0 };

/* ---------- images ---------- */
function silhouette(w, h, tones) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, tones[0]); g.addColorStop(1, tones[1]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = tones[2];
  const cx = w / 2, r = w * 0.19, hy = h * 0.42;
  x.beginPath(); x.ellipse(cx, hy, r, r * 1.15, 0, 0, Math.PI * 2); x.fill();
  x.beginPath();
  x.moveTo(cx - w * 0.52, h);
  x.bezierCurveTo(cx - w * 0.48, h * 0.76, cx - w * 0.26, h * 0.7, cx - w * 0.09, h * 0.67);
  x.lineTo(cx + w * 0.09, h * 0.67);
  x.bezierCurveTo(cx + w * 0.26, h * 0.7, cx + w * 0.48, h * 0.76, cx + w * 0.52, h);
  x.closePath(); x.fill();
  return c;
}
function sampleMedia(tones) {
  const p = silhouette(240, 280, tones), q = silhouette(240, 240, tones);
  return { portraitCanvas: p, squareCanvas: q, portrait: p.toDataURL("image/jpeg", 0.9), square: q.toDataURL("image/jpeg", 0.9), logo: null, logoAspect: 0 };
}
function useSamplePhoto() {
  Object.assign(media, sampleMedia(["#ECEEF1", "#D7DBE1", "#A9AFB9"]), { userPhoto: false });
}
function toGray(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    l = (l - 128) * 1.1 + 128;
    p[i] = p[i + 1] = p[i + 2] = l < 0 ? 0 : l > 255 ? 255 : l;
  }
  ctx.putImageData(d, 0, 0);
}
function scale() { return Math.max(240 / crop.w, 280 / crop.h) * crop.zoom; }
function clampCrop() {
  const s = scale(), hw = 120 / s, hh = 140 / s;
  crop.cx = Math.min(Math.max(crop.cx, hw), crop.w - hw);
  crop.cy = Math.min(Math.max(crop.cy, hh), crop.h - hh);
}
function drawTo(canvas, outW, outH, shiftY) {
  const x = canvas.getContext("2d", { willReadFrequently: true }), s = scale(); // B&W reads pixels back
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, outW, outH);
  x.drawImage(crop.img, outW / 2 - crop.cx * s, outH / 2 - (crop.cy - shiftY / s) * s, crop.w * s, crop.h * s);
  if (state.tone === "bw") toGray(x, outW, outH);
}
let cropRaf = 0;
function processPhoto() {
  if (!crop.img) return;
  if (cropRaf) return;
  cropRaf = requestAnimationFrame(() => {
    cropRaf = 0;
    clampCrop();
    const view = $("#crop");
    drawTo(view, 240, 280, 0);
    const p = document.createElement("canvas"); p.width = 240; p.height = 280;
    p.getContext("2d").drawImage(view, 0, 0);
    const q = document.createElement("canvas"); q.width = 240; q.height = 240;
    drawTo(q, 240, 240, 20);
    media.portraitCanvas = p; media.squareCanvas = q;
    media.portrait = p.toDataURL("image/jpeg", 0.86);
    media.square = q.toDataURL("image/jpeg", 0.86);
    media.userPhoto = true;
    render();
  });
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("type"));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
function loadPhoto(file) {
  readImage(file).then(img => {
    crop.img = img; crop.w = img.naturalWidth; crop.h = img.naturalHeight; crop.zoom = 1;
    crop.cx = crop.w / 2; crop.cy = crop.h * 0.42;
    $("#zoom").value = "1";
    $("#cropper").hidden = false;
    processPhoto();
    toast("Photo added. Drag it to frame your face.");
  }, () => toast("That file couldn't be opened. Try a JPG or PNG."));
}
function loadLogo(file) {
  readImage(file).then(img => {
    const w = img.naturalWidth || 240, h = img.naturalHeight || 240, r = Math.min(1, 240 / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r));
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
    media.logo = c.toDataURL("image/png"); media.logoAspect = c.width / c.height;
    $("#logo-img").src = media.logo; $("#logo-prev").hidden = false; $("#logo-remove").hidden = false;
    render();
  }, () => toast("That logo couldn't be opened. Try a PNG or JPG."));
}
function removePhoto() {
  crop.img = null;
  Object.assign(media, { portrait: null, square: null, portraitCanvas: null, squareCanvas: null, userPhoto: false });
  $("#cropper").hidden = true; $("#photo-file").value = "";
  const c = $("#crop"); c.getContext("2d").clearRect(0, 0, c.width, c.height);
  render();
}
function removeLogo() {
  media.logo = null; media.logoAspect = 0;
  $("#logo-img").removeAttribute("src"); $("#logo-prev").hidden = true; $("#logo-remove").hidden = true; $("#logo-file").value = "";
  render();
}

/* ---------- UI: build controls ---------- */
$("#tpls").innerHTML = TEMPLATES.map(t => '<label class="choice"><input type="radio" name="template" id="tpl-' + t.id + '" data-k="template" value="' + t.id + '"><span><span class="sk' + (t.plain ? " plain" : "") + (t.small ? " small" : "") + '">' + t.sk + "</span>" + t.name + "</span></label>").join("");
$("#swatches").innerHTML = Object.keys(PALETTES).map(k => {
  const p = PALETTES[k];
  const bg = k === "custom" ? "conic-gradient(from 90deg,#FBE6A2,#CFEEDB,#D6E4FB,#F6C9D0,#FBE6A2)" : "linear-gradient(90deg," + p.a + ",#FFFFFF 50%," + p.c + ")";
  return '<label class="sw"><input type="radio" name="palette" id="pal-' + k + '" data-k="palette" value="' + k + '"><span style="background:' + bg + '"></span><small>' + p.label + "</small></label>";
}).join("");
$("#accents").innerHTML = ACCENTS.map((a, i) => '<label class="dot" title="' + a[1] + '"><input type="radio" name="accent" id="acc-' + i + '" data-k="accent" value="' + a[0] + '" aria-label="' + a[1] + '"><span style="background:' + a[0] + '"></span></label>').join("") +
  '<label class="dot" title="Pick any color"><input type="color" id="f-accent" data-k="accent" aria-label="Custom accent color" style="width:30px;height:30px;padding:0;border-radius:50%;"></label>';
$("#gallery").innerHTML = TEMPLATES.map(t => '<article class="tile" data-t="' + t.id + '"><div class="shot"><div class="box"><div class="inner sigbox"></div></div></div><div class="meta"><div><h3>' + t.name + "</h3><p>" + t.desc + '</p></div><button type="button" class="btn small" data-use="' + t.id + '">Use ' + t.name + "</button></div></article>").join("");

function syncControls() {
  $$("[data-k]").forEach(el => {
    const k = el.dataset.k, v = state[k];
    if (el.type === "radio") el.checked = String(v).toUpperCase() === String(el.value).toUpperCase();
    else if (el.type === "color") { const h = normHex(v); if (h && el.value.toUpperCase() !== h) el.value = h.toLowerCase(); }
    else if (el !== document.activeElement && el.value !== v) el.value = v == null ? "" : v;
  });
  $("#custom-colors").hidden = state.palette !== "custom";
}

/* ---------- render ---------- */
let rq = 0;
function schedule() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
function render() {
  $("#sig").innerHTML = build(state, media, "preview");
  const t = TEMPLATES.filter(x => x.id === state.template)[0];
  $("#tpl-name").textContent = t ? t.name + " style" : "";
  $("#samplebar").hidden = !isSample;
  syncControls();

  const note = $("#stage-note");
  if (state.app === "gmail") {
    note.innerHTML = "Previewing for <b>Gmail</b>. Contact icons show as letters there" + (needsGmailUpload() ? ", and your photo goes in with Gmail's own upload (see the steps below)." : ".");
  } else {
    note.innerHTML = "Previewing for <b>" + ({ outlook: "Outlook", apple: "Apple Mail", other: "other apps" })[state.app] + "</b>. Photo, logo and icons travel inside the signature.";
  }

  $$("#gallery .tile").forEach(tile => {
    const id = tile.dataset.t;
    tile.classList.toggle("on", id === state.template);
    $(".inner", tile).innerHTML = build(Object.assign({}, state, { template: id, app: "other" }), media, "png");
  });
  fitGallery();
  fitPreview();
  renderExport();
}
function fitPreview() {
  const wrap = $(".sigscroll"), sig = $("#sig");
  sig.style.transform = "none";
  const sc = Math.min(1, (wrap.clientWidth - 4) / (sig.scrollWidth || 1));
  sig.style.transform = sc < 1 ? "scale(" + sc + ")" : "none";
  wrap.style.height = sc < 1 ? Math.ceil(sig.scrollHeight * sc + 10) + "px" : "";
}
function fitGallery() {
  $$("#gallery .tile").forEach(tile => {
    const box = $(".box", tile), inner = $(".inner", tile);
    inner.style.transform = "none";
    const avail = box.parentElement.clientWidth - 44, natural = inner.scrollWidth || 1;
    const sc = Math.min(1, avail / natural);
    inner.style.transform = "scale(" + sc + ")";
    box.style.height = Math.ceil(inner.scrollHeight * sc) + "px";
  });
}
function fitHero() {
  const stack = $("#hero-stack");
  const narrow = window.matchMedia("(max-width:980px)").matches;
  $$(".card", stack).forEach(card => {
    const w = card.firstElementChild ? card.firstElementChild.offsetWidth : 560;
    if (narrow) {
      const sc = Math.min(1, (stack.clientWidth - 4) / w), t = card.firstElementChild;
      t.style.transformOrigin = "top left";
      t.style.transform = "scale(" + sc + ")";
      t.style.marginLeft = Math.max(0, (stack.clientWidth - w * sc) / 2) + "px";
      card.style.height = Math.ceil(t.offsetHeight * sc) + "px";
    } else {
      card.firstElementChild.style.transform = "";
      card.firstElementChild.style.marginLeft = "";
      card.style.height = "";
      const sc = Math.min(0.84, (stack.clientWidth * 0.9) / w);
      card.style.setProperty("--s", sc.toFixed(3));
    }
  });
}

function needsGmailUpload() {
  return state.app === "gmail" && !!media.portrait && !safeUrl(state.photoUrl);
}
function renderExport() {
  const app = state.app;
  const gm = app === "gmail";
  $("#gmail-photo").hidden = !needsGmailUpload();
  const html = build(state, media, gm ? "gmail" : "embed");
  const code = $("#code"); if (code !== document.activeElement) code.value = html;
  const meter = $("#meter");
  meter.hidden = !gm;
  if (gm) {
    const n = html.length, over = n > GMAIL_LIMIT;
    $("#fill").style.width = Math.min(100, n / GMAIL_LIMIT * 100) + "%";
    meter.classList.toggle("over", over);
    $("#count").textContent = n.toLocaleString("en-US") + " of 10,000 characters Gmail allows" + (over ? ". Shorten the small print or drop a few links." : "");
  }
  $("#howto").innerHTML = guide(app);
}
function guide(app) {
  const copy = "<li>Click <span class=\"k\">Copy signature</span>.</li>";
  if (app === "gmail") {
    const up = needsGmailUpload();
    const logoNote = media.logo && !safeUrl(state.logoUrl) ? " Your logo is left out for Gmail unless it has a public link (step 2, Already have your images online)." : "";
    return "<h3>Add it to Gmail</h3><ol>" + copy +
      "<li>Open Gmail on a computer. Click the gear icon, then <span class=\"k\">See all settings</span>.</li>" +
      "<li>On the <span class=\"k\">General</span> tab, scroll to <span class=\"k\">Signature</span> and click <span class=\"k\">Create new</span>. Give it a name.</li>" +
      "<li>Click inside the editor box and paste with <kbd>Cmd</kbd> + <kbd>V</kbd> (<kbd>Ctrl</kbd> + <kbd>V</kbd> on Windows).</li>" +
      (up ? "<li>Click <span class=\"k\">Download photo for Gmail</span>. In the pasted signature, select the word <span class=\"k\">Photo</span>, click the <span class=\"k\">Insert image</span> button in the editor and choose the file on the <span class=\"k\">Upload</span> tab.</li>" : "") +
      "<li>Under <span class=\"k\">Signature defaults</span>, pick it for new emails and for replies, then click <span class=\"k\">Save Changes</span> at the bottom of the page.</li></ol>" +
      "<p class=\"fine\">Gmail strips images packed inside a signature, so here your contact icons become letters" + (up ? " and your photo goes in through Gmail's upload, which keeps it on Google's servers for you." : ".") + logoNote + " The Gmail phone app takes plain text only: use Copy plain text there.</p>";
  }
  if (app === "outlook") {
    return "<h3>Add it to Outlook</h3><h4>New Outlook, Outlook on the web and Outlook.com</h4><ol>" + copy +
      "<li>Open <span class=\"k\">Settings</span> (the gear icon), then <span class=\"k\">Account</span> and <span class=\"k\">Signatures</span>.</li>" +
      "<li>Click <span class=\"k\">New signature</span>, name it, and paste into the box.</li>" +
      "<li>Choose it as the default for new messages and for replies, then click <span class=\"k\">Save</span>.</li></ol>" +
      "<h4>Classic Outlook for Windows</h4><ol><li>Go to <span class=\"k\">File</span>, <span class=\"k\">Options</span>, <span class=\"k\">Mail</span>, then <span class=\"k\">Signatures</span>.</li>" +
      "<li>Click <span class=\"k\">New</span>, name it, paste into the edit box, set the defaults on the right and click <span class=\"k\">OK</span>.</li></ol>" +
      "<p class=\"fine\">Classic Outlook for Windows shows square corners and a flat color instead of the gradient. Everything else comes through.</p>";
  }
  if (app === "apple") {
    return "<h3>Add it to Apple Mail</h3><ol>" + copy +
      "<li>In Mail, open <span class=\"k\">Mail</span>, <span class=\"k\">Settings</span>, then <span class=\"k\">Signatures</span>.</li>" +
      "<li>Select your account in the left column and click <span class=\"k\">+</span>.</li>" +
      "<li>Untick <span class=\"k\">Always match my default message font</span> so the styling holds.</li>" +
      "<li>Select the sample text on the right and paste over it.</li>" +
      "<li>Pick it in <span class=\"k\">Choose Signature</span>, then close the window. Mail saves it as you go.</li></ol>" +
      "<h4>iPhone and iPad Mail</h4><ol><li>Open this page on the device and tap <span class=\"k\">Copy signature</span>.</li>" +
      "<li>Go to <span class=\"k\">Settings</span>, <span class=\"k\">Apps</span>, <span class=\"k\">Mail</span>, <span class=\"k\">Signature</span> (on older iOS: Settings, Mail, Signature) and paste.</li>" +
      "<li>If the styling drops away, shake the device and tap <span class=\"k\">Undo</span>.</li></ol>";
  }
  return "<h3>Add it to another app</h3><h4>Thunderbird</h4><ol>" +
    "<li>Click <span class=\"k\">Download HTML file</span>.</li>" +
    "<li>Open <span class=\"k\">Account Settings</span> and select your account.</li>" +
    "<li>Tick <span class=\"k\">Attach the signature from a file instead</span> and choose the downloaded file.</li></ol>" +
    "<h4>Spark, Superhuman, Zoho Mail, HubSpot and others</h4><ol>" +
    "<li>Try <span class=\"k\">Copy signature</span> and paste it into the app's signature box.</li>" +
    "<li>If the app has an HTML or source field, use <span class=\"k\">Copy HTML code</span> instead.</li>" +
    "<li>If it only takes plain text, use <span class=\"k\">Copy plain text</span>.</li></ol>" +
    "<p class=\"fine\">For an app that only accepts a picture, <span class=\"k\">Download as image</span> gives you a sharp PNG of the whole card. Links in a picture can't be clicked, so use it as a last resort.</p>";
}

/* ---------- events ---------- */
function onField(e) {
  const el = e.target, k = el.dataset && el.dataset.k;
  if (!k) return;
  if (el.type === "radio" && !el.checked) return;
  state[k] = el.value;
  if (k === "name") isSample = false;
  if (k === "tone") processPhoto();
  if (k === "palette") $("#custom-colors").hidden = state.palette !== "custom";
  if (k === "template") { const tile = $('#gallery .tile[data-t="' + state.template + '"]'); if (tile) tile.classList.add("on"); }
  schedule();
}
document.addEventListener("input", onField);
document.addEventListener("change", onField);
$("#form").addEventListener("submit", e => e.preventDefault());

$("#photo-file").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) loadPhoto(f); });
$("#logo-file").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) loadLogo(f); });
$("#photo-remove").addEventListener("click", removePhoto);
$("#logo-remove").addEventListener("click", removeLogo);
const drop = $("#photo-drop");
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadPhoto(f); });

$("#zoom").addEventListener("input", e => { crop.zoom = parseFloat(e.target.value) || 1; processPhoto(); });
const cv = $("#crop");
let drag = null;
cv.addEventListener("pointerdown", e => { if (!crop.img) return; drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", e => {
  if (!drag) return;
  const k = 240 / cv.clientWidth, s = scale();
  crop.cx -= (e.clientX - drag.x) * k / s; crop.cy -= (e.clientY - drag.y) * k / s;
  drag = { x: e.clientX, y: e.clientY };
  processPhoto();
});
["pointerup", "pointercancel"].forEach(t => cv.addEventListener(t, () => { drag = null; }));
cv.addEventListener("keydown", e => {
  if (!crop.img) return;
  const s = scale(), step = 6 / s;
  const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (map[e.key]) { crop.cx += map[e.key][0]; crop.cy += map[e.key][1]; processPhoto(); e.preventDefault(); }
  if (e.key === "+" || e.key === "=" || e.key === "-") {
    crop.zoom = Math.min(3, Math.max(1, crop.zoom + (e.key === "-" ? -0.05 : 0.05)));
    $("#zoom").value = String(crop.zoom); processPhoto(); e.preventDefault();
  }
});

/* step tabs */
const tabs = $$(".tab");
function selectTab(i) {
  tabs.forEach((t, j) => {
    const on = j === i;
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(i));
  t.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const n = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      selectTab(n); tabs[n].focus(); e.preventDefault();
    }
  });
});
$$("[data-go]").forEach(b => b.addEventListener("click", () => {
  selectTab(parseInt(b.dataset.go, 10) - 1);
  $(".steps").scrollIntoView({ behavior: "smooth", block: "start" });
}));
$("#gallery").addEventListener("click", e => {
  const b = e.target.closest("[data-use]");
  if (!b) return;
  state.template = b.dataset.use;
  render();
  selectTab(2);
  $("#builder").scrollIntoView({ behavior: "smooth", block: "start" });
  toast(b.dataset.use.charAt(0).toUpperCase() + b.dataset.use.slice(1) + " style selected.");
});

/* erase */
function eraseAll(msg) {
  state = Object.assign({}, BLANK, { app: state.app });
  isSample = false;
  removePhoto(); removeLogo();
  $("#done").hidden = true;
  $("#code").value = "";
  render();
  toast(msg || "Everything is erased from this tab.");
}
$("#erase-top").addEventListener("click", () => eraseAll());
$("#erase-done").addEventListener("click", () => eraseAll("Erased. Your photo and details are gone from this tab."));
$("#start-blank").addEventListener("click", () => { eraseAll("Blank card ready. Start with your name."); selectTab(0); const n = $("#f-name"); if (n) n.focus({ preventScroll: true }); });

/* ---------- copy ---------- */
let tt;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 4200); }
function execCopy(node) {
  const r = document.createRange(); r.selectNodeContents(node);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
  sel.removeAllRanges();
  return ok;
}
function copyRich() {
  const html = build(state, media, state.app === "gmail" ? "gmail" : "embed"), text = plainText(state);
  const done = state.app === "gmail" ? "Copied. Paste it into Gmail's signature box." : "Copied. Paste it into your signature settings.";
  const fallback = () => {
    const host = $("#copy-host"); host.innerHTML = html;
    const ok = execCopy(host);
    host.innerHTML = "";
    if (ok) toast(done);
    else { const d = $("#code").closest("details"); d.open = true; $("#code").select(); toast("This browser blocked copying. Use Copy HTML code, or press Cmd+C now."); }
  };
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]).then(() => toast(done), fallback);
      return;
    }
  } catch (e) {}
  fallback();
}
function copyText(text, done) {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.left = "-10000px";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    if (ok) toast(done);
    else { const d = $("#code").closest("details"); d.open = true; const c = $("#code"); c.value = text; c.select(); toast("Copying was blocked. The text is selected: press Cmd+C."); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast(done), fallback); return; }
  } catch (e) {}
  fallback();
}
$("#copy-rich").addEventListener("click", copyRich);
$("#copy-html").addEventListener("click", () => copyText(build(state, media, state.app === "gmail" ? "gmail" : "embed"), "HTML code copied."));
$("#copy-text").addEventListener("click", () => copyText(plainText(state), "Plain text copied."));

/* ---------- downloads ---------- */
// Files are made in memory (a Blob) and handed to the browser's own download.
function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return Promise.resolve(true);
}
function afterSave(msg) { $("#done-msg").textContent = msg + " Done here?"; $("#done").hidden = false; }
function busy(btn, on) { btn.disabled = on; }

let h2cP = null;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!h2cP) h2cP = new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "vendor/html2canvas.min.js"; // bundled with the site, loaded only when you save an image
    sc.onload = () => window.html2canvas ? res(window.html2canvas) : rej(new Error("load"));
    sc.onerror = () => { h2cP = null; rej(new Error("load")); };
    document.head.appendChild(sc);
  });
  return h2cP;
}
$("#dl-png").addEventListener("click", e => {
  const btn = e.currentTarget; busy(btn, true);
  loadH2C().then(h2c => {
    const host = $("#shot");
    host.innerHTML = '<div style="padding:8px;display:inline-block;">' + build(state, media, "png") + "</div>";
    return h2c(host.firstElementChild, { backgroundColor: null, scale: 2, logging: false, onclone: doc => { const h = doc.getElementById("shot"); if (h) h.style.opacity = "1"; } })
      .then(canvas => { host.innerHTML = ""; return new Promise(r => canvas.toBlob(r, "image/png")); });
  }).then(blob => blob ? saveBlob(slug(state.name) +"-signature.png", blob) : false)
    .then(ok => { if (ok) afterSave("Image saved."); })
    .catch(() => toast("The image couldn't be drawn. Try again, or use Copy signature."))
    .then(() => busy(btn, false));
});
$("#dl-html").addEventListener("click", () => {
  const doc = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>Email signature</title>\n</head>\n<body style=\"margin:0;padding:24px;background:#FFFFFF;\">\n" + build(state, media, "embed") + "\n</body>\n</html>\n";
  saveBlob(slug(state.name) +"-signature.html", new Blob([doc], { type: "text/html" })).then(ok => { if (ok) afterSave("HTML file saved."); });
});
function roundPath(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r[0], Y);
  x.lineTo(X + W - r[1], Y); x.quadraticCurveTo(X + W, Y, X + W, Y + r[1]);
  x.lineTo(X + W, Y + H - r[2]); x.quadraticCurveTo(X + W, Y + H, X + W - r[2], Y + H);
  x.lineTo(X + r[3], Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - r[3]);
  x.lineTo(X, Y + r[0]); x.quadraticCurveTo(X, Y, X + r[0], Y);
  x.closePath();
}
$("#gmail-photo").addEventListener("click", () => {
  const spec = PHOTO_SPEC[state.template] || PHOTO_SPEC.portrait;
  const src = spec.square ? media.squareCanvas : media.portraitCanvas;
  if (!src) return;
  const b = spec.b, W = spec.w + 2 * b, H = spec.h + 2 * b;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
  if (spec.circle) {
    if (b) { x.fillStyle = "#FFFFFF"; x.beginPath(); x.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); x.fill(); }
    x.save(); x.beginPath(); x.arc(W / 2, H / 2, spec.w / 2, 0, Math.PI * 2); x.clip();
  } else {
    if (b) { x.fillStyle = "#FFFFFF"; roundPath(x, 0, 0, W, H, spec.r.map(v => v + b)); x.fill(); }
    x.save(); roundPath(x, b, b, spec.w, spec.h, spec.r); x.clip();
  }
  x.drawImage(src, b, b, spec.w, spec.h);
  x.restore();
  c.toBlob(blob => saveBlob(slug(state.name) +"-photo-for-gmail.png", blob).then(ok => { if (ok) afterSave("Photo saved for Gmail."); }), "image/png");
});

/* ---------- hero examples ---------- */
function renderHero() {
  $$("#hero-stack .card").forEach((el, i) => { const p = EXAMPLES[i]; if (p) el.innerHTML = build(p.s, sampleMedia(p.tones), "png"); });
}

/* ---------- start ---------- */
useSamplePhoto();
renderHero();
render();
fitHero();
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { fitGallery(); fitHero(); fitPreview(); }, 120); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitGallery(); fitHero(); fitPreview(); });
})();
