// WMO weather interpretation codes → label, emoji and a theme used for the page background.
const CODES = {
  0: ["Clear sky", "☀️", "clear"],
  1: ["Mainly clear", "🌤️", "clear"],
  2: ["Partly cloudy", "⛅", "cloudy"],
  3: ["Overcast", "☁️", "cloudy"],
  45: ["Fog", "🌫️", "fog"],
  48: ["Rime fog", "🌫️", "fog"],
  51: ["Light drizzle", "🌦️", "rain"],
  53: ["Drizzle", "🌦️", "rain"],
  55: ["Heavy drizzle", "🌧️", "rain"],
  61: ["Light rain", "🌦️", "rain"],
  63: ["Rain", "🌧️", "rain"],
  65: ["Heavy rain", "🌧️", "rain"],
  71: ["Light snow", "🌨️", "snow"],
  73: ["Snow", "🌨️", "snow"],
  75: ["Heavy snow", "❄️", "snow"],
  80: ["Rain showers", "🌦️", "rain"],
  81: ["Heavy showers", "🌧️", "rain"],
  82: ["Violent showers", "⛈️", "storm"],
  95: ["Thunderstorm", "⛈️", "storm"],
  96: ["Thunderstorm, hail", "⛈️", "storm"],
  99: ["Severe thunderstorm", "⛈️", "storm"],
};

export function describeWeather(code, isDay = true) {
  const [label, emoji, theme] = CODES[code] ?? ["Unknown", "🌡️", "cloudy"];
  const nightEmoji = theme === "clear" ? "🌙" : emoji;
  return { label, emoji: isDay ? emoji : nightEmoji, theme: isDay ? theme : "night" };
}
