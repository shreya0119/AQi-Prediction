// Namma Gaali: front-end for the next-day AQI forecast.
// Reads data.json (exported by the notebook) and renders the map + station panel.

const COLORS = {
  "Good": "#2E7D32", "Satisfactory": "#8BC34A", "Moderate": "#F4C430",
  "Poor": "#F28C28", "Very Poor": "#D32F2F", "Severe": "#7B1E1E",
};
const TEXT_ON = {
  "Good": "#fff", "Satisfactory": "#26301F", "Moderate": "#26301F",
  "Poor": "#26301F", "Very Poor": "#fff", "Severe": "#fff",
};

// Health impact per category follows India's National AQI (CPCB); tips are general guidance.
const ADVICE = {
  "Good": {
    impact: "Minimal impact on health.",
    tips: ["A good day for outdoor activities and exercise.", "Open windows to air out your home."],
  },
  "Satisfactory": {
    impact: "Minor breathing discomfort for sensitive people.",
    tips: ["Most people can go about normally.", "People with asthma or lung conditions: avoid very long, strenuous outdoor exercise."],
  },
  "Moderate": {
    impact: "Breathing discomfort for people with lung disease (e.g. asthma), heart disease, children and older adults.",
    tips: ["Sensitive groups: cut down on prolonged outdoor exertion.", "Keep inhalers or medication handy.", "Prefer parks over busy roads for walks or runs."],
  },
  "Poor": {
    impact: "Breathing discomfort for most people on prolonged exposure.",
    tips: ["Limit time outdoors, especially near heavy traffic.", "Wear an N95 mask outdoors.", "Keep windows closed during peak traffic hours.", "Use an air purifier indoors if you have one."],
  },
  "Very Poor": {
    impact: "Respiratory illness on prolonged exposure.",
    tips: ["Avoid outdoor activities.", "Children, older adults and people with heart or lung disease should stay indoors.", "Wear an N95 mask if you must go out."],
  },
  "Severe": {
    impact: "Affects healthy people; serious impact on those with existing diseases.",
    tips: ["Stay indoors and avoid all outdoor exertion.", "Keep doors and windows shut.", "Seek medical help if you have breathing trouble or chest pain."],
  },
};

const BENGALURU = [77.5946, 12.9716];
const BLR_ZOOM = 10.6;
const BLR_BOUNDS = [[77.38, 12.78], [77.82, 13.17]];   // Bengaluru city only
const BLR_MIN_ZOOM = 9.8;

let stations = [];
let summary = null;
let map = null;
const markers = {};
let clickPin = null;
let introFinished = false;
let dataReady = null;   // resolves once data.json is loaded
let mapLoaded = null;   // resolves once the map style is loaded

const $ = (id) => document.getElementById(id);

init();

async function init() {
  $("skip").addEventListener("click", finishIntro);

  // start the map (and the intro flight) right away; load the data in parallel
  mapLoaded = buildMap();
  dataReady = loadData();

  try {
    await dataReady;
  } catch (err) {
    const msg = location.protocol === "file:"
      ? "Open this page through a web server (e.g. PyCharm: right-click index.html > Open In > Browser). Browsers block data loading from file://."
      : "Could not load the forecast data. Please refresh the page.";
    $("status").textContent = msg;
    $("status").classList.remove("hidden");
    console.error(err);
    return;
  }

  buildDropdown();
  renderSummary();
  if (summary.demo_date) $("demo-date").textContent = formatDate(summary.demo_date);
  await mapLoaded;
  addMarkers();
  if (introFinished) selectDefault();
}

async function loadData() {
  // data.js (a <script>) works even when the page is opened as a local file;
  // fall back to fetching data.json otherwise
  let json = window.NAMMA_GAALI_DATA;
  if (!json) {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  }
  stations = json.stations.slice().sort((a, b) => a.name.localeCompare(b.name));
  summary = json.summary;
}

/* ---------------- map ---------------- */

function buildMap() {
  return new Promise((resolve) => {
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [20, 20],
    zoom: 1.2,
    attributionControl: { compact: true },
  });

  map.on("style.load", () => {
    try { map.setProjection({ type: "globe" }); } catch (e) { /* older browsers: flat map is fine */ }
  });

  map.on("load", () => {
    $("status").classList.add("hidden");
    startIntro();
    resolve();
  });

  map.on("error", (e) => console.warn("Map error:", e && e.error));
  map.on("click", onMapClick);
  });
}

function addMarkers() {
  for (const s of stations) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "marker";
    el.style.background = COLORS[s.pred_category];
    el.style.color = TEXT_ON[s.pred_category];
    el.textContent = s.pred_aqi;
    el.title = `${s.name}: predicted AQI ${s.pred_aqi} (${s.pred_category})`;
    el.setAttribute("aria-label", el.title);
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      removeClickPin();
      selectStation(s.id);
    });
    markers[s.id] = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
  }
}

// world -> India -> Bengaluru, then reveal the panel
function startIntro() {
  if (introFinished) return;
  map.flyTo({ center: [78.96, 22.5], zoom: 3.6, duration: 3500, essential: true });
  map.once("moveend", () => {
    if (introFinished) return;
    map.flyTo({ center: BENGALURU, zoom: BLR_ZOOM, duration: 4000, essential: true });
    map.once("moveend", finishIntro);
  });
}

function finishIntro() {
  if (introFinished) return;
  introFinished = true;
  if (map) map.jumpTo({ center: BENGALURU, zoom: BLR_ZOOM });
  document.body.classList.add("ready");

  // wait for the panel to slide open, then let the map fill its new size
  setTimeout(() => {
    if (!map) return;
    map.resize();
    map.jumpTo({ center: BENGALURU, zoom: BLR_ZOOM });
    map.setMaxBounds(BLR_BOUNDS);
    map.setMinZoom(BLR_MIN_ZOOM);
  }, 650);

  selectDefault();
}

// open on the station with the worst forecast (once the data has arrived)
function selectDefault() {
  if (!stations.length) return;
  // prefer stations where we can show "what actually happened"
  const pool = stations.filter((s) => s.actual_next != null);
  const list = pool.length ? pool : stations;
  const worst = list.reduce((a, b) => (b.pred_aqi > a.pred_aqi ? b : a), list[0]);
  selectStation(worst.id);
}

function onMapClick(e) {
  if (!introFinished || !stations.length) return;
  const { lng, lat } = e.lngLat;
  let best = null;
  let bestKm = Infinity;
  for (const s of stations) {
    const km = haversineKm(lat, lng, s.lat, s.lon);
    if (km < bestKm) { bestKm = km; best = s; }
  }
  placeClickPin([lng, lat]);
  selectStation(best.id, bestKm);
}

function placeClickPin(lngLat) {
  removeClickPin();
  const el = document.createElement("div");
  el.className = "click-pin";
  clickPin = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
}

function removeClickPin() {
  if (clickPin) { clickPin.remove(); clickPin = null; }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------------- panel ---------------- */

function buildDropdown() {
  const sel = $("station-select");
  for (const s of stations) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    removeClickPin();
    const s = stations.find((x) => x.id === sel.value);
    selectStation(s.id);
    if (map && introFinished) map.easeTo({ center: [s.lon, s.lat], zoom: 12, duration: 900 });
  });
}

function selectStation(id, distanceKm) {
  const s = stations.find((x) => x.id === id);
  if (!s) return;

  $("station-select").value = id;
  for (const [sid, m] of Object.entries(markers)) {
    m.getElement().classList.toggle("selected", sid === id);
  }

  $("st-name").textContent = s.name;
  $("st-near").textContent = distanceKm != null
    ? `Nearest station to the point you clicked: ${distanceKm.toFixed(1)} km away`
    : "";

  $("latest-aqi").textContent = s.latest_aqi;
  setPill($("latest-cat"), s.latest_category);
  $("latest-date").textContent = formatDate(s.latest_date);

  $("pred-aqi").textContent = s.pred_aqi;
  setPill($("pred-cat"), s.pred_category);
  $("pred-date").textContent = `for ${formatDate(s.pred_date)}`;
  $("pred-actual").innerHTML = s.actual_next != null
    ? `Actually happened: <strong>${s.actual_next}</strong> (${s.actual_next_category})`
    : "Actual value not recorded";

  renderBars(s);
  renderAccuracy(s);
  renderAdvice(s.pred_category);
}

function setPill(el, category) {
  el.textContent = category;
  el.style.background = COLORS[category];
  el.style.color = TEXT_ON[category];
}

function renderBars(s) {
  const bars = $("bars");
  bars.innerHTML = "";
  const items = s.history.map((h) => ({ ...h, kind: "actual" }))
    .concat([{ date: s.pred_date, aqi: s.pred_aqi, kind: "forecast" }]);
  const max = Math.max(100, ...items.map((i) => i.aqi));

  for (const it of items) {
    const bar = document.createElement("div");
    bar.className = "bar";
    const val = document.createElement("b");
    val.textContent = it.aqi;
    const fill = document.createElement("div");
    fill.style.height = `${(it.aqi / max) * 100}%`;
    fill.style.background = it.kind === "forecast" ? COLORS[categoryOf(it.aqi)] : "#B5C9A1";
    if (it.kind === "forecast") fill.style.outline = "2px dashed #26301F";
    const lbl = document.createElement("span");
    lbl.textContent = it.kind === "forecast" ? "next day" : shortDate(it.date);
    bar.append(val, fill, lbl);
    bars.appendChild(bar);
  }
}

function renderAccuracy(s) {
  const better = s.model_mae < s.baseline_mae;
  $("accuracy").innerHTML =
    `<strong>How accurate is this?</strong> Over ${s.test_days} test days at this station, ` +
    `the model's average error was <strong>${s.model_mae}</strong> AQI points, ` +
    `vs <strong>${s.baseline_mae}</strong> for simply guessing "tomorrow = today". ` +
    (better
      ? "The model did better here."
      : "Here the simple guess did slightly better, shown honestly.");
}

function renderAdvice(category) {
  const a = ADVICE[category];
  setPill($("advice-cat"), category);
  $("advice-cat").classList.add("pill");
  $("advice-impact").textContent = a.impact;
  const ul = $("advice-list");
  ul.innerHTML = "";
  for (const tip of a.tips) {
    const li = document.createElement("li");
    li.textContent = tip;
    ul.appendChild(li);
  }
}

function renderSummary() {
  const s = summary;
  const wins = stations.filter((x) => x.model_mae < x.baseline_mae).length;
  $("summary").innerHTML = `
    <h3>About the model</h3>
    ${s.model} trained on past daily AQI, tested on ${s.test_period}.
    It beats the "tomorrow = today" guess at ${wins} of ${stations.length} stations.
    <table>
      <tr><th></th><th>Avg error (MAE)</th><th>Big-miss error (RMSE)</th></tr>
      <tr><td>Model</td><td>${s.model_mae}</td><td>${s.model_rmse}</td></tr>
      <tr><td>Tomorrow = today</td><td>${s.baseline_mae}</td><td>${s.baseline_rmse}</td></tr>
    </table>`;
}

/* ---------------- helpers ---------------- */

function categoryOf(aqi) {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Satisfactory";
  if (aqi <= 200) return "Moderate";
  if (aqi <= 300) return "Poor";
  if (aqi <= 400) return "Very Poor";
  return "Severe";
}

function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function shortDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
