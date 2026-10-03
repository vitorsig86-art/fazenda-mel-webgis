import { useEffect, useRef, useState } from "react";
import { EllipsoidTerrainProvider, Terrain, type Viewer } from "cesium";
import { createViewer } from "../cesium/createViewer";

export function useCesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terrainStatus, setTerrainStatus] = useState<"loading" | "world" | "ellipsoid">("loading");

  useEffect(() => {
    if (!containerRef.current) return;
    let instance: Viewer;
    try {
      instance = createViewer(containerRef.current);
      setViewer(instance);
    } catch (cause) {
      console.error("Cesium initialization failed", cause);
      setError("The 3D map could not start. Enable WebGL and hardware acceleration, then reload.");
      return;
    }

    let active = true;
    let fellBack = false;
    let terrain: Terrain | undefined;
    let removeTerrainReady = () => {};
    let removeTerrainError = () => {};
    let removeTileError = () => {};
    setTerrainStatus("loading");

    function useEllipsoid() {
      if (!active || fellBack || instance.isDestroyed()) return;
      fellBack = true;
      // The scene setter also cancels any pending World Terrain ready listener.
      instance.scene.terrainProvider = new EllipsoidTerrainProvider();
      setTerrainStatus("ellipsoid");
      instance.scene.requestRender();
      // Terrain errors may contain authenticated URLs. Never log the raw error.
      console.warn("Cesium World Terrain unavailable; using WGS84 Ellipsoid.");
    }

    try {
      // createViewer has already assigned the existing VITE_CESIUM_ION_TOKEN.
      terrain = Terrain.fromWorldTerrain();
      removeTerrainError = terrain.errorEvent.addEventListener(() => {
        useEllipsoid();
        if (!active) removeTerrainError();
      });
      instance.scene.setTerrain(terrain);
      removeTerrainReady = terrain.readyEvent.addEventListener((provider) => {
        if (!active || fellBack || instance.isDestroyed()) return;
        removeTileError = provider.errorEvent.addEventListener((tileError) => {
          tileError.retry = false;
          useEllipsoid();
        });
        setTerrainStatus("world");
        instance.scene.requestRender();
      });
    } catch {
      useEllipsoid();
    }

    const unsubscribe = instance.scene.renderError.addEventListener(() => {
      setError("The map encountered a rendering error. Reload to restart the viewer.");
    });
    return () => {
      active = false;
      removeTerrainReady();
      removeTileError();
      // Keep a safe error listener while initialization is pending: Terrain's
      // default handler otherwise prints the original credential-bearing error.
      if (terrain?.ready || fellBack) removeTerrainError();
      unsubscribe();
      if (!instance.isDestroyed()) instance.destroy();
    };
  }, []);

  return { containerRef, viewer, error, terrainStatus };
}
