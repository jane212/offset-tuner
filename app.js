/* Offset tuner: same green shift as plot_corridor_green.py
   adj_start = round(offset - TT) mod C
*/

const GREEN = "#2CA02C";
const RED = "#D62728";

let DATA = null;
let planIndex = 0;
let offsets = {};
let baseline = {};

const planSelect = document.getElementById("plan");
const sliderBox = document.getElementById("sliders");
const canvas = document.getElementById("plot");
const ctx = canvas.getContext("2d");
const metaEl = document.getElementById("meta");
const metricsEl = document.getElementById("metrics");
const statusEl = document.getElementById("status");

function mod(a, n) {
  return ((a % n) + n) % n;
}

function plan() {
  return DATA.plans[planIndex];
}

function setStatus(text, err) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("err", !!err);
}

function loadPlan(index, keepStatus) {
  planIndex = index;
  const p = plan();
  baseline = {};
  offsets = {};
  p.signals.forEach((s) => {
    baseline[s.id] = s.offset;
    offsets[s.id] = s.offset;
  });
  buildSliders();
  render();
  if (!keepStatus) setStatus("");
}

function buildSliders() {
  const p = plan();
  const c = p.cycle;
  sliderBox.innerHTML = "";
  p.signals.forEach((s) => {
    const card = document.createElement("div");
    card.className = "slider";
    card.innerHTML = `
      <div class="name">${s.name}</div>
      <div class="val-row">
        <label class="val">offset=
          <input type="number" min="0" max="${c - 1}" step="1" value="${offsets[s.id]}" data-num="${s.id}" />s
        </label>
        <button type="button" class="icon-btn" data-reset="${s.id}" title="Reset this offset" aria-label="Reset ${s.name}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M12 6V2L7 7l5 5V8c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5H5c0 3.9 3.1 7 7 7s7-3.1 7-7-3.1-7-7-7z"/>
          </svg>
        </button>
      </div>
      <input type="range" min="0" max="${c - 1}" step="1" value="${offsets[s.id]}" data-id="${s.id}" />
      <div class="ends"><span>0</span><span>${c - 1}</span></div>
    `;
    const range = card.querySelector("input[type=range]");
    const num = card.querySelector("input[type=number]");
    const write = (raw, fromNumber) => {
      let v = Math.round(Number(raw));
      if (!Number.isFinite(v)) v = offsets[s.id];
      v = Math.max(0, Math.min(c - 1, v));
      offsets[s.id] = v;
      range.value = String(v);
      if (!fromNumber || String(v) !== String(raw)) num.value = String(v);
      render();
    };
    range.addEventListener("input", () => write(range.value, false));
    num.addEventListener("input", () => {
      if (num.value === "" || num.value === "-") return;
      write(num.value, true);
    });
    num.addEventListener("change", () => write(num.value === "" ? offsets[s.id] : num.value, false));
    card.querySelector("[data-reset]").addEventListener("click", () => write(baseline[s.id], false));
    sliderBox.appendChild(card);
  });
}

function greenIntervals(offset, greenLen, tt, cycle) {
  const c = cycle;
  const gl = Math.max(0, Math.min(greenLen, c));
  if (gl === 0) return [];
  const g0 = mod(Math.round(offset - tt), c);
  if (gl >= c) return [[0, c]];
  const end = g0 + gl;
  if (end <= c) return [[g0, end]];
  return [[g0, c], [0, end - c]];
}

function maskAt(offset, greenLen, tt, cycle) {
  const m = new Array(cycle).fill(false);
  greenIntervals(offset, greenLen, tt, cycle).forEach(([a, b]) => {
    for (let t = a; t < b; t++) m[t] = true;
  });
  return m;
}

function maxCircularRun(mask) {
  const n = mask.length;
  if (!n) return 0;
  if (mask.every(Boolean)) return n;
  if (!mask.some(Boolean)) return 0;
  let best = 0;
  let cur = 0;
  for (let i = 0; i < n * 2; i++) {
    if (mask[i % n]) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return Math.min(best, n);
}

function bandWidth(direction, off) {
  const p = plan();
  const use = off || offsets;
  const masks = p.signals.map((s) =>
    maskAt(
      use[s.id],
      direction === "SB" ? s.split6 : s.split2,
      direction === "SB" ? s.tt_sb : s.tt_nb,
      p.cycle
    )
  );
  const all = masks[0].map((_, t) => masks.every((m) => m[t]));
  return maxCircularRun(all);
}

function isGreenAt(t, offset, greenLen, cycle) {
  const g = Math.max(0, Math.min(greenLen, cycle));
  if (g <= 0) return false;
  if (g >= cycle) return true;
  const o = mod(offset, cycle);
  const phase = mod(t, cycle);
  const end = (o + g) % cycle;
  if (o < end) return phase >= o && phase < end;
  return phase >= o || phase < end;
}

function nextGreenStart(t, offset, cycle) {
  const o = mod(offset, cycle);
  const phase = mod(t, cycle);
  return t + mod(o - phase, cycle);
}

function platoonCutoffs(direction, off) {
  const p = plan();
  const use = off || offsets;
  const ids = p.signals.map((s) => s.id);
  const order = direction === "SB" ? ids : ids.slice().reverse();
  const byId = Object.fromEntries(p.signals.map((s) => [s.id, s]));
  const links = direction === "SB" ? DATA.links_sb : DATA.links_nb;
  const linkTt = {};
  links.forEach((l) => {
    linkTt[l.from + ">" + l.to] = l.tt;
  });
  let t = use[order[0]] % p.cycle;
  let cuts = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i];
    const b = order[i + 1];
    t += linkTt[a + ">" + b] || 0;
    const sig = byId[b];
    const g = direction === "SB" ? sig.split6 : sig.split2;
    if (!isGreenAt(t, use[b], g, p.cycle)) {
      cuts += 1;
      t = nextGreenStart(t, use[b], p.cycle);
    }
  }
  return cuts;
}

function measure(off) {
  return {
    bSb: bandWidth("SB", off),
    bNb: bandWidth("NB", off),
    cSb: platoonCutoffs("SB", off),
    cNb: platoonCutoffs("NB", off),
  };
}

function renderMetrics() {
  const p = plan();
  const cur = measure(offsets);
  const def = measure(baseline);
  const cell = (now, base, unit) => {
    const changed = now !== base ? " class=\"changed\"" : "";
    return `<td${changed}>${now}${unit}</td>`;
  };
  metaEl.innerHTML =
    `<div>C = <b>${p.cycle}s</b> &nbsp; ${p.start_time}–${p.end_time}</div>` +
    `<div>d_SB = <b>${p.d_sb.toFixed(2)}</b> &nbsp; d_NB = <b>${p.d_nb.toFixed(2)}</b></div>` +
    `<div>avg vol SB ${Math.round(p.vol_sb)} &nbsp; NB ${Math.round(p.vol_nb)} veh/h</div>`;
  metricsEl.innerHTML = `
    <table class="metric-table">
      <thead>
        <tr>
          <th></th>
          <th>Band SB</th>
          <th>Band NB</th>
          <th>Cutoff SB</th>
          <th>Cutoff NB</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Current</th>
          ${cell(cur.bSb, def.bSb, "s")}
          ${cell(cur.bNb, def.bNb, "s")}
          ${cell(cur.cSb, def.cSb, "")}
          ${cell(cur.cNb, def.cNb, "")}
        </tr>
        <tr>
          <th>Default</th>
          <td>${def.bSb}s</td>
          <td>${def.bNb}s</td>
          <td>${def.cSb}</td>
          <td>${def.cNb}</td>
        </tr>
      </tbody>
    </table>`;
  return cur;
}

function drawTravelArrow(x, y0, y1, dir) {
  const head = 9;
  ctx.save();
  ctx.strokeStyle = "#1c1c1c";
  ctx.fillStyle = "#1c1c1c";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (dir === "down") {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1 - head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x - 5, y1 - head);
    ctx.lineTo(x + 5, y1 - head);
  } else {
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y0 + head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x - 5, y0 + head);
    ctx.lineTo(x + 5, y0 + head);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function render() {
  const stats = renderMetrics();
  draw(stats);
}

function draw(stats) {
  const p = plan();
  const signals = p.signals;
  const n = signals.length;
  const c = p.cycle;
  const dpr = window.devicePixelRatio || 1;
  const labelR = 88;
  const arrowG = 22;
  const gap = 28;
  const top = 58;
  const bottom = 36;
  const rowH = 36;
  const plotW = Math.max(420, Math.min(640, c * 7));
  ctx.font = "12px Segoe UI, Calibri, sans-serif";
  let maxLabel = 0;
  signals.forEach((s) => {
    maxLabel = Math.max(maxLabel, ctx.measureText(s.name).width);
    ctx.font = "700 12px Segoe UI, Calibri, sans-serif";
    const offW = ctx.measureText(`offset=${offsets[s.id]}s`).width;
    ctx.font = "12px Segoe UI, Calibri, sans-serif";
    const ttW = ctx.measureText(`  (TT=${Math.round(s.tt_sb)}s)`).width;
    maxLabel = Math.max(maxLabel, offW + ttW);
  });
  const arrowX = 14;
  const labelRight = arrowX + 12 + maxLabel;
  const sbX = labelRight + 10;
  const width = sbX + plotW + gap + plotW + labelR + arrowG;
  const height = top + n * rowH + bottom;

  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1c1c1c";
  ctx.font = "600 15px Segoe UI, Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${p.day_type} plan ${p.plan_id}`, width / 2, 22);

  const panels = [
    { x: sbX, title: "SB — Phase 6", sub: `d_SB=${p.d_sb.toFixed(2)}`, dir: "SB" },
    { x: sbX + plotW + gap, title: "NB — Phase 2", sub: `d_NB=${p.d_nb.toFixed(2)}`, dir: "NB" },
  ];

  panels.forEach((panel) => {
    ctx.fillStyle = "#1c1c1c";
    ctx.font = "600 13px Segoe UI, Calibri, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(panel.title, panel.x + plotW / 2, 40);
    ctx.font = "12px Segoe UI, Calibri, sans-serif";
    ctx.fillText(panel.sub, panel.x + plotW / 2, 54);

    signals.forEach((s, i) => {
      const y = top + i * rowH;
      const greenLen = panel.dir === "SB" ? s.split6 : s.split2;
      const tt = panel.dir === "SB" ? s.tt_sb : s.tt_nb;
      ctx.fillStyle = RED;
      ctx.fillRect(panel.x, y, plotW, rowH - 3);
      ctx.fillStyle = GREEN;
      greenIntervals(offsets[s.id], greenLen, tt, c).forEach(([a, b]) => {
        const x0 = panel.x + (a / c) * plotW;
        const w = ((b - a) / c) * plotW;
        ctx.fillRect(x0, y, w, rowH - 3);
      });
    });

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(panel.x, top);
    ctx.lineTo(panel.x, top + n * rowH - 3);
    ctx.stroke();

    ctx.fillStyle = "#333";
    ctx.font = "11px Segoe UI, Calibri, sans-serif";
    ctx.textAlign = "center";
    const ticks = 9;
    for (let k = 0; k < ticks; k++) {
      const sec = Math.round((k * (c - 1)) / (ticks - 1));
      const x = panel.x + (sec / c) * plotW;
      ctx.fillText(String(sec), x, top + n * rowH + 16);
    }
    ctx.fillText("Time in cycle (s)", panel.x + plotW / 2, height - 6);
  });

  drawTravelArrow(arrowX, top, top + n * rowH - 6, "down");
  drawTravelArrow(width - 12, top, top + n * rowH - 6, "up");

  signals.forEach((s, i) => {
    const y = top + i * rowH + (rowH - 3) / 2;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillStyle = "#444";
    ctx.font = "12px Segoe UI, Calibri, sans-serif";
    ctx.fillText(s.name, labelRight, y - 7);
    const ttLabel = `  (TT=${Math.round(s.tt_sb)}s)`;
    ctx.fillText(ttLabel, labelRight, y + 8);
    const ttW = ctx.measureText(ttLabel).width;
    ctx.fillStyle = "#1c1c1c";
    ctx.font = "700 12px Segoe UI, Calibri, sans-serif";
    ctx.fillText(`offset=${offsets[s.id]}s`, labelRight - ttW, y + 8);

    ctx.textAlign = "left";
    ctx.fillText(
      `(TT=${Math.round(s.tt_nb)}s)`,
      sbX + plotW + gap + plotW + 8,
      y
    );
    ctx.textBaseline = "alphabetic";
  });
}

function syncOffsetInputs() {
  sliderBox.querySelectorAll("input[type=range]").forEach((input) => {
    input.value = offsets[input.dataset.id];
  });
  sliderBox.querySelectorAll("input[type=number]").forEach((input) => {
    input.value = offsets[input.dataset.num];
  });
}

function csvEscape(v) {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function saveCsv() {
  const p = plan();
  const stats = { bSb: bandWidth("SB"), bNb: bandWidth("NB"), cSb: platoonCutoffs("SB"), cNb: platoonCutoffs("NB") };
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const savedAt =
    `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ` +
    `${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`;
  const fileStamp =
    `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_` +
    `${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
  const header = [
    "CorridorID", "day_type", "plan_id", "start_time", "end_time", "cycle_length",
    "SignalID", "SecondaryName", "offset", "split2", "split6", "tt_sb", "tt_nb",
    "band_sb_sec", "band_nb_sec", "cutoff_sb", "cutoff_nb", "saved_at",
  ];
  const lines = [header.join(",")];
  p.signals.forEach((s) => {
    lines.push([
      p.corridor_id, p.day_type, p.plan_id, p.start_time, p.end_time, p.cycle,
      s.id, s.name, offsets[s.id], s.split2, s.split6,
      s.tt_sb.toFixed(2), s.tt_nb.toFixed(2),
      stats.bSb, stats.bNb, stats.cSb, stats.cNb, savedAt,
    ].map(csvEscape).join(","));
  });
  const day = p.day_type.replace(/[^\w]+/g, "_");
  const name = `offsets_${day}_plan${p.plan_id}_C${p.cycle}_${fileStamp}.csv`;
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Saved ${name}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || "").trim(); });
    return o;
  });
}

function applyUpload(text) {
  const rows = parseCsv(text);
  if (!rows.length || rows[0].SignalID == null || rows[0].offset == null) {
    setStatus("CSV needs SignalID and offset columns.", true);
    return;
  }
  const day = rows[0].day_type;
  const pid = rows[0].plan_id;
  if (day && pid) {
    const idx = DATA.plans.findIndex(
      (p) => p.day_type === day && String(p.plan_id) === String(pid)
    );
    if (idx < 0) {
      setStatus(`No matching plan for ${day} plan ${pid}.`, true);
      return;
    }
    planSelect.value = String(idx);
    loadPlan(idx, true);
  }
  const p = plan();
  let applied = 0;
  rows.forEach((r) => {
    if (day && pid && (r.day_type !== day || String(r.plan_id) !== String(pid))) return;
    if (!(r.SignalID in offsets)) return;
    let v = Math.round(Number(r.offset));
    if (!Number.isFinite(v)) return;
    v = mod(v, p.cycle);
    offsets[r.SignalID] = v;
    applied += 1;
  });
  if (!applied) {
    setStatus("No offsets matched the current signals.", true);
    return;
  }
  syncOffsetInputs();
  render();
  setStatus(`Loaded ${applied} offsets for ${p.day_type} plan ${p.plan_id}.`);
}

document.getElementById("reset").addEventListener("click", () => {
  const p = plan();
  p.signals.forEach((s) => { offsets[s.id] = baseline[s.id]; });
  syncOffsetInputs();
  render();
  setStatus("Reset to the optimized offsets.");
});

document.getElementById("save").addEventListener("click", saveCsv);
document.getElementById("upload").addEventListener("change", (ev) => {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => applyUpload(String(reader.result || ""));
  reader.readAsText(file);
});

planSelect.addEventListener("change", () => loadPlan(Number(planSelect.value)));

fetch("data/plans.json")
  .then((r) => {
    if (!r.ok) throw new Error("Could not load data/plans.json. Serve this folder over HTTP (see README).");
    return r.json();
  })
  .then((data) => {
    DATA = data;
    data.plans.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${p.day_type} plan ${p.plan_id}  ${p.start_time}–${p.end_time}  C=${p.cycle}s`;
      planSelect.appendChild(opt);
    });
    loadPlan(0);
  })
  .catch((err) => setStatus(err.message, true));
