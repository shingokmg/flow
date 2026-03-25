function createClockWeatherController({ state, els, saveState, weatherCities }) {
  let clockIntervalId = null;
  let weatherTimeoutId = null;

  function updateClock() {
    const now = new Date();
    els.clockHoursMinutes.textContent = now.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    els.clockSeconds.textContent = String(now.getSeconds()).padStart(2, "0");

    const date = now.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const weekday = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    els.clockDate.textContent = `${date} ${weekday}`;
  }

  function setSecondsHidden(hidden) {
    els.clockSeconds.classList.toggle("is-hidden", hidden);
  }

  function getSelectedWeatherCity() {
    return weatherCities.find((city) => city.id === state.weather.cityId) ?? weatherCities[0];
  }

  function updateWeatherUi({ temperatureText, iconName }) {
    const city = getSelectedWeatherCity();
    els.weatherIcon.innerHTML = weatherIconSvg(iconName);
    els.weatherText.textContent = `${temperatureText} ${city.label}`;
    els.weatherLine?.setAttribute("aria-label", `Weather for ${city.label}. Click to change city.`);
    if (els.weatherLine) {
      els.weatherLine.title = `Change city from ${city.label}`;
    }
  }

  function weatherIconNameFromCode(code) {
    if (code === 0 || code === 1) return "sun";
    if (code === 2 || code === 3) return "cloud";
    if (code === 45 || code === 48) return "fog";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if (code >= 95) return "storm";
    return "cloud";
  }

  function weatherIconSvg(name) {
    const icons = {
      sun:
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"></path></svg>',
      cloud:
        '<svg viewBox="0 0 24 24"><path d="M7.5 18.5h9.3a4.2 4.2 0 0 0 .2-8.4 5.8 5.8 0 0 0-11-1.7A3.8 3.8 0 0 0 7.5 18.5Z"></path></svg>',
      fog:
        '<svg viewBox="0 0 24 24"><path d="M6.5 9.5h11a3.2 3.2 0 1 0-.4-6.4A4.8 4.8 0 0 0 8 4.6 3.2 3.2 0 0 0 6.5 9.5Z"></path><path d="M4 14h16M6 18h12M8 22h8"></path></svg>',
      rain:
        '<svg viewBox="0 0 24 24"><path d="M7.5 11.5h9.3a4.2 4.2 0 0 0 .2-8.4 5.8 5.8 0 0 0-11-1.7A3.8 3.8 0 0 0 7.5 11.5Z"></path><path d="M9 15.5l-1 2.5M14 15.5l-1 2.5M19 15.5l-1 2.5"></path></svg>',
      snow:
        '<svg viewBox="0 0 24 24"><path d="M7.5 11.5h9.3a4.2 4.2 0 0 0 .2-8.4 5.8 5.8 0 0 0-11-1.7A3.8 3.8 0 0 0 7.5 11.5Z"></path><path d="M9 15.5v4M7.4 17.5h3.2M7.9 16l2.2 3M10.1 16l-2.2 3M15 15.5v4M13.4 17.5h3.2M13.9 16l2.2 3M16.1 16l-2.2 3"></path></svg>',
      storm:
        '<svg viewBox="0 0 24 24"><path d="M7.5 11.5h9.3a4.2 4.2 0 0 0 .2-8.4 5.8 5.8 0 0 0-11-1.7A3.8 3.8 0 0 0 7.5 11.5Z"></path><path d="M12.5 13.5l-2 4h2.4l-1.4 4 4-5h-2.3l1.8-3Z"></path></svg>'
    };
    return icons[name] ?? icons.cloud;
  }

  async function fetchWeather() {
    const city = getSelectedWeatherCity();
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(city.timezone)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
      const data = await response.json();
      const current = data?.current;
      if (!current || typeof current.temperature_2m !== "number") {
        throw new Error("Weather payload missing current temperature");
      }

      updateWeatherUi({
        temperatureText: `${Math.round(current.temperature_2m)}°C`,
        iconName: weatherIconNameFromCode(current.weather_code)
      });
    } catch (error) {
      console.error("Weather fetch failed", error);
      updateWeatherUi({
        temperatureText: "--°C",
        iconName: "cloud"
      });
    }
  }

  function scheduleWeatherRefresh() {
    if (weatherTimeoutId) window.clearTimeout(weatherTimeoutId);
    weatherTimeoutId = window.setTimeout(() => {
      fetchWeather()
        .catch((error) => console.error("Weather refresh failed", error))
        .finally(scheduleWeatherRefresh);
    }, 15 * 60 * 1000);
  }

  function cycleWeatherCity() {
    const currentIndex = weatherCities.findIndex((city) => city.id === state.weather.cityId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % weatherCities.length;
    state.weather.cityId = weatherCities[nextIndex].id;
    updateWeatherUi({ temperatureText: "--°C", iconName: "cloud" });
    saveState();
    fetchWeather().catch((error) => console.error("Weather fetch after city change failed", error));
    scheduleWeatherRefresh();
  }

  function init() {
    updateClock();
    updateWeatherUi({ temperatureText: "--°C", iconName: "cloud" });
    fetchWeather().catch((error) => console.error("Initial weather fetch failed", error));
    scheduleWeatherRefresh();
    els.weatherLine?.addEventListener("click", cycleWeatherCity);
    clockIntervalId = window.setInterval(updateClock, 200);
  }

  function destroy() {
    els.weatherLine?.removeEventListener("click", cycleWeatherCity);
    if (clockIntervalId) window.clearInterval(clockIntervalId);
    if (weatherTimeoutId) window.clearTimeout(weatherTimeoutId);
  }

  return {
    init,
    destroy,
    setSecondsHidden
  };
}

globalThis.createClockWeatherController = createClockWeatherController;
