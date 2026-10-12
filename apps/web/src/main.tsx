import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { scope: import.meta.env.BASE_URL },
      );
      const announce = () => {
        if (!reg.waiting) return;
        const button = document.createElement("button");
        button.className = "update-banner";
        button.textContent = "新版本已准备好 · 点击刷新";
        button.onclick = () => {
          reg.waiting?.postMessage("activate");
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
      reg.update();
    } catch {
      /* Installation failure does not switch to offline/mock data. */
    }
  });
}
