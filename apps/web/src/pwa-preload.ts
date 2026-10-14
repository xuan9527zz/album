import { updatePwaCacheStatus, type PwaCacheState } from "./pwa-cache-status";

// A phone can suspend the worker while the page is in the background.
// Recheck remaining files on foreground/online and periodically while active.
export function startPwaPreload(registration: ServiceWorkerRegistration) {
  let state: PwaCacheState = { state: "checking", completed: 0, total: 0 };
  let sent = 0,
    retryAt = 0,
    failures = 0;
  const request = (force = false) => {
    if (document.hidden || !navigator.onLine || !registration.active) return;
    const now = Date.now();
    if (
      !force &&
      (state.state === "ready" ||
        state.storage ||
        now < retryAt ||
        now - sent < 20000)
    )
      return;
    sent = now;
    registration.active.postMessage("preload");
  };
  navigator.serviceWorker.addEventListener("message", (event) => {
    const value = event.data;
    if (
      event.source !== registration.active ||
      value?.type !== "album-preload" ||
      !Number.isInteger(value.completed) ||
      !Number.isInteger(value.total) ||
      value.completed < 0 ||
      value.total < 1 ||
      value.completed > value.total ||
      !["downloading", "partial", "ready"].includes(value.state)
    )
      return;
    state = {
      state: value.state,
      completed: value.completed,
      total: value.total,
      storage: value.storage === true,
      downloads: Array.isArray(value.downloads)
        ? value.downloads
            .slice(0, 2)
            .filter(
              (item: any) =>
                typeof item?.label === "string" &&
                Number.isFinite(item.loaded) &&
                item.loaded >= 0 &&
                Number.isFinite(item.total) &&
                item.total >= 0,
            )
        : [],
    };
    if (state.state === "partial")
      retryAt = Date.now() + Math.min(15000 * 2 ** failures++, 120000);
    if (state.state === "ready") {
      failures = 0;
      retryAt = 0;
    }
    updatePwaCacheStatus(state);
  });
  const resume = () => {
    retryAt = 0;
    request(true);
  };
  window.addEventListener("online", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("album-retry-preload", resume);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resume();
  });
  window.setInterval(() => request(), 5000);
  request(true);
}
