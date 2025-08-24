module.exports = function validate(data = {}) {
  const errors = [];
  
  // Default configuration
  const defaults = {
    symbols: ['MSFT', 'GOOG', 'GBPUSD'],
    scrollSpeed: 60,
    updateInterval: 5,
    showSparkline: true,
    theme: {
      bg: '#000',
      text: '#fff',
      positive: '#00ff6a',
      negative: '#ff3366',
      neutral: '#888',
      sparkline: '', // Will use change color
      separator: 'rgba(255,255,255,0.2)',
      fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace"
    },
    display: {
      showChange: true,
      showVolume: false,
      precision: 2,
      separator: ' • '
    }
  };

  // Validate symbols array
  if (data.symbols !== undefined) {
    if (!Array.isArray(data.symbols)) {
      errors.push('symbols must be an array');
    } else if (data.symbols.length === 0) {
      errors.push('symbols array cannot be empty');
    } else {
      // Validate each symbol
      data.symbols.forEach((symbol, index) => {
        if (typeof symbol !== 'string' || symbol.trim().length === 0) {
          errors.push(`symbols[${index}] must be a non-empty string`);
        } else if (symbol.length > 10) {
          errors.push(`symbols[${index}] is too long (max 10 characters)`);
        }
      });
    }
  }

  // Validate scrollSpeed
  if (data.scrollSpeed !== undefined) {
    const speed = Number(data.scrollSpeed);
    if (isNaN(speed) || speed < 20 || speed > 200) {
      errors.push('scrollSpeed must be a number between 20 and 200');
    }
  }

  // Validate updateInterval
  if (data.updateInterval !== undefined) {
    const interval = Number(data.updateInterval);
    if (isNaN(interval) || interval < 1 || interval > 60) {
      errors.push('updateInterval must be a number between 1 and 60 minutes');
    }
  }

  // Validate showSparkline
  if (data.showSparkline !== undefined && typeof data.showSparkline !== 'boolean') {
    errors.push('showSparkline must be a boolean');
  }

  // Validate apiKey
  if (data.apiKey !== undefined && typeof data.apiKey !== 'string') {
    errors.push('apiKey must be a string');
  }

  // Validate theme object
  if (data.theme !== undefined) {
    if (typeof data.theme !== 'object' || data.theme === null) {
      errors.push('theme must be an object');
    } else {
      const colorFields = ['bg', 'text', 'positive', 'negative', 'neutral', 'sparkline', 'separator'];
      colorFields.forEach(field => {
        if (data.theme[field] !== undefined && typeof data.theme[field] !== 'string') {
          errors.push(`theme.${field} must be a string`);
        }
      });
      
      if (data.theme.fontFamily !== undefined && typeof data.theme.fontFamily !== 'string') {
        errors.push('theme.fontFamily must be a string');
      }
    }
  }

  // Validate display object
  if (data.display !== undefined) {
    if (typeof data.display !== 'object' || data.display === null) {
      errors.push('display must be an object');
    } else {
      if (data.display.showChange !== undefined && typeof data.display.showChange !== 'boolean') {
        errors.push('display.showChange must be a boolean');
      }
      
      if (data.display.showVolume !== undefined && typeof data.display.showVolume !== 'boolean') {
        errors.push('display.showVolume must be a boolean');
      }
      
      if (data.display.precision !== undefined) {
        const precision = Number(data.display.precision);
        if (isNaN(precision) || precision < 0 || precision > 6) {
          errors.push('display.precision must be a number between 0 and 6');
        }
      }
      
      if (data.display.separator !== undefined && typeof data.display.separator !== 'string') {
        errors.push('display.separator must be a string');
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join('; ') };
  }

  // Merge with defaults
  const result = {
    ...defaults,
    ...data,
    theme: { ...defaults.theme, ...(data.theme || {}) },
    display: { ...defaults.display, ...(data.display || {}) }
  };

  return { ok: true, data: result };
};
