import type { ProjectConfig, ProjectLayerConfig } from "../projects/types";
import "./LayerPanel.css";

interface Props {
  project: ProjectConfig;
  visible: Set<string>;
  rasterOpacities: Record<string, number>;
  onOpacityChange: (id: string, percent: number) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
}

export function getWorkspaceSections(layers: ProjectLayerConfig[]) {
  return [
    { id: "basemap", title: "Mapa base", layers: layers.filter((layer) => layer.kind === "basemap") },
    { id: "raster", title: "Rasters", layers: layers.filter((layer) => layer.kind !== "basemap" && (layer.source.format === "tms" || layer.source.format === "xyz")) },
    { id: "vector", title: "Vetores", layers: layers.filter((layer) => layer.source.format === "geojson") },
    { id: "model", title: "Modelo 3D", layers: layers.filter((layer) => layer.source.format === "3d-tiles") },
  ];
}

export function LayerPanel({ project, visible, rasterOpacities, onOpacityChange, onToggle, onClose }: Props) {
  return (
    <>
      <div className="panel-heading workspace-project">
        <div>
          <h2>{project.name}</h2>
          <p className="location">{project.location}</p>
        </div>
        <button type="button" className="icon-button mobile-only" onClick={onClose} aria-label="Fechar painel de camadas">×</button>
      </div>
      {getWorkspaceSections(project.layers).map((section) => (
        <section key={section.id} className="workspace-section" aria-labelledby={`workspace-${section.id}`}>
          <h3 id={`workspace-${section.id}`}>{section.title}</h3>
          <div className="layer-list">
            {section.layers.map((layer) => {
              const enabled = visible.has(layer.id);
              const opacity = rasterOpacities[layer.id] ?? 100;
              const isModel = section.id === "model";
              return (
                <div key={layer.id} className={`layer-card ${enabled ? "is-active" : ""} ${isModel ? "model-layer-card" : ""}`}>
                  <label className="layer-toggle">
                    <input type="checkbox" checked={enabled} onChange={() => onToggle(layer.id)} />
                    {isModel && <span className="model-layer-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                        <path d="m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5 M12 12v10" />
                      </svg>
                    </span>}
                    <span className="layer-copy">
                      <strong>{layer.name}</strong>
                      {isModel && <small>Visualização tridimensional</small>}
                    </span>
                  </label>
                  {section.id === "raster" && enabled && <div className="layer-opacity">
                    <div className="layer-opacity-heading">
                      <label htmlFor={`opacity-${layer.id}`}>Opacidade</label>
                      <output htmlFor={`opacity-${layer.id}`}>{opacity}%</output>
                    </div>
                    <input
                      id={`opacity-${layer.id}`}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={opacity}
                      aria-label={`Opacidade de ${layer.name}`}
                      aria-valuetext={`${opacity}%`}
                      onChange={(event) => onOpacityChange(layer.id, Number(event.currentTarget.value))}
                    />
                  </div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
