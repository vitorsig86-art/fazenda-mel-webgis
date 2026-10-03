import { Ion, Viewer } from "cesium";

export function createViewer(container: HTMLElement): Viewer {
  Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() ?? "";

  return new Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    animation: false,
    timeline: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    sceneModePicker: false,
    infoBox: false,
    selectionIndicator: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });
}
