import axios from "axios";
import { describeWeather } from "./weatherCodes.js";

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export class WeatherError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Small TTL cache so repeated searches don't hammer the free API. */
export function ttlCache(ttlMs, now = Date.now) {
  const entries = new Map();
  return {
    async wrap(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expires > now()) return hit.value;
      const value = await load();
      entries.set(key, { value, expires: now() + ttlMs });
      if (entries.size > 500) entries.delete(entries.keys().next().value);
      return value;
    },
  };
}

export function createWeatherService({ http = axios.create({ timeout: 6000 }), cacheTtlMs = 10 * 60 * 1000 } = {}) {
  const cache = ttlCache(cacheTtlMs);

  async function get(url, params) {
    try {
      const { data } = await http.get(url, { params });
      return data;
    } catch (error) {
      if (error.response?.status === 400) throw new WeatherError("The weather service rejected that request.", 400);
      throw new WeatherError("The weather service is unreachable right now. Please try again shortly.");
    }
  }

  async function searchCity(name) {
    const query = String(name ?? "").trim();
    if (query.length < 2) throw new WeatherError("Type at least two letters of a city name.", 400);
    const data = await cache.wrap(`geo:${query.toLowerCase()}`, () => get(GEO_URL, { name: query, count: 5, language: "en", format: "json" }));
    return (data.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }));
  }

  async function forecast({ latitude, longitude, units = "metric" }) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new WeatherError("Invalid coordinates.", 400);
    }
    const imperial = units === "imperial";
    const params = {
      latitude: lat.toFixed(3),
      longitude: lon.toFixed(3),
      timezone: "auto",
      forecast_days: 7,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day,precipitation",
      hourly: "temperature_2m,precipitation_probability",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
      temperature_unit: imperial ? "fahrenheit" : "celsius",
      wind_speed_unit: imperial ? "mph" : "kmh",
    };
    const data = await cache.wrap(`fc:${params.latitude},${params.longitude},${units}`, () => get(FORECAST_URL, params));
    return shapeForecast(data, imperial);
  }

  return { searchCity, forecast };
}

/** Turn Open-Meteo's parallel arrays into objects the view can render directly. */
export function shapeForecast(data, imperial = false) {
  const { current, hourly, daily } = data;
  const nowIndex = Math.max(0, hourly.time.findIndex((t) => t >= current.time.slice(0, 13)));
  const next24 = hourly.time.slice(nowIndex, nowIndex + 24).map((time, i) => ({
    time,
    hour: time.slice(11, 16),
    temp: Math.round(hourly.temperature_2m[nowIndex + i]),
    rain: hourly.precipitation_probability[nowIndex + i] ?? 0,
  }));

  return {
    units: { temp: imperial ? "°F" : "°C", wind: imperial ? "mph" : "km/h" },
    timezone: data.timezone,
    current: {
      temp: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      wind: Math.round(current.wind_speed_10m),
      precipitation: current.precipitation,
      ...describeWeather(current.weather_code, current.is_day === 1),
    },
    hourly: next24,
    daily: daily.time.map((date, i) => ({
      date,
      weekday: new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" }),
      max: Math.round(daily.temperature_2m_max[i]),
      min: Math.round(daily.temperature_2m_min[i]),
      rain: daily.precipitation_probability_max[i] ?? 0,
      uv: daily.uv_index_max[i],
      sunrise: daily.sunrise[i].slice(11),
      sunset: daily.sunset[i].slice(11),
      ...describeWeather(daily.weather_code[i]),
    })),
  };
}

/** Build an SVG polyline path for the hourly temperature chart (server-side, no chart library). */
export function sparkline(values, width = 600, height = 120, padding = 16) {
  if (!values.length) return { path: "", points: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - padding * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: +(padding + i * step).toFixed(1),
    y: +(height - padding - ((v - min) / span) * (height - padding * 2)).toFixed(1),
  }));
  return { path: points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "), points };
}
