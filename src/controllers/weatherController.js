'use strict';
const HttpError = require('../utils/httpError');
const { getWeather, CITIES } = require('../services/weatherService');

// GET /api/weather?city=tel-aviv
exports.current = async (req, res) => {
  const city = typeof req.query.city === 'string' && CITIES[req.query.city] ? req.query.city : 'tel-aviv';
  const data = await getWeather(city);
  if (!data) throw new HttpError(503, 'Weather information is temporarily unavailable');
  res.set('Cache-Control', 'public, max-age=300');
  res.json(data);
};

// GET /api/weather/cities
exports.cities = (req, res) => {
  res.json(Object.entries(CITIES).map(([key, c]) => ({ key, name: c.name })));
};
