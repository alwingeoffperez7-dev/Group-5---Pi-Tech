// Landing page: data from the backend (public, no log-in needed).
// Graph style (colours, dashes, busiest-day marker) comes from system.js/charts.js.
const API_ENDPOINTS = {
  chart: "/api/landing/chart",
  summary: "/api/landing/summary",
  packaging: "/api/packaging",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request to ${url} failed (${response.status})`);
  return response.json();
}

// Range comes from the dropdown above the graph (7 / 14 / 30 days)
function getChartData(days) {
  const range = document.getElementById("chart-range");
  return fetchJSON(`${API_ENDPOINTS.chart}?days=${days || (range ? range.value : 7)}`);
}

/* ---------- Line graph ---------- */
let wasteChart = null;

function renderChart(data) {
  const statusEl = document.getElementById("chart-status");
  if (typeof Chart === "undefined") {
    statusEl.textContent = "Chart library failed to load.";
    return;
  }
  if (!data || !Array.isArray(data.datasets) || data.labels.length === 0) {
    statusEl.textContent = "No chart data available yet.";
    return;
  }
  // Text version of the graph (also for screen readers)
  statusEl.textContent = graphSummaryText(data.summary);
  if (wasteChart) wasteChart.destroy(); // avoid duplicate charts on re-render
  wasteChart = new Chart(document.getElementById("waste-chart"), {
    type: "line",
    data: { labels: data.labels, datasets: packagingDatasets(data.datasets) },
    options: packagingChartOptions(),
    plugins: [busiestDayPlugin],
  });
}

/* ---------- This week: big card ---------- */
// perDay: plastic items per day for the last 7 days (sum of the graph's lines)
function renderWeek(week, perDay) {
  document.getElementById("week-total").textContent = week.this_week;
  const change = document.getElementById("week-change");
  if (week.change_pct === null) change.textContent = "No sales last week to compare";
  else if (week.change_pct === 0) change.textContent = "Same as last week";
  else change.textContent = `${week.change_pct < 0 ? "↓" : "↑"} ${Math.abs(week.change_pct)}% from last week`;

  // Small green trend line
  const svg = document.getElementById("week-sparkline");
  const max = Math.max(...perDay, 1);
  const pts = perDay.map((v, i) => `${(i * 300) / (perDay.length - 1 || 1)},${96 - (v / max) * 88}`);
  const last = pts[pts.length - 1].split(",");
  svg.innerHTML = `<line x1="0" y1="99" x2="300" y2="99" class="spark-base"/>
    <polyline points="${pts.join(" ")}" class="spark-line"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="5" class="spark-dot"/>`;
}

/* ---------- This week: small cards ---------- */
function renderSummary(data) {
  const listEl = document.getElementById("summary-list");
  const statusEl = document.getElementById("summary-status");
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    statusEl.textContent = "No summary available yet.";
    return;
  }
  statusEl.textContent = "";
  listEl.innerHTML = data.items
    .map(
      (item) => `<div class="card">
        <dt>${escapeHtml(item.label)}</dt>
        <dd>${escapeHtml(item.value)}</dd>
        ${item.note ? `<dd class="card-sub">${escapeHtml(item.note)}</dd>` : ""}
      </div>`,
    )
    .join("");
}

/* ---------- What we track ---------- */
function renderPackaging(list) {
  document.getElementById("packaging-list").innerHTML = list
    .map(
      (pk) => `<li class="card"><strong>${escapeHtml(pk.packaging_name)}</strong>
        ${pk.example ? `<span class="card-sub">e.g. ${escapeHtml(pk.example)}</span>` : ""}</li>`,
    )
    .join("");
}

/* ---------- Init ---------- */
async function initLanding() {
  const [chartResult, summaryResult, packagingResult] = await Promise.allSettled([
    getChartData(7),
    fetchJSON(API_ENDPOINTS.summary),
    fetchJSON(API_ENDPOINTS.packaging),
  ]);

  if (chartResult.status === "fulfilled") renderChart(chartResult.value);
  else {
    console.error(chartResult.reason);
    document.getElementById("chart-status").textContent = "Could not load chart data.";
  }

  if (summaryResult.status === "fulfilled") {
    renderSummary(summaryResult.value);
    if (chartResult.status === "fulfilled") {
      const lines = chartResult.value.datasets;
      const perDay = chartResult.value.labels.map((_, i) => lines.reduce((a, l) => a + l.values[i], 0));
      renderWeek(summaryResult.value.week, perDay);
    }
  } else {
    console.error(summaryResult.reason);
    document.getElementById("summary-status").textContent = "Could not load summary.";
  }

  if (packagingResult.status === "fulfilled") renderPackaging(packagingResult.value);
  else console.error(packagingResult.reason);
}

document.addEventListener("DOMContentLoaded", () => {
  initLanding();
  // Redraw the graph when the range dropdown changes
  const range = document.getElementById("chart-range");
  if (range) {
    range.addEventListener("change", () => {
      getChartData().then(renderChart).catch((err) => {
        console.error(err);
        document.getElementById("chart-status").textContent = "Could not load chart data.";
      });
    });
  }
});
