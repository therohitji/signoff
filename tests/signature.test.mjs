// Tests for the signature engine. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../src/signature.js");

// A tiny stand-in for an uploaded photo and logo, so the image paths get exercised.
const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const NO_MEDIA = { portrait: null, square: null, logo: null, logoAspect: 0 };
const WITH_MEDIA = { portrait: PIXEL, square: PIXEL, logo: PIXEL, logoAspect: 2 };
const TEMPLATE_IDS = S.TEMPLATES.map(t => t.id);

const count = (html, re) => (html.match(re) || []).length;

test("ships the six styles", () => {
  assert.deepEqual(TEMPLATE_IDS, ["portrait", "mirror", "arch", "edge", "badge", "minimal"]);
});

for (const id of TEMPLATE_IDS) {
  test(`${id}: renders balanced, email-safe tables`, () => {
    const html = S.build({ ...S.SAMPLE, template: id }, WITH_MEDIA, "embed");
    assert.ok(html.length > 500, "output is suspiciously short");
    assert.equal(count(html, /<table\b/g), count(html, /<\/table>/g), "every <table> is closed");
    assert.equal(count(html, /<tr\b/g), count(html, /<\/tr>/g), "every <tr> is closed");
    assert.equal(count(html, /<td\b/g), count(html, /<\/td>/g), "every <td> is closed");
    assert.ok(!/<(script|style|link|iframe)\b/i.test(html), "no tags that email apps strip");
    assert.ok(!/class=/.test(html), "styles are inline, not classes");
    assert.ok(html.includes("Alex Rivera"));
  });
}

test("gmail output never contains packed (data:) images", () => {
  for (const id of TEMPLATE_IDS) {
    const html = S.build({ ...S.SAMPLE, template: id }, WITH_MEDIA, "gmail");
    assert.ok(!html.includes("data:"), `${id} leaked a data: URI into Gmail output`);
  }
});

test("gmail output marks where the uploaded photo goes", () => {
  const html = S.build({ ...S.SAMPLE, template: "portrait" }, WITH_MEDIA, "gmail");
  assert.ok(html.includes(">Photo</td>"), "placeholder cell for Gmail's own image upload");
});

test("gmail output uses a public photo link when one is given", () => {
  const url = "https://images.example/alex.jpg";
  const html = S.build({ ...S.SAMPLE, photoUrl: url }, WITH_MEDIA, "gmail");
  assert.ok(html.includes(`src="${url}"`));
  assert.ok(!html.includes(">Photo</td>"));
});

test("gmail output fits the 10,000 character signature limit for every style", () => {
  for (const id of TEMPLATE_IDS) {
    const html = S.build({ ...S.SAMPLE, template: id }, WITH_MEDIA, "gmail");
    assert.ok(html.length < S.GMAIL_LIMIT, `${id} is ${html.length} characters`);
  }
});

test("outlook and apple mail output carries the photo inside the signature", () => {
  const html = S.build(S.SAMPLE, WITH_MEDIA, "embed");
  assert.ok(html.includes('src="data:image/jpeg'));
});

test("user text is escaped, so a name cannot inject markup", () => {
  const evil = '<img src=x onerror=alert(1)> "Bob" & \'co\'';
  const html = S.build({ ...S.SAMPLE, name: evil, title: evil, disclaimer: evil }, NO_MEDIA, "embed");
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt; &quot;Bob&quot; &amp; &#39;co&#39;"));
});

test("unsafe links are dropped and bare domains get https", () => {
  assert.equal(S.safeUrl("javascript:alert(1)"), "");
  assert.equal(S.safeUrl("data:text/html,hi"), "");
  assert.equal(S.safeUrl("northwind.example"), "https://northwind.example");
  assert.equal(S.safeUrl("mailto:a@b.example"), "mailto:a@b.example");
  const html = S.build({ ...S.SAMPLE, linkedin: "javascript:alert(1)", ctaUrl: "javascript:alert(1)" }, NO_MEDIA, "embed");
  assert.ok(!/javascript:/i.test(html));
});

test("an empty form still renders a usable card", () => {
  const html = S.build(S.BLANK, NO_MEDIA, "embed");
  assert.ok(html.includes("Your name"));
  assert.equal(count(html, /<table\b/g), count(html, /<\/table>/g));
});

test("custom colors are normalised and fall back safely", () => {
  assert.equal(S.normHex("abc"), "#AABBCC");
  assert.equal(S.normHex("#1b1f27"), "#1B1F27");
  assert.equal(S.normHex("red"), "");
  const p = S.paletteOf({ palette: "custom", customA: "nonsense", customC: "#123456" });
  assert.equal(p.a, "#FFFFFF");
  assert.equal(p.c, "#123456");
});

test("plain text version lists the essentials in order", () => {
  const lines = S.plainText(S.SAMPLE).split("\n");
  assert.equal(lines[0], "Alex Rivera");
  assert.equal(lines[1], "Head of Partnerships, Northwind Studio");
  assert.ok(lines.includes("alex@northwind.example"));
  assert.ok(lines.includes("Book a call: https://calendar.example/alex"));
});

test("file names are safe slugs", () => {
  assert.equal(S.slug("Zoë O'Brien-Smith"), "zoe-obrien-smith");
  assert.equal(S.slug(""), "my");
  assert.equal(S.slug("!!!"), "my");
});
