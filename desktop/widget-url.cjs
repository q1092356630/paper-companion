const views = new Set(['library', 'weekly', 'reader', 'card', 'pdf']);
function parseWidgetUrl(value) {
  if (typeof value !== 'string' || value.length > 250) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'papercompanion:' || !views.has(url.hostname) || url.username || url.password || url.port || url.search || url.hash) return null;
    if (['library', 'weekly'].includes(url.hostname)) return ['', '/'].includes(url.pathname) ? {view: url.hostname} : null;
    if (!/^\/[a-f0-9]{24}$/.test(url.pathname)) return null;
    return {view: url.hostname, id: url.pathname.slice(1)};
  } catch { return null; }
}
module.exports = {parseWidgetUrl};
