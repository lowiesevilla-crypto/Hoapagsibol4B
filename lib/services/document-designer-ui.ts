export const designerPanelPreferenceKey = "hoahub:visual-designer:panels:v1";

export type DesignerPanelPreference = {
  leftOpen: boolean;
  rightOpen: boolean;
};

export type DesignerPanelState = DesignerPanelPreference & {
  focusCanvas: boolean;
};

export const defaultDesignerPanelPreference: DesignerPanelPreference = {
  leftOpen: true,
  rightOpen: true,
};

export function toggleDesignerPanel(state: DesignerPanelState, panel: "left" | "right"): DesignerPanelState {
  return { ...state, focusCanvas: false, [panel === "left" ? "leftOpen" : "rightOpen"]: !state[panel === "left" ? "leftOpen" : "rightOpen"] };
}

export function enterDesignerFocusCanvas(state: DesignerPanelState) {
  return { state: { ...state, leftOpen: false, rightOpen: false, focusCanvas: true }, restore: { leftOpen: state.leftOpen, rightOpen: state.rightOpen } };
}

export function exitDesignerFocusCanvas(state: DesignerPanelState, restore: DesignerPanelPreference | null) {
  const panels = restore || defaultDesignerPanelPreference;
  return { ...state, leftOpen: panels.leftOpen, rightOpen: panels.rightOpen, focusCanvas: false };
}

export function parseDesignerPanelPreference(value: string | null): DesignerPanelPreference | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || typeof record.leftOpen !== "boolean" || typeof record.rightOpen !== "boolean") return null;
    return { leftOpen: record.leftOpen, rightOpen: record.rightOpen };
  } catch {
    return null;
  }
}

export function serializeDesignerPanelPreference(preference: DesignerPanelPreference) {
  return JSON.stringify({ version: 1, leftOpen: preference.leftOpen, rightOpen: preference.rightOpen });
}
