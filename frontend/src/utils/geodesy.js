/**
 * Geodetic Utilities for Lunar Selenographic Projections
 * Reference Spheroid: Moon 2000 (R = 1,737,400.0 m)
 */

export const MOON_RADIUS_METERS = 1737400.0;

export function formatCoordinates(latDeg, lonDeg) {
  const latDir = latDeg >= 0 ? 'N' : 'S';
  const lonDir = lonDeg >= 0 ? 'E' : 'W';
  return {
    latitude: `${Math.abs(latDeg).toFixed(4)}° ${latDir}`,
    longitude: `${Math.abs(lonDeg).toFixed(4)}° ${lonDir}`
  };
}

export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (MOON_RADIUS_METERS / 1000) * c;
}
