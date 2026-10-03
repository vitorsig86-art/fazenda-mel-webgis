// Thematic data and transport format are separate: several themes share a loader.
export type LayerKind =
  | "basemap"
  | "orthomosaic"
  | "dtm"
  | "dsm"
  | "slope"
  | "solar-orientation"
  | "ndvi"
  | "multispectral"
  | "property-boundary"
  | "drainage"
  | "contours"
  | "3d-tiles";

// Geographic rectangles use longitude/latitude degrees.
export type GeographicBounds = [west: number, south: number, east: number, north: number];

export type LayerSource =
  | { format: "3d-tiles"; url: string }
  | {
    format: "ion-world-imagery";
    fallback: { url: string; credit: string; maximumLevel: number };
  }
  | {
    format: "xyz" | "tms";
    url: string;
    credit: string;
    // Imagery tile zoom levels, independent of camera height/navigation limits.
    minimumLevel?: number;
    maximumLevel?: number;
    bounds?: GeographicBounds;
    tileWidth?: number;
    tileHeight?: number;
    // Opt in only for verified sparse datasets with expected footprint gaps.
    allowMissingTiles?: boolean;
  }
  | {
    format: "geojson";
    url: string;
    autoZoom?: boolean;
    style?: {
      stroke: string;
      strokeWidth: number;
      fill?: string;
      clampToGround?: boolean;
      zIndex?: number;
    };
  };

export interface ProjectLayerConfig {
  id: string;
  name: string;
  description: string;
  kind: LayerKind;
  source: LayerSource;
  defaultVisible: boolean;
  legend?: LegendConfig;
}

// Position and orientation angles are degrees; height is meters above the ellipsoid.
export interface CameraConfig {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  location: string;
  bounds: GeographicBounds;
  initialCamera: CameraConfig;
  layers: ProjectLayerConfig[];
}

export type LayerStatus = "idle" | "loading" | "ready" | "fallback" | "error";

export type LegendConfig = GradientLegendConfig | ImageLegendConfig;

export interface ImageLegendConfig {
  type: "image";
  title: string;
  imageUrl: string;
  imageAlt: string;
}

export interface GradientLegendConfig {
  type?: "gradient";
  title: string;
  min: number;
  max: number;
  tickValues: number[];
  decimalPlaces?: number;
  // Percentage positions run from the minimum (bottom) to maximum (top).
  gradientStops: { position: number; color: string }[];
}
