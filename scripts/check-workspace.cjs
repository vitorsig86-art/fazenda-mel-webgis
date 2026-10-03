// Local panel rendering and interaction checks. No browser or network required.
// Run: node scripts/check-workspace.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.join(__dirname, "..");

function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => name.endsWith(".css") ? {} : require(name) });
  return exports;
}

function elements(node, parents = []) {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, parents));
  if (!node || typeof node !== "object" || !node.props) return [];
  return [{ node, parents }, ...elements(node.props.children, [...parents, node])];
}

const { fazendaMelProject: project } = load("src/projects/fazenda-mel.ts");
const { LayerPanel, getWorkspaceSections } = load("src/components/LayerPanel.tsx");
const sections = getWorkspaceSections(project.layers);
assert.equal(JSON.stringify(sections.map((section) => [section.title, section.layers.length])), JSON.stringify([
  ["Mapa base", 1], ["Rasters", 5], ["Vetores", 3], ["Modelo 3D", 1],
]));
assert.equal(new Set(sections.flatMap((section) => section.layers.map((layer) => layer.id))).size, project.layers.length);
let visible = new Set(project.layers.filter((layer) => layer.defaultVisible).map((layer) => layer.id));
const opacities = {};
const toggles = [];
const opacityChanges = [];
const render = () => LayerPanel({
  project, visible, rasterOpacities: opacities,
  onToggle: (id) => { toggles.push(id); if (visible.has(id)) visible.delete(id); else visible.add(id); },
  onOpacityChange: (id, value) => { opacityChanges.push([id, value]); opacities[id] = value; },
  onClose() {},
});
const initialTree = render();
const markup = renderToStaticMarkup(initialTree);
assert.doesNotMatch(markup, /<select|<option/);
assert.doesNotMatch(markup.replace(/<[^>]*>/g, " "), /PROJECT WORKSPACE|\bProject\b|\bLayers\b|\bactive\b|Choose what/);
assert.match(markup, /Fazenda Mel/);
assert.match(markup, /Soledade de Minas, MG/);
assert.equal(elements(initialTree).filter(({ node }) => node.type === "input" && node.props.type === "range").length, 1);

for (const section of sections) {
  for (const layer of section.layers) {
    const row = elements(render()).find(({ node }) => node.key === layer.id).node;
    const checkbox = elements(row).find(({ node }) => node.type === "input" && node.props.type === "checkbox").node;
    const initial = visible.has(layer.id);
    assert.equal(checkbox.props.checked, initial);
    checkbox.props.onChange();
    assert.equal(visible.has(layer.id), !initial);
    checkbox.props.onChange();
    assert.equal(visible.has(layer.id), initial);
    assert.equal(toggles.at(-1), layer.id);
  }
}

visible = new Set(project.layers.map((layer) => layer.id));
assert.equal(elements(render()).filter(({ node }) => node.type === "input" && node.props.type === "range").length, 5);
for (const layer of sections.find((section) => section.id === "raster").layers) {
  const row = elements(render()).find(({ node }) => node.key === layer.id).node;
  const slider = elements(row).find(({ node }) => node.type === "input" && node.props.type === "range");
  assert.ok(!slider.parents.some((parent) => parent.type === "label"), "Moving opacity must not activate the checkbox label");
  assert.equal(slider.node.props.value, 100);
  assert.equal(slider.node.props.min, 0);
  assert.equal(slider.node.props.max, 100);
  slider.node.props.onChange({ currentTarget: { value: "65" } });
  assert.equal(JSON.stringify(opacityChanges.at(-1)), JSON.stringify([layer.id, 65]));
  assert.ok(visible.has(layer.id), "Opacity must not change visibility");
  const updatedRow = elements(render()).find(({ node }) => node.key === layer.id).node;
  assert.match(renderToStaticMarkup(updatedRow), /65%/);
}
for (const layer of [...sections[0].layers, ...sections[2].layers, ...sections[3].layers]) {
  const row = elements(render()).find(({ node }) => node.key === layer.id).node;
  assert.ok(!elements(row).some(({ node }) => node.type === "input" && node.props.type === "range"));
}
assert.match(renderToStaticMarkup(render()), /model-layer-card/);
const { Legend } = load("src/components/Legend.tsx");
const mdtLegend = project.layers.find((layer) => layer.kind === "dtm").legend;
assert.equal(Legend({ ...mdtLegend, visibility: false }), null);
const legendMarkup = renderToStaticMarkup(Legend({ ...mdtLegend, visibility: true }));
assert.match(legendMarkup, /src="\/mdt_legend\.png"/);
assert.match(legendMarkup, /alt="Legenda do Modelo Digital do Terreno/);
assert.doesNotMatch(legendMarkup, /raster-legend-gradient/);
assert.match(renderToStaticMarkup(Legend({ ...mdtLegend, imageUrl: "/future-legend.png", visibility: true })), /src="\/future-legend\.png"/);
const gradientLegend = { title: "Gradient", min: 0, max: 10, tickValues: [0, 10], gradientStops: [{ position: 0, color: "blue" }, { position: 100, color: "red" }], visibility: true };
assert.match(renderToStaticMarkup(Legend(gradientLegend)), /raster-legend-gradient/);
assert.equal(Legend({ ...gradientLegend, max: 0 }), null);
console.log("Workspace passed: Portuguese sections, checkbox callbacks, independent sliders, 3D card, reusable image legends, hidden legends and gradient compatibility.");
