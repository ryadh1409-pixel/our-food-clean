/**
 * ~500m grid cells (at mid-latitudes). Used for demand forecast grouping.
 */
const GRID_STEP_DEG = 0.0045; // ~500m

export function getGridKey(lat: number, lng: number): string {
  const i = Math.floor(lat / GRID_STEP_DEG);
  const j = Math.floor(lng / GRID_STEP_DEG);
  return `${i}_${j}`;
}

export function getGridCenter(gridKey: string): {
  latitude: number;
  longitude: number;
} {
  const [i, j] = gridKey.split('_').map(Number);
  return {
    latitude: i * GRID_STEP_DEG + GRID_STEP_DEG / 2,
    longitude: j * GRID_STEP_DEG + GRID_STEP_DEG / 2,
  };
}

export function formatArea(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
