module.exports = function validateTimeleft(data = {}) {
  const m = Number(data.minutes);
  if (!Number.isFinite(m) || m < 0) {
    return { ok: false, error: 'timeleft requires data.minutes (non-negative number)' };
  }
  if (data.label !== undefined && typeof data.label !== 'string') {
    return { ok: false, error: 'timeleft: label must be a string' };
  }
  return { ok: true };
};
