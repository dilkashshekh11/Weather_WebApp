// Paste your OpenWeather API key below (https://openweathermap.org/api).
const API_KEY = "9232a97d03a12ac4edcc4eae1084e4b4";

const $ = (s) => document.querySelector(s);
const form = $("#search-form"), input = $("#city-input"), statusEl = $("#status");
const dash = $("#dash"), suggestEl = $("#suggest"), goBtn = $("#go");
const API = "https://api.openweathermap.org";

let unit = "metric";
let current = null;   // { weather, forecast, air, label }
let tick = null;

const emoji = (id, night = false) => {
  if (id >= 200 && id < 300) return "⛈️";
  if (id >= 300 && id < 400) return "🌦️";
  if (id >= 500 && id < 600) return "🌧️";
  if (id >= 600 && id < 700) return "❄️";
  if (id >= 700 && id < 800) return "🌫️";
  if (id === 800) return night ? "🌙" : "☀️";
  if (id === 801) return "🌤️";
  if (id === 802) return "⛅";
  return "☁️";
};
const skyOf = (id, tempC) => {
  if (id < 300) return "storm";
  if (id < 600) return "rain";
  if (id < 700) return "snow";
  if (id < 800) return "mist";
  if (id === 800) return tempC >= 32 ? "hot" : "clear";
  return "clouds";
};

// ---------- unit helpers (data is always fetched in metric) ----------
const T = (c) => Math.round(unit === "metric" ? c : c * 9 / 5 + 32);
const tU = () => (unit === "metric" ? "°C" : "°F");
const speed = (ms) => unit === "metric" ? `${Math.round(ms * 3.6)} km/h` : `${Math.round(ms * 2.237)} mph`;
const dist = (m) => unit === "metric" ? `${(m / 1000).toFixed(1)} km` : `${(m / 1609.34).toFixed(1)} mi`;
const compass = (d) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];

// Time at the searched city: shift by its UTC offset, then read UTC fields.
const cityDate = (unixSec, tz) => new Date((unixSec + tz) * 1000);
const hm = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

// ---------- API ----------
async function api(path, params) {
  const res = await fetch(`${API}${path}?${new URLSearchParams({ ...params, appid: API_KEY })}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function load(lat, lon, label) {
  if (API_KEY === "PASTE_YOUR_OPENWEATHER_API_KEY_HERE") return setStatus("Add your OpenWeather API key in script.js first.", true);
  goBtn.disabled = true;
  setStatus("Scanning atmosphere...");
  try {
    const p = { lat, lon, units: "metric" };
    const [weather, forecast, air, daily] = await Promise.all([
      api("/data/2.5/weather", p),
      api("/data/2.5/forecast", p),
      api("/data/2.5/air_pollution", { lat, lon }).catch(() => null),
      fetch("https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
        latitude: lat, longitude: lon, past_days: 7, forecast_days: 8, timezone: "auto",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max,uv_index_max",
      })).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    current = { weather, forecast, air, daily, label: label || `${weather.name}, ${weather.sys.country}` };
    render();
    saveRecent(current.label, lat, lon);
    setStatus("Live conditions");
  } catch (e) {
    setStatus(`Error: ${e.message}`, true);
  } finally {
    goBtn.disabled = false;
  }
}

async function geocode(q, limit = 5) {
  return api("/geo/1.0/direct", { q, limit });
}

// ---------- render ----------
function render() {
  const { weather: w, forecast: f, air, label } = current;
  const tz = w.timezone, id = w.weather[0].id;
  const nowSec = Math.floor(Date.now() / 1000);
  const night = nowSec < w.sys.sunrise || nowSec > w.sys.sunset;

  document.body.dataset.sky = skyOf(id, w.main.temp);
  $("#location").textContent = label;
  $("#description").textContent = w.weather[0].description;
  $("#icon").textContent = emoji(id, night);
  $("#temperature").textContent = `${T(w.main.temp)}${tU()}`;
  $("#feels").textContent = `Feels like ${T(w.main.feels_like)}${tU()}`;
  $("#hi").textContent = `${T(w.main.temp_max)}${tU()}`;
  $("#lo").textContent = `${T(w.main.temp_min)}${tU()}`;

  // temperature gauge: -10°C .. 45°C mapped onto the ring
  const pct = Math.min(1, Math.max(0.04, (w.main.temp + 10) / 55));
  $("#ring").style.strokeDashoffset = 540 * (1 - pct);

  $("#humidity").textContent = `${w.main.humidity}%`;
  $("#humBar").style.width = `${w.main.humidity}%`;
  $("#wind").textContent = speed(w.wind.speed);
  $("#windDir").textContent = `from ${compass(w.wind.deg || 0)}`;
  $("#arrow").style.transform = `rotate(${((w.wind.deg || 0) + 180) % 360}deg)`;
  $("#pressure").textContent = `${w.main.pressure} hPa`;
  $("#visibility").textContent = dist(w.visibility ?? 10000);
  $("#clouds").textContent = `${w.clouds.all}%`;
  $("#cloudBar").style.width = `${w.clouds.all}%`;

  const aqi = air?.list?.[0]?.main?.aqi;
  const aqiNames = ["", "Good", "Fair", "Moderate", "Poor", "Very poor"];
  $("#aqi").textContent = aqi ? aqiNames[aqi] : "n/a";
  $("#aqiBar").style.width = aqi ? `${aqi * 20}%` : "0";

  $("#rise").textContent = hm(cityDate(w.sys.sunrise, tz));
  $("#set").textContent = hm(cityDate(w.sys.sunset, tz));
  const sunPct = (nowSec - w.sys.sunrise) / (w.sys.sunset - w.sys.sunrise);
  $("#sunBar").style.width = `${Math.min(100, Math.max(0, sunPct * 100))}%`;

  applyEffects(w, night);
  renderHourly(f, tz);
  renderTrend();
  renderAlerts();

  clearInterval(tick);
  const paint = () => ($("#clock").textContent = hm(cityDate(Math.floor(Date.now() / 1000), tz)));
  paint();
  tick = setInterval(paint, 15000);
  dash.classList.remove("hidden");
}

function renderHourly(f, tz) {
  const items = f.list.slice(0, 8);
  const temps = items.map((i) => T(i.main.temp));
  const min = Math.min(...temps), max = Math.max(...temps), span = max - min || 1;
  const W = 640, H = 150, padX = W / 16;
  const pts = temps.map((t, i) => [padX + i * ((W - padX * 2) / 7), 100 - ((t - min) / span) * 70 + 20]);
  const line = pts.map((p) => p.join(",")).join(" ");
  $("#chart").innerHTML =
    `<polygon points="${pts[0][0]},${H} ${line} ${pts.at(-1)[0]},${H}" fill="var(--accent)" opacity=".12"/>` +
    `<polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 4px var(--accent))"/>` +
    pts.map((p, i) => `<text x="${p[0]}" y="${p[1] - 10}" text-anchor="middle" style="fill:var(--text)" font-size="14" font-family="inherit">${temps[i]}°</text><circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--accent)"/>`).join("");
  $("#hours").innerHTML = items.map((i) => {
    const d = cityDate(i.dt, tz);
    const night = d.getUTCHours() >= 19 || d.getUTCHours() < 6;
    return `<div><span>${emoji(i.weather[0].id, night)}</span>${hm(d)}</div>`;
  }).join("");
}

// ---------- status, recents ----------
function setStatus(msg, err = false) { statusEl.textContent = msg; statusEl.classList.toggle("err", err); }

function recents() { try { return JSON.parse(localStorage.getItem("wn-recent")) || []; } catch { return []; } }
function saveRecent(label, lat, lon) {
  const list = [{ label, lat, lon }, ...recents().filter((r) => r.label !== label)].slice(0, 5);
  try { localStorage.setItem("wn-recent", JSON.stringify(list)); } catch {}
  drawRecents();
}
function drawRecents() {
  const box = $("#recent");
  box.innerHTML = "";
  recents().forEach((r) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = r.label;
    b.onclick = () => load(r.lat, r.lon, r.label);
    box.append(b);
  });
}

// ---------- events ----------
document.querySelectorAll(".unit button").forEach((b) => b.addEventListener("click", () => {
  unit = b.dataset.unit;
  document.querySelectorAll(".unit button").forEach((x) => x.classList.toggle("on", x === b));
  if (current) render();
}));

$("#locate").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("Geolocation is not supported in this browser.", true);
  setStatus("Locating you...");
  navigator.geolocation.getCurrentPosition(
    (p) => load(p.coords.latitude, p.coords.longitude),
    () => setStatus("Location blocked. Allow access in your browser, or search for a city.", true),
    { timeout: 10000 }
  );
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  suggestEl.classList.add("hidden");
  const q = input.value.trim();
  if (!q) return;
  try {
    const [hit] = await geocode(q, 1);
    if (!hit) return setStatus("City not found. Check the spelling and try again.", true);
    load(hit.lat, hit.lon, `${hit.name}, ${hit.country}`);
  } catch (err) { setStatus(`Error: ${err.message}`, true); }
});

let timer;
input.addEventListener("input", () => {
  clearTimeout(timer);
  const q = input.value.trim();
  if (q.length < 2 || API_KEY.startsWith("PASTE")) return suggestEl.classList.add("hidden");
  timer = setTimeout(async () => {
    try {
      const hits = await geocode(q);
      suggestEl.innerHTML = "";
      hits.forEach((h) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.innerHTML = `${h.name}<small>${[h.state, h.country].filter(Boolean).join(", ")}</small>`;
        li.onclick = () => { input.value = h.name; suggestEl.classList.add("hidden"); load(h.lat, h.lon, `${h.name}, ${h.country}`); };
        suggestEl.append(li);
      });
      suggestEl.classList.toggle("hidden", !hits.length);
    } catch {}
  }, 300);
});
document.addEventListener("click", (e) => { if (!form.contains(e.target)) suggestEl.classList.add("hidden"); });

drawRecents();
const last = recents()[0];
if (last) load(last.lat, last.lon, last.label);

// ---------- condition-driven visuals ----------
function applyEffects(w, night) {
  const id = w.weather[0].id, temp = w.main.temp, clouds = w.clouds.all;
  const est = id < 300 ? 4 : id < 400 ? 0.4 : id === 500 ? 1 : id === 501 ? 4 : id < 600 ? 9 : 0;
  const rain = id >= 600 && id < 700 ? 0 : (w.rain?.["1h"] ?? w.rain?.["3h"] ?? est);
  const snow = id >= 600 && id < 700 ? (w.snow?.["1h"] ?? 1.5) : 0;
  fx.set({ rain: id >= 200 && id < 600 ? Math.max(rain, 0.3) : 0, snow, clouds, temp, night, storm: id < 300, mist: id >= 700 && id < 800 });

  const chips = [];
  if (rain > 0 || (id >= 200 && id < 600)) {
    const r = Math.max(rain, 0.3);
    chips.push(`${r > 7.6 ? "Heavy" : r > 2.5 ? "Moderate" : "Light"} rain · ${r.toFixed(1)} mm/h`);
  }
  if (snow) chips.push(`${snow > 4 ? "Heavy" : "Light"} snow · ${snow.toFixed(1)} mm/h`);
  if (id < 300) chips.push("Thunderstorm");
  if (clouds >= 85) chips.push(`Overcast · ${clouds}% cloud`);
  else if (clouds >= 50) chips.push(`Cloudy · ${clouds}% cloud`);
  if (temp >= 35) chips.push(`Extreme heat · ${T(temp)}${tU()}`);
  else if (temp >= 30) chips.push(`Hot · ${T(temp)}${tU()}`);
  else if (temp <= -5) chips.push(`Severe cold · ${T(temp)}${tU()}`);
  else if (temp <= 3) chips.push(`Freezing · ${T(temp)}${tU()}`);
  if (w.wind.speed >= 10) chips.push(`Strong wind · ${speed(w.wind.speed)}`);
  if (w.main.humidity >= 85) chips.push(`Humid · ${w.main.humidity}%`);
  if (id >= 700 && id < 800) chips.push("Low visibility");
  $("#chips").innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join("");
}

// ---------- theme ----------
(function initTheme() {
  let t = null;
  try { t = localStorage.getItem("wn-theme"); } catch {}
  if (!t) t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.body.dataset.theme = t;
  $("#theme").addEventListener("click", () => {
    const next = document.body.dataset.theme === "light" ? "dark" : "light";
    document.body.dataset.theme = next;
    try { localStorage.setItem("wn-theme", next); } catch {}
  });
})();

// ---------- 7 days back + 7 days ahead, and hazard alerts ----------
const TODAY_I = 7;
const wmo = (c) => c === 0 ? "☀️" : c === 1 ? "🌤️" : c === 2 ? "⛅" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 57 ? "🌦️" : c <= 67 ? "🌧️" : c <= 77 ? "❄️" : c <= 82 ? "🌧️" : c <= 86 ? "❄️" : "⛈️";
const dayLabel = (iso, opts) => new Date(iso + "T00:00:00Z").toLocaleDateString("en", { ...opts, timeZone: "UTC" });

function dayHazards(i) {
  const D = current.daily.daily, h = [], add = (lv, title, tip) => h.push({ lv, title, tip });
  const tx = D.temperature_2m_max[i], tn = D.temperature_2m_min[i], p = D.precipitation_sum[i] ?? 0;
  const g = D.wind_gusts_10m_max[i] ?? 0, sn = D.snowfall_sum[i] ?? 0, uv = D.uv_index_max[i] ?? 0, code = D.weather_code[i];
  if (tx >= 40) add(2, `Extreme heat, high ${T(tx)}${tU()}`, "Stay indoors in the hottest hours, drink water, and check on older people and pets.");
  else if (tx >= 35) add(1, `Heat, high ${T(tx)}${tU()}`, "Limit outdoor activity at midday and keep drinking water.");
  if (tn <= -20) add(2, `Dangerous cold, low ${T(tn)}${tU()}`, "Frostbite risk in minutes. Stay inside and cover all skin if you go out.");
  else if (tn <= -10) add(1, `Severe cold, low ${T(tn)}${tU()}`, "Dress in layers and limit time outdoors.");
  if (g >= 100) add(2, `Destructive winds, gusts ${speed(g / 3.6)}`, "Stay indoors away from windows. Avoid travel.");
  else if (g >= 70) add(1, `Strong gusts, ${speed(g / 3.6)}`, "Secure loose objects and take care when driving.");
  if (p >= 100) add(2, `Extreme rainfall, ${Math.round(p)} mm`, "Flash-flood risk. Avoid low ground and flooded roads.");
  else if (p >= 50) add(1, `Heavy rainfall, ${Math.round(p)} mm`, "Possible flooding. Take care on roads.");
  if (sn >= 20) add(2, `Extreme snowfall, ${Math.round(sn)} cm`, "Travel may be impossible. Stock up and stay in.");
  else if (sn >= 10) add(1, `Heavy snowfall, ${Math.round(sn)} cm`, "Expect road disruption.");
  if (code >= 96) add(2, "Thunderstorm with hail", "Stay indoors. Hail and lightning can injure.");
  else if (code === 95) add(1, "Thunderstorm", "Avoid open areas and tall trees.");
  if (uv >= 11) add(2, `Extreme UV index ${Math.round(uv)}`, "Avoid direct sun 11:00 to 15:00. Use SPF 50 and cover up.");
  else if (uv >= 8) add(1, `Very high UV index ${Math.round(uv)}`, "Use sunscreen, a hat and sunglasses.");
  return h;
}

function nowHazards() {
  const w = current.weather, id = w.weather[0].id, h = [], add = (lv, title, tip) => h.push({ lv, title, tip });
  const fl = w.main.feels_like, ws = w.wind.speed, aqi = current.air?.list?.[0]?.main?.aqi;
  const rain = w.rain?.["1h"] ?? 0, snow = w.snow?.["1h"] ?? 0, vis = w.visibility ?? 10000;
  if (fl >= 41) add(2, `Dangerous heat, feels like ${T(fl)}${tU()}`, "Heat stroke risk. Stay in cool shade or indoors and drink water.");
  else if (fl >= 35) add(1, `Heat, feels like ${T(fl)}${tU()}`, "Limit exertion outdoors and keep hydrated.");
  if (fl <= -20) add(2, `Dangerous cold, feels like ${T(fl)}${tU()}`, "Frostbite risk in minutes. Stay inside.");
  else if (fl <= -10) add(1, `Severe cold, feels like ${T(fl)}${tU()}`, "Dress in layers and cover exposed skin.");
  if (ws >= 20) add(2, `Violent wind, ${speed(ws)}`, "Stay indoors away from windows. Avoid travel.");
  else if (ws >= 14) add(1, `Strong wind, ${speed(ws)}`, "Secure loose objects. Take care driving.");
  if (id === 781) add(2, "Tornado reported", "Take shelter immediately in a sturdy building.");
  else if (id >= 200 && id < 300) add([202, 212, 221, 232].includes(id) ? 2 : 1, "Thunderstorm", "Stay indoors, away from open areas and tall trees.");
  if (rain >= 30) add(2, `Extreme rain, ${rain.toFixed(0)} mm/h`, "Flash-flood risk. Move away from low ground.");
  else if (rain >= 7.6) add(1, `Heavy rain, ${rain.toFixed(1)} mm/h`, "Possible flooding. Drive slowly.");
  if (snow >= 10) add(2, `Extreme snowfall, ${snow.toFixed(0)} mm/h`, "Avoid travel.");
  else if (snow >= 4) add(1, `Heavy snowfall, ${snow.toFixed(1)} mm/h`, "Roads may become impassable.");
  if (vis < 200) add(2, `Near-zero visibility, ${dist(vis)}`, "Avoid driving if you can.");
  else if (vis < 1000) add(1, `Poor visibility, ${dist(vis)}`, "Drive slowly and use fog lights.");
  if (aqi === 5) add(2, "Very poor air quality", "Stay indoors, close windows, wear an N95 mask if you must go out.");
  else if (aqi === 4) add(1, "Poor air quality", "Sensitive people should limit time outdoors.");
  return h;
}

function dayLevels() {
  const D = current.daily?.daily;
  return D ? D.time.map((_, i) => (i >= TODAY_I ? Math.max(0, ...dayHazards(i).map((x) => x.lv)) : 0)) : [];
}

function renderAlerts() {
  const items = nowHazards().map((x) => ({ ...x, when: "Now" }));
  const D = current.daily?.daily;
  if (D) for (let i = TODAY_I; i < D.time.length; i++) {
    dayHazards(i).forEach((x) => items.push({ ...x, when: i === TODAY_I ? "Today" : dayLabel(D.time[i], { weekday: "short", day: "numeric", month: "short" }) }));
  }
  const box = $("#alerts");
  if (!items.length) { box.innerHTML = `<div class="ok">✓ No dangerous conditions now or in the next 7 days.</div>`; return; }
  items.sort((a, b) => b.lv - a.lv);
  const nD = items.filter((x) => x.lv === 2).length, nW = items.length - nD;
  const head = [nD && `${nD} danger${nD > 1 ? "s" : ""}`, nW && `${nW} warning${nW > 1 ? "s" : ""}`].filter(Boolean).join(", ");
  box.innerHTML = `<p class="head">${nD ? "🚨" : "⚠️"} ${head}</p>` + items.slice(0, 6).map((x) =>
    `<div class="row lv${x.lv}"><span class="ic">${x.lv === 2 ? "🚨" : "⚠️"}</span><div><span class="lvl">${x.lv === 2 ? "Danger" : "Warning"}</span>${x.title}<span class="when">${x.when}</span><p class="what">${x.tip}</p></div></div>`).join("") +
    (items.length > 6 ? `<p class="what">+ ${items.length - 6} more in the day cards below.</p>` : "");
}

function renderTrend() {
  const D = current.daily?.daily, svg = $("#trend"), strip = $("#days");
  if (!D) { svg.innerHTML = ""; strip.innerHTML = `<p class="status">History and the 7-day outlook are unavailable right now.</p>`; return; }
  const n = D.time.length, mx = D.temperature_2m_max.map(T), mn = D.temperature_2m_min.map(T), lv = dayLevels();
  const lo = Math.min(...mn), hi = Math.max(...mx), span = hi - lo || 1, W = 900, px = 30;
  const x = (i) => px + i * ((W - px * 2) / (n - 1)), y = (v) => 135 - ((v - lo) / span) * 95;
  const line = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const cx = (i) => (lv[i] === 2 ? "var(--danger)" : lv[i] === 1 ? "var(--warn)" : "var(--accent)");
  svg.innerHTML =
    `<rect x="0" y="0" width="${(x(TODAY_I - 1) + x(TODAY_I)) / 2}" height="170" style="fill:var(--dim)" opacity=".1"/>` +
    `<line x1="${x(TODAY_I)}" x2="${x(TODAY_I)}" y1="20" y2="160" style="stroke:var(--accent)" stroke-dasharray="4 4"/>` +
    `<text x="10" y="14" font-size="12" style="fill:var(--dim)">Past 7 days</text><text x="${x(TODAY_I) + 8}" y="14" font-size="12" style="fill:var(--dim)">Today and next 7 days</text>` +
    `<polyline points="${line(mn)}" fill="none" style="stroke:var(--dim)" stroke-width="2"/>` +
    `<polyline points="${line(mx)}" fill="none" style="stroke:var(--accent)" stroke-width="2.5"/>` +
    mx.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${lv[i] ? 6 : 3.5}" style="fill:${cx(i)}"/><text x="${x(i)}" y="${y(v) - 11}" text-anchor="middle" font-size="12" style="fill:var(--text)">${v}°</text>`).join("") +
    mn.map((v, i) => `<text x="${x(i)}" y="${y(v) + 18}" text-anchor="middle" font-size="11" style="fill:var(--dim)">${v}°</text>`).join("");
  strip.innerHTML = D.time.map((t, i) =>
    `<div class="day ${i < TODAY_I ? "past" : i === TODAY_I ? "today" : ""} ${lv[i] ? "lv" + lv[i] : ""}" title="${lv[i] === 2 ? "Danger" : lv[i] === 1 ? "Warning" : ""}">` +
    `<b>${i === TODAY_I ? "Today" : dayLabel(t, { weekday: "short" })}</b><small>${dayLabel(t, { day: "numeric", month: "short" })}</small>` +
    `<span class="di">${wmo(D.weather_code[i])}</span><div class="r"><strong>${mx[i]}°</strong> / ${mn[i]}°</div>` +
    `<small>${(D.precipitation_sum[i] ?? 0).toFixed(1)} mm</small>${lv[i] ? `<small style="color:${cx(i)};font-weight:700">${lv[i] === 2 ? "Danger" : "Warning"}</small>` : ""}</div>`).join("");
  const el = strip.querySelector(".today");
  if (el) strip.scrollLeft = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
}
