const state = {
  live: false,
  snapshot: null,
  numbers: new Set(),
  stars: new Set(),
  historyOffset: 0,
  historyTotal: 0,
  era: "current",
};

const $ = (id) => document.getElementById(id);

function ball(n, { star = false, hit = false, small = false } = {}) {
  const el = document.createElement("span");
  el.className = `ball${star ? " star" : ""}${hit ? " hit" : ""}${small ? " small" : ""}`;
  el.textContent = n;
  return el;
}

function fillBalls(container, values, opts = {}) {
  container.innerHTML = "";
  for (const n of values) container.appendChild(ball(n, opts));
}

function weekdayFr(value) {
  if (!value) return "";
  const map = { MARDI: "Mardi", VENDREDI: "Vendredi" };
  return map[value] || value;
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

async function tryLive(path, options) {
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function boot() {
  buildPickers();
  try {
    const health = await tryLive("/health");
    state.live = true;
    $("mode-badge").textContent = `Live Neon · ${health.draws} tirages`;
    $("mode-badge").classList.add("live");
    $("btn-sync").hidden = false;
    $("btn-quit").hidden = false;
    $("grids-mode").textContent = "Stockées dans Neon.";
    await refreshFromLive();
  } catch {
    const snap = await fetch("snapshot.json").then((r) => (r.ok ? r.json() : null));
    if (!snap) {
      $("status").textContent =
        "Pas de base connectée et pas de snapshot. En local : python -m synchro sync && python -m synchro serve";
      $("mode-badge").textContent = "Hors ligne";
      return;
    }
    state.snapshot = snap;
    $("mode-badge").textContent = `Snapshot Netlify · ${snap.total} tirages`;
    $("mode-badge").classList.add("snapshot");
    $("grids-mode").textContent = "Stockées dans ce navigateur (déploiement statique).";
    renderLatest(snap.latest);
    renderHistory(snap.draws.slice(0, 50), snap.total);
    renderStats(snap.stats_current);
    renderGrids(loadLocalGrids());
    $("status").textContent = `Exporté le ${formatDate(snap.exported_at)} — relancez un déploiement Netlify pour rafraîchir.`;
  }
}

async function refreshFromLive() {
  const latest = await tryLive("/draws/latest").catch(() => null);
  const hist = await tryLive("/draws?limit=50&offset=0");
  const stats = await tryLive(`/stats?era=${state.era}`);
  const grids = await tryLive("/grids");
  renderLatest(latest);
  renderHistory(hist.items, hist.total);
  renderStats(stats);
  renderGrids(grids.items);
  $("status").textContent = latest
    ? `Dernier tirage synchronisé : ${weekdayFr(latest.weekday)} ${formatDate(latest.draw_date)}.`
    : "Base vide — cliquez sur Synchroniser FDJ.";
}

function formatEuro(value) {
  if (value == null || value === "") return "n.d.";
  const n = Number(value);
  if (!Number.isFinite(n)) return "n.d.";
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function jackpotLabel(draw) {
  const rank1 = (draw.prizes || []).find((tier) => Number(tier.rank) === 1);
  const prize = rank1 ? rank1.prize : draw.prize_rank1;
  const winners = rank1
    ? rank1.winners_eu ?? rank1.winners_fr
    : draw.winners_rank1_eu ?? draw.winners_rank1_fr;
  if (prize == null || prize === "") return "Report / n.d.";
  const n = Number(prize);
  if (n === 0 && (!winners || Number(winners) === 0)) return "Report";
  return formatEuro(n);
}

function winnerTotals(draw) {
  if (draw.winners_total_fr != null || draw.winners_total_eu != null) {
    return { fr: draw.winners_total_fr, eu: draw.winners_total_eu };
  }
  let fr = 0;
  let eu = 0;
  let hasFr = false;
  let hasEu = false;
  for (const tier of draw.prizes || []) {
    if (tier.winners_fr != null && tier.winners_fr !== "") {
      hasFr = true;
      fr += Number(tier.winners_fr);
    }
    if (tier.winners_eu != null && tier.winners_eu !== "") {
      hasEu = true;
      eu += Number(tier.winners_eu);
    }
  }
  return { fr: hasFr ? fr : null, eu: hasEu ? eu : null };
}

function formatWinnerTotals(draw) {
  const { fr, eu } = winnerTotals(draw);
  const fmt = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("fr-FR"));
  if (fr == null && eu == null) return "—";
  if (fr == null) return `${fmt(eu)} EU`;
  if (eu == null) return `${fmt(fr)} FR`;
  return `${fmt(fr)} FR · ${fmt(eu)} EU`;
}

function renderLatest(draw) {
  if (!draw) {
    $("latest-date").textContent = "Aucun tirage";
    $("latest-balls").innerHTML = "";
    $("latest-facts").innerHTML = "";
    return;
  }
  $("latest-date").textContent = `${weekdayFr(draw.weekday)} ${formatDate(draw.draw_date)}`;
  const wrap = $("latest-balls");
  wrap.innerHTML = "";
  for (const n of draw.numbers) wrap.appendChild(ball(n));
  for (const s of draw.stars) wrap.appendChild(ball(s, { star: true }));
  const prizes = Array.isArray(draw.prizes) ? draw.prizes : [];
  const ladder = prizes
    .map(
      (tier) =>
        `<div><dt>Rang ${tier.rank}</dt><dd>${formatEuro(tier.prize)} · ${tier.winners_eu ?? "—"} EU / ${tier.winners_fr ?? "—"} FR</dd></div>`
    )
    .join("");
  $("latest-facts").innerHTML = `
    <div><dt>Gagnants FR+EU</dt><dd>${formatWinnerTotals(draw)}</dd></div>
    <div><dt>Gagnants rang 1 (EU)</dt><dd>${draw.winners_rank1_eu ?? "—"}</dd></div>
    <div><dt>Gagnants rang 1 (FR)</dt><dd>${draw.winners_rank1_fr ?? "—"}</dd></div>
    <div><dt>Rapport rang 1</dt><dd>${jackpotLabel(draw)}</dd></div>
    <div><dt>My Million</dt><dd>${draw.my_million || "—"}</dd></div>
    ${ladder}
  `;
}

function renderHistory(items, total) {
  state.historyTotal = total;
  const body = $("history-body");
  if (state.historyOffset === 0) body.innerHTML = "";
  for (const draw of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${formatDate(draw.draw_date)}</td>
      <td>${weekdayFr(draw.weekday)}</td>
      <td>${draw.numbers.map((n) => String(n).padStart(2, "0")).join(" · ")}</td>
      <td>${draw.stars.map((n) => String(n).padStart(2, "0")).join(" · ")}</td>
      <td>${formatWinnerTotals(draw)}</td>`;
    body.appendChild(tr);
  }
  $("history-count").textContent = `${body.children.length} / ${total} tirages`;
}

function heatColor(count, max) {
  if (!max) return "var(--bg)";
  const t = count / max;
  const a = 0.12 + t * 0.75;
  return `rgba(224, 184, 77, ${a})`;
}

function renderStats(stats) {
  if (!stats || !stats.draw_count) {
    $("stats-summary").textContent = "Pas encore de statistiques.";
    return;
  }
  $("stats-summary").textContent =
    `${stats.draw_count} tirages du ${formatDate(stats.from_date)} au ${formatDate(stats.to_date)} · somme moyenne ${stats.sum.avg}`;
  const hot = $("hot-numbers");
  hot.innerHTML = "";
  for (const n of stats.hottest_numbers) hot.appendChild(ball(n.value, { small: true }));
  const overdue = $("cold-numbers");
  overdue.innerHTML = "";
  for (const n of stats.overdue_numbers) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = `${n.value} · ${n.delay_days} j · ${n.count}×`;
    overdue.appendChild(chip);
  }
  const stars = $("hot-stars");
  stars.innerHTML = "";
  for (const s of stats.hottest_stars) stars.appendChild(ball(s.value, { star: true, small: true }));

  const maxN = Math.max(...stats.numbers.map((x) => x.count), 1);
  const freqN = $("freq-numbers");
  freqN.innerHTML = "";
  for (const n of stats.numbers) {
    const el = document.createElement("div");
    el.className = "heat-item";
    el.style.background = heatColor(n.count, maxN);
    el.innerHTML = `<strong>${n.value}</strong><br>${n.count}`;
    freqN.appendChild(el);
  }
  const maxS = Math.max(...stats.stars.map((x) => x.count), 1);
  const freqS = $("freq-stars");
  freqS.innerHTML = "";
  freqS.style.gridTemplateColumns = `repeat(${stats.stars.length}, minmax(0, 1fr))`;
  for (const s of stats.stars) {
    const el = document.createElement("div");
    el.className = "heat-item";
    el.style.background = heatColor(s.count, maxS);
    el.innerHTML = `<strong>★ ${s.value}</strong><br>${s.count}`;
    freqS.appendChild(el);
  }
}

function renderGrids(items) {
  const root = $("grids-list");
  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = `<p class="muted">Aucune grille. Composez-en une dans l’onglet Dernier tirage.</p>`;
    return;
  }
  for (const grid of items) {
    const el = document.createElement("div");
    el.className = "grid-item";
    const balls = document.createElement("div");
    balls.className = "balls";
    for (const n of grid.numbers) balls.appendChild(ball(n, { small: true }));
    for (const s of grid.stars) balls.appendChild(ball(s, { star: true, small: true }));
    const right = document.createElement("div");
    right.innerHTML = `<div>${grid.label || "Grille"}</div>`;
    const del = document.createElement("button");
    del.className = "btn";
    del.textContent = "Supprimer";
    del.addEventListener("click", () => removeGrid(grid));
    right.appendChild(del);
    el.appendChild(balls);
    el.appendChild(right);
    root.appendChild(el);
  }
}

function buildPickers() {
  const nums = $("picker-numbers");
  const stars = $("picker-stars");
  nums.innerHTML = "";
  stars.innerHTML = "";
  for (let i = 1; i <= 50; i += 1) nums.appendChild(pickButton(i, "numbers"));
  for (let i = 1; i <= 12; i += 1) stars.appendChild(pickButton(i, "stars"));
}

function pickButton(value, kind) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pick";
  btn.textContent = value;
  btn.addEventListener("click", () => togglePick(kind, value, btn));
  return btn;
}

function togglePick(kind, value, btn) {
  const set = kind === "numbers" ? state.numbers : state.stars;
  const max = kind === "numbers" ? 5 : 2;
  if (set.has(value)) {
    set.delete(value);
    btn.classList.remove("is-on");
    return;
  }
  if (set.size >= max) return;
  set.add(value);
  btn.classList.add("is-on");
}

function selectedGrid() {
  return {
    numbers: [...state.numbers].sort((a, b) => a - b),
    stars: [...state.stars].sort((a, b) => a - b),
  };
}

async function onCheck() {
  const grid = selectedGrid();
  if (grid.numbers.length !== 5 || grid.stars.length !== 2) {
    $("check-result").innerHTML = `<div class="result lose">Choisissez 5 numéros et 2 étoiles.</div>`;
    return;
  }
  const lastN = Number($("check-n").value);
  let results;
  if (state.live) {
    const payload = await tryLive("/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...grid, last_n: lastN }),
    });
    results = payload.results;
  } else {
    const draws = (state.snapshot?.draws || []).slice(0, lastN);
    results = draws.map((draw) => evaluateLocal(grid, draw));
  }
  $("check-result").innerHTML = results
    .map((r) => {
      const win = r.rank != null;
      return `<div class="result ${win ? "win" : "lose"}">
        <strong>${formatDate(r.draw_date)}</strong> — ${r.label}
        (${r.matched_numbers} n° + ${r.matched_stars} ★)
      </div>`;
    })
    .join("");
}

function evaluateLocal(grid, draw) {
  const n = grid.numbers.filter((x) => draw.numbers.includes(x)).length;
  const s = grid.stars.filter((x) => draw.stars.includes(x)).length;
  const table = {
    "5-2": 1, "5-1": 2, "5-0": 3, "4-2": 4, "4-1": 5, "3-2": 6, "4-0": 7,
    "2-2": 8, "3-1": 9, "3-0": 10, "1-2": 11, "2-1": 12, "2-0": 13,
  };
  const rank = table[`${n}-${s}`] || null;
  const labels = {
    1: "5 numéros + 2 étoiles", 2: "5 numéros + 1 étoile", 3: "5 numéros",
    4: "4 numéros + 2 étoiles", 5: "4 numéros + 1 étoile", 6: "3 numéros + 2 étoiles",
    7: "4 numéros", 8: "2 numéros + 2 étoiles", 9: "3 numéros + 1 étoile",
    10: "3 numéros", 11: "1 numéro + 2 étoiles", 12: "2 numéros + 1 étoile", 13: "2 numéros",
  };
  return {
    draw_date: draw.draw_date,
    matched_numbers: n,
    matched_stars: s,
    rank,
    label: rank ? labels[rank] : "Pas de gain",
  };
}

function loadLocalGrids() {
  try {
    return JSON.parse(localStorage.getItem("synchro.grids") || "[]");
  } catch {
    return [];
  }
}

function saveLocalGrids(items) {
  localStorage.setItem("synchro.grids", JSON.stringify(items));
}

async function onSave() {
  const grid = selectedGrid();
  if (grid.numbers.length !== 5 || grid.stars.length !== 2) return;
  const label = `Grille ${formatDate(new Date().toISOString())}`;
  if (state.live) {
    await tryLive("/grids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, ...grid }),
    });
    const grids = await tryLive("/grids");
    renderGrids(grids.items);
  } else {
    const items = loadLocalGrids();
    items.unshift({ id: Date.now(), label, ...grid });
    saveLocalGrids(items);
    renderGrids(items);
  }
}

async function removeGrid(grid) {
  if (state.live) {
    await tryLive(`/grids/${grid.id}`, { method: "DELETE" });
    const grids = await tryLive("/grids");
    renderGrids(grids.items);
  } else {
    const items = loadLocalGrids().filter((g) => g.id !== grid.id);
    saveLocalGrids(items);
    renderGrids(items);
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    $(`tab-${tab.dataset.tab}`).classList.add("is-active");
  });
});

$("btn-check").addEventListener("click", onCheck);
$("btn-save").addEventListener("click", onSave);
$("btn-sync").addEventListener("click", async () => {
  $("btn-sync").disabled = true;
  $("status").textContent = "Téléchargement des archives FDJ…";
  try {
    const result = await tryLive("/sync", { method: "POST" });
    $("status").textContent = `Synchro OK · ${result.fetched} tirages.`;
    state.historyOffset = 0;
    await refreshFromLive();
  } catch (err) {
    $("status").textContent = String(err.message || err);
  } finally {
    $("btn-sync").disabled = false;
  }
});

$("btn-quit").addEventListener("click", async () => {
  if ($("btn-quit").disabled) return;
  if (!window.confirm("Quitter Synchro ? L’API et l’interface vont s’arrêter.")) return;
  $("btn-quit").disabled = true;
  $("btn-quit").textContent = "Arrêt…";
  $("status").textContent = "Arrêt du programme…";
  try {
    await tryLive("/shutdown", { method: "POST" });
  } catch {
    // le serveur peut déjà être coupé
  }
  document.body.innerHTML = `<main class="panel is-active" style="padding:48px 24px;text-align:center">
    <h1>Synchro est arrêté</h1>
    <p class="muted">Vous pouvez fermer cet onglet.</p>
  </main>`;
});

$("stats-era").addEventListener("change", async (ev) => {
  state.era = ev.target.value;
  if (state.live) renderStats(await tryLive(`/stats?era=${state.era}`));
  else renderStats(state.era === "all" ? state.snapshot.stats_all : state.snapshot.stats_current);
});

async function loadLab() {
  const era = $("lab-era").value;
  const name = $("lab-var").value;
  const win = $("lab-window").value;
  $("lab-summary").textContent = "Calcul…";
  try {
    let lab;
    if (state.live) {
      lab = await tryLive(
        `/analysis/lab?era=${encodeURIComponent(era)}&name=${encodeURIComponent(name)}&window=${win}&n_sim=200`
      );
    } else {
      lab = state.snapshot?.analysis_current;
      if (!lab) throw new Error("Pas de laboratoire dans le snapshot.");
    }
    renderLab(lab);
  } catch (err) {
    $("lab-summary").textContent = String(err.message || err);
    $("lab-candles").innerHTML = "";
    $("lab-ranks").innerHTML = "";
  }
}

function renderLab(lab) {
  if (!lab) return;
  const roll = lab.rolling || {};
  const ta = lab.ta || {};
  const taLast = ta.last || null;
  $("lab-summary").textContent =
    `${lab.draw_count} tirages ${lab.from_date} → ${lab.to_date} · ` +
    `moyenne fenêtre ${roll.mean ?? "—"} · z ${roll.zscore ?? "—"} · couverture ${roll.coverage ?? "—"}/50` +
    (taLast
      ? ` · SMA ${taLast.sma ?? "—"} · RSI ${taLast.rsi ?? "—"} · MACD ${taLast.macd ?? "—"} · ATR ${taLast.atr ?? "—"}`
      : "") +
    `. ${lab.disclaimer || ""} ${ta.disclaimer || ""}`;
  const candles = (lab.ohlc && lab.ohlc.candles) || [];
  const max = Math.max(...candles.map((c) => c.h), 1);
  const box = $("lab-candles");
  box.innerHTML = "";
  for (const c of candles.slice(-48)) {
    const el = document.createElement("div");
    el.className = "candle";
    el.style.height = `${Math.max(4, (c.c / max) * 72)}px`;
    el.title = `${c.key} O${c.o} H${c.h} L${c.l} C${c.c}`;
    box.appendChild(el);
  }
  const ranks = (lab.proba && lab.proba.ranks) || [];
  const chi = lab.inference && lab.inference.chi_square;
  const mc = lab.montecarlo && lab.montecarlo.max_frequency;
  $("lab-ranks").innerHTML = `
    <p class="muted">${chi ? `χ² = ${Number(chi.stat).toFixed(1)} (p≈${Number(chi.pvalue).toFixed(3)})` : ""}
    ${mc ? ` · fréquence max observée ${mc.observed}, P(≥obs) ${Number(mc.p_ge_observed).toFixed(2)}` : ""}</p>
    <table class="lab-table"><thead><tr><th>Rang</th><th>Libellé</th><th>P</th></tr></thead>
    <tbody>${ranks.slice(0, 8).map((r) => `<tr><td>${r.rank ?? "—"}</td><td>${r.label}</td><td>${Number(r.p).toExponential(2)}</td></tr>`).join("")}</tbody></table>
  `;
}

$("btn-lab").addEventListener("click", loadLab);

$("btn-more").addEventListener("click", async () => {
  if (state.live) {
    state.historyOffset += 50;
    const hist = await tryLive(`/draws?limit=50&offset=${state.historyOffset}&q=${encodeURIComponent($("history-q").value)}`);
    renderHistory(hist.items, hist.total);
  } else {
    const q = $("history-q").value.trim();
    let draws = state.snapshot.draws;
    if (q) draws = draws.filter((d) => JSON.stringify(d).includes(q));
    state.historyOffset += 50;
    const next = draws.slice(state.historyOffset, state.historyOffset + 50);
    renderHistory(next, draws.length);
  }
});

let searchTimer;
$("history-q").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.historyOffset = 0;
    const q = $("history-q").value.trim();
    if (state.live) {
      const hist = await tryLive(`/draws?limit=50&offset=0&q=${encodeURIComponent(q)}`);
      renderHistory(hist.items, hist.total);
    } else {
      const draws = q
        ? state.snapshot.draws.filter((d) => JSON.stringify(d).toLowerCase().includes(q.toLowerCase()))
        : state.snapshot.draws;
      renderHistory(draws.slice(0, 50), draws.length);
    }
  }, 250);
});

boot();
