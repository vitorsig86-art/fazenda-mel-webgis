import type { Viewer } from "cesium";
import { useMeasurements } from "../hooks/useMeasurements";
import type { MeasurementTool } from "../cesium/measurementUtils";
import "./MeasurementToolbar.css";

const tools: { id: MeasurementTool; label: string; path: string; help: string }[] = [
  { id: "coordinates", label: "Coordenadas", path: "M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8", help: "Clique numa superfície para obter as coordenadas." },
  { id: "distance", label: "Distância", path: "m4 17 16-10M4 14v6m16-16v6M8 12l2 3m3-6 2 3", help: "Clique para adicionar pontos. Enter ou duplo clique finaliza." },
  { id: "area", label: "Área", path: "m4 17 2-12 13 3-2 12ZM6 5h.01M19 8h.01M17 20h.01M4 17h.01", help: "Selecione pelo menos 3 pontos. Enter ou duplo clique finaliza." },
  { id: "height", label: "Diferença de cota", path: "M5 18h6M13 6h6M12 4v16m-3-3 3 3 3-3M9 7l3-3 3 3", help: "Selecione os pontos A e B para medir ΔZ = B − A." },
];

export function MeasurementToolbar({ viewer, disabled = false }: { viewer: Viewer | null; disabled?: boolean }) {
  const measurements = useMeasurements(viewer);
  const unavailable = disabled || !measurements.ready || !viewer || viewer.isDestroyed();
  const selected = tools.find((tool) => tool.id === measurements.active);
  return (
    <section className="measurement-controls" aria-label="Medições">
      <div className="measurement-toolbar" role="group" aria-label="Ferramentas de medição">
        {tools.map((tool) => <button key={tool.id} type="button" title={tool.label} aria-label={tool.label} aria-pressed={measurements.active === tool.id} disabled={unavailable} onClick={() => measurements.select(tool.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={tool.path} /></svg>
        </button>)}
        <button type="button" title="Limpar medições" aria-label="Limpar medições" disabled={unavailable} onClick={measurements.clear}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg>
        </button>
      </div>
      {(selected || measurements.message || measurements.result) && <div className="measurement-readout">
        {selected && <><strong>{selected.label}</strong><p>{selected.help} Esc cancela.</p></>}
        {measurements.result && <output>{measurements.result}</output>}
        <p className="measurement-message" role="status">{measurements.message}</p>
        {measurements.pointCount > 0 && <span>{measurements.pointCount} ponto(s) · </span>}
        <span>{measurements.completed} medição(ões)</span>
        <small>Altitudes elipsoidais (m). Área horizontal geográfica, sem relevo.</small>
        {selected && <div className="measurement-actions">
          {(selected.id === "distance" || selected.id === "area") && <button type="button" onClick={measurements.finish} disabled={unavailable}>Finalizar</button>}
          <button type="button" onClick={measurements.cancel}>Cancelar</button>
        </div>}
      </div>}
    </section>
  );
}
