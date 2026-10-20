import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(fileURLToPath(new URL("../web", import.meta.url)));
const port = Number(process.env.WEB_PORT || 5173);
const host = process.env.WEB_HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' http://localhost:3000 ws://localhost:3000 http://127.0.0.1:3000 ws://127.0.0.1:3000 https://familygame.wisp.uno wss://familygame.wisp.uno",
  "font-src 'self'",
  "object-src 'none'",
].join("; ");

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...headers,
  });
  res.end(body);
}

async function fileForPath(pathname) {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";

  if (
    cleanPath === "/" ||
    cleanPath === "/game" ||
    /^\/g\/[a-z0-9]{5}$/i.test(cleanPath)
  ) {
    return path.join(webRoot, "index.html");
  }
  if (
    cleanPath === "/admin" ||
    /^\/admin\/(room|playlist|session|live|content|config|settings)$/.test(
      cleanPath,
    )
  ) {
    return path.join(webRoot, "admin.html");
  }

  let relative = cleanPath;
  let absolute = path.resolve(webRoot, `.${relative}`);
  if (absolute !== webRoot && !absolute.startsWith(`${webRoot}${path.sep}`)) {
    return null;
  }

  try {
    const info = await stat(absolute);
    if (info.isDirectory()) {
      absolute = path.join(absolute, "index.html");
    }
    return absolute;
  } catch {
    if (!path.extname(absolute)) {
      const htmlPath = `${absolute}.html`;
      try {
        const info = await stat(htmlPath);
        if (info.isFile()) return htmlPath;
      } catch {
        // Fall through to 404.
      }
    }
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(res, 400, "Bad request", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const file = await fileForPath(pathname);
  if (!file) {
    try {
      const page = await readFile(path.join(webRoot, "404.html"));
      send(res, 404, req.method === "HEAD" ? "" : page, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(page.byteLength),
      });
    } catch {
      send(res, 404, "Not found", {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }
    return;
  }

  try {
    const data = await readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    send(res, 200, req.method === "HEAD" ? "" : data, {
      "Content-Type": type,
      "Content-Length": String(data.byteLength),
    });
  } catch {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
});

server.listen(port, host, () => {
  console.log(`Family Game web preview: http://localhost:${port}`);
  console.log(`Serving ${webRoot}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
