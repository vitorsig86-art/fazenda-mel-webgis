// Run with node scripts/check-measurements.cjs. No browser or external assets required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cesium = require("cesium");

function load(relativePath, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name], ...globals });
  return exports;
}
const utils = load("src/cesium/measurementUtils.ts", { cesium });
const graphics = load("src/cesium/measurementGraphics.ts", { cesium });

assert.equal(utils.distance3D([new cesium.Cartesian3(0, 0, 0), new cesium.Cartesian3(3, 4, 0), new cesium.Cartesian3(3, 4, 12)]), 17);
assert.equal(utils.formatDistance(999), "999.00 m");
assert.equal(utils.formatDistance(1000), "1.000 km");
assert.match(utils.formatArea(10000), /^1.0000 ha \(10000.00 m²\)$/);
const at = (x, y, height = 0, longitude = 0) => cesium.Cartesian3.fromDegrees(longitude + x / 111319.490793, y / 110574.275822, height);
const square = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];
const area = utils.geographicArea(square);
assert.ok(Math.abs(area - 10000) < 1, `100 m square: ${area}`);
assert.ok(Math.abs(utils.geographicArea([...square].reverse()) - area) < 0.001);
assert.ok(Math.abs(utils.geographicArea([...square, square[0]]) - area) < 0.001);
assert.ok(Math.abs(utils.geographicArea(square.map((point) => {
  const c = cesium.Cartographic.fromCartesian(point);
  return cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 900);
})) - area) < 0.001, "Area must ignore relief/altitudes");
const concave = [at(0, 0), at(100, 0), at(100, 50), at(50, 50), at(50, 100), at(0, 100)];
assert.ok(Math.abs(utils.geographicArea(concave) - 7500) < 1);
assert.ok(Math.abs(utils.geographicArea([at(0, 0, 0, 179.9995), at(100, 0, 0, 179.9995), at(100, 100, 0, 179.9995), at(0, 100, 0, 179.9995)]) - 10000) < 1);
assert.throws(() => utils.geographicArea([square[0], square[2], square[1], square[3]]), /cruzar/);
assert.throws(() => utils.geographicArea([at(0, 0), at(200000, 0), at(0, 100)]), /100 km/);
const heights = utils.elevationDifference([at(0, 0, 150), at(100, 0, 125)]);
assert.ok(Math.abs(heights.delta + 25) < 1e-6);
assert.match(utils.measurementText("coordinates", [cesium.Cartesian3.fromDegrees(-44.7952463, -21.8294233, 1555.15)]), /Latitude: -21.8294233°\nLongitude: -44.7952463°\nAltitude: 1555.15 m/);

const depth = at(10, 10, 500);
const ground = at(10, 10, 100);
const pickingViewer = {
  isDestroyed: () => false,
  camera: { getPickRay: () => ({}), pickEllipsoid: () => { throw new Error("Ellipsoid must not be used"); } },
  scene: { pickPositionSupported: true, pickPosition: () => depth, globe: { pick: () => ground } },
};
assert.ok(cesium.Cartesian3.equals(utils.pickMeasurementPosition(pickingViewer, new cesium.Cartesian2()), depth));
pickingViewer.scene.pickPosition = () => { throw new Error("Depth unavailable"); };
assert.ok(cesium.Cartesian3.equals(utils.pickMeasurementPosition(pickingViewer, new cesium.Cartesian2()), ground));
pickingViewer.scene.pickPosition = () => new cesium.Cartesian3(NaN, 0, 0);
assert.ok(cesium.Cartesian3.equals(utils.pickMeasurementPosition(pickingViewer, new cesium.Cartesian2()), ground));
pickingViewer.scene.globe.pick = () => undefined;
assert.equal(utils.pickMeasurementPosition(pickingViewer, new cesium.Cartesian2()), undefined);

class Element {}
class FakeHandler {
  static instances = [];
  constructor() { this.actions = new Map(); FakeHandler.instances.push(this); }
  setInputAction(action, type) { this.actions.set(type, action); }
  getInputAction(type) { return this.actions.get(type); }
  removeInputAction(type) { this.actions.delete(type); }
  destroy() { this.destroyed = true; this.actions.clear(); }
}
const listeners = new Map();
const timers = new Map();
let nextTimer = 0;
const flushTimers = () => { const queued = [...timers.values()]; timers.clear(); queued.forEach((callback) => callback()); };
let state, effect;
const react = {
  useState: (initial) => { state = initial; return [state, (value) => state = typeof value === "function" ? value(state) : value]; },
  useRef: (value) => ({ current: value }),
  useEffect: (callback) => effect = callback,
};
const { useMeasurements } = load("src/hooks/useMeasurements.ts", {
  react, cesium: { ...cesium, ScreenSpaceEventHandler: FakeHandler },
  "../cesium/measurementUtils": utils, "../cesium/measurementGraphics": graphics,
}, {
  document: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name) },
  HTMLElement: Element, HTMLInputElement: class {}, HTMLTextAreaElement: class {},
  performance: { now: () => 1000 },
  setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
  clearTimeout: (id) => timers.delete(id),
});

async function main() {
  const canvas = new Element();
  const attributes = new Map();
  canvas.getAttribute = (key) => attributes.get(key) ?? null;
  canvas.setAttribute = (key, value) => attributes.set(key, value);
  canvas.removeAttribute = (key) => attributes.delete(key);
  canvas.focus = () => {};
  const defaults = new FakeHandler();
  const originalDoubleClick = () => {};
  defaults.setInputAction(originalDoubleClick, cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  const dataSources = new cesium.DataSourceCollection();
  const project = new cesium.CustomDataSource("project-vector-layer");
  project.entities.add({ position: at(0, 0) });
  await dataSources.add(project);
  const viewer = {
    isDestroyed: () => false, canvas, dataSources, screenSpaceEventHandler: defaults,
    camera: { getPickRay: () => ({}) },
    scene: { requestRender() {}, pickPositionSupported: true, pickPosition: (screen) => at(screen.x, screen.y, 100 + screen.x), globe: { pick: () => undefined } },
  };
  const api = useMeasurements(viewer);
  const cleanup = effect();
  await new Promise(setImmediate);
  assert.equal(state.ready, true);
  const source = dataSources.get(1);
  const handler = FakeHandler.instances.at(-1);
  function click(x, y = 0) { handler.getInputAction(cesium.ScreenSpaceEventType.LEFT_CLICK)({ position: new cesium.Cartesian2(x, y) }); }
  function enter() { listeners.get("keydown")({ key: "Enter", target: canvas, preventDefault() {} }); }

  api.select("coordinates"); click(10);
  assert.equal(state.completed, 1);
  assert.match(state.result, /Altitude: 110.00 m/);
  const retainedCount = source.entities.values.length;
  api.select("distance"); click(0); flushTimers(); click(10); click(10);
  handler.getInputAction(cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)({ position: new cesium.Cartesian2(10, 0) });
  assert.equal(state.completed, 2);
  assert.equal(source.entities.values.length - retainedCount, 4, "Two markers, one line, one label; no duplicate double-click vertex");
  assert.equal(timers.size, 0);
  click(20); click(30); enter(); assert.equal(state.completed, 3, "Enter commits pending clicks");
  api.select("height"); click(10); click(30);
  assert.equal(state.completed, 4); assert.match(state.result, /ΔZ \(B − A\): 20.00 m/);
  api.select("area"); click(0, 0); click(100, 0); click(100, 100); click(0, 100); enter();
  assert.equal(state.completed, 5); assert.match(state.result, /Área horizontal:/);
  const finalizedCount = source.entities.values.length;
  api.select("distance"); click(40); flushTimers(); click(50);
  listeners.get("keydown")({ key: "Escape", target: canvas, preventDefault() {} });
  flushTimers(); assert.equal(state.active, null); assert.equal(state.completed, 5);
  assert.equal(source.entities.values.length, finalizedCount, "ESC removes only incomplete graphics");
  assert.equal(defaults.getInputAction(cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK), originalDoubleClick);
  api.clear(); assert.equal(source.entities.values.length, 0); assert.equal(state.completed, 0);
  assert.equal(project.entities.values.length, 1); assert.equal(dataSources.length, 2);
  cleanup(); assert.equal(dataSources.length, 1); assert.equal(handler.destroyed, true);
  assert.equal(listeners.size, 0); assert.equal(timers.size, 0); assert.equal(attributes.has("tabindex"), false);
  useMeasurements(viewer); const disposeBeforeReady = effect(); disposeBeforeReady();
  await new Promise(setImmediate); assert.equal(dataSources.length, 1, "No late data source leak after early disposal");
  console.log("Measurements passed: 3D distances, geographic area/units/invalid polygons, coordinates, signed elevation difference, depth/fallback picking, double-click/Enter/ESC, isolated graphics, clear, and cleanup.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
