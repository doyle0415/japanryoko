// main.js

import { buildOverpassQuery, fetchOverpass, parseOverpassElements, calculateDistance, formatDistance } from "./overpass.js";
import { addVisitItem, getVisitList, removeVisitItem, clearVisitList, estimateCost, estimateTripDuration } from "./visitList.js";

const DATA_URL = "./data/attractions.json";

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "home") initHomePage();
  if (page === "attraction") initAttractionPage();
  if (page === "visit-list") initVisitListPage();
  initReveal();
});

async function initHomePage() {
  const grid = document.getElementById("attractionsGrid");
  const attractions = await fetchAttractions();
  grid.innerHTML = "";
  attractions.forEach((a) => {
    const card = document.createElement("a");
    card.className = "card card-link";
    card.href = `attraction.html?id=${encodeURIComponent(a.id)}`;
    card.innerHTML = `
      <img class="card-image" src="${a.image}" alt="${a.name}" />
      <div class="card-body">
        <h3 class="card-title">${a.name}</h3>
        <p class="card-desc">${a.description}</p>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function initAttractionPage() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const all = await fetchAttractions();
  const a = all.find((x) => x.id === id) || all[0];
  const nameEl = document.getElementById("attractionName");
  const imgEl = document.getElementById("attractionImage");
  const descEl = document.getElementById("attractionDesc");
  const btn = document.getElementById("loadNearbyBtn");
  const addAttractionBtn = document.getElementById("addAttractionBtn");
  const grid = document.getElementById("nearbyGrid");
  const empty = document.getElementById("nearbyEmpty");

  nameEl.textContent = a.name;
  imgEl.src = a.image;
  imgEl.alt = a.name;
  descEl.textContent = a.description;

  const map = initMap(a.lat, a.lon);

  if (addAttractionBtn) {
    addAttractionBtn.addEventListener("click", () => {
      addVisitItem({
        id: `attraction:${a.id}`,
        name: a.name,
        category: "attraction",
        lat: a.lat,
        lon: a.lon,
        website: null
      });
      addAttractionBtn.textContent = "추가 완료";
      addAttractionBtn.disabled = true;
    });
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    empty.hidden = true;
    grid.innerHTML = "";
    try {
      const q = buildOverpassQuery(a.lat, a.lon, 800);
      const elements = await fetchOverpass(q);
      const items = parseOverpassElements(elements)
        .filter((it) => it.name && it.name !== "이름 없음")
        .map((it) => ({
          ...it,
          distance: calculateDistance(a.lat, a.lon, it.lat, it.lon)
        }))
        .sort((x, y) => x.distance - y.distance);

      addMapMarkers(map, a, items);

      if (items.length === 0) {
        empty.hidden = false;
      } else {
        items.forEach((it) => {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            <div class="card-body">
              <h3 class="card-title">${formatDisplayName(it)}</h3>
              <p class="meta">
                <span class="badge">${labelCategory(it.category)}</span>
                <span>${formatDistance(it.distance)}</span>
              </p>
              ${it.cuisine ? `<p class="card-desc">요리: ${escapeHtml(it.cuisine)}</p>` : ""}
              ${it.opening_hours ? `<p class="card-desc">영업시간: ${escapeHtml(it.opening_hours)}</p>` : ""}
              ${it.phone ? `<p class="card-desc">전화: ${escapeHtml(it.phone)}</p>` : ""}
              ${it.address ? `<p class="card-desc">주소: ${escapeHtml(it.address)}</p>` : ""}
              ${it.website ? `<p class="card-desc"><a class="link" href="${it.website}" target="_blank" rel="noopener">공식 웹사이트</a></p>` : ""}
              <div class="card-actions" style="margin-top:8px;">
                ${buildReviewLinks(it)}
              </div>
              <button class="btn btn-secondary" data-add="${it.id}">방문 목록에 추가</button>
            </div>
          `;
          grid.appendChild(card);
          const addBtn = card.querySelector(`[data-add="${it.id}"]`);
          addBtn.addEventListener("click", () => {
            addVisitItem({
              id: it.id,
              name: it.name,
              category: it.category,
              lat: it.lat,
              lon: it.lon,
              website: it.website || null
            });
            addBtn.textContent = "추가 완료";
            addBtn.disabled = true;
          });
        });
      }
    } catch (e) {
      empty.hidden = false;
      empty.textContent = "주변 장소 불러오기 실패";
    } finally {
      btn.disabled = false;
    }
  });
}

async function initVisitListPage() {
  renderVisitList();
  const clearBtn = document.getElementById("clearVisitBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearVisitList();
      renderVisitList();
    });
  }
  setupVisitMap();
  updateVisitMap(getVisitList());

  const routeBtn = document.getElementById("routeBtn");
  if (routeBtn) {
    routeBtn.addEventListener("click", () => {
      const selected = getSelectedVisitItems();
      updateVisitMap(selected);
    });
  }

  const selectAllBtn = document.getElementById("selectAllBtn");
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      toggleSelectAll();
    });
  }
}

async function fetchAttractions() {
  const res = await fetch(DATA_URL, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("명소 데이터 로드 실패");
  return await res.json();
}

function renderVisitList() {
  const listEl = document.getElementById("visitList");
  const empty = document.getElementById("visitEmpty");
  const list = getVisitList();
  listEl.innerHTML = "";
  if (list.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    list.forEach((it) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div class="list-main">
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" class="route-check" data-id="${escapeHtml(String(it.id))}" checked />
            <h3 class="list-title" style="margin:0;">${escapeHtml(it.name)}</h3>
          </div>
          <p class="meta"><span class="badge">${labelCategory(it.category)}</span></p>
        </div>
        <div class="list-actions">
          <a class="btn" href="${googleMapsUrl(it)}" target="_blank" rel="noopener">구글맵</a>
          <button class="btn btn-danger" data-remove="${it.id}">삭제</button>
        </div>
      `;
      listEl.appendChild(row);
      row.querySelector(`[data-remove="${it.id}"]`).addEventListener("click", () => {
        const next = removeVisitItem(it.id);
        updateSummary(next);
        renderVisitList();
        updateVisitMap(getVisitList());
      });
    });
  }
  updateSummary(list);
  // 체크박스 변경 시 지도 갱신
  Array.from(document.querySelectorAll(".route-check")).forEach((cb) => {
    cb.addEventListener("change", () => {
      const selected = getSelectedVisitItems();
      updateVisitMap(selected);
    });
  });
}

function updateSummary(list) {
  const costEl = document.getElementById("totalCost");
  const nightsEl = document.getElementById("tripNights");
  const daysEl = document.getElementById("tripDays");
  if (!costEl || !nightsEl || !daysEl) return;
  const total = estimateCost(list);
  const { nights, days } = estimateTripDuration(list);
  costEl.textContent = `${total.toLocaleString()} JPY`;
  nightsEl.textContent = String(nights);
  daysEl.textContent = String(days);
}

function labelCategory(cat) {
  if (cat === "restaurant") return "레스토랑";
  if (cat === "cafe") return "카페";
  if (cat === "shrine") return "신사";
  if (cat === "attraction") return "관광지";
  return "기타";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initMap(lat, lon) {
  const map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([lat, lon], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
  L.marker([lat, lon]).addTo(map).bindPopup("중심 명소");
  return map;
}

function addMapMarkers(map, center, items) {
  const group = [];
  items.slice(0, 100).forEach((it) => {
    const m = L.marker([it.lat, it.lon]).addTo(map);
    m.bindPopup(`${it.name}<br>${labelCategory(it.category)}`);
    group.push(m.getLatLng());
  });
  const bounds = L.latLngBounds([[center.lat, center.lon], ...group]);
  map.fitBounds(bounds, { padding: [20, 20] });
}

function formatDisplayName(it) {
  if (it.nameKo && it.nameKo !== it.name) {
    return `${escapeHtml(it.nameKo)} (${escapeHtml(it.name)})`;
  }
  return escapeHtml(it.name);
}

function buildReviewLinks(it) {
  const nameEnc = encodeURIComponent(it.name);
  const googleMaps = `https://www.google.com/maps/search/${nameEnc}/@${it.lat},${it.lon},17z`;
  return `<a class="btn btn-secondary" href="${googleMaps}" target="_blank" rel="noopener">구글맵 리뷰</a>`;
}

function googleMapsUrl(it) {
  const nameEnc = encodeURIComponent(it.name);
  return `https://www.google.com/maps/search/${nameEnc}/@${it.lat},${it.lon},17z`;
}

// ===== 경로 지도 및 OSRM =====
let visitMap;
let visitLayerGroup;
let currentProfile = "walking";
const ORIGIN_KIX = { lat: 34.435, lon: 135.244 }; // 칸사이 국제공항

function setupVisitMap() {
  const el = document.getElementById("visitMap");
  if (!el || typeof L === "undefined") return;
  visitMap = L.map("visitMap", { scrollWheelZoom: false, zoomControl: true }).setView([34.6937, 135.5023], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(visitMap);
  visitLayerGroup = L.layerGroup().addTo(visitMap);

  const modeSel = document.getElementById("travelMode");
  if (modeSel) {
    currentProfile = modeSel.value;
    modeSel.addEventListener("change", () => {
      currentProfile = modeSel.value;
      const selected = getSelectedVisitItems();
      updateVisitMap(selected);
    });
  }
}

function getSelectedVisitItems() {
  const list = getVisitList();
  const checkedIds = new Set(
    Array.from(document.querySelectorAll(".route-check"))
      .filter((cb) => cb.checked)
      .map((cb) => cb.getAttribute("data-id"))
  );
  return list.filter((it) => checkedIds.has(String(it.id)));
}

function toggleSelectAll() {
  const checks = Array.from(document.querySelectorAll(".route-check"));
  const allChecked = checks.every((c) => c.checked);
  checks.forEach((c) => (c.checked = !allChecked));
  updateVisitMap(getSelectedVisitItems());
}

async function updateVisitMap(list) {
  if (!visitMap || !visitLayerGroup) return;
  visitLayerGroup.clearLayers();

  const markers = [];
  // 출발지(KIX)
  const originMarker = L.marker([ORIGIN_KIX.lat, ORIGIN_KIX.lon]).bindPopup("출발: KIX");
  originMarker.addTo(visitLayerGroup);
  markers.push(originMarker.getLatLng());

  if (!list || list.length === 0) {
    visitMap.setView([34.6937, 135.5023], 10);
    setMoveSummary(0, 0);
    visitMap.fitBounds(L.latLngBounds(markers), { padding: [20, 20] });
    return;
  }

  list.forEach((it) => {
    const m = L.marker([it.lat, it.lon]).bindPopup(escapeHtml(it.name));
    m.addTo(visitLayerGroup);
    markers.push(m.getLatLng());
  });

  const bounds = L.latLngBounds(markers);
  visitMap.fitBounds(bounds, { padding: [20, 20] });

  // 좌표 순서: KIX -> 선택 항목들(리스트 순서 유지)
  const waypoints = [{ lat: ORIGIN_KIX.lat, lon: ORIGIN_KIX.lon }, ...list.map((x) => ({ lat: x.lat, lon: x.lon }))];
  if (waypoints.length < 2) {
    setMoveSummary(0, 0);
    return;
  }

  try {
    const url = buildOSRMUrl(waypoints, currentProfile);
    const route = await fetchOSRMRoute(url);
    const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    L.polyline(coords, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(visitLayerGroup);
    setMoveSummary(route.distance, route.duration);
  } catch {
    // 실패 시 직선 연결
    L.polyline(markers, { color: "#94a3b8", dashArray: "6,6" }).addTo(visitLayerGroup);
    setMoveSummary(0, 0);
  }
}

function buildOSRMUrl(points, profile = "walking") {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  return `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=false`;
}

async function fetchOSRMRoute(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM 오류");
  const json = await res.json();
  if (!json.routes || !json.routes[0]) throw new Error("경로 없음");
  return json.routes[0];
}

function setMoveSummary(distanceMeters, durationSeconds) {
  const distEl = document.getElementById("moveDistance");
  const durEl = document.getElementById("moveDuration");
  if (!distEl || !durEl) return;
  const km = distanceMeters ? (distanceMeters / 1000).toFixed(1) : "0";
  const min = durationSeconds ? Math.round(durationSeconds / 60) : 0;
  distEl.textContent = `${km} km`;
  durEl.textContent = `${min}분`;
}

// ===== Reveal on scroll =====
function initReveal() {
  if (!("IntersectionObserver" in window)) return;
  const els = Array.from(document.querySelectorAll(".card, .list-item, .hero, .map, .summary, .section-title"));
  els.forEach((el) => el.classList.add("reveal"));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("reveal-visible");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}

