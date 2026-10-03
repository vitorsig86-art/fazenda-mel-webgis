import type { TileProviderError } from "cesium";
import type { ProjectLayerConfig } from "../projects/types";

export function createImageryTileErrorHandler(
  layer: ProjectLayerConfig,
  onWarning: (message: string) => void,
  development: boolean,
) {
  let reportedMissingTile = false;

  return (tileError: TileProviderError) => {
    if (layer.source.format === "ion-world-imagery") {
      // Basemap fallback is handled by useProjectLayers. Avoid logging URLs/errors
      // from authenticated providers, which may contain credentials.
      console.warn("Basemap tile request failed", { x: tileError.x, y: tileError.y, level: tileError.level });
      onWarning("OpenStreetMap fallback tiles could not load. Check the network connection.");
      return;
    }
    const cause: unknown = tileError.error;
    const statusCode = typeof cause === "object" && cause !== null && "statusCode" in cause
      ? cause.statusCode
      : undefined;

    // Verified sparse rasters opt in through their source configuration.
    // Only confirmed per-tile 404s are
    // expected; do not infer a missing tile from opaque network/CORS errors.
    const allowMissingTiles = (layer.source.format === "xyz" || layer.source.format === "tms")
      && layer.source.allowMissingTiles === true;
    if (allowMissingTiles && statusCode === 404
      && Number.isInteger(tileError.x) && Number.isInteger(tileError.y)
      && Number.isInteger(tileError.level)) {
      tileError.retry = false;
      if (development && !reportedMissingTile) {
        console.debug(`${layer.name}: missing footprint tile (HTTP 404); additional misses are suppressed.`, {
          x: tileError.x,
          y: tileError.y,
          level: tileError.level,
          urlTemplate: layer.source.url,
        });
        reportedMissingTile = true;
      }
      return;
    }

    console.warn(`Tile loading failed for ${layer.name}`, {
      urlTemplate: layer.source.url,
      x: tileError.x,
      y: tileError.y,
      level: tileError.level,
      statusCode,
      message: tileError.message,
      error: tileError.error,
    });
    onWarning(`Tiles for ${layer.name} could not load. Check the tile URL, addressing, network connection, and server CORS settings.`);
  };
}
