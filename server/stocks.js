const fs = require('fs');
const path = require('path');
const axios = require('axios');

const STOCK_MIN_REFRESH_MIN = 1;
const STOCK_MAX_REFRESH_MIN = 60;
const _STOCK_STALE_TOLERANCE_MS = 30 * 60 * 1000; // 30 minutes (unused placeholder retained for docs)

const stockCache = new Map(); // key: `${symbols.join(',')}|${provider}` -> { data, fetchedAt, ttlMs }

function getConfigPath() {
  return process.env.HDS_CONFIG_PATH || path.join(__dirname, '..', 'config.json');
}

function getConfigJSON() {
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function getStockProviderId() {
  const cfg = getConfigJSON();
  const raw = (cfg && cfg.stocks && cfg.stocks.provider) || null;
  const val = String(raw || '').toLowerCase();
  if (val === 'finnhub') return 'finnhub';
  if (val === 'alphavantage') return 'alphavantage';
  return 'finnhub'; // Default to Finnhub as it has better free tier
}

function getAlphaVantageApiKey() {
  const fromEnv = process.env.ALPHA_VANTAGE_API_KEY;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const cfg = getConfigJSON();
    const val = cfg?.apiKeys?.alphavantage;
    if (val && String(val).trim()) return String(val).trim();
  } catch {}
  return null;
}

function getFinnhubApiKey() {
  const fromEnv = process.env.FINNHUB_API_KEY;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const cfg = getConfigJSON();
    const val = cfg?.apiKeys?.finnhub;
    if (val && String(val).trim()) return String(val).trim();
  } catch {}
  return null;
}

function clampRefreshMinutes(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 5;
  return Math.max(STOCK_MIN_REFRESH_MIN, Math.min(STOCK_MAX_REFRESH_MIN, Math.floor(n)));
}

// Rate limiting for Alpha Vantage API
let lastAlphaVantageRequest = 0;
const ALPHA_VANTAGE_MIN_INTERVAL = 12000; // 12 seconds between requests

async function makeRateLimitedRequest(url, provider = 'alphavantage') {
  if (provider === 'alphavantage') {
    const now = Date.now();
    const timeSinceLastRequest = now - lastAlphaVantageRequest;
    
    if (timeSinceLastRequest < ALPHA_VANTAGE_MIN_INTERVAL) {
      const delay = ALPHA_VANTAGE_MIN_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    lastAlphaVantageRequest = Date.now();
  }
  
  return axios.get(url, { timeout: 10000 });
}

const stockProviders = {
  alphavantage: {
    id: 'alphavantage',
    needsApiKey: true,
    getApiKey: getAlphaVantageApiKey,
    
    parseSymbol(symbol) {
      // Detect forex pairs (simple heuristic: length > 5 or contains /)
      if (symbol.length > 5 || symbol.includes('/')) {
        let fromCurrency, toCurrency;
        if (symbol.includes('/')) {
          [fromCurrency, toCurrency] = symbol.split('/');
        } else {
          // Assume format like GBPUSD
          fromCurrency = symbol.slice(0, 3);
          toCurrency = symbol.slice(3);
        }
        return { type: 'forex', fromCurrency, toCurrency };
      } else {
        return { type: 'stock', symbol };
      }
    },

    async fetchStockQuote(symbol, apiKey) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
      
      const response = await makeRateLimitedRequest(url, 'alphavantage');
      const data = response.data;
      
      if (data['Information'] && data['Information'].includes('rate limit')) {
        throw new Error('API call frequency limit reached');
      }
      
      if (data['Error Message']) {
        throw new Error(`Invalid symbol: ${symbol}`);
      }
      
      if (data['Note']) {
        throw new Error('API call frequency limit reached');
      }
      
      const quote = data['Global Quote'];
      if (!quote) {
        throw new Error('No quote data available');
      }
      
      return {
        symbol,
        name: symbol,
        price: parseFloat(quote['05. price']),
        change: parseFloat(quote['09. change']),
        changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
        volume: parseInt(quote['06. volume']) || 0,
        lastUpdate: quote['07. latest trading day']
      };
    },

    async fetchForexRate(fromCurrency, toCurrency, apiKey) {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${apiKey}`;
      
      const response = await makeRateLimitedRequest(url, 'alphavantage');
      const data = response.data;
      
      if (data['Information'] && data['Information'].includes('rate limit')) {
        throw new Error('API call frequency limit reached');
      }
      
      if (data['Error Message']) {
        throw new Error(`Invalid currency pair: ${fromCurrency}/${toCurrency}`);
      }
      
      if (data['Note']) {
        throw new Error('API call frequency limit reached');
      }
      
      const rate = data['Realtime Currency Exchange Rate'];
      if (!rate) {
        throw new Error('No exchange rate data available');
      }
      
      const currentRate = parseFloat(rate['5. Exchange Rate']);
      const prevRate = parseFloat(rate['8. Previous Close']) || currentRate;
      const change = currentRate - prevRate;
      const changePercent = prevRate !== 0 ? (change / prevRate) * 100 : 0;
      
      return {
        symbol: `${fromCurrency}/${toCurrency}`,
        name: `${fromCurrency} to ${toCurrency}`,
        price: currentRate,
        change,
        changePercent,
        lastUpdate: rate['6. Last Refreshed']
      };
    },

  async fetchHistoricalData(symbol, apiKey) {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
      
      try {
        const response = await makeRateLimitedRequest(url, 'alphavantage');
        const data = response.data;
        
        if (data['Error Message'] || data['Note'] || (data['Information'] && data['Information'].includes('rate limit'))) {
          return [];
        }
        
        const timeSeries = data['Time Series (Daily)'];
        if (!timeSeries) {
          return [];
        }
        
        // Get last 7 days of closing prices
        const dates = Object.keys(timeSeries).sort().reverse().slice(0, 7);
        const prices = dates.map(date => parseFloat(timeSeries[date]['4. close']));
        
        return prices;
      } catch {
        return [];
      }
    }
  },

  finnhub: {
    id: 'finnhub',
    needsApiKey: true,
    getApiKey: getFinnhubApiKey,
    
    parseSymbol(symbol) {
      // Finnhub uses different format for forex
      if (symbol.length > 5 || symbol.includes('/')) {
        let fromCurrency, toCurrency;
        if (symbol.includes('/')) {
          [fromCurrency, toCurrency] = symbol.split('/');
        } else {
          fromCurrency = symbol.slice(0, 3);
          toCurrency = symbol.slice(3);
        }
        return { type: 'forex', symbol: `OANDA:${fromCurrency}_${toCurrency}` };
      } else {
        return { type: 'stock', symbol: symbol.toUpperCase() };
      }
    },

    async fetchStockQuote(symbol, apiKey) {
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
      
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      if (!data.c || data.c === 0) {
        throw new Error('No quote data available');
      }
      
      const price = data.c; // current price
      const previousClose = data.pc; // previous close
      const change = price - previousClose;
      const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
      
      return {
        symbol,
        name: symbol,
        price: price,
        change: change,
        changePercent: changePercent,
        volume: 0, // Finnhub basic doesn't include volume in quote endpoint
        lastUpdate: new Date().toISOString()
      };
    },

  async fetchForexRate(symbol, _apiKey) {
      // Finnhub free tier doesn't support forex data
      return {
        symbol: symbol.replace('OANDA:', '').replace('_', '/'),
        name: symbol.replace('OANDA:', '').replace('_', ' to '),
        price: 0,
        change: 0,
        changePercent: 0,
        lastUpdate: new Date().toISOString(),
        error: 'Currency pairs not supported in free tier'
      };
    },

  async fetchHistoricalData(symbol, apiKey) {
      // Finnhub historical data requires different endpoint and date ranges
      const to = Math.floor(Date.now() / 1000);
      const from = to - (7 * 24 * 60 * 60); // 7 days ago
      
      try {
        const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${apiKey}`;
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;
        
        if (data.s !== 'ok' || !data.c || data.c.length === 0) {
          return [];
        }
        
        // Return closing prices (data.c contains close prices)
        return data.c.slice(-7); // Last 7 days
      } catch {
        return [];
      }
    }
  }
};

async function fetchSymbolData(symbolStr, provider, apiKey, showSparkline) {
  const parsed = provider.parseSymbol(symbolStr);
  let result;
  
  if (parsed.type === 'forex') {
    if (provider.id === 'alphavantage') {
      result = await provider.fetchForexRate(parsed.fromCurrency, parsed.toCurrency, apiKey);
    } else if (provider.id === 'finnhub') {
      result = await provider.fetchForexRate(parsed.symbol, apiKey);
    }
  } else {
    result = await provider.fetchStockQuote(parsed.symbol, apiKey);
  }
  
  // Fetch sparkline data if requested
  if (showSparkline && provider.fetchHistoricalData) {
    try {
      result.sparkline = await provider.fetchHistoricalData(parsed.symbol, apiKey);
      
      // If no historical data available, generate sample data for visual testing
      if (!result.sparkline || result.sparkline.length === 0) {
        const basePrice = result.price || 100;
        const variation = basePrice * 0.05; // 5% variation
        result.sparkline = Array.from({ length: 7 }, (_, i) => {
          const trend = result.change > 0 ? 0.1 : -0.1; // Slight trend based on current change
          const noise = (Math.random() - 0.5) * variation;
          return basePrice + (i * trend) + noise;
        });
      }
    } catch {
      result.sparkline = [];
    }
  }
  
  return result;
}

function registerStockRoutes(app) {
  app.get('/api/stocks', async (req, res) => {
    try {
      const symbolsParam = String(req.query.symbols || '').trim();
      const refreshMinutes = clampRefreshMinutes(req.query.refresh);
      const showSparkline = String(req.query.sparkline || 'true') === 'true';
      const providerId = getStockProviderId();
      const provider = stockProviders[providerId] || stockProviders.finnhub;
      
      let apiKey = null;
      if (provider.needsApiKey) {
        apiKey = provider.getApiKey ? provider.getApiKey() : null;
        if (!apiKey) {
          return res.status(400).json({ 
            error: `${provider.id} API key required. Set ${provider.id.toUpperCase()}_API_KEY environment variable or configure in config.json` 
          });
        }
      }
      
      if (!symbolsParam) {
        return res.status(400).json({ error: 'Symbols parameter required (comma-separated list)' });
      }
      
      let symbols;
      // Handle both array JSON format and comma-separated string format
      if (symbolsParam.startsWith('[') && symbolsParam.endsWith(']')) {
        try {
          symbols = JSON.parse(symbolsParam);
          if (!Array.isArray(symbols)) {
            return res.status(400).json({ error: 'Invalid symbols array format' });
          }
        } catch {
          return res.status(400).json({ error: 'Invalid JSON format for symbols' });
        }
      } else {
        symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
      }
      
      if (symbols.length === 0) {
        return res.status(400).json({ error: 'No valid symbols provided' });
      }
      
      const cacheKey = `${symbols.join(',')}|${provider.id}`;
      const now = Date.now();
      const cached = stockCache.get(cacheKey);
      
      if (cached && now - cached.fetchedAt < cached.ttlMs) {
        return res.json({ ...cached.data, cached: true });
      }
      
      const results = [];
      const errors = [];
      
      for (const symbolStr of symbols) {
        try {
          const stockData = await fetchSymbolData(symbolStr, provider, apiKey, showSparkline);
          results.push(stockData);
        } catch (error) {
          console.warn(`[hdisplay] Failed to fetch data for "${symbolStr}" via ${provider.id}:`, error.message);
          errors.push(`${symbolStr}: ${error.message}`);
          
          // Add placeholder data for failed symbols
          results.push({
            symbol: symbolStr,
            name: symbolStr,
            price: 0,
            change: 0,
            changePercent: 0,
            volume: 0,
            sparkline: [],
            error: error.message,
            lastUpdate: new Date().toISOString()
          });
        }
      }
      
      const payload = {
        stocks: results,
        provider: provider.id,
        errors: errors.length > 0 ? errors : undefined,
        refreshMinutes
      };
      
      // Cache successful results
      if (results.some(r => !r.error)) {
        stockCache.set(cacheKey, { 
          data: payload, 
          fetchedAt: now, 
          ttlMs: refreshMinutes * 60 * 1000 
        });
      }
      
      return res.json(payload);
      
    } catch (error) {
      console.warn('[hdisplay] /api/stocks error:', error && error.message ? error.message : error);
      return res.status(500).json({ error: error.message || 'Server error' });
    }
  });
}

module.exports = { registerStockRoutes };