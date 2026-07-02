export function discoverLog(scope, event, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    scope,
    event,
    ...meta,
  };
  const level = meta.error ? "error" : "log";
  console[level](`[${scope}] ${event}`, entry);
}
