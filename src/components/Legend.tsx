import type { LegendConfig } from "../projects/types";
import "./Legend.css";

type LegendProps = LegendConfig & {
  visibility: boolean;
  formatValue?: (value: number) => string;
};

export function Legend(props: LegendProps) {
  if (!props.visibility) return null;
  if (props.type === "image") {
    return (
      <section className="raster-legend raster-legend-image" aria-label={`${props.title} legend`}>
        <img src={props.imageUrl} alt={props.imageAlt} />
      </section>
    );
  }

  const { title, min, max, tickValues, gradientStops, decimalPlaces, formatValue = (value) => decimalPlaces === undefined ? String(value) : value.toFixed(decimalPlaces) } = props;
  if (max <= min) return null;

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
