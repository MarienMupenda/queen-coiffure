const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT_DIR = __dirname;

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const infos of Object.values(interfaces)) {
    for (const info of infos || []) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }

  return "127.0.0.1";
}

function getPublicOrigin() {
  const explicit = String(process.env.PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");

  if (explicit) {
    return explicit;
  }

  return `http://${getLocalIpAddress()}:${PORT}`;
}

const publicOrigin = getPublicOrigin();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function resolveSafePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[\\/])+/, "");
  const absolutePath = path.resolve(ROOT_DIR, `.${normalizedPath}`);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return absolutePath;
}

function serveFile(filePath, res) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);

  stream.on("error", () => {
    send(res, 500, "Erreur de lecture du fichier.");
  });

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });

  stream.pipe(res);
}

function serveIndex(res) {
  const indexPath = path.join(ROOT_DIR, "index.html");

  fs.readFile(indexPath, "utf8", (error, html) => {
    if (error) {
      send(res, 500, "Impossible de charger index.html.");
      return;
    }

    const finalHtml = html.replace(/__APP_ORIGIN__/g, publicOrigin);

    send(res, 200, finalHtml, "text/html; charset=utf-8");
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    send(res, 400, "Requête invalide.");
    return;
  }

  const requestUrl = new URL(req.url, publicOrigin);
  const pathname = requestUrl.pathname;

  if (pathname === "/health") {
    send(res, 200, "ok");
    return;
  }

  const safePath = resolveSafePath(pathname);

  if (!safePath) {
    send(res, 403, "Accès refusé.");
    return;
  }

  let filePath = safePath;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(filePath, res);
    return;
  }

  if (!path.extname(path.basename(pathname))) {
    serveIndex(res);
    return;
  }

  send(res, 404, "Fichier introuvable.");
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server reachable on ${publicOrigin}`);
  console.log(`Open the salon app on your phone with: ${publicOrigin}/`);
});

