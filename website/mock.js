// --- arrow click: slower-than-default smooth scroll (click only; never touches
//     the user's own wheel/trackpad scrolling) ---
const cue = document.querySelector(".scroll-cue");
if (cue && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const DURATION = 550; // ms — tune to taste
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  cue.addEventListener("click", (e) => {
    const target = document.querySelector(cue.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 0;
    const startY = window.scrollY;
    const endY = target.getBoundingClientRect().top + startY - barH;
    const dist = endY - startY;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / DURATION);
      window.scrollTo({ top: startY + dist * easeInOutCubic(p), behavior: "instant" });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// Flip the mock cockpit's theme.
const mock = document.getElementById("mock");
if (mock) {
  for (const btn of mock.querySelectorAll("[data-set-theme]")) {
    btn.addEventListener("click", () => {
      mock.dataset.theme = btn.dataset.setTheme;
      for (const b of mock.querySelectorAll("[data-set-theme]")) {
        b.setAttribute("aria-pressed", String(b === btn));
      }
    });
  }
}
