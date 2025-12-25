// visitList.js

const STORAGE_KEY = "visitList";

export function getVisitList() {
  const raw = localStorage.getItem(STORAGE_KEY);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setVisitList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addVisitItem(item) {
  const list = getVisitList();
  if (!list.find((x) => String(x.id) === String(item.id))) {
    list.push(item);
    setVisitList(list);
  }
  return list;
}

export function removeVisitItem(id) {
  const list = getVisitList().filter((x) => String(x.id) !== String(id));
  setVisitList(list);
  return list;
}

export function clearVisitList() {
  setVisitList([]);
}

export function estimateCost(list) {
  const costs = {
    restaurant: 2000,
    cafe: 800,
    attraction: 600,
    shrine: 0,
    other: 0
  };
  return list.reduce((sum, item) => {
    const cat = item.category || "other";
    return sum + (costs[cat] ?? 0);
  }, 0);
}

export function estimateTripDuration(list) {
  const count = list.length;
  const days = Math.max(1, Math.ceil(count / 4));
  const nights = Math.max(days - 1, 0);
  return { nights, days };
}


