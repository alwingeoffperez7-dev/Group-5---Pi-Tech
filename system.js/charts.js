// Shared look for the packaging line graphs (landing page + vendor dashboard).
// Load after Chart.js and before the page script.
// Each line has its own colour AND dash pattern, so it can be told apart without colour.
const LINE_COLORS = ["#2563eb", "#dc2626", "#d97706", "#16a34a", "#7c3aed", "#0891b2"];
const LINE_DASHES = [[], [10, 6], [2, 6], [14, 5, 3, 5], [6, 4], [1, 4]];

// Index of the day with the most items over all lines; -1 when nothing was sold.
function busiestIndex(lines) {
  let best = -1, most = 0;
  (lines[0]?.values || []).forEach((_, i) => {
    const sum = lines.reduce((a, l) => a + (l.values[i] || 0), 0);
    if (sum > most) { most = sum; best = i; }
  });
  return best;
}

// lines: [{ label, values }] -> Chart.js datasets, with a dot on every line on the busiest day
function packagingDatasets(lines) {
  const busy = busiestIndex(lines);
  return lines.map((line, i) => {
    const color = LINE_COLORS[i % LINE_COLORS.length];
    return {
      label: line.label,
      data: line.values,
      borderColor: color,
      backgroundColor: "transparent",
      borderDash: LINE_DASHES[i % LINE_DASHES.length],
      borderWidth: 2.5,
      tension: 0,
      pointRadius: line.values.map((_, d) => (d === busy ? 5 : 0)),
      pointHoverRadius: 5,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: color,
      pointBorderWidth: 2.5,
    };
  });
}

// Dashed guide line + "Busiest day" tag on the busiest day
const busiestDayPlugin = {
  id: "busiestDay",
  beforeDatasetsDraw(chart) {
    const i = busiestIndex(chart.data.datasets.map((d) => ({ values: d.data })));
    chart.$busiest = i;
    if (i < 0) return;
    const { ctx, chartArea } = chart;
    const x = chart.scales.x.getPixelForValue(i);
    ctx.save();
    ctx.strokeStyle = "#6b7fa3";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
  afterDatasetsDraw(chart) {
    const i = chart.$busiest;
    if (i == null || i < 0) return;
    const { ctx, chartArea } = chart;
    const x = chart.scales.x.getPixelForValue(i);
    const text = "Busiest day · " + chart.data.labels[i];
    ctx.save();
    ctx.font = "600 12px 'Fira Sans', sans-serif";
    const w = ctx.measureText(text).width + 16;
    const left = x + 8 + w > chartArea.right ? x - 8 - w : x + 8; // flip left near the edge
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#c7ddff";
    ctx.beginPath();
    ctx.roundRect(left, chartArea.top + 2, w, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + 8, chartArea.top + 14);
    ctx.restore();
  },
};

// Options shared by both line graphs: legend on top, scale on the right, light grid
function packagingChartOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        align: "start",
        labels: { boxWidth: 28, boxHeight: 0, padding: 16, font: { family: "'Fira Sans', sans-serif", size: 13 }, color: "#334155" },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#5b6b85", font: { family: "'Fira Sans', sans-serif" } } },
      y: {
        position: "right",
        beginAtZero: true,
        border: { display: false },
        grid: { color: "#e0ebff" },
        ticks: { precision: 0, color: "#5b6b85", font: { family: "'Fira Sans', sans-serif" } },
        title: { display: !!yTitle, text: yTitle, color: "#5b6b85" },
      },
    },
  };
}

// "Polystyrene (PS) was used most: 38 of 57 items. Plastic Container least: 3."
function graphSummaryText(summary) {
  if (!summary || !summary.most_used) return "No sales recorded yet.";
  let text = `${summary.most_used.label} was used most: ${summary.most_used.items} of ${summary.total} items.`;
  if (summary.least_used) text += ` ${summary.least_used.label} least: ${summary.least_used.items}.`;
  return text;
}
