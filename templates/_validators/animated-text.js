module.exports = function validateAnimatedText(data = {}) {
  const text = data.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'animated-text requires data.text (non-empty string)' };
  }
  if (data.velocity !== undefined) {
    const v = Number(data.velocity);
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, error: 'animated-text: velocity must be a positive number' };
    }
  }
  if (data.speed !== undefined) {
    const s = Number(data.speed);
    if (!Number.isFinite(s) || s <= 0) {
      return { ok: false, error: 'animated-text: speed must be a positive number' };
    }
  }
  return { ok: true };
};
