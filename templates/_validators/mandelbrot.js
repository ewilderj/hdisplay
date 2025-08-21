module.exports = function validateMandelbrot(data = {}) {
  const asBool = (v) => typeof v === 'boolean' || /^(true|false|1|0|yes|no|on|off)$/i.test(String(v || ''));
  const asNum = (v) => Number.isFinite(Number(v));

  if (data.duration !== undefined && !asNum(data.duration)) {
    return { ok: false, error: 'mandelbrot: duration must be a number (ms)' };
  }
  if (data.transitionMs !== undefined && !asNum(data.transitionMs)) {
    return { ok: false, error: 'mandelbrot: transitionMs must be a number (ms)' };
  }
  if (data.shuffle !== undefined && !asBool(data.shuffle)) {
    return { ok: false, error: 'mandelbrot: shuffle must be a boolean' };
  }
  if (data.zoom !== undefined && !asBool(data.zoom)) {
    return { ok: false, error: 'mandelbrot: zoom must be a boolean' };
  }
  if (data.maxIterations !== undefined && !asNum(data.maxIterations)) {
    return { ok: false, error: 'mandelbrot: maxIterations must be a number' };
  }
  if (data.progressive !== undefined && !asBool(data.progressive)) {
    return { ok: false, error: 'mandelbrot: progressive must be a boolean' };
  }
  if (data.locations && data.locations !== 'default' && data.locations !== 'custom') {
    return { ok: false, error: 'mandelbrot: locations must be "default" or "custom"' };
  }
  if (Array.isArray(data.customLocations)) {
    for (const [i, loc] of data.customLocations.entries()) {
      if (typeof loc !== 'object' || loc === null) {
        return { ok: false, error: `mandelbrot: customLocations[${i}] must be an object` };
      }
      if (loc.bounds) {
        if (!Array.isArray(loc.bounds) || loc.bounds.length !== 4 || !loc.bounds.every(asNum)) {
          return { ok: false, error: `mandelbrot: customLocations[${i}].bounds must be [x0,x1,y0,y1]` };
        }
      } else {
        if (!asNum(loc.centerX) || !asNum(loc.centerY) || !asNum(loc.scale)) {
          return { ok: false, error: `mandelbrot: customLocations[${i}] requires centerX, centerY, scale` };
        }
      }
      if (loc.iterations !== undefined && !asNum(loc.iterations)) {
        return { ok: false, error: `mandelbrot: customLocations[${i}].iterations must be a number` };
      }
    }
  }
  return { ok: true };
};
