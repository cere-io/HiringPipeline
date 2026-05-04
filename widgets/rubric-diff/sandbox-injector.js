// Local-dev only — DO NOT upload this file to the Cere Sandbox.
// Provides window.WidgetSandbox + window.WidgetRuntime stubs for `npx serve .` previews.
window.WidgetSandbox = {
  manifestUrl: './manifest.json',
  runtimeUrl:  './widget-runtime.js',
  manifest:    null,
};

window.WidgetRuntime = {
  async query() {
    const r = await fetch('./data.json');
    const data = await r.json();
    return {
      manifest: null,
      columns: data.columns,
      rows:    data.rows,
      meta:    data.meta ?? { duration: 0, rowsRead: data.rows.length },
    };
  },
  async mount() { /* no-op */ },
};
