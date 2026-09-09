(() => {
  const cacheKey = 'area51WeatherAmericana:v1';
  const cacheDuration = 30 * 60 * 1000;
  const button = document.querySelector('#weatherButton');
  const panel = document.querySelector('#weatherPanel');
  if (!button || !panel) return;

  const weatherInfo = (code) => {
    const values = {
      0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Predomínio de sol'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
      45: ['🌫️', 'Neblina'], 48: ['🌫️', 'Neblina com geada'], 51: ['🌦️', 'Garoa fraca'], 53: ['🌦️', 'Garoa'], 55: ['🌧️', 'Garoa forte'],
      61: ['🌦️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'], 71: ['🌨️', 'Neve fraca'], 73: ['🌨️', 'Neve'],
      80: ['🌦️', 'Pancadas fracas'], 81: ['🌧️', 'Pancadas'], 82: ['⛈️', 'Pancadas fortes'], 95: ['⛈️', 'Trovoadas'], 96: ['⛈️', 'Trovoadas com granizo'], 99: ['⛈️', 'Granizo']
    };
    return values[Number(code)] || ['🌡️', 'Condições locais'];
  };
  const dayName = (iso, index) => index === 0 ? 'Hoje' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso + 'T12:00:00'));
  const setPanel = (data) => {
    const current = data.current || {};
    const daily = data.daily || {};
    const [icon, label] = weatherInfo(current.weather_code);
    document.querySelector('#weatherIcon').textContent = icon;
    document.querySelector('#weatherTemperature').textContent = Math.round(Number(current.temperature_2m)) + '°';
    document.querySelector('#weatherNow').textContent = label + ' · sensação de ' + Math.round(Number(current.apparent_temperature)) + '°';
    document.querySelector('#weatherDays').innerHTML = (daily.time || []).map((date, index) => {
      const [dayIcon] = weatherInfo(daily.weather_code?.[index]);
      const rain = Number(daily.precipitation_probability_max?.[index] || 0);
      return '<article><strong>' + dayName(date, index) + '</strong><span>' + dayIcon + '</span><b>' + Math.round(Number(daily.temperature_2m_max?.[index])) + '° <small>' + Math.round(Number(daily.temperature_2m_min?.[index])) + '°</small></b><em>' + rain + '% chuva</em></article>';
    }).join('');
  };
  const setOpen = (open) => { panel.classList.toggle('hidden', !open); button.setAttribute('aria-expanded', String(open)); };
  const loadWeather = async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (saved?.data && Date.now() - saved.savedAt < cacheDuration) { setPanel(saved.data); return; }
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-22.7392&longitude=-47.3314&current=temperature_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=3');
      if (!response.ok) throw new Error('weather unavailable');
      const data = await response.json();
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
      setPanel(data);
    } catch {
      document.querySelector('#weatherNow').textContent = 'Não foi possível atualizar agora.';
      document.querySelector('#weatherDays').innerHTML = '';
    }
  };
  button.addEventListener('click', () => setOpen(panel.classList.contains('hidden')));
  document.querySelector('#weatherClose').addEventListener('click', () => setOpen(false));
  document.addEventListener('click', (event) => { if (!event.target.closest('.weather-widget')) setOpen(false); });
  loadWeather();
})();
