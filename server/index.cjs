"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const RED = require("node-red");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT) || 47120;
const host = "0.0.0.0";
const hosted = process.env.PORT != null && String(process.env.PORT).trim() !== "";
const enableEditor = process.env.ENABLE_NODE_RED_EDITOR === "1" && !hosted;
const solar = require(path.join(root, "ephemeris", "solar.js"));

const app = express();
app.disable("x-powered-by");
const server = http.createServer(app);

const settings = {
  httpAdminRoot: enableEditor ? "/red" : false,
  httpNodeRoot: "/api",
  userDir: path.join(root, ".node-red"),
  flowFile: path.join(root, "flows", "flows.json"),
  flowFilePretty: true,
  functionGlobalContext: {
    solar,
    editorEnabled: enableEditor,
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
