import { ArcType, Cartesian2, Color, CustomDataSource, LabelStyle, PolygonHierarchy, PolylineOutlineMaterialProperty, VerticalOrigin, type Cartesian3, type Entity } from "cesium";
import type { MeasurementTool } from "./measurementUtils";

export function drawMeasurement(source: CustomDataSource, tool: MeasurementTool, points: readonly Cartesian3[], text: string): Entity[] {
  const graphics: Entity[] = [];
  // Alpha < 1 keeps our geometry in the translucent pass, outside opaque picking
  // depth. Do not enable pickTranslucentDepth: it would make overlays pick themselves.
  const color = Color.fromCssColorString("#66e4f2").withAlpha(0.95);
  for (const point of points) graphics.push(source.entities.add({
    position: point,
    point: { pixelSize: 9, color, outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 2, disableDepthTestDistance: Infinity },
  }));
  if (points.length >= 2) {
    const line = tool === "area" && points.length >= 3 ? [...points, points[0]] : [...points];
    graphics.push(source.entities.add({ polyline: {
      positions: line, width: 3, arcType: ArcType.NONE, clampToGround: false,
      material: new PolylineOutlineMaterialProperty({ color, outlineColor: Color.BLACK.withAlpha(0.95), outlineWidth: 1 }),
      depthFailMaterial: color.withAlpha(0.5),
    } }));
  }
  if (tool === "area" && points.length >= 3) graphics.push(source.entities.add({ polygon: {
    hierarchy: new PolygonHierarchy([...points]), perPositionHeight: true, material: color.withAlpha(0.14),
  } }));
  if (text && points.length) graphics.push(source.entities.add({
    position: points[points.length - 1],
    label: {
      text, font: "13px sans-serif", fillColor: Color.WHITE.withAlpha(0.99),
      outlineColor: Color.BLACK.withAlpha(0.99), outlineWidth: 2, style: LabelStyle.FILL_AND_OUTLINE,
      showBackground: true, backgroundColor: Color.fromCssColorString("#26323d").withAlpha(0.9),
      backgroundPadding: new Cartesian2(8, 6), pixelOffset: new Cartesian2(12, -16),
      verticalOrigin: VerticalOrigin.BOTTOM, disableDepthTestDistance: Infinity,
    },
  }));
  return graphics;
}
