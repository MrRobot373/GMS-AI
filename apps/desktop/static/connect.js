// The connect screen. window.aatmiqDesktop comes from connect-preload.ts.
const form = document.getElementById("form");
const input = document.getElementById("address");
const error = document.getElementById("error");
const go = document.getElementById("go");

function show(state) {
  if (!state) return;
  if (state.server && !input.value) input.value = state.server;
  error.hidden = !state.error;
  error.textContent = state.error || "";
}

window.aatmiqDesktop.state().then(show);
window.aatmiqDesktop.onState(show);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  go.disabled = true;
  go.textContent = "Connecting…";
  error.hidden = true;
  const r = await window.aatmiqDesktop.connect(input.value);
  if (!r.ok) {
    error.textContent = r.error;
    error.hidden = false;
    go.disabled = false;
    go.textContent = "Connect";
    input.focus();
  }
});

// Without the picture (an older build), leave the page as it was rather than show a broken image.
for (const img of document.querySelectorAll("img.art")) {
  if (img.complete && !img.naturalWidth) img.remove();
  else img.addEventListener("error", () => img.remove());
}
