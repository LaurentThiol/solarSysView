"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const RED = require("node-red");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT) || 47120;
const host = "0.0.0.0";
const localFlag = process.env.PLANETES_LOCAL === "1";
const hosted = !localFlag && process.env.PORT != null && String(process.env.PORT).trim() !== "";
const enableEditor = process.env.ENABLE_NODE_RED_EDITOR === "1" && !hosted;
const canShutdown = !hosted;
const solar = require(path.join(root, "ephemeris", "solar.js"));

const app = express();
app.disable("x-powered-by");
const server = http.createServer(app);
const sockets = new Set();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

const settings = {
  httpAdminRoot: enableEditor ? "/red" : false,
  httpNodeRoot: "/api",
  userDir: path.join(root, ".node-red"),
  flowFile: path.join(root, "flows", "flows.json"),
  flowFilePretty: true,
  credentialSecret: false,
  functionGlobalContext: {
    solar,
    editorEnabled: enableEditor,
    shutdownEnabled: canShutdown,
  },
  uiHost: host,
  uiPort: port,
  logging: {
    console: {
      level: "info",
      metrics: false,
      audit: false,
    },
  },
  editorTheme: {
    projects: { enabled: false },
    tours: false,
    page: { title: "Système solaire — Node-RED" },
    header: { title: "Système solaire" },
  },
};

RED.init(server, settings);

let shuttingDown = false;

async function gracefulShutdown(source) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n✦ Arrêt propre de Node-RED et de l'observatoire (${source})…`);
  const forceTimer = setTimeout(() => {
    process.exit(0);
  }, 4000);
  forceTimer.unref();

  try {
    await RED.stop();
  } catch (error) {
    console.error("Erreur lors de l'arrêt de Node-RED :", error);
  }

  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }
  const destroyTimer = setTimeout(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
  }, 250);
  destroyTimer.unref();

  server.close(() => {
    console.log("✔ Observatoire et Node-RED arrêtés proprement.");
    process.exit(0);
  });
}

process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));

app.post("/api/shutdown", (req, res) => {
  if (!canShutdown) {
    res.status(403).json({ ok: false, error: "Arrêt distant désactivé sur cet hébergement." });
    return;
  }
  if (req.get("x-solar-shutdown") !== "1") {
    res.status(400).json({ ok: false, error: "Confirmation d'arrêt manquante." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.set("Connection", "close");
  res.status(200).json({ ok: true });
  res.once("finish", () => {
    setTimeout(() => void gracefulShutdown("interface"), 60);
  });
});

app.use("/api", RED.httpNode);

if (enableEditor) {
  app.use("/red", RED.httpAdmin);
} else {
  const disabled = (_req, res) => {
    res
      .status(404)
      .type("text/plain; charset=utf-8")
      .send("Éditeur Node-RED désactivé sur cet hébergement.");
  };
  app.get("/red", disabled);
  app.get("/red/*", disabled);
}

const dist = path.join(root, "web", "dist");
app.use(express.static(dist, { index: false, fallthrough: true }));
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/red")) return next();
  if (path.extname(req.path)) return next();
  const index = path.join(dist, "index.html");
  if (!fs.existsSync(index)) {
    res
      .status(503)
      .type("text/plain; charset=utf-8")
      .send("Interface absente. Lancez npm start, ou npm run dev puis ouvrez le port 47121.");
    return;
  }
  res.sendFile(index);
});

server.listen(port, host, () => {
  console.log(`Observatoire  http://127.0.0.1:${port}`);
  if (enableEditor) console.log(`Éditeur Node-RED  http://127.0.0.1:${port}/red`);
});

RED.start().catch((error) => {
  console.error(error);
  process.exit(1);
});
