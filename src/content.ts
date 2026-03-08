import { cleanupTaplink, startTaplink } from "./content-logic";

const init = () => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startTaplink(), {
      once: true,
    });
  } else {
    startTaplink();
  }

  window.addEventListener("pagehide", () => cleanupTaplink(), { once: true });
};

if (typeof chrome !== "undefined" && chrome?.runtime) {
  init();
}
