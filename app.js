/* ==========================================================================
   Boosting Tracker — app logic (View: 2026 Boosts)
   ========================================================================== */

(function () {
  const DATA = BOOSTS_2026;

  const PLATFORM_ORDER = ["FB", "IG", "TW", "TT"];
  const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const state = {
    dateFrom: null,
    dateTo: null,
    brands: new Set(),      // empty = all
    platforms: new Set(),   // empty = all
    months: new Set(),      // empty = all
    flags: new Set(),       // subset of: fanatics, segment, curationIntegration, whg, standard
    sortKey: "start",
    sortDir: "asc",
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

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

  function populateBrandOptions() {
    const brands = Array.from(new Set(DATA.map((r) => r.brand))).sort();
    const sel = $("#brandSelect");
    brands.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      sel.appendChild(opt);
    });
  }

  function getFiltered() {
    return DATA.filter((r) => {
      if (state.dateFrom && (!r.start || r.start < state.dateFrom)) return false;
      if (state.dateTo && (!r.start || r.start > state.dateTo)) return false;
      if (state.brands.size && !state.brands.has(r.brand)) return false;
      if (state.platforms.size && !state.platforms.has(r.platform)) return false;
      if (state.months.size && !state.months.has(r.month)) return false;
      for (const f of state.flags) {
        if (!r[f]) return false;
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
    return active
      .map(([, label]) => `<span class="flag-dot" title="${label}">${label}</span>`)
      .join("");
  }

  function cpmBadge(r) {
    if (r.cpm === null || r.cpm === undefined) return `<span class="cpm-neutral">—</span>`;
    let cls = "cpm-neutral";
    if (r.projCPM) {
      cls = r.cpm <= r.projCPM ? "cpm-good" : "cpm-bad";
    }
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

  function wireFilters() {
    $("#dateFrom").addEventListener("change", (e) => {
      state.dateFrom = e.target.value || null;
      render();
    });
    $("#dateTo").addEventListener("change", (e) => {
      state.dateTo = e.target.value || null;
      render();
    });

    $("#brandSelect").addEventListener("change", (e) => {
      const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
      state.brands = new Set(selected);
      render();
    });

    $("#monthSelect").addEventListener("change", (e) => {
      const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
      state.months = new Set(selected);
      render();
    });

    $$(".chip[data-platform]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const p = chip.dataset.platform;
        if (state.platforms.has(p)) {
          state.platforms.delete(p);
          chip.classList.remove("active");
        } else {
          state.platforms.add(p);
          chip.classList.add("active");
        }
        render();
      });
    });

    $$(".chip[data-flag]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const f = chip.dataset.flag;
        if (state.flags.has(f)) {
          state.flags.delete(f);
          chip.classList.remove("active");
        } else {
          state.flags.add(f);
          chip.classList.add("active");
        }
        render();
      });
    });

    $("#resetBtn").addEventListener("click", () => {
      state.dateFrom = null;
      state.dateTo = null;
      state.brands = new Set();
      state.platforms = new Set();
      state.months = new Set();
      state.flags = new Set();
      $("#dateFrom").value = "";
      $("#dateTo").value = "";
      $("#brandSelect").selectedIndex = -1;
      Array.from($("#brandSelect").options).forEach((o) => (o.selected = false));
      Array.from($("#monthSelect").options).forEach((o) => (o.selected = false));
      $$(".chip.active").forEach((c) => c.classList.remove("active"));
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
    populateBrandOptions();
    wireFilters();
    render();
  });
})();
