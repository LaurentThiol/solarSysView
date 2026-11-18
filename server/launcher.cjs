#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(__dirname, "manifest.json");

const tty = Boolean(process.stdout.isTTY);
const C = {
  reset: tty ? "\x1b[0m" : "",
  bold: tty ? "\x1b[1m" : "",
  dim: tty ? "\x1b[2m" : "",
  green: tty ? "\x1b[32m" : "",
  yellow: tty ? "\x1b[33m" : "",
  red: tty ? "\x1b[31m" : "",
  brass: tty ? "\x1b[38;5;180m" : "",
};

function parseArgs(argv) {
  const opts = {
    checkOnly: false,
    openBrowser: true,
    forceRebuild: false,
    port: Number(process.env.PORT) || 47120,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check" || arg === "-c") opts.checkOnly = true;
    else if (arg === "--no-open") opts.openBrowser = false;
    else if (arg === "--rebuild") opts.forceRebuild = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--port" && argv[i + 1]) {
      const p = Number(argv[i + 1]);
      if (Number.isInteger(p) && p > 0 && p < 65536) opts.port = p;
      i += 1;
    }
  }
  return opts;
}

function ok(msg) {
  console.log(`  ${C.green}✔${C.reset} ${msg}`);
}

function warn(msg) {
  console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
}

function fail(msg) {
  console.error(`  ${C.red}✖${C.reset} ${msg}`);
}

function step(index, total, title) {
  console.log(`\n${C.brass}[${index}/${total}]${C.reset} ${C.bold}${title}${C.reset}`);
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    buf,
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  };
}

function isValidJpeg(buf) {
  return buf.length > 16 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function isValidSvg(buf) {
  const head = buf.subarray(0, 256).toString("utf8").trim();
  return head.includes("<svg");
}

function newestMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath)) {
    if (entry === "dist" || entry === "node_modules" || entry.startsWith(".")) continue;
    const m = newestMtimeMs(path.join(targetPath, entry));
    if (m > newest) newest = m;
  }
  return newest;
}

function verifyDistBundle(distDir) {
  const indexHtml = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    return { valid: false, reason: "web/dist/index.html absent" };
  }
  const html = fs.readFileSync(indexHtml, "utf8");
  const refs = [];
  const pattern = /(?:src|href)="(\/assets\/[^"]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    refs.push(match[1]);
    match = pattern.exec(html);
  }
  if (refs.length === 0) {
    return { valid: false, reason: "aucun bundle JS/CSS référencé dans web/dist/index.html" };
  }
  for (const rel of refs) {
    const assetPath = path.join(distDir, rel.replace(/^\//, ""));
    if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size === 0) {
      return { valid: false, reason: `bundle manquant ou vide : web/dist${rel}` };
    }
  }
  return { valid: true, assetCount: refs.length, mtimeMs: fs.statSync(indexHtml).mtimeMs };
}

function runNpm(args) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const res = spawnSync(npmCmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return res.status === 0;
}

function httpGetJson(port, urlPath, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: urlPath, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, json: null });
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "0.0.0.0");
  });
}

async function findFreePort(startPort) {
  for (let p = startPort; p < startPort + 25; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  return startPort;
}

function canOpenBrowser() {
  if (process.env.CI === "true" || process.env.CI === "1") return false;
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

function openBrowser(url) {
  if (!canOpenBrowser()) return;
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => undefined);
  child.unref();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      [
        "Usage : ./planetes [options]",
        "",
        "Options :",
        "  --check, -c   Vérifie l'intégrité complète sans lancer le serveur",
        "  --rebuild     Force la recompilation de l'interface (npm run build)",
        "  --no-open     Ne pas ouvrir automatiquement le navigateur",
        "  --port <N>    Port HTTP (défaut : 47120)",
      ].join("\n"),
    );
    process.exit(0);
  }

  console.log(
    `${C.brass}✦${C.reset} ${C.bold}Planètes — Vérification d'intégrité de l'observatoire${C.reset}`,
  );

  if (!fs.existsSync(MANIFEST_PATH)) {
    fail("Manifeste introuvable : server/manifest.json");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const errors = [];
  const totalSteps = 6;

  // 1. Environnement Node.js
  step(1, totalSteps, "Environnement d'exécution");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < manifest.minNodeMajor) {
    errors.push(
      `Node.js v${process.versions.node} détecté ; version >= ${manifest.minNodeMajor} requise.`,
    );
    fail(`Node.js v${process.versions.node} trop ancien (>= ${manifest.minNodeMajor} requis)`);
  } else {
    ok(`Node.js v${process.versions.node} (${process.platform} ${process.arch})`);
  }

  // 2. Fichiers sources essentiels
  step(2, totalSteps, "Fichiers sources et configuration");
  let missingFiles = 0;
  for (const rel of manifest.requiredFiles) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
      missingFiles += 1;
      errors.push(`Fichier manquant ou vide : ${rel}`);
      fail(`Fichier manquant ou vide : ${rel}`);
    }
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    if (missingFiles === 0) {
      ok(`${manifest.requiredFiles.length} fichiers sources présents (${pkg.name}@${pkg.version})`);
    }
  } catch (err) {
    errors.push(`package.json invalide : ${err.message}`);
    fail(`package.json invalide : ${err.message}`);
  }

  // 3. Textures planétaires & icône (en-têtes binaires + SHA-256)
  step(3, totalSteps, "Textures planétaires et ressources graphiques");
  const assetEntries = Object.entries(manifest.assets);
  let exactHashes = 0;
  let customValid = 0;
  for (const [rel, expected] of assetEntries) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      errors.push(`Ressource manquante : ${rel}`);
      fail(`Ressource manquante : ${rel}`);
      continue;
    }
    const { buf, sha256 } = sha256File(full);
    const formatOk = rel.endsWith(".jpg") ? isValidJpeg(buf) : isValidSvg(buf);
    if (!formatOk) {
      errors.push(`Ressource corrompue (en-tête invalide) : ${rel}`);
      fail(`Ressource corrompue (en-tête invalide) : ${rel}`);
      continue;
    }
    if (sha256 === expected.sha256) {
      exactHashes += 1;
    } else {
      customValid += 1;
      warn(`Texture modifiée mais valide : ${rel}`);
    }
  }
  if (exactHashes === assetEntries.length) {
    ok(`${exactHashes}/${assetEntries.length} ressources intègres (empreintes SHA-256 conformes)`);
  } else if (exactHashes + customValid === assetEntries.length) {
    ok(`${exactHashes} ressources d'origine + ${customValid} personnalisée(s) valide(s)`);
  }

  // 4. Flux Node-RED
  step(4, totalSteps, "Flux Node-RED (flows/flows.json)");
  try {
    const flows = JSON.parse(fs.readFileSync(path.join(ROOT, "flows", "flows.json"), "utf8"));
    if (!Array.isArray(flows)) throw new Error("Le fichier des flux n'est pas un tableau JSON");
    const byId = new Map(flows.map((node) => [node.id, node]));
    let badNodes = 0;
    for (const [id, expectedType] of Object.entries(manifest.requiredFlowNodes)) {
      const node = byId.get(id);
      if (!node || node.type !== expectedType) {
        badNodes += 1;
        errors.push(`Nœud Node-RED manquant ou altéré : ${id} (attendu : ${expectedType})`);
        fail(`Nœud Node-RED manquant ou altéré : ${id}`);
      }
    }
    if (badNodes === 0) {
      ok(`${Object.keys(manifest.requiredFlowNodes).length} nœuds Node-RED vérifiés (horloge, WebSocket, catalogue, santé)`);
    }
  } catch (err) {
    errors.push(`flows/flows.json illisible : ${err.message}`);
    fail(`flows/flows.json illisible : ${err.message}`);
  }

  // 5. Dépendances npm & auto-test des éphémérides
  step(5, totalSteps, "Dépendances et moteur d'éphémérides");
  const missingPkgs = manifest.requiredPackages.filter((pkgName) => {
    try {
      require.resolve(pkgName, { paths: [ROOT] });
      return false;
    } catch {
      return true;
    }
  });
  if (missingPkgs.length > 0) {
    if (opts.checkOnly) {
      errors.push(`Dépendances npm manquantes : ${missingPkgs.join(", ")} (lancez npm install)`);
      fail(`Dépendances manquantes : ${missingPkgs.join(", ")}`);
    } else {
      warn(`Dépendances manquantes (${missingPkgs.join(", ")}) — installation automatique…`);
      if (!runNpm(["install"])) {
        errors.push("Échec de npm install");
        fail("Échec de l'installation des dépendances npm");
      } else {
        ok("Dépendances npm installées");
      }
    }
  } else {
    ok(`Modules requis présents (${manifest.requiredPackages.join(", ")})`);
  }

  if (errors.length === 0) {
    try {
      const solar = require(path.join(ROOT, "ephemeris", "solar.js"));
      const cat = solar.catalog();
      const ids = cat.bodies.map((b) => b.id);
      const missingBodies = manifest.requiredBodies.filter((id) => !ids.includes(id));
      const sample = solar.positions(solar.J2000);
      const hasNaN = sample.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          !Number.isFinite(p.z) ||
          !Number.isFinite(p.rAu) ||
          !Number.isFinite(p.speedKmS),
      );
      if (missingBodies.length > 0 || hasNaN) {
        errors.push("Catalogue ou positions invalides dans ephemeris/solar.js");
        fail("Catalogue ou positions invalides dans ephemeris/solar.js");
      } else {
        const testRes = spawnSync(
          process.execPath,
          ["--test", path.join(ROOT, "ephemeris", "solar.test.cjs")],
          { cwd: ROOT, encoding: "utf8" },
        );
        if (testRes.status !== 0) {
          errors.push("Les tests unitaires d'éphémérides ont échoué");
          fail("Échec des tests d'éphémérides :\n" + (testRes.stderr || testRes.stdout));
        } else {
          ok(`Éphémérides intègres (${ids.length} astres et engins, tests unitaires validés)`);
        }
      }
    } catch (err) {
      errors.push(`Erreur lors du chargement de ephemeris/solar.js : ${err.message}`);
      fail(`Erreur dans ephemeris/solar.js : ${err.message}`);
    }
  }

  // 6. Build front-end (web/dist)
  step(6, totalSteps, "Interface compilée (web/dist)");
  const distDir = path.join(ROOT, "web", "dist");
  const sourceNewest = Math.max(
    newestMtimeMs(path.join(ROOT, "web", "src")),
    newestMtimeMs(path.join(ROOT, "web", "index.html")),
    newestMtimeMs(path.join(ROOT, "web", "vite.config.ts")),
    newestMtimeMs(path.join(ROOT, "ephemeris", "solar.js")),
  );
  let distCheck = verifyDistBundle(distDir);
  const isStale = distCheck.valid && distCheck.mtimeMs < sourceNewest;

  if (!distCheck.valid || isStale || opts.forceRebuild) {
    if (opts.checkOnly) {
      if (!distCheck.valid) {
        warn(`Build absent ou incomplet (${distCheck.reason}) — sera compilé au lancement.`);
      } else if (isStale) {
        warn("Les sources sont plus récentes que web/dist — sera recompilé au lancement.");
      }
    } else if (errors.length === 0) {
      const reason = opts.forceRebuild
        ? "recompilation demandée (--rebuild)"
        : !distCheck.valid
          ? distCheck.reason
          : "sources modifiées depuis le dernier build";
      warn(`Compilation Vite nécessaire (${reason})…`);
      if (!runNpm(["run", "build"])) {
        errors.push("Échec de la compilation Vite (npm run build)");
        fail("Échec de npm run build");
      } else {
        distCheck = verifyDistBundle(distDir);
        if (!distCheck.valid) {
          errors.push(`Build invalide après compilation : ${distCheck.reason}`);
          fail(`Build invalide : ${distCheck.reason}`);
        } else {
          ok(`Interface compilée et vérifiée (${distCheck.assetCount} bundles actifs)`);
        }
      }
    }
  } else {
    ok(`Build à jour et complet (${distCheck.assetCount} bundles vérifiés)`);
  }

  if (errors.length > 0) {
    console.error(
      `\n${C.red}${C.bold}Arrêt : ${errors.length} contrôle(s) d'intégrité en échec.${C.reset}`,
    );
    process.exit(1);
  }

  console.log(`\n${C.green}${C.bold}✔ Intégrité validée.${C.reset}`);
  if (opts.checkOnly) {
    process.exit(0);
  }

  // Vérifie si l'observatoire tourne déjà sur le port cible
  let port = opts.port;
  const existing = await httpGetJson(port, "/api/health");
  if (existing && existing.status === 200 && existing.json && existing.json.ok === true) {
    const url = `http://127.0.0.1:${port}`;
    console.log(`${C.brass}✦${C.reset} Planètes est déjà en cours d'exécution sur ${C.bold}${url}${C.reset}`);
    if (opts.openBrowser) openBrowser(url);
    process.exit(0);
  }

  if (!(await isPortFree(port))) {
    const nextPort = await findFreePort(port + 1);
    warn(`Le port ${port} est occupé par un autre programme ; bascule sur le port ${nextPort}.`);
    port = nextPort;
  }

  console.log(`${C.dim}Démarrage de Node-RED et de l'observatoire sur le port ${port}…${C.reset}\n`);
  const env = {
    ...process.env,
    ENABLE_NODE_RED_EDITOR: process.env.ENABLE_NODE_RED_EDITOR ?? "1",
  };
  if (port !== 47120 && !process.env.PORT) {
    // Attention : dans server/index.cjs, définir PORT désactive l'éditeur Node-RED comme sur un hébergement.
    // On ne passe PORT que si le port par défaut 47120 était indisponible.
    env.PORT = String(port);
  }

  const serverProc = spawn(process.execPath, [path.join(ROOT, "server", "index.cjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });

  const forwardSignal = (sig) => {
    if (!serverProc.killed) serverProc.kill(sig);
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  serverProc.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  // Attend que /api/health et /api/catalog répondent 200 avant d'ouvrir le navigateur
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const [health, catalog] = await Promise.all([
      httpGetJson(port, "/api/health", 800),
      httpGetJson(port, "/api/catalog", 800),
    ]);
    if (
      health?.status === 200 &&
      health.json?.ok === true &&
      catalog?.status === 200 &&
      Array.isArray(catalog.json?.bodies)
    ) {
      const url = `http://127.0.0.1:${port}`;
      console.log(
        `\n${C.green}✦ Prêt :${C.reset} ${C.bold}${url}${C.reset} (${catalog.json.bodies.length} objets chargés — Ctrl+C pour arrêter)\n`,
      );
      if (opts.openBrowser) openBrowser(url);
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
}

main().catch((err) => {
  fail(`Erreur inattendue du lanceur : ${err.message}`);
  process.exit(1);
});
