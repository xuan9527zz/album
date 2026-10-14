import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { updatePwaCacheStatus } from "./pwa-cache-status";
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const value = event.data;
        if (
          value?.type === "album-preload" &&
          Number.isInteger(value.completed) &&
          Number.isInteger(value.total) &&
          ["downloading", "partial", "ready"].includes(value.state)
        )
          updatePwaCacheStatus(value);
      });
      const reg = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { scope: import.meta.env.BASE_URL, updateViaCache: "none" },
      );
      const announce = () => {
        if (!reg.waiting) return;
        if (!navigator.serviceWorker.controller) {
          reg.waiting.postMessage("activate");
          return;
        }
        if (document.querySelector(".update-banner")) return;
        const button = document.createElement("button");
        button.className = "update-banner";
        button.textContent = "新版本已准备好 · 点击刷新";
        button.onclick = () => {
          const waiting = reg.waiting;
          if (!waiting) {
            void reg
              .update()
              .then(announce)
              .catch(() => {});
            return;
          }
          button.disabled = true;
          button.textContent = "正在刷新…";
          waiting.postMessage("activate");
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = "更新尚未完成 · 点击重试";
          }, 15000);
        };
        document.body.append(button);
      };
      announce();
      reg.addEventListener("updatefound", () =>
        reg.installing?.addEventListener("statechange", announce),
      );
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          location.reload();
        }
      });
      let lastCheck = 0;
      const checkUpdate = () => {
        if (document.hidden || Date.now() - lastCheck < 60000) return;
        lastCheck = Date.now();
        void reg
          .update()
          .then(announce)
          .catch(() => {});
      };
      checkUpdate();
      document.addEventListener("visibilitychange", checkUpdate);
      window.addEventListener("pageshow", checkUpdate);
      window.setInterval(checkUpdate, 240000);
      void navigator.serviceWorker.ready.then((ready) =>
        ready.active?.postMessage("preload"),
      );
    } catch {
      /* Installation failure does not switch to offline/mock data. */
    }
  });
}
