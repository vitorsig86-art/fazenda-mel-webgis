// Real Cesium rectangle/skeleton and collection checks; no WebGL or network.
// Run: node scripts/check-raster-lifecycle.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cesium = require("cesium");
const root = path.join(__dirname, "..");

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8").replaceAll("import.meta.env.DEV", "false"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name] ?? require(name), console });
  return exports;
}

const { fazendaMelProject: project } = load("src/projects/fazenda-mel.ts");
const { loadLayer, attachLayer, assertImageryLayerReady } = load("src/cesium/loadLayer.ts");
const rasters = project.layers.filter((layer) => layer.source.format === "tms");
const terrain = new cesium.EllipsoidTerrainProvider();
const scheme = terrain.tilingScheme;

function makeTile(x, y, level) {
  return { x, y, level, rectangle: scheme.tileXYToRectangle(x, y, level), data: { imagery: [] } };
}

function release(tile) {
  for (const imagery of tile.data.imagery) imagery.freeResources();
  tile.data.imagery.length = 0;
}

async function checkHookOrdering() {
  // Run the actual hook with a small deterministic effect scheduler. Delayed
  // attachment deliberately allows a visibility update while loading is pending.
  const slots = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useRef(value) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useState(value) {
      const index = cursor++;
      const slot = slots[index] ??= { value };
      return [slot.value, (next) => { slot.value = typeof next === "function" ? next(slot.value) : next; }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const slot = slots[index] ??= {};
      if (!slot.dependencies || dependencies.some((value, i) => value !== slot.dependencies[i])) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
        slot.dependencies = dependencies;
      }
    },
  };
  const loader = load("src/cesium/loadLayer.ts");
  const collection = new cesium.ImageryLayerCollection();
  const dataSources = new cesium.DataSourceCollection();
  const primitives = new cesium.PrimitiveCollection();
  const viewer = {
    isDestroyed: () => false,
    imageryLayers: collection,
    dataSources,
    camera: { cancelFlight() {} },
    scene: { requestRender() {}, primitives },
  };
  const pending = [];
  const created = new Map();
  const loadCounts = new Map();
  const { useProjectLayers } = load("src/hooks/useProjectLayers.ts", {
    react,
    "../cesium/projectCamera": { applyProjectCamera() {} },
    "../cesium/loadLayer": {
      ...loader,
      loadLayer: async (definition) => {
        loadCounts.set(definition.id, (loadCounts.get(definition.id) ?? 0) + 1);
        let layer;
        if (definition.source.format === "ion-world-imagery") {
          layer = new cesium.ImageryLayer(new cesium.UrlTemplateImageryProvider({ url: "https://example.invalid/{z}/{x}/{y}.png" }));
        } else if (definition.source.format === "geojson") {
          layer = new cesium.GeoJsonDataSource(definition.id);
        } else if (definition.source.format === "3d-tiles") {
          layer = new cesium.Cesium3DTileset();
        } else layer = await loader.loadLayer(definition);
        created.set(definition.id, layer);
        return layer;
      },
      attachLayer: (viewer, layer) => layer instanceof cesium.ImageryLayer ? new Promise((resolve, reject) => {
        pending.push({ layer, finish: () => loader.attachLayer(viewer, layer).then(resolve, reject) });
      }) : loader.attachLayer(viewer, layer),
    },
    "../cesium/imageryTileErrors": { createImageryTileErrorHandler: () => () => {} },
  });
  const hookProject = project;
  let visible = new Set();
  const render = () => {
    cursor = 0;
    const result = useProjectLayers(viewer, hookProject, visible);
    const scheduled = effects;
    effects = [];
    scheduled.forEach((effect) => effect());
    return result;
  };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  render();
  await flush();
  for (const definition of rasters) {
    const attachment = pending.shift();
    assert.ok(attachment, `${definition.name}: attachment must await construction`);
    const layer = attachment.layer;
    const provider = layer.imageryProvider;
    assertImageryLayerReady(layer);
    visible = new Set([...visible, definition.id]);
    assert.equal(render().statuses[definition.id], "loading");
    assert.equal(layer.show, false, "ON during pending attachment must not expose the layer");
    assert.equal(collection.contains(layer), false);
    render().setRasterOpacity(definition.id, 35);
    assert.equal(render().rasterOpacities[definition.id], 35);
    visible = new Set([...visible].filter((id) => id !== definition.id));
    render();
    visible = new Set([...visible, definition.id]);
    render();
    await attachment.finish();
    await flush();
    assert.equal(render().statuses[definition.id], "ready");
    assert.equal(collection.contains(layer), true);
    assert.equal(layer.show, true, "Activation must use the latest requested visibility");
    assert.equal(layer.alpha, 0.35, "Pending attachment must apply the latest opacity");
    const otherOpacities = new Map([...created].filter(([id]) => id !== definition.id).map(([id, entry]) => [id, entry.alpha]));
    for (let percent = 0; percent <= 100; percent++) {
      render().setRasterOpacity(definition.id, percent);
      assert.equal(layer.alpha, percent / 100);
      assert.equal(render().rasterOpacities[definition.id], percent);
      assert.equal(layer.imageryProvider, provider);
      for (const [id, alpha] of otherOpacities) assert.equal(created.get(id).alpha, alpha, "Opacity must affect only its raster");
    }
    render().setRasterOpacity(definition.id, 65);
    for (let round = 0; round < 4; round++) {
      visible = new Set([...visible].filter((id) => id !== definition.id));
      render();
      assert.equal(layer.show, false);
      visible = new Set([...visible, definition.id]);
      render();
      assert.equal(layer.show, true);
      assert.equal(layer.imageryProvider, provider);
      assert.equal(layer.alpha, 0.65, "OFF/ON must retain opacity");
    }
    assert.equal(loadCounts.get(definition.id), 1, "Sliders and repeated toggles must never reload providers");
  }
  const first = rasters[0].id;
  const second = rasters[1].id;
  render().setRasterOpacity(first, 100);
  render().setRasterOpacity(second, 45);
  assert.equal(created.get(first).alpha, 1);
  assert.equal(created.get(second).alpha, 0.45);
  assert.equal(created.get(first).show, true);
  assert.equal(created.get(second).show, true);
  for (const definition of project.layers.filter((entry) => entry.source.format === "geojson" || entry.source.format === "3d-tiles")) {
    visible = new Set([...visible, definition.id]);
    render();
    await flush();
    const layer = created.get(definition.id);
    assert.ok(layer);
    for (let round = 0; round < 4; round++) {
      visible = new Set([...visible].filter((id) => id !== definition.id));
      render();
      assert.equal(layer.show, false);
      visible = new Set([...visible, definition.id]);
      render();
      assert.equal(layer.show, true);
    }
    assert.equal(loadCounts.get(definition.id), 1);
    render().setRasterOpacity(definition.id, 25);
    assert.equal(layer.alpha, undefined, "Vectors and 3D Tiles must not receive raster opacity");
  }
  // Cleanup must also dispose of cached hidden layers.
  slots.forEach((slot) => slot?.cleanup?.());
  assert.equal(collection.length, 0);
  assert.equal(dataSources.length, 0);
  assert.equal(primitives.length, 0);
  collection.destroy();
  dataSources.destroy();
  primitives.destroy();
  console.log("Actual hook passed: all raster opacity values 0-100%, independent simultaneous alpha, retained opacity, vector/3D toggles, provider reuse and cleanup.");
}

// Include both sides of each footprint edge across terrain levels, including
// levels above the imagery maximum. Cesium chooses imagery LOD independently.
const tiles = [];
for (let level = 0; level <= 23; level++) {
  const xs = new Set();
  const ys = new Set();
  for (const longitude of [project.bounds[0], project.bounds[2]]) {
    for (const latitude of [project.bounds[1], project.bounds[3]]) {
      const position = scheme.positionToTileXY(cesium.Cartographic.fromDegrees(longitude, latitude), level);
      for (let delta = -1; delta <= 1; delta++) {
        xs.add(position.x + delta);
        ys.add(position.y + delta);
      }
    }
  }
  for (const x of xs) {
    for (const y of ys) {
      if (x >= 0 && y >= 0 && x < scheme.getNumberOfXTilesAtLevel(level) && y < scheme.getNumberOfYTilesAtLevel(level)) {
        tiles.push(makeTile(x, y, level));
      }
    }
  }
}

async function main() {
  // Prove that the original loader's fully initialized provider still throws
  // the reported exception. This is not a provider promise or missing bounds.
  const source = rasters[0].source;
  const original = new cesium.ImageryLayer(new cesium.UrlTemplateImageryProvider({
    ...source,
    rectangle: cesium.Rectangle.fromDegrees(...source.bounds),
    tilingScheme: new cesium.WebMercatorTilingScheme(),
  }));
  assertImageryLayerReady(original);
  const failingTile = makeTile(769, 636, 10);
  const overlap = cesium.Rectangle.intersection(failingTile.rectangle, original.imageryProvider.rectangle);
  assert.ok(overlap.width > 0 && overlap.width < cesium.Math.EPSILON14);
  assert.throws(() => original._createTileImagerySkeletons(failingTile, terrain), /Expected rectangle.*undefined/);
  release(failingTile);
  original.destroy();

  const collection = new cesium.ImageryLayerCollection();
  const viewer = { isDestroyed: () => false, imageryLayers: collection };
  const basemap = new cesium.ImageryLayer(new cesium.UrlTemplateImageryProvider({ url: "https://example.invalid/{z}/{x}/{y}.png" }));
  collection.add(basemap, 0);
  // Exercise the same show/hide events consumed by GlobeSurfaceTileProvider,
  // using real layer skeleton builders and existing terrain tile rectangles.
  collection.layerShownOrHidden.addEventListener((layer, index, show) => {
    if (layer === basemap) return;
    for (const tile of tiles) {
      if (show) layer._createTileImagerySkeletons(tile, terrain);
      else release(tile);
    }
  });

  for (const definition of rasters) {
    const layer = await loadLayer(definition);
    const provider = layer.imageryProvider;
    assertImageryLayerReady(layer);
    assert.equal(layer.show, false);
    assert.ok(cesium.Rectangle.equals(provider.rectangle, cesium.Rectangle.fromDegrees(...definition.source.bounds)));
    await attachLayer(viewer, layer);
    assert.equal(collection.contains(layer), true);
    assert.equal(layer.show, false, "Attachment must not expose a raster before activation");
    const count = collection.length;
    for (let round = 0; round < 4; round++) {
      layer.show = true;
      assert.doesNotThrow(() => collection._update(), `${definition.name}: ON round ${round}`);
      assert.ok(tiles.some((tile) => tile.data.imagery.length > 0), "Interior coverage must still produce imagery");
      assert.equal(layer.imageryProvider, provider, "Repeated ON must reuse the initialized provider");
      await attachLayer(viewer, layer);
      assert.equal(collection.length, count, "Attachment must be idempotent");
      layer.show = false;
      assert.doesNotThrow(() => collection._update(), `${definition.name}: OFF round ${round}`);
      assert.ok(tiles.every((tile) => tile.data.imagery.length === 0));
    }
    collection.remove(layer, true);
    console.log(`${definition.name}: 4 ON/OFF cycles, ${tiles.length} terrain edge cases per activation passed.`);
  }

  const undefinedProvider = new cesium.ImageryLayer(undefined);
  await assert.rejects(attachLayer(viewer, undefinedProvider), /uninitialized imagery/);
  undefinedProvider.destroy();
  for (const overrides of [
    { bounds: [NaN, -22, -44, -21] },
    { bounds: [-45, -21, -44, -22] },
    { bounds: [-45, 86, -44, 87] },
    { minimumLevel: 21, maximumLevel: 20 },
    { tileWidth: 0 },
  ]) {
    await assert.rejects(loadLayer({ ...rasters[0], source: { ...source, ...overrides } }), /Invalid raster|do not intersect/);
  }
  collection.destroy();
  await checkHookOrdering();
  console.log("Original undefined-rectangle crash reproduced; all guarded rasters, provider validation and repeat activation passed without reloading.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
