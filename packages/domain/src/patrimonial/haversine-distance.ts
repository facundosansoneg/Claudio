const EARTH_RADIUS_KM = 6371;

/**
 * Distancia geográfica entre dos puntos (spec, sección 10.2). No es
 * dinero, porcentaje, unidad indexada ni tipo de cambio (CLAUDE.md
 * regla 2 no aplica acá), así que usa aritmética de punto flotante
 * estándar — es una magnitud física aproximada, no una cifra contable.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
