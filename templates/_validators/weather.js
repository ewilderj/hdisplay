module.exports = function validateWeather(data = {}) {
  const loc = data.location;
  if (typeof loc !== 'string' || loc.trim().length === 0) {
    return { ok: false, error: 'weather requires data.location (string)' };
  }
  const units = data.units;
  if (units !== 'C' && units !== 'F') {
    return { ok: false, error: 'weather requires data.units to be "C" or "F"' };
  }
  if (data.refreshInterval !== undefined) {
    const m = Number(data.refreshInterval);
    if (!Number.isFinite(m)) return { ok: false, error: 'weather: refreshInterval must be a number' };
    if (m < 10 || m > 120) return { ok: false, error: 'weather: refreshInterval must be between 10 and 120 minutes' };
  }
  if (data.showConditionText !== undefined && typeof data.showConditionText !== 'boolean') {
    return { ok: false, error: 'weather: showConditionText must be a boolean' };
  }
  if (data.darkMode !== undefined && typeof data.darkMode !== 'boolean') {
    return { ok: false, error: 'weather: darkMode must be a boolean' };
  }
  return { ok: true };
};
