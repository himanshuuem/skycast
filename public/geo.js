// Progressive enhancement: browser geolocation → /weather. The rest of the app works without JS.
const button = document.getElementById("geoBtn");
const status = document.getElementById("geoStatus");

if (button && "geolocation" in navigator) {
  button.addEventListener("click", () => {
    status.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const params = new URLSearchParams({ lat: coords.latitude.toFixed(3), lon: coords.longitude.toFixed(3), name: "My location" });
        location.href = `/weather?${params}`;
      },
      () => { status.textContent = "Location permission denied. Search for a city instead."; },
      { timeout: 8000 },
    );
  });
} else if (button) {
  button.hidden = true;
}
