/*!
 * Signoff signature engine
 * Turns a plain object of details into email-safe HTML: nested tables, inline styles,
 * bgcolor fallbacks. Pure string building, so it runs in the browser and in Node.
 * The only DOM use is drawing the contact icons onto a canvas; without one (Node),
 * icons fall back to letters.
 *
 * Browser: window.Signoff        Node: require("./src/signature.js")
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Signoff = factory();
})(typeof self !== "undefined" ? self : this, function () {
"use strict";

/* ---------- constants ---------- */
const INK = "#1B1F27", MUTED = "#5A616E", SOFT = "#8A909C", RULE = "#CDD1D8", RING = "#BCC1CA", CARD_EDGE = "#E3E5EA";
const TBL = 'cellpadding="0" cellspacing="0" border="0" role="presentation"';
const GMAIL_LIMIT = 10000;
const FONTS = {
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  verdana: "Verdana, Geneva, sans-serif",
  trebuchet: "'Trebuchet MS', Tahoma, sans-serif"
};
const PALETTES = {
  lemon:  { label: "Lemon mint", a: "#FBE6A2", c: "#CFEEDB" },
  mint:   { label: "Mint blush", a: "#CDEEDB", c: "#F7CDD3" },
  blush:  { label: "Blush",      a: "#F6C9D0", c: "#FBE3E7" },
  sunset: { label: "Lemon rose", a: "#FBE3A0", c: "#F5C4C4" },
  sky:    { label: "Sky lilac",  a: "#D6E4FB", c: "#E6DEFA" },
  peach:  { label: "Peach",      a: "#FCD9C2", c: "#FFF0E3" },
  sage:   { label: "Sage",       a: "#DCE8D2", c: "#F1F4EA" },
  white:  { label: "White",      a: "#FFFFFF", c: "#FFFFFF" },
  custom: { label: "Custom",     a: null,      c: null }
};
const ACCENTS = [["#1B1F27","Ink"],["#2F6BD1","Blue"],["#1F7A5A","Green"],["#7A3E8E","Plum"],["#C9402F","Red"],["#B7791F","Ochre"]];
const TEMPLATES = [
  { id: "portrait", name: "Portrait", desc: "Photo on the left, social links in a column on the right.", sk: '<i class="p"></i><i class="l"></i><i class="d"></i>' },
  { id: "mirror",   name: "Mirror",   desc: "Social links on the left, framed photo on the right.", sk: '<i class="d"></i><i class="l"></i><i class="p"></i>' },
  { id: "arch",     name: "Arch",     desc: "An arched photo frame, social links under your details.", sk: '<i class="a"></i><i class="l"></i>' },
  { id: "edge",     name: "Edge",     desc: "Your photo sits in a tinted panel on the card's edge.", sk: '<i class="l"></i><i class="d"></i><i class="e"></i>' },
  { id: "badge",    name: "Badge",    desc: "A smaller card with a round photo. Kind to phone screens.", sk: '<i class="o"></i><i class="l"></i>', small: true },
  { id: "minimal",  name: "Minimal",  desc: "No card. A round photo or logo and clean lines of text.", sk: '<i class="o"></i><i class="bar2"></i><i class="l"></i>', plain: true }
];
const SOCIALS = [["linkedin","LinkedIn","in","linkedin"],["x","X","X","x"],["instagram","Instagram","IG","instagram"],["facebook","Facebook","f","facebook"],["youtube","YouTube","YT","youtube"],["github","GitHub","GH","github"]];
const PHOTO_SPEC = {
  portrait: { w: 100, h: 117, r: [10,10,10,10], b: 3 },
  mirror:   { w: 100, h: 117, r: [10,10,10,10], b: 3 },
  arch:     { w: 100, h: 117, r: [50,50,10,10], b: 3 },
  edge:     { w: 112, h: 131, r: [8,8,8,8],     b: 0 },
  badge:    { w: 76,  h: 76,  circle: true, b: 3, square: true },
  minimal:  { w: 56,  h: 56,  circle: true, b: 0, square: true }
};

/* Line icons drawn from 24px stroke paths, rendered to small PNGs so email apps can show them.
   All paths except "x" come from Feather icons (MIT, (c) Cole Bemis, see vendor/feather-icons.LICENSE). */
const ICON_PATHS = {
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  mobile: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z|M22 6l-10 7L2 6",
  globe: "M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z|M15 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0z",
  linkedin: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z|M2 9h4v12H2z|M6 4a2 2 0 1 1-4 0a2 2 0 1 1 4 0z",
  x: "M4.5 3.5h4.2l10.8 17h-4.2z|M19.2 3.5l-6.4 7.3|M11.1 13.2l-6.3 7.3",
  instagram: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z|M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z|M17.5 6.5h.01",
  facebook: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  youtube: "M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z|M9.75 15.02l5.75-3.27-5.75-3.27v6.54z",
  github: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
};
const ICONS = {};
let ICONS_OK = typeof document !== "undefined";
if (ICONS_OK) try {
  Object.keys(ICON_PATHS).forEach(k => {
    const c = document.createElement("canvas"); c.width = c.height = 40;
    const x = c.getContext("2d");
    x.scale(40 / 24, 40 / 24);
    x.strokeStyle = INK; x.lineWidth = 2.1; x.lineCap = "round"; x.lineJoin = "round";
    ICON_PATHS[k].split("|").forEach(d => x.stroke(new Path2D(d)));
    ICONS[k] = c.toDataURL("image/png");
  });
} catch (e) { ICONS_OK = false; }

/* ---------- state ---------- */
const BLANK = {
  name: "", title: "", company: "", phone: "", mobile: "", email: "", website: "", address: "",
  linkedin: "", x: "", instagram: "", facebook: "", youtube: "", github: "",
  ctaLabel: "", ctaUrl: "", disclaimer: "", photoUrl: "", logoUrl: "",
  template: "portrait", palette: "lemon", customA: "#FBE6A2", customC: "#CFEEDB", accent: "#1B1F27",
  font: "helvetica", icons: "icons", tone: "bw", app: "gmail"
};
const SAMPLE = Object.assign({}, BLANK, {
  name: "Alex Rivera", title: "Head of Partnerships", company: "Northwind Studio",
  phone: "+1 (555) 010-2040", email: "alex@northwind.example", website: "northwind.example",
  address: "120 Market Street, San Francisco",
  linkedin: "https://www.linkedin.com/in/your-profile", x: "https://x.com/yourhandle", instagram: "https://instagram.com/yourhandle",
  ctaLabel: "Book a call", ctaUrl: "https://calendar.example/alex"
});

/* ---------- helpers ---------- */
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function safeUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(u)) return "https://" + u;
  return "";
}
function displayUrl(u) { return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, ""); }
function telHref(p) { return "tel:" + p.replace(/[^\d+]/g, ""); }
function normHex(h) {
  h = String(h || "").trim();
  if (/^#?[0-9a-f]{6}$/i.test(h)) return ("#" + h.replace("#", "")).toUpperCase();
  if (/^#?[0-9a-f]{3}$/i.test(h)) { const s = h.replace("#", ""); return ("#" + s[0] + s[0] + s[1] + s[1] + s[2] + s[2]).toUpperCase(); }
  return "";
}
function rgb(h) { h = normHex(h) || "#FFFFFF"; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function hex(a) { return "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase(); }
function mix(a, b, t) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); }
function lum(h) { const c = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function onColor(h) { return lum(h) > 0.4 ? INK : "#FFFFFF"; }
function paletteOf(s) {
  const p = PALETTES[s.palette] || PALETTES.lemon;
  const a = s.palette === "custom" ? (normHex(s.customA) || "#FFFFFF") : p.a;
  const c = s.palette === "custom" ? (normHex(s.customC) || "#FFFFFF") : p.c;
  return { a: a, b: "#FFFFFF", c: c, solid: mix(a, "#FFFFFF", 0.55), panel: mix(c, INK, 0.07) };
}
function slug(name) { return String(name || "my").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "my"; }

/* ---------- the signature ---------- */
function build(s, m, target) {
  // target: "preview" (on this page), "png" (image export), "embed" (Outlook, Apple Mail, HTML file), "gmail"
  const gmail = target === "gmail" || (target === "preview" && s.app === "gmail");
  const icons = s.icons === "icons" && !gmail && ICONS_OK;
  const F = FONTS[s.font] || FONTS.helvetica;
  const P = paletteOf(s);
  const A = normHex(s.accent) || INK;
  const site = safeUrl(s.website);
  const tpl = s.template;
  const txt = (size, lh, color, extra) => "font-family:" + F + ";font-size:" + size + "px;line-height:" + lh + "px;color:" + color + ";" + (extra || "");
  const link = (href, text, extra) => href ? '<a href="' + esc(href) + '" style="color:' + INK + ";text-decoration:none;" + (extra || "") + '">' + text + "</a>" : text;

  function source(kind) {
    const local = kind === "logo" ? m.logo : (kind === "square" ? m.square : m.portrait);
    const url = safeUrl(kind === "logo" ? s.logoUrl : s.photoUrl);
    if (target === "gmail") return url ? { src: url } : (local && kind !== "logo" ? { placeholder: true } : null);
    if (target === "embed") return url ? { src: url } : (local ? { src: local } : null);
    if (local) return { src: local };
    if (target === "preview" && url) return { src: url };
    return null;
  }
  function photo(kind, w, h, style, frame) {
    const src = source(kind);
    if (!src) return "";
    if (src.placeholder) {
      const W = w + 2 * (frame || 0), H = h + 2 * (frame || 0);
      return '<table ' + TBL + ' width="' + W + '"><tr><td width="' + W + '" height="' + H + '" align="center" valign="middle" style="width:' + W + "px;height:" + H + "px;text-align:center;vertical-align:middle;" + txt(11, 14, SOFT, "font-weight:bold;letter-spacing:1px;") + '">Photo</td></tr></table>';
    }
    return '<img src="' + esc(src.src) + '" width="' + w + '" height="' + h + '" alt="' + esc(s.name.trim() || "Photo") + '" style="display:block;width:' + w + "px;height:" + h + "px;border:0;" + style + '">';
  }
  function logoInline() {
    const src = source("logo");
    if (!src || src.placeholder) return "";
    const h = 15;
    const size = m.logoAspect ? 'width="' + Math.max(1, Math.round(h * m.logoAspect)) + '" height="' + h + '"' : 'height="' + h + '"';
    const w = m.logoAspect ? "width:" + Math.max(1, Math.round(h * m.logoAspect)) + "px;" : "";
    return '<img src="' + esc(src.src) + '" ' + size + ' alt="" style="display:inline-block;' + w + "height:" + h + 'px;border:0;vertical-align:-3px;margin-right:6px;">';
  }

  const name = esc(s.name.trim() || "Your name");
  const title = esc(s.title.trim()), company = esc(s.company.trim());
  const roleParts = [];
  if (title) roleParts.push(title);
  const comp = logoInline() + (company ? link(site, company, "font-weight:bold;") : "");
  if (comp) roleParts.push(comp);
  const role = roleParts.join('<span style="color:' + RING + ';">&nbsp;&nbsp;|&nbsp;&nbsp;</span>');

  const items = [];
  const add = (key, icon, letter, html) => items.push({ key: key, icon: icon, letter: letter, html: html });
  const phone = s.phone.trim(), mobile = s.mobile.trim(), email = s.email.trim(), addr = s.address.trim();
  if (phone) add("phone", "phone", "T", link(telHref(phone), esc(phone)));
  if (mobile) add("mobile", "mobile", "M", link(telHref(mobile), esc(mobile)));
  if (email) add("email", "mail", "E", link("mailto:" + email, esc(email)));
  if (site) add("web", "globe", "W", link(site, esc(displayUrl(site))));
  if (addr) add("addr", "pin", "A", esc(addr));

  function mark(it) {
    if (icons) {
      return '<td width="18" valign="middle" style="width:18px;padding:0 7px 0 0;vertical-align:middle;"><table ' + TBL + '><tr><td width="18" height="18" align="center" valign="middle" style="width:18px;height:18px;border:1px solid ' + RING + ';border-radius:50%;background-color:#FFFFFF;text-align:center;vertical-align:middle;line-height:0;"><img src="' + ICONS[it.icon] + '" width="10" height="10" alt="" style="display:inline-block;width:10px;height:10px;border:0;vertical-align:middle;"></td></tr></table></td>';
    }
    return '<td valign="middle" style="padding:0 7px 0 0;vertical-align:middle;' + txt(11, 16, A, "font-weight:bold;") + '">' + it.letter + "</td>";
  }
  function item(it) {
    return '<table ' + TBL + "><tr>" + mark(it) + '<td valign="middle" style="vertical-align:middle;white-space:nowrap;' + txt(12, 16, INK) + '">' + it.html + "</td></tr></table>";
  }
  function grid(cols) {
    if (!items.length) return "";
    const gap = 7;
    let rows = "";
    if (cols === 1) {
      rows = items.map((it, i) => '<tr><td style="padding:' + (i ? gap : 0) + 'px 0 0 0;">' + item(it) + "</td></tr>").join("");
    } else {
      const list = items.filter(i => i.key !== "addr"), adr = items.filter(i => i.key === "addr")[0];
      for (let i = 0; i < list.length; i += 2) {
        const a = list[i], b = list[i + 1], top = i ? gap : 0;
        rows += '<tr><td valign="middle" style="padding:' + top + 'px 20px 0 0;vertical-align:middle;">' + item(a) + '</td><td valign="middle" style="padding:' + top + 'px 0 0 0;vertical-align:middle;">' + (b ? item(b) : "") + "</td></tr>";
      }
      if (adr) rows += '<tr><td colspan="2" style="padding:' + (list.length ? gap : 0) + 'px 0 0 0;">' + item(adr) + "</td></tr>";
    }
    return '<table ' + TBL + ' style="border-collapse:collapse;">' + rows + "</table>";
  }

  const socials = SOCIALS.map(r => ({ href: safeUrl(s[r[0]]), label: r[1], letter: r[2], icon: r[3] })).filter(x => x.href);
  function socialBtn(sc, size) {
    const inner = icons ? '<img src="' + ICONS[sc.icon] + '" width="12" height="12" alt="' + sc.label + '" style="display:block;width:12px;height:12px;border:0;">' : sc.letter;
    const pad = Math.round((size - 12) / 2);
    const aStyle = icons ? "display:block;padding:" + pad + "px;line-height:0;text-decoration:none;" : "display:block;text-decoration:none;text-align:center;" + txt(10, size, INK, "font-weight:bold;");
    return '<table ' + TBL + '><tr><td width="' + size + '" height="' + size + '" align="center" valign="middle" style="width:' + size + "px;height:" + size + "px;border:1px solid " + RING + ';border-radius:50%;background-color:#FFFFFF;text-align:center;vertical-align:middle;"><a href="' + esc(sc.href) + '" title="' + sc.label + '" style="' + aStyle + '">' + inner + "</a></td></tr></table>";
  }
  function socialCol(size) {
    if (!socials.length) return "";
    return '<table ' + TBL + ">" + socials.map((sc, k) => '<tr><td style="padding:' + (k ? 6 : 0) + 'px 0 0 0;">' + socialBtn(sc, size || 26) + "</td></tr>").join("") + "</table>";
  }
  function socialRow(size) {
    if (!socials.length) return "";
    return '<table ' + TBL + "><tr>" + socials.map((sc, k) => '<td style="padding:0 ' + (k < socials.length - 1 ? 6 : 0) + 'px 0 0;">' + socialBtn(sc, size || 24) + "</td>").join("") + "</tr></table>";
  }

  const ctaUrl = safeUrl(s.ctaUrl), ctaLabel = s.ctaLabel.trim();
  const cta = ctaUrl && ctaLabel ? '<table ' + TBL + ' style="border-collapse:separate;"><tr><td bgcolor="' + A + '" style="background-color:' + A + ';border-radius:4px;"><a href="' + esc(ctaUrl) + '" style="display:inline-block;padding:7px 14px;text-decoration:none;' + txt(12, 14, onColor(A), "font-weight:bold;") + '">' + esc(ctaLabel) + "&nbsp;&rarr;</a></td></tr></table>" : "";

  function details(o) {
    o = o || {};
    const ns = o.nameSize || 21;
    const rows = ['<tr><td style="' + txt(ns, ns + 4, INK, "font-weight:bold;letter-spacing:-0.2px;") + '">' + name + "</td></tr>"];
    if (role) rows.push('<tr><td style="padding-top:3px;' + txt(12, 17, MUTED) + '">' + role + "</td></tr>");
    const g = grid(o.cols || 2);
    if (g) rows.push('<tr><td style="padding:11px 0 11px 0;"><table ' + TBL + ' width="100%" style="width:100%;"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:' + RULE + ';">&nbsp;</td></tr></table></td></tr><tr><td>' + g + "</td></tr>");
    if (o.socialRow && socials.length) rows.push('<tr><td style="padding-top:' + (g ? 12 : 10) + 'px;">' + socialRow(o.socialSize || 24) + "</td></tr>");
    if (cta) rows.push('<tr><td style="padding-top:12px;">' + cta + "</td></tr>");
    return '<table ' + TBL + ' style="border-collapse:collapse;">' + rows.join("") + "</table>";
  }
  function card(width, cells) {
    return '<table ' + TBL + ' width="' + width + '" bgcolor="' + P.solid + '" style="width:' + width + "px;border-collapse:separate;border:1px solid " + CARD_EDGE + ";border-radius:14px;background-color:" + P.solid + ";background-image:linear-gradient(90deg," + P.a + " 0%," + P.b + " 50%," + P.c + ' 100%);"><tr>' + cells + "</tr></table>";
  }

  const frame = "border:3px solid #FFFFFF;border-radius:10px;";
  let body = "", width = 560;
  if (tpl === "mirror") {
    const ph = photo("portrait", 100, 117, frame, 3);
    body = card(560,
      (socials.length ? '<td width="26" valign="middle" style="width:26px;padding:16px 0 16px 16px;vertical-align:middle;">' + socialCol(26) + "</td>" : "") +
      '<td valign="middle" style="padding:18px 18px 18px 20px;vertical-align:middle;">' + details() + "</td>" +
      (ph ? '<td width="106" valign="middle" style="width:106px;padding:14px 14px 14px 16px;border-left:1px solid ' + RULE + ';vertical-align:middle;">' + ph + "</td>" : ""));
  } else if (tpl === "arch") {
    const ph = photo("portrait", 100, 117, "border:3px solid #FFFFFF;border-radius:50px 50px 10px 10px;", 3);
    body = card(560,
      (ph ? '<td width="106" valign="middle" style="width:106px;padding:14px 0 14px 16px;vertical-align:middle;">' + ph + "</td>" : "") +
      '<td valign="middle" style="padding:18px 20px 18px 22px;vertical-align:middle;">' + details({ socialRow: true }) + "</td>");
  } else if (tpl === "edge") {
    const ph = photo("portrait", 112, 131, "border-radius:8px;", 0);
    body = card(560,
      '<td valign="middle" style="padding:18px 16px 18px 22px;vertical-align:middle;">' + details() + "</td>" +
      (socials.length ? '<td width="26" valign="middle" style="width:26px;padding:16px 18px 16px 0;vertical-align:middle;">' + socialCol(26) + "</td>" : "") +
      (ph ? '<td width="112" valign="middle" bgcolor="' + P.panel + '" style="width:112px;padding:14px 16px;background-color:' + P.panel + ';border-radius:0 13px 13px 0;vertical-align:middle;">' + ph + "</td>" : ""));
  } else if (tpl === "badge") {
    width = 460;
    const ph = photo("square", 76, 76, "border:3px solid #FFFFFF;border-radius:50%;", 3);
    body = card(460,
      (ph ? '<td width="82" valign="top" style="width:82px;padding:18px 0 18px 18px;vertical-align:top;">' + ph + "</td>" : "") +
      '<td valign="top" style="padding:18px 20px 18px 18px;vertical-align:top;">' + details({ nameSize: 18, cols: 1, socialRow: true, socialSize: 24 }) + "</td>");
  } else if (tpl === "minimal") {
    width = 520;
    let lead = photo("square", 56, 56, "border-radius:50%;", 0);
    if (!lead) {
      const ls = source("logo");
      if (ls && !ls.placeholder) {
        const asp = m.logoAspect || 1;
        const lw = asp >= 1 ? 56 : Math.round(56 * asp), lh = asp >= 1 ? Math.round(56 / asp) : 56;
        lead = '<img src="' + esc(ls.src) + '" width="' + lw + '" height="' + lh + '" alt="' + (company || "Logo") + '" style="display:block;width:' + lw + "px;height:" + lh + 'px;border:0;">';
      }
    }
    const sep = '<span style="color:' + RING + ';">&nbsp;&nbsp;|&nbsp;&nbsp;</span>';
    const inl = it => (icons ? '<img src="' + ICONS[it.icon] + '" width="11" height="11" alt="" style="display:inline-block;width:11px;height:11px;border:0;vertical-align:-1px;margin-right:6px;">' : '<span style="font-weight:bold;color:' + A + ';">' + it.letter + "</span>&nbsp;&nbsp;") + it.html;
    const line1 = items.filter(i => i.key !== "addr").map(inl).join(sep);
    const adr = items.filter(i => i.key === "addr")[0];
    const rows = ['<tr><td style="' + txt(17, 21, INK, "font-weight:bold;") + '">' + name + "</td></tr>"];
    if (role) rows.push('<tr><td style="padding-top:2px;' + txt(12, 17, MUTED) + '">' + role + "</td></tr>");
    if (line1) rows.push('<tr><td style="padding-top:9px;white-space:nowrap;' + txt(12, 18, INK) + '">' + line1 + "</td></tr>");
    if (adr) rows.push('<tr><td style="padding-top:' + (line1 ? 3 : 9) + "px;" + txt(12, 18, INK) + '">' + inl(adr) + "</td></tr>");
    if (socials.length) rows.push('<tr><td style="padding-top:10px;">' + socialRow(22) + "</td></tr>");
    if (cta) rows.push('<tr><td style="padding-top:12px;">' + cta + "</td></tr>");
    const block = '<table ' + TBL + ' style="border-collapse:collapse;">' + rows.join("") + "</table>";
    body = '<table ' + TBL + ' style="border-collapse:collapse;"><tr>' +
      (lead ? '<td valign="top" style="padding:2px 16px 0 0;vertical-align:top;">' + lead + "</td>" : "") +
      '<td valign="top" style="vertical-align:top;' + (lead ? "padding-left:16px;border-left:2px solid " + A + ";" : "") + '">' + block + "</td></tr></table>";
  } else {
    const ph = photo("portrait", 100, 117, frame, 3);
    body = card(560,
      (ph ? '<td width="106" valign="middle" style="width:106px;padding:14px 0 14px 14px;vertical-align:middle;">' + ph + "</td>" : "") +
      '<td valign="middle" style="padding:18px 16px 18px 20px;vertical-align:middle;">' + details() + "</td>" +
      (socials.length ? '<td width="26" valign="middle" style="width:26px;padding:16px 16px 16px 0;vertical-align:middle;">' + socialCol(26) + "</td>" : ""));
  }

  const disc = s.disclaimer.trim();
  if (disc) {
    body = '<table ' + TBL + ' style="border-collapse:collapse;"><tr><td>' + body + '</td></tr><tr><td width="' + width + '" style="width:' + width + "px;padding-top:10px;" + txt(10, 14, SOFT) + '">' + esc(disc).replace(/\n/g, "<br>") + "</td></tr></table>";
  }
  return body;
}

function plainText(s) {
  const site = safeUrl(s.website), out = [];
  if (s.name.trim()) out.push(s.name.trim());
  const role = [s.title.trim(), s.company.trim()].filter(Boolean).join(", ");
  if (role) out.push(role);
  const nums = [s.phone.trim() && "T " + s.phone.trim(), s.mobile.trim() && "M " + s.mobile.trim()].filter(Boolean).join(" | ");
  if (nums) out.push(nums);
  if (s.email.trim()) out.push(s.email.trim());
  if (site) out.push(displayUrl(site));
  if (s.address.trim()) out.push(s.address.trim());
  const cta = safeUrl(s.ctaUrl);
  if (s.ctaLabel.trim() && cta) out.push(s.ctaLabel.trim() + ": " + cta);
  SOCIALS.forEach(r => { const u = safeUrl(s[r[0]]); if (u) out.push(r[1] + ": " + u); });
  if (s.disclaimer.trim()) out.push("", s.disclaimer.trim());
  return out.join("\n");
}

/* ---------- made-up people for the hero cards (every address uses the reserved .example domain) ---------- */
const EXAMPLES = [
  { s: Object.assign({}, BLANK, { name: "Priya Nair", title: "Product Designer", company: "Lumen Labs", phone: "+1 (555) 010-3188", email: "priya@lumen.example", website: "lumen.example", linkedin: "https://linkedin.com/in/example", instagram: "https://instagram.com/example", x: "https://x.com/example", template: "portrait", palette: "lemon" }), tones: ["#EDEFF1", "#D5D9DF", "#9EA4AE"] },
  { s: Object.assign({}, BLANK, { name: "Daniel Mensah", title: "Founder", company: "Harbor & Co.", mobile: "+1 (555) 010-7731", email: "daniel@harbor.example", website: "harbor.example", linkedin: "https://linkedin.com/in/example", x: "https://x.com/example", template: "mirror", palette: "blush", accent: "#C9402F", ctaLabel: "Book a call", ctaUrl: "https://calendar.example" }), tones: ["#F1EEEE", "#DCD6D6", "#A39C9C"] },
  { s: Object.assign({}, BLANK, { name: "Mei Tanaka", title: "Senior Counsel", company: "Kestrel Legal", phone: "+1 (555) 010-4410", email: "mei@kestrel.example", website: "kestrel.example", address: "48 Hudson Yards, New York", linkedin: "https://linkedin.com/in/example", template: "edge", palette: "mint" }), tones: ["#EEF1EF", "#D6DCD8", "#9FA8A2"] }
];

return {
  // palette and limits
  INK: INK, GMAIL_LIMIT: GMAIL_LIMIT, FONTS: FONTS, PALETTES: PALETTES, ACCENTS: ACCENTS,
  TEMPLATES: TEMPLATES, SOCIALS: SOCIALS, PHOTO_SPEC: PHOTO_SPEC, ICONS: ICONS, iconsReady: ICONS_OK,
  // starting points
  BLANK: BLANK, SAMPLE: SAMPLE, EXAMPLES: EXAMPLES,
  // helpers
  esc: esc, safeUrl: safeUrl, displayUrl: displayUrl, normHex: normHex, mix: mix, onColor: onColor, paletteOf: paletteOf, slug: slug,
  // output
  build: build, plainText: plainText
};
});
