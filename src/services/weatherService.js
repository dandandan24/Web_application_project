'use strict';
const config = require('../config');
const logger = require('../utils/logger');

// Open-Meteo (https://open-meteo.com) - free weather web service, no API key or credit card needed.
const API_URL = 'https://api.open-meteo.com/v1/forecast';
const MAX_AGE_MS = 15 * 60 * 1000; // never show data older than 15 minutes
const RETRY_AFTER_FAILURE_MS = 30 * 1000;

const CITIES = {
  'tel-aviv': { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818 },
  jerusalem: { name: 'Jerusalem', lat: 31.7683, lon: 35.2137 },
  haifa: { name: 'Haifa', lat: 32.794, lon: 34.9896 },
  'beer-sheva': { name: "Be'er Sheva", lat: 31.2518, lon: 34.7913 },
  eilat: { name: 'Eilat', lat: 29.5577, lon: 34.9519 },
  london: { name: 'London', lat: 51.5072, lon: -0.1276 },
  'new-york': { name: 'New York', lat: 40.7128, lon: -74.006 }
};

// WMO weather codes -> text + icon
const CODES = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Thunderstorm with hail', '⛈️']
};

// One cache entry per city, shared by all visitors. Thousands of users -> at most one
// request to the provider per city every 10 minutes.
const cache = new Map(); // city -> { data, fetchedAt }
const inFlight = new Map(); // city -> Promise (prevents a burst of parallel requests)
const lastFailure = new Map(); // city -> timestamp

async function fetchFromProvider(cityKey) {
  const city = CITIES[cityKey];
  const url = `${API_URL}?latitude=${city.lat}&longitude=${city.lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.weather.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Weather provider responded with ${response.status}`);
    const json = await response.json();
    const current = json.current;
    if (!current || typeof current.temperature_2m !== 'number') throw new Error('Unexpected weather response');
    const [description, icon] = CODES[current.weather_code] || ['Unknown', '🌡️'];
    return {
      city: city.name,
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      wind: Math.round(current.wind_speed_10m),
      min: json.daily ? Math.round(json.daily.temperature_2m_min[0]) : null,
      max: json.daily ? Math.round(json.daily.temperature_2m_max[0]) : null,
      description,
      icon,
      observedAt: current.time
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getWeather(cityKey) {
  const entry = cache.get(cityKey);
  const age = entry ? Date.now() - entry.fetchedAt : Infinity;
  if (entry && age < config.weather.cacheMs) return { ...entry.data, fetchedAt: entry.fetchedAt, cached: true };

  const failedAt = lastFailure.get(cityKey);
  const recentlyFailed = failedAt && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS;

  if (!recentlyFailed) {
    if (!inFlight.has(cityKey)) {
      inFlight.set(cityKey, fetchFromProvider(cityKey)
        .then((data) => {
          cache.set(cityKey, { data, fetchedAt: Date.now() });
          lastFailure.delete(cityKey);
          return data;
        })
        .finally(() => inFlight.delete(cityKey)));
    }
    try {
      await inFlight.get(cityKey);
      const fresh = cache.get(cityKey);
      return { ...fresh.data, fetchedAt: fresh.fetchedAt, cached: false };
    } catch (err) {
      lastFailure.set(cityKey, Date.now());
      logger.warn('Weather service failed', { city: cityKey, error: err.message });
    }
  }

  // Provider is down: an older value is still acceptable if it is within the 15 minute limit
  if (entry && age < MAX_AGE_MS) return { ...entry.data, fetchedAt: entry.fetchedAt, cached: true, stale: true };
  return null;
}

module.exports = { getWeather, CITIES };
