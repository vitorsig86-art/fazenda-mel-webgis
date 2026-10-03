import { useEffect, useRef, useState } from "react";
import { Cesium3DTileset, GeoJsonDataSource, ImageryLayer, type Viewer } from "cesium";
import { applyProjectCamera } from "../cesium/projectCamera";
import { assertImageryLayerReady, attachLayer, createBasemapFallback, isBasemapFallback, loadLayer, removeLayer, type LoadedLayer } from "../cesium/loadLayer";
import { createImageryTileErrorHandler } from "../cesium/imageryTileErrors";
import type { LayerStatus, ProjectConfig } from "../projects/types";

export function useProjectLayers(viewer: Viewer | null, project: ProjectConfig, visible: Set<string>) {
  const loaded = useRef(new Map<string, LoadedLayer>());
  const opacityRef = useRef(new Map<string, number>());
  const [rasterOpacities, setRasterOpacities] = useState<Record<string, number>>({});
  const visibleRef = useRef(visible);
  const loadVisibleTilesRef = useRef<(() => void) | null>(null);
  visibleRef.current = visible;
  const [statuses, setStatuses] = useState<Record<string, LayerStatus>>({});
  const [mapWarning, setMapWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;
    const resources = new Map<string, LoadedLayer>();
    loaded.current = resources;
    const unsubscribe: (() => void)[] = [];
    setMapWarning(null);
    setStatuses(Object.fromEntries(project.layers.map((layer) => [layer.id, layer.source.format === "3d-tiles" ? "idle" : "loading"])));
    applyProjectCamera(viewer, project);

    const pendingTiles = new Set<string>();
    const failedTiles = new Set<string>();
    const loadVisibleTiles = () => {
      if (cancelled || viewer.isDestroyed()) return;
      for (const definition of project.layers) {
        if (definition.source.format !== "3d-tiles") continue;
        const tilesetUrl = definition.source.url;
        if (!visibleRef.current.has(definition.id)) {
          failedTiles.delete(definition.id);
          continue;
        }
        if (resources.has(definition.id) || pendingTiles.has(definition.id) || failedTiles.has(definition.id)) continue;
        pendingTiles.add(definition.id);
        setStatuses((current) => ({ ...current, [definition.id]: "loading" }));
        void (async () => {
          try {
            const layer = await loadLayer(definition);
            if (!(layer instanceof Cesium3DTileset)) throw new Error("Expected a 3D Tiles layer.");
            if (cancelled || viewer.isDestroyed()) {
              if (!layer.isDestroyed()) layer.destroy();
              return;
            }
            resources.set(definition.id, layer);
            layer.show = visibleRef.current.has(definition.id);
            let reportedTileFailure = false;
            unsubscribe.push(layer.tileFailed.addEventListener((failure) => {
              if (cancelled || reportedTileFailure) return;
              reportedTileFailure = true;
              console.warn(`Tile loading failed for ${definition.name}; further tile errors are suppressed.`, {
                tilesetUrl,
                url: failure.url,
                message: failure.message,
              });
            }));
            await attachLayer(viewer, layer);
            if (cancelled || viewer.isDestroyed()) {
              removeLayer(viewer, layer);
              return;
            }
            setStatuses((current) => ({ ...current, [definition.id]: "ready" }));
            viewer.scene.requestRender();
          } catch (cause) {
            if (cancelled || viewer.isDestroyed()) return;
            const failedLayer = resources.get(definition.id);
            if (failedLayer) {
              removeLayer(viewer, failedLayer);
              resources.delete(definition.id);
            }
            if (visibleRef.current.has(definition.id)) failedTiles.add(definition.id);
            console.error(`Unable to load ${definition.name}`, { url: tilesetUrl, error: cause });
            setStatuses((current) => ({ ...current, [definition.id]: "error" }));
          } finally {
            pendingTiles.delete(definition.id);
          }
        })();
      }
    };
    loadVisibleTilesRef.current = loadVisibleTiles;
    loadVisibleTiles();

    // Sequential attachment preserves imagery stack order. React cleanup guards
    // late async results when a project changes or StrictMode remounts the app.
    void (async () => {
      for (const definition of project.layers) {
        if (cancelled || viewer.isDestroyed()) return;
        if (definition.source.format === "3d-tiles") continue;
        let pendingLayer: LoadedLayer | undefined;
        try {
          const layer = await loadLayer(definition);
          pendingLayer = layer;
          if (cancelled || viewer.isDestroyed()) {
            if (layer instanceof ImageryLayer && !layer.isDestroyed()) layer.destroy();
            return;
          }
          const isRaster = definition.source.format === "tms" || definition.source.format === "xyz";
          // Keep newly constructed rasters hidden until attachment completes.
          // Publish only attached layers so the toggle effect cannot expose one
          // while the attachment promise is pending.
          layer.show = isRaster ? false : visibleRef.current.has(definition.id);
          if (definition.kind === "basemap" && layer instanceof ImageryLayer) {
            viewer.imageryLayers.add(layer, 0);
          } else {
            await attachLayer(viewer, layer);
          }
          if (cancelled || viewer.isDestroyed()) {
            removeLayer(viewer, layer);
            return;
          }
          resources.set(definition.id, layer);
          if (isRaster && layer instanceof ImageryLayer) layer.alpha = opacityRef.current.get(definition.id) ?? 1;
          if (layer instanceof ImageryLayer) {
            const handleTileError = createImageryTileErrorHandler(definition, setMapWarning, import.meta.env.DEV);
            unsubscribe.push(layer.imageryProvider.errorEvent.addEventListener((tileError) => {
              if (cancelled) return;
              if (definition.source.format === "ion-world-imagery" && !isBasemapFallback(layer)) {
                if (viewer.isDestroyed() || resources.get(definition.id) !== layer) return;
                tileError.retry = false;
                // Replace only the failed basemap; preserve overlay order and visibility.
                const fallback = createBasemapFallback(definition);
                fallback.show = visibleRef.current.has(definition.id);
                viewer.imageryLayers.remove(layer, true);
                viewer.imageryLayers.add(fallback, 0);
                resources.set(definition.id, fallback);
                unsubscribe.push(fallback.imageryProvider.errorEvent.addEventListener((error) => {
                  if (!cancelled) handleTileError(error);
                }));
                console.warn("Bing Aerial unavailable · OpenStreetMap fallback");
                setStatuses((current) => ({ ...current, [definition.id]: "fallback" }));
                viewer.scene.requestRender();
                return;
              }
              handleTileError(tileError);
            }));
          }
          setStatuses((current) => ({ ...current, [definition.id]: isBasemapFallback(layer) ? "fallback" : "ready" }));
          if (isRaster) layer.show = visibleRef.current.has(definition.id);
          if (layer instanceof GeoJsonDataSource && layer.show
            && definition.source.format === "geojson" && definition.source.autoZoom !== false) {
            await viewer.zoomTo(layer);
          }
          if (!cancelled && !viewer.isDestroyed()) viewer.scene.requestRender();
        } catch (cause) {
          if (cancelled || viewer.isDestroyed()) return;
          if (pendingLayer) removeLayer(viewer, pendingLayer);
          resources.delete(definition.id);
          console.error(`Unable to load layer ${definition.id}`, cause);
          setStatuses((current) => ({ ...current, [definition.id]: "error" }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadVisibleTilesRef.current === loadVisibleTiles) loadVisibleTilesRef.current = null;
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
      unsubscribe.forEach((remove) => remove());
      for (const layer of resources.values()) removeLayer(viewer, layer);
      resources.clear();
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    };
  }, [viewer, project]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    for (const [id, layer] of loaded.current) {
      if (layer instanceof ImageryLayer) assertImageryLayerReady(layer);
      layer.show = visible.has(id);
    }
    loadVisibleTilesRef.current?.();
    viewer.scene.requestRender();
  }, [viewer, visible]);

  function setRasterOpacity(id: string, percent: number): void {
    const definition = project.layers.find((layer) => layer.id === id);
    if (!definition || definition.kind === "basemap"
      || (definition.source.format !== "tms" && definition.source.format !== "xyz")
      || !Number.isFinite(percent)) return;
    const value = Math.min(100, Math.max(0, percent));
    opacityRef.current.set(id, value / 100);
    setRasterOpacities((current) => ({ ...current, [id]: value }));
    const layer = loaded.current.get(id);
    if (!viewer || viewer.isDestroyed() || !(layer instanceof ImageryLayer) || layer.isDestroyed()) return;
    layer.alpha = value / 100;
    viewer.scene.requestRender();
  }

  return { statuses, mapWarning, rasterOpacities, setRasterOpacity };
}
