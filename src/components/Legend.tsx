import type { LegendConfig } from "../projects/types";
import "./Legend.css";

interface LegendProps extends LegendConfig {
  visibility: boolean;
  formatValue?: (value: number) => string;
}

export function Legend({ title, min, max, tickValues, gradientStops, visibility, decimalPlaces, formatValue = (value) => decimalPlaces === undefined ? String(value) : value.toFixed(decimalPlaces) }: LegendProps) {
  if (!visibility || max <= min) return null;

  const gradient = [...gradientStops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");

  return (
    <section className="raster-legend" aria-label={`${title} legend`}>
      <h2 className="raster-legend-title">{title}</h2>
      <div className="raster-legend-scale">
        <div className="raster-legend-gradient" aria-hidden="true" style={{ background: `linear-gradient(to top, ${gradient})` }} />
        {tickValues.filter((value) => value >= min && value <= max).map((value) => (
          <div key={value} className="raster-legend-tick" style={{ top: `${(max - value) / (max - min) * 100}%` }}>
            <span className="raster-legend-mark" aria-hidden="true" />
            <span>{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
