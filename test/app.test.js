import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createWeatherService, shapeForecast, sparkline, ttlCache } from "../src/weather.js";
import { describeWeather } from "../src/weatherCodes.js";

// A fake axios-like client so tests never hit the network.
const hours = Array.from({ length: 48 }, (_, i) => `2026-10-24T${String(i % 24).padStart(2, "0")}:00`);
const FORECAST = {
  timezone: "Asia/Kolkata",
  current: { time: "2026-10-24T10:15", temperature_2m: 29.6, apparent_temperature: 33.1, relative_humidity_2m: 70, wind_speed_10m: 11.2, weather_code: 2, is_day: 1, precipitation: 0 },
  hourly: { time: hours, temperature_2m: hours.map((_, i) => 25 + (i % 10)), precipitation_probability: hours.map(() => 20) },
  daily: {
    time: ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"],
    weather_code: [2, 61, 3, 0, 95, 1, 45],
    temperature_2m_max: [32, 30, 31, 33, 29, 32, 30],
    temperature_2m_min: [24, 23, 24, 25, 23, 24, 22],
    precipitation_probability_max: [10, 80, 20, 0, 90, 5, 15],
    sunrise: Array(7).fill("2026-10-24T05:39"),
    sunset: Array(7).fill("2026-10-24T17:05"),
    uv_index_max: Array(7).fill(7.5),
  },
};
let calls = 0;
const fakeHttp = {
  async get(url, { params }) {
    calls += 1;
    if (url.includes("geocoding")) {
      if (params.name.toLowerCase() === "springfield") {
        return { data: { results: [
          { id: 1, name: "Springfield", admin1: "Illinois", country: "United States", latitude: 39.8, longitude: -89.6 },
          { id: 2, name: "Springfield", admin1: "Missouri", country: "United States", latitude: 37.2, longitude: -93.3 },
        ] } };
      }
      if (params.name.toLowerCase() === "kolkata") return { data: { results: [{ id: 3, name: "Kolkata", admin1: "West Bengal", country: "India", latitude: 22.56, longitude: 88.36 }] } };
      return { data: {} };
    }
    return { data: FORECAST };
  },
};

let server;
let base;
before(async () => {
  server = createApp({ weather: createWeatherService({ http: fakeHttp }) }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("describeWeather maps codes and night", () => {
  assert.equal(describeWeather(0).label, "Clear sky");
  assert.equal(describeWeather(0, false).emoji, "🌙");
  assert.equal(describeWeather(1234).label, "Unknown");
});

test("shapeForecast builds 24 hourly points and 7 days", () => {
  const shaped = shapeForecast(FORECAST);
  assert.equal(shaped.hourly.length, 24);
  assert.equal(shaped.hourly[0].hour, "10:00");
  assert.equal(shaped.daily.length, 7);
  assert.equal(shaped.current.temp, 30);
});

test("sparkline scales into the box", () => {
  const { points, path } = sparkline([0, 10], 100, 50, 10);
  assert.deepEqual(points, [{ x: 10, y: 40 }, { x: 90, y: 10 }]);
  assert.equal(path, "M10 40 L90 10");
});

test("ttlCache reuses values until they expire", async () => {
  let t = 0;
  const cache = ttlCache(100, () => t);
  let loads = 0;
  const load = async () => ++loads;
  await cache.wrap("k", load);
  await cache.wrap("k", load);
  t = 200;
  await cache.wrap("k", load);
  assert.equal(loads, 2);
});

test("single search result redirects straight to the forecast", async () => {
  const res = await fetch(`${base}/search?q=Kolkata`, { redirect: "manual" });
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location"), /^\/weather\?lat=22\.56&lon=88\.36&name=Kolkata/);
});

test("ambiguous search lists choices; empty search shows a message", async () => {
  const many = await (await fetch(`${base}/search?q=Springfield`)).text();
  assert.match(many, /Did you mean/);
  assert.match(many, /Missouri/);
  const none = await (await fetch(`${base}/search?q=Atlantis`)).text();
  assert.match(none, /No places found/);
});

test("weather page renders and remembers the city", async () => {
  const res = await fetch(`${base}/weather?lat=22.56&lon=88.36&name=Kolkata&region=West%20Bengal`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Partly cloudy/);
  assert.match(html, /7-day forecast/);
  assert.match(res.headers.get("set-cookie"), /skycast_recent=/);
});

test("invalid coordinates give a 400", async () => {
  const res = await fetch(`${base}/weather?lat=999&lon=0`);
  assert.equal(res.status, 400);
});

test("repeat requests are served from cache", async () => {
  const before = calls;
  await fetch(`${base}/weather?lat=22.56&lon=88.36&name=Kolkata`);
  await fetch(`${base}/weather?lat=22.56&lon=88.36&name=Kolkata`);
  assert.equal(calls, before);
});
