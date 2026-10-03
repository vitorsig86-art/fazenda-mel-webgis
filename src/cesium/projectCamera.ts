import { Cartesian3, Math as CesiumMath, Rectangle, type Viewer } from "cesium";
import type { ProjectConfig, CameraConfig } from "../projects/types";

export function createCameraView(camera: CameraConfig) {
  return {
    destination: Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height),
    orientation: {
      heading: CesiumMath.toRadians(camera.heading),
      pitch: CesiumMath.toRadians(camera.pitch),
      roll: CesiumMath.toRadians(camera.roll),
    },
  };
}

// Omit duration for immediate opening; supply it for an animated Home action.
export function applyProjectCamera(viewer: Viewer, project: ProjectConfig, duration?: number): void {
  if (viewer.isDestroyed()) return;
  const camera = project.initialCamera;
  const view = camera ? createCameraView(camera) : { destination: Rectangle.fromDegrees(...project.bounds) };

  if (duration !== undefined || !camera) {
    // Preserve the existing bounds-based opening for projects without a preset.
    viewer.camera.flyTo({ ...view, duration: duration ?? 1.2 });
  } else {
    viewer.camera.cancelFlight();
    viewer.camera.setView(view);
  }
  viewer.scene.requestRender();
}
