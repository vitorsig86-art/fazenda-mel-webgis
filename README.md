# Cardeal Map Viewer

A minimal React + TypeScript geospatial workspace built with Vite, CesiumJS, and `vite-plugin-cesium`.

## Run locally

Use Node.js 22.14+ (Node 24 also works).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. On Windows with PowerShell script execution disabled, use `npm.cmd` instead of `npm`.

```sh
npm run typecheck
npm run build
npm run preview
```

`build` checks TypeScript and produces `dist/`; `preview` serves it at http://127.0.0.1:4173. The Cesium Vite plugin serves/copies Cesium workers, widgets, and static assets.

If the default Vite config loader encounters a sandbox filesystem access error on Windows, run `npm.cmd run build -- --configLoader runner` without changing the project settings.

## Configuration

Set the existing browser-safe ion token in `.env.local`:

```dotenv
VITE_CESIUM_ION_TOKEN=your_browser_safe_token
```

Restart Vite after changing environment variables. Vite exposes `VITE_*` values to the browser: use a restricted, read-only ion token, never account secrets. **Bing Aerial** uses `createWorldImageryAsync({ style: IonWorldImageryStyle.AERIAL })` and the existing `Ion.defaultAccessToken` set by `createViewer`. No direct Bing API key is used. If ion/provider initialization or a Bing tile request fails, only the basemap is replaced with OpenStreetMap and the panel shows **Bing Aerial unavailable ? OpenStreetMap fallback**. On success it shows only **Bing Aerial**. The basemap is always inserted at index 0; Orthomosaic, MDS, and future imagery stay above it. Provider credits remain managed by Cesium. World Terrain is initialized independently from imagery; camera behavior is unchanged. Internet access and ion access to Bing Aerial imagery are required.

## Terrain surface

The existing viewer hook applies `viewer.scene.setTerrain(Terrain.fromWorldTerrain())` after `createViewer` configures the ion token. Initialization failures or terrain tile errors replace only the terrain provider with `EllipsoidTerrainProvider`. Console warnings do not include raw errors, URLs, or credentials. Bing Aerial, Orthomosaic, MDS, and MDT remain independent imagery layers draped over the active globe surface, with their existing order and configuration. No custom terrain or 3D content is enabled.

## Fazenda Mel datasets

This standalone application represents **Fazenda Mel**, Soledade de Minas, MG. Data uses the public R2 root `https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev`; no tiles are copied into the repository.

All five rasters use TMS `{z}/{x}/{reverseY}.png`, EPSG:3857 (`WebMercatorTilingScheme`), 256 x 256 PNG tiles, and levels 11-20. Shared bounds are west `-45.17578125`, south `-22.1059988`, east `-44.82421875`, north `-21.943045533`.

- **Ortomosaico**: `/orto/`, enabled by default.
- **Modelo Digital do Terreno**: `/mdt/`, disabled by default.
- **Modelo Digital da Superfície**: `/mds/`, disabled by default.
- **Declividade**: `/declividade/`, disabled by default.
- **Orientação solar**: `/solar/`, disabled by default.

Vectors use `/vetores/peri_imovel.geojson` (red, 3 px, transparent fill, enabled), `/vetores/curvas_nivel.geojson` (uniform black, 1 px, disabled, no major contours or labels), and `/vetores/linhas_drenagem.geojson` (blue, 2 px, disabled). All are clamped to ground and do not move the camera when loaded.

The final opening and animated Home scene share the single `initialCamera` configuration in `src/projects/fazenda-mel.ts`. Startup uses `camera.setView()`; Home uses `camera.flyTo()` with a 1.2-second animation to the same destination and orientation. The shared `createCameraView()` helper creates the destination with `Cartesian3.fromDegrees()` and converts heading, pitch and roll from degrees to radians. Height is meters above the ellipsoid. MDT, MDS, slope and solar legends are omitted until Fazenda Mel values are supplied; the generic legend system remains available.

For tile diagnostics, inspect the browser Network panel for PNG URLs, HTTP status and CORS errors. Public R2 assets must permit the app origin. TMS rows use `2^z - 1 - y`. Cesium can attempt ancestor tiles below the configured minimum after loading failures; the global basemap has independent zoom levels.

## Structure

- `src/projects/types.ts`: `ProjectConfig`, `CameraConfig`, `ProjectLayerConfig`, source and legend models; thematic type is independent of transport format.
- `src/projects/fazenda-mel.ts`: Fazenda Mel metadata, initial/Home camera, bounds, all layer URLs/styles/zoom levels/default visibility and pending legend configuration.
- `src/projects/index.ts`: single Fazenda Mel entry used at startup.
- `src/cesium/`: viewer configuration and layer loading/attachment/removal.
- `src/hooks/`: React lifecycle, async cleanup, visibility, error state.
- `src/components/`: layer panel, legends, navigation and measurements.
- `public/data/`: inactive illustrative GeoJSON examples; Fazenda Mel imagery is hosted remotely.

The Portuguese workspace has a static project header and no project selector. `LayerPanel.tsx` groups the existing definitions into Mapa base (`kind: basemap`), Rasters (TMS/XYZ), Vetores (GeoJSON), and Modelo 3D (3D Tiles). The model uses a distinct card. Enabled rasters expose independent 0–100% opacity sliders; `useProjectLayers.setRasterOpacity()` writes only the corresponding loaded `ImageryLayer.alpha` and requests a render. Opacity survives OFF/ON toggles and is applied when pending raster attachment completes. Slider changes do not recreate providers or restart the layer-loading effect.

The viewer is destroyed on unmount. Project switches remove previous resources; late async results are discarded. Explicit rendering reduces idle GPU work. Cesium and dataset credits remain visible.

## Fazenda Mel photogrammetric 3D model

**Modelo 3D** is disabled by default. Enabling it loads the public R2 /tiled/tileset.json with Cesium3DTileset.fromUrl and adds it to viewer.scene.primitives. Cesium uses the native root transform and resolves nested tilesets and relative content URIs. No additional translation, rotation, scale, height offset, or model matrix is applied.

Disabling it sets show to false; re-enabling reuses the same tileset while the project remains active. Concurrent enables share one pending request. Project changes/unmounts remove and destroy it, including late results. No automatic camera movement is added. Initial failures log once per attempt; toggle off/on to retry. Content errors log the first failure and suppress further messages. Metadata readiness does not confirm rendered positioning or alignment with World Terrain; inspect these visually before considering any corrections.

## Manual verification

1. Confirm Fazenda Mel opens with **Bing Aerial** via ion, **Ortomosaico** and **Limite da propriedade**, with no console errors.
2. Toggle each layer and check visibility changes.
3. Zoom into Fazenda Mel; verify PNG requests use levels 11-20 and TMS row addresses.
4. Use **Home** and confirm the configured opening view; pan, zoom, tilt, reset north, and draw/clear measurements.
5. At phone width, open/close **Layers** and toggle layers using keyboard or touch.
6. Run the production build and repeat checks in preview, including worker/static asset requests.

Run `node scripts/check-projects.cjs` for registry, camera, configuration-driven imagery/vector/3D Tiles loading and sparse-tile policy checks. Run `node scripts/check-measurements.cjs` for measurement calculations and lifecycle checks. These local checks do not verify remote asset availability or rendered appearance.

Run `node scripts/check-workspace.cjs` for Portuguese panel rendering, section membership, absence of project selection, all checkbox callbacks and raster-only slider interactions. The raster lifecycle checks also cover every opacity percentage, simultaneous independent rasters, retained opacity and repeated vector/3D toggles using local data sources.

Run `node scripts/check-raster-lifecycle.cjs` for all five raster layers. It reproduces the original undefined-rectangle exception with real Cesium objects, then checks four ON/OFF cycles per layer across 586 terrain tile cases, delayed attachment, provider reuse, invalid configuration and cleanup. It requires no WebGL or network.

### Raster activation and boundary guard

Raster configuration is validated before creating its rectangle, synchronous URL-template provider and hidden imagery layer. The hook awaits attachment before publishing the layer, marking it ready and applying the latest visibility. Later toggles reuse the same initialized layer.

Cesium 1.146 can treat floating-point contact at a raster boundary as an overlapping tile, then pass an undefined clipped rectangle to Web Mercator conversion. Project rasters guard this internal skeleton-building step, rejecting only absent or roundoff-sized overlaps (`1e-14` radians, less than 0.1 micrometer). Dataset bounds, imagery addressing, zoom levels, basemap and terrain settings are unchanged. Recheck this narrowly scoped internal API integration when upgrading Cesium.

## References

- [CesiumJS setup and token configuration](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/)
- [vite-plugin-cesium configuration](https://github.com/nshen/vite-plugin-cesium)
- Installed CesiumJS skills under `.agents/skills/`.
