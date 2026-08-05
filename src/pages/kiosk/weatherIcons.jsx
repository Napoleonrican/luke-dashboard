import { Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Moon } from 'lucide-react';

// Open-Meteo WMO weather codes, collapsed to the icon set we actually have.
// https://open-meteo.com/en/docs#weathervariables
export function weatherIconFor(code, isNight = false) {
  if (code === 0) return isNight ? Moon : Sun;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code >= 85 && code <= 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}
