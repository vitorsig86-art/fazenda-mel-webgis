import { Cartesian2, Cartesian3, Cartographic, Ellipsoid, EllipsoidGeodesic, Math as CesiumMath, type Viewer } from "cesium";

export type MeasurementTool = "coordinates" | "distance" | "area" | "height";

function validPosition(position: Cartesian3 | undefined): position is Cartesian3 {
  return Boolean(position && [position.x, position.y, position.z].every(Number.isFinite)
    && Cartographic.fromCartesian(position));
}

export function pickMeasurementPosition(viewer: Viewer, screen: Cartesian2): Cartesian3 | undefined {
  if (viewer.isDestroyed()) return undefined;
  const { scene, camera } = viewer;
  // Measurement graphics are translucent and do not write opaque scene depth.
  // Use rendered model/terrain depth first; never substitute a bare ellipsoid hit.
  if (scene.pickPositionSupported) {
    try {
      const position = scene.pickPosition(screen);
      if (validPosition(position)) return Cartesian3.clone(position);
    } catch {
      // Depth reconstruction may be unavailable during a render/context transition.
    }
  }
  try {
    const ray = camera.getPickRay(screen);
    if (!ray) return undefined;
    const position = scene.globe.pick(ray, scene);
    return validPosition(position) ? Cartesian3.clone(position) : undefined;
  } catch {
    return undefined;
  }
}

export function distance3D(points: readonly Cartesian3[]): number {
  return points.slice(1).reduce((total, point, index) => total + Cartesian3.distance(points[index], point), 0);
}

export function elevationDifference(points: readonly Cartesian3[]) {
  const altitudeA = Cartographic.fromCartesian(points[0]).height;
  const altitudeB = Cartographic.fromCartesian(points[1]).height;
  return { altitudeA, altitudeB, delta: altitudeB - altitudeA };
}

export function formatDistance(distance: number): string {
  return distance < 1000 ? `${distance.toFixed(2)} m` : `${(distance / 1000).toFixed(3)} km`;
}

export function formatArea(area: number): string {
  const squareMeters = `${area.toFixed(2)} m²`;
  const hectares = `${(area / 10000).toFixed(4)} ha`;
  return area < 10000 ? `${squareMeters} (${hectares})` : `${hectares} (${squareMeters})`;
}

// WGS84 authalic latitude maps ellipsoid surface area to an equal-area sphere.
const ellipsoid = Ellipsoid.WGS84;
const a = ellipsoid.maximumRadius;
const b = ellipsoid.minimumRadius;
const eccentricity = Math.sqrt(1 - (b * b) / (a * a));
function authalicQ(latitude: number): number {
  const sine = Math.sin(latitude);
  const es = eccentricity * sine;
  return (1 - eccentricity ** 2) * (sine / (1 - es ** 2)
    - Math.log((1 - es) / (1 + es)) / (2 * eccentricity));
}
const polarQ = authalicQ(Math.PI / 2);
const radius = a * Math.sqrt(polarQ / 2);
function authalicLatitude(latitude: number): number {
  return Math.asin(CesiumMath.clamp(authalicQ(latitude) / polarQ, -1, 1));
}

type Point2D = { x: number; y: number };
function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function onSegment(a: Point2D, b: Point2D, p: Point2D): boolean {
  return Math.abs(cross(a, b, p)) < 1e-6 && p.x >= Math.min(a.x, b.x) - 1e-6
    && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6
    && p.y <= Math.max(a.y, b.y) + 1e-6;
}
function intersects(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

export function geographicArea(points: readonly Cartesian3[]): number {
  const ring = points.length > 3 && Cartesian3.distance(points[0], points[points.length - 1]) < 0.001
    ? points.slice(0, -1) : points;
  if (ring.length < 3) return 0;
  // Horizontal geographic footprint, NOT triangulated 3D terrain/model surface area.
  // Lambert azimuthal equal-area on the WGS84 authalic sphere. Densify ellipsoidal
  // geodesic edges before projection; sampled heights intentionally do not affect area.
  const vertices = ring.map((point) => Cartographic.fromCartesian(point));
  const origin = vertices[0];
  const beta0 = authalicLatitude(origin.latitude);
  function project(point: Cartographic): Point2D {
    const beta = authalicLatitude(point.latitude);
    const longitude = point.longitude - origin.longitude;
    const k = Math.sqrt(2 / (1 + Math.sin(beta0) * Math.sin(beta)
      + Math.cos(beta0) * Math.cos(beta) * Math.cos(longitude)));
    return {
      x: radius * k * Math.cos(beta) * Math.sin(longitude),
      y: radius * k * (Math.cos(beta0) * Math.sin(beta) - Math.sin(beta0) * Math.cos(beta) * Math.cos(longitude)),
    };
  }
  const projected = vertices.map(project);
  if (projected.some((point) => !Number.isFinite(point.x + point.y) || Math.hypot(point.x, point.y) > 100000)) {
    throw new Error("Use polígonos locais, com extensão de até 100 km.");
  }
  for (let i = 0; i < projected.length; i++) {
    for (let j = i + 1; j < projected.length; j++) {
      if (j === i + 1 || (i === 0 && j === projected.length - 1)) continue;
      if (intersects(projected[i], projected[(i + 1) % projected.length], projected[j], projected[(j + 1) % projected.length])) {
        throw new Error("O polígono não pode cruzar suas próprias arestas.");
      }
    }
  }
  const boundary: Point2D[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const edge = new EllipsoidGeodesic(vertices[i], vertices[(i + 1) % vertices.length], ellipsoid);
    const steps = Math.max(1, Math.min(256, Math.ceil(edge.surfaceDistance / 250)));
    for (let step = 0; step < steps; step++) boundary.push(project(edge.interpolateUsingFraction(step / steps)));
  }
  const area = Math.abs(boundary.reduce((sum, point, index) => {
    const next = boundary[(index + 1) % boundary.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  if (!Number.isFinite(area) || area < 0.01) throw new Error("Selecione um polígono com área válida.");
  return area;
}

export function measurementText(tool: MeasurementTool, points: readonly Cartesian3[]): string {
  if (!points.length) return "";
  if (tool === "coordinates") {
    const point = Cartographic.fromCartesian(points[0]);
    return `Latitude: ${CesiumMath.toDegrees(point.latitude).toFixed(7)}°\nLongitude: ${CesiumMath.toDegrees(point.longitude).toFixed(7)}°\nAltitude: ${point.height.toFixed(2)} m`;
  }
  if (tool === "distance") return `Distância 3D: ${formatDistance(distance3D(points))}`;
  if (tool === "area") return points.length < 3 ? "Área: selecione pelo menos 3 pontos" : `Área horizontal: ${formatArea(geographicArea(points))}`;
  if (points.length < 2) return `Cota A: ${Cartographic.fromCartesian(points[0]).height.toFixed(2)} m`;
  const { altitudeA, altitudeB, delta } = elevationDifference(points);
  return `Cota A: ${altitudeA.toFixed(2)} m\nCota B: ${altitudeB.toFixed(2)} m\nΔZ (B − A): ${delta.toFixed(2)} m`;
}
