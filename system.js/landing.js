const USE_MOCK_DATA = false;

const API_ENDPOINTS = {
  chart: "/api/landing/chart",
  summary: "/api/landing/summary",
};

/* ---------- Mock data (matches the design; remove once backend is live) ---------- */
const MOCK_CHART_DATA = {
  yLabel: "Plastic waste",
  labels: [
    "Jan 2021", "Jul 2021", "Jan 2022", "Jul 2022", "Jan 2023",
    "Jul 2023", "Jan 2024", "Jul 2024", "Jan 2025",
  ],
  values: [8, null, 18, null, 20, null, 33, null, 36],
};

const MOCK_SUMMARY_DATA = {
  title: "Summary",
  items: [
    { label: "Total plastic waste", value: "36 kg" },
    { label: "Items in inventory", value: "412" },
    { label: "Change since last year", value: "+3 kg" },
  ],
};

/* ---------- Data fetching ---------- */
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed (${response.status})`);
  }
  return response.json();
}

function getChartData() {
  return USE_MOCK_DATA ? Promise.resolve(MOCK_CHART_DATA) : fetchJSON(API_ENDPOINTS.chart);
}

function getSummaryData() {
  return USE_MOCK_DATA ? Promise.resolve(MOCK_SUMMARY_DATA) : fetchJSON(API_ENDPOINTS.summary);
}

/* ---------- Line graph ---------- */
let wasteChart = null;
// One colour per packaging category line (same order as the vendor dashboard graph)
const LINE_COLORS = ["#2563eb", "#dc2626", "#d97706", "#16a34a", "#7c3aed", "#0891b2"];

function renderChart(data) {
  const statusEl = document.getElementById("chart-status");
  const canvas = document.getElementById("waste-chart");

  if (typeof Chart === "undefined") {
    statusEl.textContent = "Chart library failed to load.";
    return;
  }
  if (!data || !Array.isArray(data.labels) || data.labels.length === 0) {
    statusEl.textContent = "No chart data available yet.";
    return;
  }

  // Backend sends one line per packaging category: datasets = [{ label: "Tetra Pak", values: [...] }, ...]
  // (the mock data still uses a single `values` line)
  const lines = Array.isArray(data.datasets) ? data.datasets : [{ label: data.yLabel || "Plastic waste", values: data.values }];
  const anyData = lines.some((line) => line.values.some((v) => v));
  statusEl.textContent = anyData ? "" : "No sales recorded yet.";
  if (wasteChart) wasteChart.destroy(); // avoid duplicate charts on re-render

  wasteChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: lines.map((line, i) => ({
        label: line.label,
        data: line.values,
        tension: 0.4,      // smooth curve, like the design
        cubicInterpolationMode: "monotone", // smooth, but never dips below 0 between points
        spanGaps: true,    // connect points across null values
        pointRadius: 4,
        borderColor: lines.length > 1 ? LINE_COLORS[i % LINE_COLORS.length] : "#000000",
        backgroundColor: lines.length > 1 ? LINE_COLORS[i % LINE_COLORS.length] : "#000000",
      })),
    },
    options: {
      plugins: { legend: { display: lines.length > 1, position: "bottom" } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          title: { display: true, text: data.yLabel || "" },
        },
      },
    },
  });
}

/* ---------- Information summary card ---------- */
function renderSummary(data) {
  const titleEl = document.getElementById("summary-title");
  const listEl = document.getElementById("summary-list");
  const statusEl = document.getElementById("summary-status");

  listEl.innerHTML = "";

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    statusEl.textContent = "No summary available yet.";
    return;
  }

  statusEl.textContent = "";
  if (data.title) titleEl.textContent = data.title;

  data.items.forEach((item) => {
    const term = document.createElement("dt");
    term.textContent = item.label;

    const detail = document.createElement("dd");
    detail.textContent = item.value;

    listEl.append(term, detail);
  });
}

/* ---------- Init ---------- */
async function initLanding() {
  const [chartResult, summaryResult] = await Promise.allSettled([
    getChartData(),
    getSummaryData(),
  ]);

  if (chartResult.status === "fulfilled") {
    renderChart(chartResult.value);
  } else {
    console.error(chartResult.reason);
    document.getElementById("chart-status").textContent = "Could not load chart data.";
  }

  if (summaryResult.status === "fulfilled") {
    renderSummary(summaryResult.value);
  } else {
    console.error(summaryResult.reason);
    document.getElementById("summary-status").textContent = "Could not load summary.";
  }
}

document.addEventListener("DOMContentLoaded", initLanding);
