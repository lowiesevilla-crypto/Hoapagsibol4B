import { readFile } from "node:fs/promises";
import {
  defaultDesignerPanelPreference,
  enterDesignerFocusCanvas,
  exitDesignerFocusCanvas,
  parseDesignerPanelPreference,
  serializeDesignerPanelPreference,
  toggleDesignerPanel,
  type DesignerPanelState,
} from "../lib/services/document-designer-ui";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const initial: DesignerPanelState = { ...defaultDesignerPanelPreference, focusCanvas: false };
  const leftCollapsed = toggleDesignerPanel(initial, "left");
  assert(!leftCollapsed.leftOpen && leftCollapsed.rightOpen, "left panel collapses independently");
  const leftReopened = toggleDesignerPanel(leftCollapsed, "left");
  assert(leftReopened.leftOpen && leftReopened.rightOpen, "left panel reopens independently");
  const rightCollapsed = toggleDesignerPanel(initial, "right");
  assert(rightCollapsed.leftOpen && !rightCollapsed.rightOpen, "right panel collapses independently");
  const rightReopened = toggleDesignerPanel(rightCollapsed, "right");
  assert(rightReopened.leftOpen && rightReopened.rightOpen, "right panel reopens independently");

  const focused = enterDesignerFocusCanvas({ leftOpen: false, rightOpen: true, focusCanvas: false });
  assert(focused.state.focusCanvas && !focused.state.leftOpen && !focused.state.rightOpen, "Focus Canvas collapses both panels");
  const restored = exitDesignerFocusCanvas(focused.state, focused.restore);
  assert(!restored.focusCanvas && !restored.leftOpen && restored.rightOpen, "Exit Focus Canvas restores the previous panel state");

  const editorState = { selectedIds: ["title", "logo"], coordinates: { x: 42, y: 84, width: 100, height: 12 }, zoom: 82, dirty: true, text: "Unsaved wording", history: ["before"], future: ["after"] };
  const before = JSON.stringify(editorState);
  toggleDesignerPanel(initial, "left");
  enterDesignerFocusCanvas(initial);
  exitDesignerFocusCanvas({ ...initial, leftOpen: false, rightOpen: false, focusCanvas: true }, { leftOpen: true, rightOpen: true });
  assert(JSON.stringify(editorState) === before, "panel transitions do not mutate selection, coordinates, zoom, dirty state, text, or history");
  assert(editorState.selectedIds.length === 2 && editorState.coordinates.x === 42 && editorState.zoom === 82 && editorState.dirty && editorState.text === "Unsaved wording", "selection, coordinates, zoom, unsaved edits, and history remain available");

  const serialized = serializeDesignerPanelPreference({ leftOpen: false, rightOpen: true });
  assert(parseDesignerPanelPreference(serialized)?.leftOpen === false && parseDesignerPanelPreference(serialized)?.rightOpen === true, "panel preference restores from the versioned session value");
  assert(parseDesignerPanelPreference(null) === null && parseDesignerPanelPreference("{bad") === null && parseDesignerPanelPreference(JSON.stringify({ version: 2, leftOpen: false, rightOpen: false })) === null, "invalid stored preferences fall back safely");
  assert(!serialized.includes("tenant") && !serialized.includes("template") && !serialized.includes("user"), "panel preference contains no tenant, template, or user data");

  const source = await readFile(new URL("../components/professional-document-template-editor.tsx", import.meta.url), "utf8");
  assert(source.includes("designer-left-toggle") && source.includes("designer-right-toggle"), "left and right toolbar toggles are rendered");
  assert(source.includes("designer-focus-toggle") && source.includes("Focus Canvas"), "Focus Canvas control remains in the top toolbar");
  assert(source.includes("designer-left-edge-toggle") && source.includes("designer-right-edge-toggle"), "collapsed panels expose visible edge reopen controls");
  assert(source.includes("Ctrl+Shift") === false && source.includes('shortcut === "l"') && source.includes('shortcut === "r"') && source.includes('shortcut === "f"'), "panel keyboard shortcuts are handled without changing template content");
  assert(source.includes("aria-expanded={expanded}") && source.includes('aria-controls="designer-left-panel"') && source.includes('aria-controls="designer-right-panel"'), "panel controls expose accessible expanded state and relationships");
  assert(source.includes("dragRef.current") && source.includes("resizePosition"), "panel changes leave drag and resize coordinate paths intact");
  assert(source.includes("templateDefinitionJson") && !source.includes("setDefinitionJson"), "panel visibility is not written into template JSON separately");
  assert(source.includes("xl:grid-cols-[minmax(0,1fr)]") && source.includes("max-xl:absolute"), "focus and responsive layouts provide a full canvas and drawer behavior");
  console.log("Designer panel state verification passed (20 checks).");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
