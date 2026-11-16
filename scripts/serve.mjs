#!/usr/bin/env node
// Tiny static server for running Signoff locally. No dependencies.
//   npm start                 -> http://localhost:5173
//   PORT=8080 npm start       -> pick a port
//   HOST=0.0.0.0 npm start    -> open it to other devices on your network (your phone, say)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const HOST = process.env.HOST || "127.0.0.1";
const START_PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

// Same policy as the <meta> tag in index.html, plus frame-ancestors (header only).
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'"
].join("; ");

const HEADERS = {
  "Content-Security-Policy": CSP,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store"
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { ...HEADERS, "Content-Type": type });
  res.end(body);
}

async function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");

  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad request");
  }
  if (path.endsWith("/")) path += "index.html";

  // Never serve dot-files or dot-folders (.git, .trace, ...).
  if (path.split("/").some(part => part.startsWith("."))) return send(res, 404, "Not found");

  const file = resolve(join(ROOT, path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 404, "Not found");

  try {
    const info = await stat(file);
    if (!info.isFile()) return send(res, 404, "Not found");
    const body = await readFile(file);
    res.writeHead(200, { ...HEADERS, "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    send(res, 404, "Not found");
  }
}

function listen(port, triesLeft) {
  const server = createServer((req, res) => {
    handle(req, res).catch(() => send(res, 500, "Server error"));
  });
  server.once("error", err => {
    if (err.code === "EADDRINUSE" && triesLeft > 0 && !process.env.PORT) return listen(port + 1, triesLeft - 1);
    console.error(err.code === "EADDRINUSE" ? `Port ${port} is busy. Try PORT=8080 npm start` : err.message);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const shown = HOST === "0.0.0.0" || HOST === "127.0.0.1" ? "localhost" : HOST;
    let lines = `\n  Signoff is running at http://${shown}:${port}\n`;
    if (HOST === "0.0.0.0") {
      // Show the addresses a phone on the same Wi-Fi can open.
      const lan = Object.values(networkInterfaces()).flat()
        .filter(a => a && a.family === "IPv4" && !a.internal)
        .map(a => `http://${a.address}:${port}`);
      lines += lan.length
        ? `  On your network:  ${lan.join("  ")}\n`
        : "  On your network:  no network address found (are you on Wi-Fi?)\n";
    }
    console.log(lines + "  Press Ctrl+C to stop.\n");
  });
}

listen(START_PORT, 10);
