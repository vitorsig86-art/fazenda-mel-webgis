import { useState } from "react";
import { projects } from "./projects";
import { LayerPanel } from "./components/LayerPanel";
import { Legend } from "./components/Legend";
import { NavigationControls } from "./components/NavigationControls";
import { MeasurementToolbar } from "./components/MeasurementToolbar";
import { useCesiumViewer } from "./hooks/useCesiumViewer";
import { useProjectLayers } from "./hooks/useProjectLayers";
import { useIonConnectionTest } from "./hooks/useIonConnectionTest";
import type { ProjectConfig } from "./projects/types";

function defaultVisibility(project: ProjectConfig) {
  return new Set(project.layers.filter((layer) => layer.defaultVisible).map((layer) => layer.id));
}

export function App() {
  const project = projects[0];
  const [visible, setVisible] = useState(() => defaultVisibility(projects[0]));
  const [panelOpen, setPanelOpen] = useState(false);
  const { containerRef, viewer, error, terrainStatus } = useCesiumViewer();
  const { mapWarning, rasterOpacities, setRasterOpacity } = useProjectLayers(viewer, project, visible);
  const legendLayers = project.layers.filter((layer) => layer.legend && visible.has(layer.id));
  const ionStatus = useIonConnectionTest();
  const ionStatusText = {
    unconfigured: "Cesium ion: token not configured",
    configured: "Cesium ion: token configured; testing…",
    connected: "Cesium ion: connected",
    failed: "Cesium ion: connection failed",
  }[ionStatus];

  function toggleLayer(id: string) {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="app-shell">
      <div ref={containerRef} className="map-container" aria-label="Interactive 3D project map" />
      <header className="app-header">
        <a className="brand" href="/" aria-label="Cardeal Map Viewer home">
          <img src="/logo-cardeal.png" alt="" />
          <span><strong>CARDEAL</strong><span>Map Viewer</span></span>
        </a>
        <span className="header-divider" />
        <span className="header-context">Geospatial workspace</span>
        <span className={`ion-status ${ionStatus === "failed" ? "failed" : ""}`} role="status" title="Temporary Cesium World Terrain access test">
          <span aria-hidden="true" className={`status-dot ${ionStatus === "connected" ? "" : ionStatus === "failed" ? "failed" : "muted"}`} />
          <span className="map-service-status">
            <span>{ionStatusText}</span>
            <span>{terrainStatus === "world" ? "Terrain: Cesium World Terrain" : terrainStatus === "ellipsoid" ? "Terrain: WGS84 Ellipsoid" : "Terrain: loading…"}</span>
          </span>
        </span>
        <button className="panel-toggle mobile-only" aria-expanded={panelOpen} aria-controls="layer-panel" onClick={() => setPanelOpen(!panelOpen)}>☰ <span>Camadas</span></button>
      </header>
      <aside id="layer-panel" aria-label="Área de trabalho e camadas" className={`layer-panel ${panelOpen ? "is-open" : ""}`}>
        <LayerPanel project={project} visible={visible} rasterOpacities={rasterOpacities} onOpacityChange={setRasterOpacity} onToggle={toggleLayer} onClose={() => setPanelOpen(false)} />
      </aside>
      <div className="map-heading"><span className="eyebrow">PROJECT OVERVIEW</span><h1>{project.name}</h1></div>
      <NavigationControls viewer={viewer} homeCamera={project.initialCamera} disabled={Boolean(error)} />
      <MeasurementToolbar viewer={viewer} disabled={Boolean(error)} />
      {(error || mapWarning) && <div role="alert" className="map-alert">{error || mapWarning}</div>}
      {!viewer && !error && <div role="status" className="map-alert">Starting the 3D viewer…</div>}
      {legendLayers.length > 0 && <div className="raster-legend-stack" role="group" aria-label="Visible layer legends" tabIndex={0}>
        {legendLayers.map((layer) => layer.legend && <Legend key={layer.id} {...layer.legend} visibility={visible.has(layer.id)} />)}
      </div>}
      <div className="map-help">Drag to pan <span>·</span> Scroll to zoom <span>·</span> Ctrl + drag to tilt</div>
    </main>
  );
}
