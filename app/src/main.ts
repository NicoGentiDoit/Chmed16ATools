// Placeholder entry point for the CHMED16A tools app.
// UI wiring arrives in a later phase; nothing app-like is rendered yet.
const mount = document.querySelector<HTMLDivElement>('#app');

if (mount) {
  mount.dataset.ready = 'true';
}
