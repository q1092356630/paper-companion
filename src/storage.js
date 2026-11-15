export const STORAGE_KEY = 'paper-companion-v1';

export function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== 1) return {};
    return parsed;
  } catch { return {}; }
}

export function persistState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: 1 }));
}

export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
