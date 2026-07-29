/* ==========================================================================
   Boosting Tracker — app logic (View: 2026 Boosts)
   ========================================================================== */

(function () {
  const STORAGE_KEY = "jomboy-boosting-tracker:2026-data";
  const PLATFORM_ORDER = ["FB", "IG", "TW", "TT"];
  const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Expected column headers in the raw sheet export (case-insensitive match).
  const HEADER_MAP = {
    "boost id": "id",
    "platform": "platform",
    "brand": "brand",
    "caption": "caption",
    "content": "content",
    "episode": "episode",
    "start": "start",
    "end": "end",
    "total budget": "totalBudget",
    "total spent": "totalSpent",
    "delivered views": "deliveredViews",
    "cpm": "cpm",
    "proj views": "projViews",
    "proj cpm": "projCPM",
    "fanatics?": "fanatics",
    "segment?": "segment",
    "curation/integration?": "curationIntegration",
    "whg?": "whg",
    "standard?": "standard",
    "month": "month",
  };

  const BRAND_FIXES = { "mlb the show": "MLB The Show" };

  let DATA = [];

  const state = {
    startFrom: null,
    startTo: null,
    endFrom: null,
    endTo: null,
    budgetMin: null,
    budgetMax: null,
    spendMin: null,
    spendMax: null,
    brands: new Set(),
    platforms: new Set(),
    months: new Set(),
    flags: {
      fanatics: "any",
      segment: "any",
      curationIntegration: "any",
      whg: "any",
      standard: "any",
    },
    sortKey: "start",
    sortDir: "asc",
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  /* ---------------- formatting ---------------- */

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return n.toLocaleString("en-US");
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTH_NAMES[m]} ${d}`;
  }

  /* ---------------- CSV parsing / cleaning ---------------- */

  function cleanMoney(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim().replace(/\$/g, "").replace(/,/g, "");
    if (s === "" || s === "#DIV/0!") return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }

  function cleanInt(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim().replace(/,/g, "");
    if (s === "" || s === "#DIV/0!") return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n);
  }

  function cleanFlag(raw) {
    return String(raw || "").trim().toUpperCase() === "Y";
  }

  function normBrand(raw) {
    const s = String(raw || "").trim();
    const fixed = BRAND_FIXES[s.toLowerCase()];
    return fixed || s;
  }

  function toISO(raw, year) {
    const s = String(raw || "").trim();
    if (!s || s.indexOf("/") === -1) return null;
    const parts = s.split("/");
    const m = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    if (!m || !d) return null;
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Convert raw parsed rows (array of arrays) into clean boost records.
  function rowsToRecords(rows, year) {
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const first = String((rows[i][0] || "")).trim().toLowerCase();
      if (first === "boost id") {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new Error('Could not find a header row (expected a "Boost ID" column). Check that this is the raw sheet export.');
    }

    const headerRow = rows[headerIdx];
    const colIndex = {};
    headerRow.forEach((h, i) => {
      const key = String(h || "").trim().toLowerCase();
      if (HEADER_MAP[key]) colIndex[HEADER_MAP[key]] = i;
    });

    const required = ["id", "platform", "brand", "start", "end"];
    const missing = required.filter((f) => colIndex[f] === undefined);
    if (missing.length) {
      throw new Error("Missing expected columns: " + missing.join(", "));
    }

    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.length) continue;
      const idRaw = String(r[colIndex.id] || "").trim();
      const platformRaw = String(r[colIndex.platform] || "").trim();
      if (!/^\d+$/.test(idRaw)) continue;
      if (platformRaw.toLowerCase() === "platform") continue;

      records.push({
        id: parseInt(idRaw, 10),
        platform: platformRaw,
        brand: normBrand(r[colIndex.brand]),
        caption: String(r[colIndex.caption] || "").trim(),
        content: String(r[colIndex.content] || "").trim(),
        episode: String(r[colIndex.episode] || "").trim(),
        start: toISO(r[colIndex.start], year),
        end: toISO(r[colIndex.end], year),
        startRaw: String(r[colIndex.start] || "").trim(),
        endRaw: String(r[colIndex.end] || "").trim(),
        totalBudget: cleanMoney(r[colIndex.totalBudget]),
        totalSpent: cleanMoney(r[colIndex.totalSpent]),
        deliveredViews: cleanInt(r[colIndex.deliveredViews]),
        cpm: cleanMoney(r[colIndex.cpm]),
        projViews: cleanInt(r[colIndex.projViews]),
        projCPM: cleanMoney(r[colIndex.projCPM]),
        fanatics: cleanFlag(r[colIndex.fanatics]),
        segment: cleanFlag(r[colIndex.segment]),
        curationIntegration: cleanFlag(r[colIndex.curationIntegration]),
        whg: cleanFlag(r[colIndex.whg]),
        standard: cleanFlag(r[colIndex.standard]),
        month: /^\d+$/.test(String(r[colIndex.month] || "").trim()) ? parseInt(r[colIndex.month], 10) : null,
      });
    }
    return records;
  }

  function parseCSVText(text, year) {
    const parsed = Papa.parse(text, { skipEmptyLines: false });
    if (parsed.errors && parsed.errors.length) {
      const fatal = parsed.errors.filter((e) => e.type !== "FieldMismatch");
      if (fatal.length) throw new Error(fatal[0].message);
    }
    return rowsToRecords(parsed.data, year);
  }

  /* ---------------- data source management ---------------- */

  function setStatus(text, isCustom) {
    $("#dataStatusText").textContent = text;
    $(".data-panel .dot").style.background = isCustom ? "var(--amber)" : "var(--turf)";
  }

  function showUploadError(msg) {
    const el = $("#uploadError");
    if (!msg) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.style.display = "block";
    el.textContent = msg;
  }

  function loadInitialData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        DATA = parsed.records;
        setStatus(`Custom upload: ${parsed.filename} · ${parsed.records.length} boosts · ${new Date(parsed.uploadedAt).toLocaleString()}`, true);
        $("#dataYear").value = parsed.year || 2026;
        return;
      }
    } catch (e) {
      /* fall through to default */
    }
    DATA = BOOSTS_2026;
    setStatus(`Using default embedded dataset · ${DATA.length} boosts`, false);
  }

  function handleFileUpload(file) {
    showUploadError(null);
    const year = parseInt($("#dataYear").value, 10) || 2026;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const records = parseCSVText(e.target.result, year);
        if (!records.length) throw new Error("No valid boost rows found in this file.");
        DATA = records;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ filename: file.name, uploadedAt: Date.now(), year, records })
        );
        setStatus(`Custom upload: ${file.name} · ${records.length} boosts · just now`, true);
        resetFilterUI();
        populateBrandOptions();
        render();
      } catch (err) {
        showUploadError("Could not read this file: " + err.message);
      }
    };
    reader.onerror = () => showUploadError("Could not read this file.");
    reader.readAsText(file);
  }

  /* ---------------- filtering / sorting ---------------- */

  function getFiltered() {
    return DATA.filter((r) => {
      if (state.startFrom && (!r.start || r.start < state.startFrom)) return false;
      if (state.startTo && (!r.start || r.start > state.startTo)) return false;
      if (state.endFrom && (!r.end || r.end < state.endFrom)) return false;
      if (state.endTo && (!r.end || r.end > state.endTo)) return false;
      if (state.budgetMin !== null && (r.totalBudget === null || r.totalBudget < state.budgetMin)) return false;
      if (state.budgetMax !== null && (r.totalBudget === null || r.totalBudget > state.budgetMax)) return false;
      if (state.spendMin !== null && (r.totalSpent === null || r.totalSpent < state.spendMin)) return false;
      if (state.spendMax !== null && (r.totalSpent === null || r.totalSpent > state.spendMax)) return false;
      if (state.brands.size && !state.brands.has(r.brand)) return false;
      if (state.platforms.size && !state.platforms.has(r.platform)) return false;
      if (state.months.size && !state.months.has(r.month)) return false;
      for (const [flag, val] of Object.entries(state.flags)) {
        if (val === "yes" && !r[flag]) return false;
        if (val === "no" && r[flag]) return false;
      }
      return true;
    });
  }

  function sortRows(rows) {
    const { sortKey, sortDir } = state;
    const dir = sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (av === null || av === undefined) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return (av - bv) * dir;
    });
  }

  /* ---------------- rendering ---------------- */

  function populateBrandOptions() {
    const brands = Array.from(new Set(DATA.map((r) => r.brand))).sort();
    const sel = $("#brandSelect");
    sel.innerHTML = "";
    brands.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      sel.appendChild(opt);
    });
  }

  function renderKPIs(rows) {
    const strip = $("#kpiStrip");
    strip.innerHTML = "";

    const byPlatform = {};
    PLATFORM_ORDER.forEach((p) => (byPlatform[p] = { spent: 0, views: 0, count: 0 }));

    let totalSpent = 0, totalViews = 0, totalCount = rows.length;

    rows.forEach((r) => {
      const p = r.platform;
      if (!byPlatform[p]) byPlatform[p] = { spent: 0, views: 0, count: 0 };
      if (r.totalSpent) { byPlatform[p].spent += r.totalSpent; totalSpent += r.totalSpent; }
      if (r.deliveredViews) { byPlatform[p].views += r.deliveredViews; totalViews += r.deliveredViews; }
      byPlatform[p].count += 1;
    });

    const cards = [...PLATFORM_ORDER.map((p) => ({ label: p, ...byPlatform[p], color: `var(--${p.toLowerCase()})` }))];
    cards.push({ label: "ALL", spent: totalSpent, views: totalViews, count: totalCount, color: "var(--amber)" });

    cards.forEach((c) => {
      const cpm = c.views ? (c.spent / c.views) * 1000 : null;
      const card = document.createElement("div");
      card.className = "kpi-card";
      card.style.setProperty("--platform-color", c.color);
      card.innerHTML = `
        <div class="kpi-plat"><span>${c.label}</span><span class="count">${c.count} boost${c.count === 1 ? "" : "s"}</span></div>
        <div class="kpi-row"><span>Spent</span><strong>${fmtMoney(c.spent)}</strong></div>
        <div class="kpi-row"><span>Views</span><strong>${fmtInt(c.views)}</strong></div>
        <div class="kpi-row"><span>Blended CPM</span><strong>${cpm !== null ? fmtMoney(cpm) : "—"}</strong></div>
      `;
      strip.appendChild(card);
    });
  }

  function flagDots(r) {
    const map = [
      ["fanatics", "FN"],
      ["segment", "SG"],
      ["curationIntegration", "CI"],
      ["whg", "WH"],
      ["standard", "ST"],
    ];
    const active = map.filter(([k]) => r[k]);
    if (!active.length) return `<span style="color:var(--text-faint); font-family:var(--font-mono); font-size:11px;">—</span>`;
    return active.map(([, label]) => `<span class="flag-dot" title="${label}">${label}</span>`).join("");
  }

  function cpmBadge(r) {
    if (r.cpm === null || r.cpm === undefined) return `<span class="cpm-neutral">—</span>`;
    let cls = "cpm-neutral";
    if (r.projCPM) cls = r.cpm <= r.projCPM ? "cpm-good" : "cpm-bad";
    return `<span class="cpm-flag ${cls}">${fmtMoney(r.cpm)}</span>`;
  }

  function renderTable(rows) {
    const tbody = $("#boostsBody");
    const emptyState = $("#emptyState");
    tbody.innerHTML = "";

    if (!rows.length) {
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    const frag = document.createDocumentFragment();
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="id-col">#${r.id}</td>
        <td><span class="platform-pill ${r.platform}">${r.platform}</span></td>
        <td class="brand-cell">
          <strong>${r.brand}</strong>
          <span class="content-line">${[r.content, r.episode].filter(Boolean).join(" · ")}</span>
        </td>
        <td class="date-range">${fmtDate(r.start)} – ${fmtDate(r.end)}</td>
        <td class="num-col">${fmtMoney(r.totalBudget)}</td>
        <td class="num-col">${fmtMoney(r.totalSpent)}</td>
        <td class="num-col">${fmtInt(r.deliveredViews)}</td>
        <td class="num-col">${cpmBadge(r)}</td>
        <td><div class="flags-cell">${flagDots(r)}</div></td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  function renderCount(rows) {
    $("#resultCount").innerHTML = `Showing <strong>${rows.length}</strong> of <strong>${DATA.length}</strong> boosts`;
  }

  function renderSortArrows() {
    $$("th[data-key]").forEach((th) => {
      const arrow = th.querySelector(".arrow");
      if (arrow) arrow.remove();
      if (th.dataset.key === state.sortKey) {
        const span = document.createElement("span");
        span.className = "arrow";
        span.textContent = state.sortDir === "asc" ? "▲" : "▼";
        th.appendChild(span);
      }
    });
  }

  function render() {
    const filtered = getFiltered();
    const sorted = sortRows(filtered);
    renderKPIs(filtered);
    renderTable(sorted);
    renderCount(filtered);
    renderSortArrows();
  }

  /* ---------------- filter wiring ---------------- */

  function resetFilterUI() {
    state.startFrom = state.startTo = null;
    state.endFrom = state.endTo = null;
    state.budgetMin = state.budgetMax = null;
    state.spendMin = state.spendMax = null;
    state.brands = new Set();
    state.platforms = new Set();
    state.months = new Set();
    Object.keys(state.flags).forEach((k) => (state.flags[k] = "any"));

    ["startFrom", "startTo", "endFrom", "endTo", "budgetMin", "budgetMax", "spendMin", "spendMax"].forEach((id) => {
      $("#" + id).value = "";
    });
    Array.from($("#brandSelect").options).forEach((o) => (o.selected = false));
    Array.from($("#monthSelect").options).forEach((o) => (o.selected = false));
    $$(".chip.active").forEach((c) => c.classList.remove("active"));
    $$(".tri-toggle").forEach((group) => {
      $$("button", group).forEach((b) => b.classList.toggle("active", b.dataset.val === "any"));
    });
  }

  function wireFilters() {
    const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : parseFloat(v));

    $("#startFrom").addEventListener("change", (e) => { state.startFrom = e.target.value || null; render(); });
    $("#startTo").addEventListener("change", (e) => { state.startTo = e.target.value || null; render(); });
    $("#endFrom").addEventListener("change", (e) => { state.endFrom = e.target.value || null; render(); });
    $("#endTo").addEventListener("change", (e) => { state.endTo = e.target.value || null; render(); });

    $("#budgetMin").addEventListener("input", (e) => { state.budgetMin = numOrNull(e.target.value); render(); });
    $("#budgetMax").addEventListener("input", (e) => { state.budgetMax = numOrNull(e.target.value); render(); });
    $("#spendMin").addEventListener("input", (e) => { state.spendMin = numOrNull(e.target.value); render(); });
    $("#spendMax").addEventListener("input", (e) => { state.spendMax = numOrNull(e.target.value); render(); });

    $("#brandSelect").addEventListener("change", (e) => {
      state.brands = new Set(Array.from(e.target.selectedOptions).map((o) => o.value));
      render();
    });
    $("#monthSelect").addEventListener("change", (e) => {
      state.months = new Set(Array.from(e.target.selectedOptions).map((o) => Number(o.value)));
      render();
    });

    $$(".chip[data-platform]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const p = chip.dataset.platform;
        if (state.platforms.has(p)) { state.platforms.delete(p); chip.classList.remove("active"); }
        else { state.platforms.add(p); chip.classList.add("active"); }
        render();
      });
    });

    $$(".tri-toggle").forEach((group) => {
      const flag = group.dataset.flag;
      $$("button", group).forEach((btn) => {
        btn.addEventListener("click", () => {
          state.flags[flag] = btn.dataset.val;
          $$("button", group).forEach((b) => b.classList.toggle("active", b === btn));
          render();
        });
      });
    });

    $("#resetBtn").addEventListener("click", () => {
      resetFilterUI();
      render();
    });

    $("#csvUpload").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFileUpload(file);
    });

    $("#clearDataBtn").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      DATA = BOOSTS_2026;
      $("#dataYear").value = 2026;
      setStatus(`Using default embedded dataset · ${DATA.length} boosts`, false);
      showUploadError(null);
      resetFilterUI();
      populateBrandOptions();
      render();
    });

    $$("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "start" ? "asc" : "desc";
        }
        render();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadInitialData();
    populateBrandOptions();
    wireFilters();
    render();
  });
})();
