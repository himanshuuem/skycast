import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createWeatherService, sparkline } from "./weather.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECENT_COOKIE = "skycast_recent";
const MAX_RECENT = 5;

function readRecent(req) {
  const raw = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${RECENT_COOKIE}=`));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice(RECENT_COOKIE.length + 1)));
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function createApp({ weather = createWeatherService() } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.use(express.static(path.join(root, "public")));

  app.use((req, res, next) => {
    res.locals.recent = readRecent(req);
    res.locals.units = req.query.units === "imperial" ? "imperial" : "metric";
    res.locals.q = typeof req.query.q === "string" ? req.query.q : "";
    next();
  });

  app.get("/", (req, res) => res.render("home", { error: null }));

  app.get("/search", async (req, res, next) => {
    try {
      const cities = await weather.searchCity(req.query.q);
      if (cities.length === 1) {
        const [c] = cities;
        return res.redirect(303, `/weather?${new URLSearchParams({ lat: c.latitude, lon: c.longitude, name: c.name, region: c.region, units: res.locals.units })}`);
      }
      res.render("home", { cities, error: cities.length ? null : `No places found for “${res.locals.q}”.` });
    } catch (error) {
      next(error);
    }
  });

  app.get("/weather", async (req, res, next) => {
    try {
      const forecast = await weather.forecast({ latitude: req.query.lat, longitude: req.query.lon, units: res.locals.units });
      const place = { name: String(req.query.name ?? "Your location").slice(0, 80), region: String(req.query.region ?? "").slice(0, 120), lat: req.query.lat, lon: req.query.lon };

      const recent = [place, ...res.locals.recent.filter((r) => r.name !== place.name)].slice(0, MAX_RECENT);
      res.cookie(RECENT_COOKIE, JSON.stringify(recent), { maxAge: 30 * 24 * 3600 * 1000, httpOnly: true, sameSite: "lax" });

      res.render("weather", { place, forecast, chart: sparkline(forecast.hourly.map((h) => h.temp), 600, 128, 28) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use((req, res) => res.status(404).render("home", { error: "That page doesn't exist." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res.status(err.status ?? 500).render("home", { error: err.status ? err.message : "Something went wrong." });
  });

  return app;
}
