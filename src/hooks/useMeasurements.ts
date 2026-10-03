import { useEffect, useRef, useState } from "react";
import { Cartesian2, Cartesian3, CustomDataSource, ScreenSpaceEventHandler, ScreenSpaceEventType, type Entity, type Viewer } from "cesium";
import { drawMeasurement } from "../cesium/measurementGraphics";
import { measurementText, pickMeasurementPosition, type MeasurementTool } from "../cesium/measurementUtils";

interface MeasurementState {
  ready: boolean;
  active: MeasurementTool | null;
  pointCount: number;
  completed: number;
  result: string;
  message: string;
}
const initialState: MeasurementState = { ready: false, active: null, pointCount: 0, completed: 0, result: "", message: "" };
interface MeasurementActions {
  select: (tool: MeasurementTool) => void;
  clear: () => void;
  finish: () => void;
  cancel: () => void;
}

export function useMeasurements(viewer: Viewer | null) {
  const [state, setState] = useState(initialState);
  const actions = useRef<MeasurementActions | null>(null);

  useEffect(() => {
    setState(initialState);
    if (!viewer || viewer.isDestroyed()) return;
    const source = new CustomDataSource("cardeal-measurements");
    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    let disposed = false;
    let ready = false;
    let active: MeasurementTool | null = null;
    let points: Cartesian3[] = [];
    let draft: Entity[] = [];
    let completed = 0;
    let lastScreen: Cartesian2 | null = null;
    let lastMove = 0;
    const pending = new Map<ReturnType<typeof setTimeout>, { point: Cartesian3; screen: Cartesian2 }>();
    const originalTabIndex = viewer.canvas.getAttribute("tabindex");
    if (originalTabIndex === null) viewer.canvas.setAttribute("tabindex", "0");
    let defaultDoubleClick: ReturnType<ScreenSpaceEventHandler["getInputAction"]>;
    let suspendedDoubleClick = false;

    function render() { if (!disposed && !viewer!.isDestroyed()) viewer!.scene.requestRender(); }
    function removeDraft() { draft.forEach((entity) => source.entities.remove(entity)); draft = []; }
    function clearPending() { pending.forEach((_value, timer) => clearTimeout(timer)); pending.clear(); }
    function resetDraft() { clearPending(); removeDraft(); points = []; lastScreen = null; }
    function restoreDoubleClick() {
      if (!suspendedDoubleClick || viewer!.isDestroyed()) return;
      if (defaultDoubleClick && !viewer!.screenSpaceEventHandler.getInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)) {
        viewer!.screenSpaceEventHandler.setInputAction(defaultDoubleClick, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      }
      suspendedDoubleClick = false;
    }
    function cancel() {
      resetDraft(); active = null;
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      handler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
      restoreDoubleClick();
      setState((current) => ({ ...current, active: null, pointCount: 0, message: "Desenho cancelado.", result: "" }));
      render();
    }
    function updateDraft(hover?: Cartesian3) {
      removeDraft();
      if (!active || !points.length) return;
      const preview = hover && Cartesian3.distance(points[points.length - 1], hover) > 0.001 ? [...points, hover] : points;
      let text: string;
      try { text = measurementText(active, preview); }
      catch (error) { text = error instanceof Error ? error.message : "Área inválida."; }
      draft = drawMeasurement(source, active, preview, text);
      setState((current) => ({ ...current, pointCount: points.length, result: text, message: "" }));
      render();
    }
    function finish() {
      // Enter commits clicks waiting for double-click disambiguation.
      const waiting = [...pending.values()]; clearPending();
      waiting.forEach(({ point, screen }) => addPoint(point, screen));
      if (!active) return;
      if (active === "area" && points.length > 3 && Cartesian3.distance(points[0], points[points.length - 1]) < 0.001) points.pop();
      const minimum = active === "area" ? 3 : active === "coordinates" ? 1 : 2;
      if (points.length < minimum) {
        setState((current) => ({ ...current, message: `Selecione pelo menos ${minimum} pontos.` })); return;
      }
      let text: string;
      try { text = measurementText(active, points); }
      catch (error) { setState((current) => ({ ...current, message: error instanceof Error ? error.message : "Medição inválida." })); return; }
      removeDraft();
      drawMeasurement(source, active, points, text);
      completed++; points = []; lastScreen = null;
      setState((current) => ({ ...current, pointCount: 0, completed, result: text, message: "Medição concluída. Clique para iniciar outra." }));
      render();
    }
    function addPoint(point: Cartesian3, screen: Cartesian2) {
      if (!active || disposed || viewer!.isDestroyed()) return;
      if (points.length >= 128) { setState((current) => ({ ...current, message: "Limite de 128 pontos. Finalize a medição." })); return; }
      if (points.length && Cartesian3.distance(points[points.length - 1], point) < 0.001) return;
      points.push(point); lastScreen = Cartesian2.clone(screen);
      updateDraft();
      if (active === "coordinates" || (active === "height" && points.length === 2)) finish();
    }
    function pick(screen: Cartesian2) {
      const point = pickMeasurementPosition(viewer!, screen);
      if (!point) setState((current) => ({ ...current, message: "Nenhuma superfície disponível. Clique no terreno ou no modelo carregado." }));
      return point;
    }
    function select(tool: MeasurementTool) {
      if (!ready || disposed || viewer!.isDestroyed()) return;
      if (active === tool) { cancel(); return; }
      resetDraft(); active = tool;
      // Suspend only Cesium's entity-tracking double-click while drawing; restore on exit.
      if (!suspendedDoubleClick) {
        defaultDoubleClick = viewer!.screenSpaceEventHandler.getInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        viewer!.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        suspendedDoubleClick = true;
      }
      setState((current) => ({ ...current, active: tool, pointCount: 0, result: "", message: "" }));
      handler.setInputAction((event: { position: Cartesian2 }) => {
        viewer!.canvas.focus({ preventScroll: true });
        const point = pick(event.position);
        if (!point) return;
        const screen = Cartesian2.clone(event.position);
        if (active === "coordinates" || active === "height") { addPoint(point, screen); return; }
        // Delay commit, not picking, so double-click finishes without a duplicate vertex.
        const timer = setTimeout(() => {
          pending.delete(timer); addPoint(point, screen);
        }, 250);
        pending.set(timer, { point, screen });
      }, ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        if (active !== "distance" && active !== "area") return;
        const waiting = [...pending.values()]; clearPending();
        const earlier = waiting.filter(({ screen }) => Cartesian2.distance(screen, event.position) > 5);
        earlier.forEach(({ point, screen }) => addPoint(point, screen));
        if (!lastScreen || Cartesian2.distance(lastScreen, event.position) > 5) {
          const endpoint = waiting.find(({ screen }) => Cartesian2.distance(screen, event.position) <= 5)?.point ?? pick(event.position);
          if (endpoint) addPoint(endpoint, event.position);
        }
        finish();
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      handler.setInputAction((event: { endPosition: Cartesian2 }) => {
        if (!points.length || performance.now() - lastMove < 80) return;
        lastMove = performance.now();
        const point = pickMeasurementPosition(viewer!, event.endPosition);
        updateDraft(point);
      }, ScreenSpaceEventType.MOUSE_MOVE);
      render();
    }
    function clear() {
      cancel(); source.entities.removeAll(); completed = 0;
      setState((current) => ({ ...current, completed: 0, result: "", message: "Medições removidas." })); render();
    }
    function keydown(event: KeyboardEvent) {
      if (!active || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
      if (event.key === "Enter" && (active === "distance" || active === "area") && event.target === viewer!.canvas) {
        event.preventDefault(); finish();
      }
    }
    const api = { select, clear, finish, cancel };
    actions.current = api;
    document.addEventListener("keydown", keydown);
    void viewer.dataSources.add(source).then(() => {
      if (disposed || viewer.isDestroyed()) {
        if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
        return;
      }
      ready = true; setState((current) => ({ ...current, ready: true })); render();
    }).catch(() => {
      if (!disposed) setState((current) => ({ ...current, message: "Não foi possível iniciar as medições." }));
    });
    return () => {
      disposed = true; clearPending(); restoreDoubleClick();
      document.removeEventListener("keydown", keydown); handler.destroy();
      if (actions.current === api) actions.current = null;
      if (originalTabIndex === null) viewer.canvas.removeAttribute("tabindex");
      if (!viewer.isDestroyed()) { viewer.dataSources.remove(source, true); viewer.scene.requestRender(); }
    };
  }, [viewer]);

  return {
    ...state,
    select: (tool: MeasurementTool) => actions.current?.select(tool),
    clear: () => actions.current?.clear(),
    finish: () => actions.current?.finish(),
    cancel: () => actions.current?.cancel(),
  };
}
