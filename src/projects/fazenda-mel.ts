import type { GeographicBounds, ProjectConfig, ProjectLayerConfig } from "./types";

const basemap: ProjectLayerConfig = {
  id: "basemap",
  name: "Bing Aerial com rótulos",
  description: "Bing Maps Aerial with Labels via Cesium ion",
  kind: "basemap",
  source: {
    format: "ion-world-imagery",
    fallback: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      credit: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
      maximumLevel: 19,
    },
  },
  defaultVisible: true,
};

const fazendaMelBounds: GeographicBounds = [-45.17578125, -22.1059988, -44.82421875, -21.943045533];

export const fazendaMelProject: ProjectConfig = {
  id: "fazenda-mel",
  name: "Fazenda Mel",
  location: "Soledade de Minas, MG",
  bounds: fazendaMelBounds,
  // Final opening/Home scene. Position and orientation angles are degrees.
  initialCamera: {
    longitude: -45.0020391,
    latitude: -22.0209443,
    height: 1877.57,
    heading: 3.48,
    pitch: -86.46,
    roll: 359.99,
  },
  // Keep a global base layer beneath the bounded orthomosaic so regional
  // imagery is not treated as a base layer and stretched across the globe.
  // Each raster can provide an image or gradient legend independently.
  layers: [basemap, {
    id: "fazenda-mel-orthomosaic",
    name: "Ortomosaico",
    description: "Fazenda Mel · Cloudflare R2 · EPSG:3857",
    kind: "orthomosaic",
    source: {
      format: "tms",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/orto/{z}/{x}/{reverseY}.png",
      credit: "Fazenda Mel orthomosaic",
      minimumLevel: 11,
      maximumLevel: 20,
      bounds: fazendaMelBounds,
      tileWidth: 256,
      tileHeight: 256,
      allowMissingTiles: true,
    },
    defaultVisible: true,
  }, {
    id: "fazenda-mel-mds",
    name: "Modelo Digital da Superfície",
    description: "Fazenda Mel · Cloudflare R2 · EPSG:3857",
    kind: "dsm",
    source: {
      format: "tms",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/mds/{z}/{x}/{reverseY}.png",
      credit: "Fazenda Mel MDS",
      minimumLevel: 11,
      maximumLevel: 20,
      bounds: fazendaMelBounds,
      tileWidth: 256,
      tileHeight: 256,
      allowMissingTiles: true,
    },
    defaultVisible: false,
    legend: {
      type: "image",
      title: "MDS",
      imageUrl: "/mds_legend.png",
      imageAlt: "Legenda do Modelo Digital da Superfície",
    },
  }, {
    id: "fazenda-mel-mdt",
    name: "Modelo Digital do Terreno",
    description: "Fazenda Mel · Cloudflare R2 · EPSG:3857",
    kind: "dtm",
    source: {
      format: "tms",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/mdt/{z}/{x}/{reverseY}.png",
      credit: "Fazenda Mel MDT",
      minimumLevel: 11,
      maximumLevel: 20,
      bounds: fazendaMelBounds,
      tileWidth: 256,
      tileHeight: 256,
      allowMissingTiles: true,
    },
    defaultVisible: false,
    legend: {
      type: "image",
      title: "MDT",
      imageUrl: "/mdt_legend.png",
      imageAlt: "Legenda do Modelo Digital do Terreno: elevação de 893,4 a 944,7 metros",
    },
  }, {
    id: "fazenda-mel-slope",
    name: "Declividade",
    description: "Fazenda Mel · Cloudflare R2 · EPSG:3857",
    kind: "slope",
    source: {
      format: "tms",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/declividade/{z}/{x}/{reverseY}.png",
      credit: "Fazenda Mel Declividade",
      minimumLevel: 11,
      maximumLevel: 20,
      bounds: fazendaMelBounds,
      tileWidth: 256,
      tileHeight: 256,
      allowMissingTiles: true,
    },
    defaultVisible: false,
  }, {
    id: "fazenda-mel-solar-orientation",
    name: "Orientação solar",
    description: "Fazenda Mel · Cloudflare R2 · EPSG:3857",
    kind: "solar-orientation",
    source: {
      format: "tms",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/solar/{z}/{x}/{reverseY}.png",
      credit: "Fazenda Mel Orientação solar",
      minimumLevel: 11,
      maximumLevel: 20,
      bounds: fazendaMelBounds,
      tileWidth: 256,
      tileHeight: 256,
      allowMissingTiles: true,
    },
    defaultVisible: false,
    legend: {
      type: "image",
      title: "Orientação solar",
      imageUrl: "/aspect_legend.png",
      imageAlt: "Legenda de Orientação solar",
    },
  }, {
    id: "fazenda-mel-property-boundary",
    name: "Limite da propriedade",
    description: "Fazenda Mel · Cloudflare R2 · GeoJSON",
    kind: "property-boundary",
    source: {
      format: "geojson",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/vetores/peri_imovel.geojson",
      autoZoom: false,
      style: { stroke: "#ff0000", strokeWidth: 3, fill: "#00000000", clampToGround: true, zIndex: 3 },
    },
    defaultVisible: true,
  }, {
    id: "fazenda-mel-contours",
    name: "Curvas de nível",
    description: "Fazenda Mel · Cloudflare R2 · GeoJSON",
    kind: "contours",
    source: {
      format: "geojson",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/vetores/curvas_nivel.geojson",
      autoZoom: false,
      style: { stroke: "#000000", strokeWidth: 1, fill: "#00000000", clampToGround: true, zIndex: 1 },
    },
    defaultVisible: false,
  }, {
    id: "fazenda-mel-drainage",
    name: "Linhas de drenagem",
    description: "Fazenda Mel · Cloudflare R2 · GeoJSON",
    kind: "drainage",
    source: {
      format: "geojson",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/vetores/linhas_drenagem.geojson",
      autoZoom: false,
      style: { stroke: "#0000ff", strokeWidth: 2, fill: "#00000000", clampToGround: true, zIndex: 2 },
    },
    defaultVisible: false,
  }, {
    id: "fazenda-mel-model-3d",
    name: "Modelo 3D",
    description: "Fazenda Mel · Cloudflare R2 · 3D Tiles",
    kind: "3d-tiles",
    source: {
      format: "3d-tiles",
      url: "https://pub-ee4efe5ddacc44908daff7f68409b306.r2.dev/tiled/tileset.json",
    },
    defaultVisible: false,
  }],
};
