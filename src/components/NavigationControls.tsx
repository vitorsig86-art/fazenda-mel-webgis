import { useEffect, useRef } from "react";
import { Cartesian2, Cartesian3, type Viewer } from "cesium";
import { createCameraView } from "../cesium/projectCamera";
import type { CameraConfig } from "../projects/types";
import "./NavigationControls.css";

interface NavigationControlsProps {
  viewer: Viewer | null;
  homeCamera?: CameraConfig;
  disabled?: boolean;
}

export function NavigationControls({ viewer, homeCamera, disabled = false }: NavigationControlsProps) {
  const compassRef = useRef<HTMLSpanElement>(null);
  const unavailable = disabled || !viewer || viewer.isDestroyed();

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    let previousHeading: number | undefined;
    function syncCompass() {
      if (!viewer || viewer.isDestroyed() || !compassRef.current) return;
      const heading = viewer.camera.heading;
      if (heading === previousHeading) return;
      // North rotates opposite the camera. Update only the icon, not the React tree.
      compassRef.current.style.transform = `rotate(${-heading}rad)`;
      previousHeading = heading;
    }
    syncCompass();
    // postRender follows even small heading changes without changing camera thresholds.
    return viewer.scene.postRender.addEventListener(syncCompass);
  }, [viewer]);

  function resetNorth() {
    if (unavailable || !viewer) return;
    const camera = viewer.camera;
    camera.cancelFlight();
    camera.setView({
      orientation: { heading: 0, pitch: camera.pitch, roll: camera.roll },
    });
    viewer.scene.requestRender();
  }

  function zoom(closer: boolean) {
    if (unavailable || !viewer) return;
    const { camera, scene } = viewer;
    camera.cancelFlight();
    const orientation = { heading: camera.heading, pitch: camera.pitch, roll: camera.roll };
    const center = new Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
    const ray = camera.getPickRay(center);
    const target = (ray && scene.globe.pick(ray, scene))
      ?? camera.pickEllipsoid(center, scene.globe.ellipsoid);
    const position = camera.positionCartographic;
    const clearance = position.height - (scene.globe.getHeight(position) ?? 0);
    const distance = target ? Cartesian3.distance(camera.positionWC, target) : Math.max(clearance, 1);
    const step = distance * 0.2;
    const amount = closer
      ? Math.min(step, Math.max(0, distance - scene.screenSpaceCameraController.minimumZoomDistance))
      : step;
    if (closer) camera.zoomIn(amount);
    else camera.zoomOut(amount);
    // Translation can change the local ENU frame; preserve the original heading/pitch.
    camera.setView({ orientation });
    scene.requestRender();
  }

  function goHome() {
    if (unavailable || !viewer || !homeCamera) return;
    viewer.camera.flyTo({ ...createCameraView(homeCamera), duration: 1.2 });
    viewer.scene.requestRender();
  }

  return (
    <div className="navigation-controls" role="group" aria-label="Map navigation">
      <button className="navigation-compass" type="button" disabled={unavailable} onClick={resetNorth} aria-label="Reset orientation to north" title="Reset north">
        <span className="navigation-compass-face" ref={compassRef} aria-hidden="true">
          <span className="navigation-north">N</span>
          <svg viewBox="0 0 48 48"><path d="M24 16 30 34 24 30 18 34Z" fill="currentColor" /><path d="M24 30 30 34 24 42 18 34Z" fill="currentColor" opacity=".35" /></svg>
        </span>
      </button>
      <div className="navigation-button-stack">
        <button type="button" disabled={unavailable} onClick={() => zoom(true)} aria-label="Zoom in" title="Zoom in"><span aria-hidden="true">+</span></button>
        <button type="button" disabled={unavailable || !homeCamera} onClick={goHome} aria-label="Return to project opening view" title="Home">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9" /></svg>
        </button>
        <button type="button" disabled={unavailable} onClick={() => zoom(false)} aria-label="Zoom out" title="Zoom out"><span aria-hidden="true">−</span></button>
      </div>
    </div>
  );
}
