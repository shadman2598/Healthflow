#!/usr/bin/env node
/**
 * Serve the static GitHub Pages export the same way production does:
 *   http://localhost:4173/Healthflow/
 *
 * Usage:
 *   node scripts/preview-pages.cjs           # serve existing apps/web/out
 *   node scripts/preview-pages.cjs --build   # build then serve
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "apps/web");
const OUT = path.join(WEB, "out");
const REPO = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthflow";
const BASE = `/${REPO}`;
const PORT = Number(process.env.PAGES_PREVIEW_PORT ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json"
};

function buildPages() {
  const backup = path.join(ROOT, ".ci-tmp", "pages-preview-backup");
  fs.mkdirSync(backup, { recursive: true });

  const moves = [
    ["apps/web/src/app/api", path.join(backup, "api")],
    ["apps/web/src/app/appointments/[id]", path.join(backup, "appointments-id")],
    ["apps/web/src/app/patients/[id]", path.join(backup, "patients-id")]
  ];

  const moved = [];
  for (const [fromRel, toAbs] of moves) {
    const fromAbs = path.join(ROOT, fromRel);
    if (fs.existsSync(fromAbs)) {
      fs.renameSync(fromAbs, toAbs);
      moved.push([fromAbs, toAbs]);
    }
  }

  try {
    // Prefer a fresh `out/` directory. If macOS locks files (EPERM), move aside.
    if (fs.existsSync(OUT)) {
      try {
        fs.rmSync(OUT, { recursive: true, force: true });
      } catch {
        const stale = `${OUT}.stale-${Date.now()}`;
        fs.renameSync(OUT, stale);
        console.warn(`Could not delete out/; moved to ${path.basename(stale)}`);
      }
    }
    const result = spawnSync("npm", ["run", "build:pages"], {
      cwd: WEB,
      env: {
        ...process.env,
        GITHUB_PAGES: "true",
        NEXT_PUBLIC_GITHUB_PAGES: "true",
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY ?? "shadman2598/Healthflow"
      },
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  } finally {
    for (const [fromAbs, toAbs] of moved) {
      if (fs.existsSync(toAbs) && !fs.existsSync(fromAbs)) {
        fs.renameSync(toAbs, fromAbs);
      }
    }
  }
}

function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (pathname === "/") {
    return { redirect: `${BASE}/` };
  }
  if (pathname === BASE || pathname === `${BASE}/`) {
    pathname = "/index.html";
  } else if (pathname.startsWith(`${BASE}/`)) {
    pathname = pathname.slice(BASE.length);
  } else {
    return { missing: true };
  }

  const candidates = [];
  const abs = path.join(OUT, pathname.replace(/^\//, ""));
  candidates.push(abs);
  if (!path.extname(pathname)) {
    candidates.push(`${abs}.html`);
    candidates.push(path.join(abs, "index.html"));
  }

  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return { file };
    }
  }
  // SPA-style fallback for client routes
  const fallback = path.join(OUT, "404.html");
  if (fs.existsSync(fallback)) return { file: fallback, status: 404 };
  return { missing: true };
}

function serve() {
  if (!fs.existsSync(OUT)) {
    console.error(`Missing ${OUT}. Run with --build first.`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const result = resolveFile(req.url ?? "/");
    if (result.redirect) {
      res.writeHead(302, { Location: result.redirect });
      res.end();
      return;
    }
    if (result.missing || !result.file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Not found. Open http://localhost:${PORT}${BASE}/`);
      return;
    }
    const ext = path.extname(result.file).toLowerCase();
    res.writeHead(result.status ?? 200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(result.file).pipe(res);
  });

  server.listen(PORT, () => {
    console.log(`\nGitHub Pages preview (matches production basePath):\n  http://localhost:${PORT}${BASE}/\n`);
    console.log("This is a static export — same as https://shadman2598.github.io/Healthflow/");
    console.log("Guest browse + public integrations work in-browser.");
    console.log("For full clinic login locally, use: npm run dev  (API rewrite mode)\n");
  });
}

if (process.argv.includes("--build")) {
  buildPages();
}
serve();
