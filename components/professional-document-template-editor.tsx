"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Grid2X2,
  ImageIcon,
  List,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  MoveDown,
  MoveUp,
  PanelLeft,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  Printer,
  QrCode,
  Redo2,
  Save,
  Search,
  Signature,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  allowedDocumentPlaceholders,
  defaultOfficerListConfig,
  normalizeTemplateDefinition,
  placeholderGroups,
  sampleTemplateValue,
  safeFontFamilies,
  validateTemplateDefinition,
  documentPageSizes,
  type DocumentPageFormat,
  type DocumentOfficerListConfig,
  type DocumentTemplateBlock,
  type DocumentTemplateBlockType,
  type DocumentTemplateDefinition,
  type DocumentTemplateSectionName,
  type DocumentRichText,
} from "@/lib/services/document-template-builder";
import {
  defaultDesignerPanelPreference,
  designerPanelPreferenceKey,
  enterDesignerFocusCanvas,
  exitDesignerFocusCanvas,
  parseDesignerPanelPreference,
  serializeDesignerPanelPreference,
  toggleDesignerPanel,
} from "@/lib/services/document-designer-ui";

type TemplateEditorAction = (formData: FormData) => void | Promise<void>;

type Props = {
  action: TemplateEditorAction;
  definitionId: string;
  versionId: string;
  title: string;
  code: string;
  status: string;
  editable: boolean;
  template: DocumentTemplateDefinition;
  updatedAt: string;
  templateWorkspaceHref: string;
  documentManagementHref: string;
  previewHref: string;
  tenantLogoSrc?: string | null;
  customPlaceholders: CustomPlaceholder[];
  officerPositions: string[];
  activeOfficerCount: number;
};

type CustomPlaceholder = { key: string; group: string; label: string; description: string; dataType: string; sample: string; sensitivity: string | null };

type VisualBlock = DocumentTemplateBlock & { position: NonNullable<DocumentTemplateBlock["position"]> };
type LeftTab = "Elements" | "Dynamic Fields" | "Layers" | "Pages";
type DragState = {
  mode: "move" | "resize";
  id: string;
  corner?: "nw" | "ne" | "sw" | "se";
  startX: number;
  startY: number;
  origin: NonNullable<VisualBlock["position"]>;
  before: DocumentTemplateDefinition;
  moved: boolean;
  lockAspectRatio: boolean;
};

const elementOptions: { type: DocumentTemplateBlockType; label: string; icon: React.ReactNode; content?: string; binding?: string; section?: DocumentTemplateSectionName }[] = [
  { type: "text", label: "Text", icon: <Type /> },
  { type: "heading", label: "Heading", icon: <Type /> },
  { type: "paragraph", label: "Paragraph", icon: <FileText /> },
  { type: "image", label: "Image", icon: <ImageIcon /> },
  { type: "logo", label: "Tenant Logo", icon: <ImageIcon />, binding: "tenant.logo", section: "header" },
  { type: "horizontalLine", label: "Horizontal Line", icon: <Minus /> },
  { type: "verticalLine", label: "Vertical Line", icon: <Minus /> },
  { type: "rectangle", label: "Rectangle", icon: <Square /> },
  { type: "textBox", label: "Text Box", icon: <Type /> },
  { type: "officerList", label: "HOA Officer List", icon: <List /> },
  { type: "table", label: "Table", icon: <FileText /> },
  { type: "signature", label: "Signature Block", icon: <Signature />, content: "{{signatory.name}}\n{{signatory.position}}", binding: "signatory.name" },
  { type: "officerName", label: "Officer Name", icon: <FileText />, binding: "signatory.name" },
  { type: "officerTitle", label: "Officer Title", icon: <FileText />, binding: "signatory.position" },
  { type: "qrVerification", label: "QR Code", icon: <QrCode />, binding: "verification.url", section: "footer" },
  { type: "verificationText", label: "Verification Text", icon: <FileText />, binding: "verification.code" },
  { type: "documentNumber", label: "Document Number", icon: <FileText />, binding: "document.number" },
  { type: "issueDate", label: "Issue Date", icon: <FileText />, binding: "document.issueDate" },
  { type: "pageNumber", label: "Page Number", icon: <FileText />, content: "Page 1" },
  { type: "text", label: "Header", icon: <PanelLeft />, section: "header" },
  { type: "text", label: "Footer", icon: <PanelLeft />, section: "footer" },
];

export function ProfessionalDocumentTemplateEditor(props: Props) {
  const [definition, setDefinition] = useState<DocumentTemplateDefinition>(() => materializeVisualLayout(props.template, props.title));
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [materializeVisualLayout(props.template, props.title).blocks[0]?.id].filter(Boolean) as string[]);
  const [leftTab, setLeftTab] = useState<LeftTab>("Elements");
  const [fieldSearch, setFieldSearch] = useState("");
  const [zoom, setZoom] = useState(82);
  const [editingId, setEditingId] = useState("");
  const [history, setHistory] = useState<DocumentTemplateDefinition[]>([]);
  const [future, setFuture] = useState<DocumentTemplateDefinition[]>([]);
  const [isPending, startTransition] = useTransition();
  const [imageBlockId, setImageBlockId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const textSelectionRef = useRef<{ blockId: string; start: number; end: number } | null>(null);
  const copiedRef = useRef<VisualBlock[]>([]);
  const focusRestoreRef = useRef<{ leftOpen: boolean; rightOpen: boolean } | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(defaultDesignerPanelPreference.leftOpen);
  const [rightPanelOpen, setRightPanelOpen] = useState(defaultDesignerPanelPreference.rightOpen);
  const [focusCanvas, setFocusCanvas] = useState(false);
  const [pageSelected, setPageSelected] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [panelPreferenceLoaded, setPanelPreferenceLoaded] = useState(false);
  const initialSerialized = useRef(JSON.stringify(materializeVisualLayout(props.template, props.title)));
  const validation = useMemo(() => validateTemplateDefinition(definition, { officerPositions: props.officerPositions, activeOfficerCount: props.activeOfficerCount }), [definition, props.activeOfficerCount, props.officerPositions]);
  const selected = selectedIds.map((id) => findBlock(definition, id)).filter(Boolean) as VisualBlock[];
  const page = documentPageSizes[definition.page.format];
  const paperWidth = definition.page.widthMm;
  const paperHeight = definition.page.heightMm;
  const scale = (zoom / 100) * 3.78;
  const dirty = JSON.stringify(definition) !== initialSerialized.current;
  const knownPlaceholderKeys = useMemo(() => new Set<string>([...allowedDocumentPlaceholders, ...props.customPlaceholders.map((item) => item.key)]), [props.customPlaceholders]);

  useEffect(() => {
    const preference = parseDesignerPanelPreference(window.localStorage.getItem(designerPanelPreferenceKey));
    if (preference) {
      setLeftPanelOpen(preference.leftOpen);
      setRightPanelOpen(preference.rightOpen);
    }
    setPanelPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!panelPreferenceLoaded) return;
    window.localStorage.setItem(designerPanelPreferenceKey, serializeDesignerPanelPreference({ leftOpen: leftPanelOpen, rightOpen: rightPanelOpen }));
  }, [leftPanelOpen, panelPreferenceLoaded, rightPanelOpen]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editingField = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "Escape" && !editingField) { event.preventDefault(); selectPage(); return; }
      if (editingField) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        const shortcut = event.key.toLowerCase();
        if (shortcut === "l") { event.preventDefault(); toggleLeftPanel(); return; }
        if (shortcut === "r") { event.preventDefault(); toggleRightPanel(); return; }
        if (shortcut === "f") { event.preventDefault(); toggleFocusCanvas(); return; }
      }
      if (editingId || !props.editable || selected.length === 0) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); copiedRef.current = selected.map(clone); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); paste(); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelected(); return; }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const delta = event.shiftKey ? 5 : 1;
        const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
        const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
        updatePositions((position) => ({ ...position, x: clamp(position.x + dx, 0, paperWidth - position.width), y: clamp(position.y + dy, 0, paperHeight - position.height) }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function focusControl(id: string) {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function toggleLeftPanel() {
    const next = toggleDesignerPanel({ leftOpen: leftPanelOpen, rightOpen: rightPanelOpen, focusCanvas }, "left");
    setFocusCanvas(next.focusCanvas);
    focusRestoreRef.current = null;
    setLeftPanelOpen(next.leftOpen);
    focusControl("designer-left-toggle");
  }

  function toggleRightPanel() {
    const next = toggleDesignerPanel({ leftOpen: leftPanelOpen, rightOpen: rightPanelOpen, focusCanvas }, "right");
    setFocusCanvas(next.focusCanvas);
    focusRestoreRef.current = null;
    setRightPanelOpen(next.rightOpen);
    focusControl("designer-right-toggle");
  }

  function toggleFocusCanvas() {
    if (focusCanvas) {
      const next = exitDesignerFocusCanvas({ leftOpen: leftPanelOpen, rightOpen: rightPanelOpen, focusCanvas }, focusRestoreRef.current);
      setFocusCanvas(next.focusCanvas);
      setLeftPanelOpen(next.leftOpen);
      setRightPanelOpen(next.rightOpen);
      focusRestoreRef.current = null;
    } else {
      const next = enterDesignerFocusCanvas({ leftOpen: leftPanelOpen, rightOpen: rightPanelOpen, focusCanvas });
      focusRestoreRef.current = next.restore;
      setFocusCanvas(next.state.focusCanvas);
      setLeftPanelOpen(next.state.leftOpen);
      setRightPanelOpen(next.state.rightOpen);
    }
    focusControl("designer-focus-toggle");
  }

  function commit(next: DocumentTemplateDefinition) {
    setHistory((items) => [...items.slice(-49), definition]);
    setFuture([]);
    setDefinition(next);
  }

  function updateDefinition(updater: (draft: DocumentTemplateDefinition) => DocumentTemplateDefinition) {
    commit(normalizeTemplateDefinition(updater(structuredClone(definition)), props.title));
  }

  function updateLive(updater: (draft: DocumentTemplateDefinition) => DocumentTemplateDefinition) {
    setDefinition((current) => normalizeTemplateDefinition(updater(structuredClone(current)), props.title));
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, definition]);
    setDefinition(previous);
  }

  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, definition]);
    setDefinition(next);
  }

  function select(id: string, additive = false) {
    setPageSelected(false);
    setSelectedIds((current) => additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id]);
  }

  function selectPage() {
    setSelectedIds([]);
    setPageSelected(true);
  }

  function updatePage(patch: Partial<DocumentTemplateDefinition["page"]>) {
    updateDefinition((draft) => ({ ...draft, page: { ...draft.page, ...patch } }));
  }

  function isLockedPageRegion(position: NonNullable<VisualBlock["position"]>) {
    const headerEnd = definition.page.margins.top + definition.page.headerHeightMm;
    const footerStart = paperHeight - definition.page.margins.bottom - definition.page.footerHeightMm;
    return (definition.page.headerLocked && position.y < headerEnd) || (definition.page.footerLocked && position.y + position.height > footerStart);
  }

  function updateBlock(id: string, patch: Partial<DocumentTemplateBlock>) {
    updateDefinition((draft) => mapBlocks(draft, (block) => block.id === id ? { ...block, ...patch } : block));
  }

  function updateSelectedPatch(patch: Partial<DocumentTemplateBlock>) {
    if (!selectedIds.length) return;
    updateDefinition((draft) => mapBlocks(draft, (block) => selectedIds.includes(block.id) ? { ...block, ...patch } : block));
  }

  function applyTextColor(color: string) {
    const normalized = /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : "";
    if (!normalized || !selected.length) return;
    const block = selected[0];
    const selection = textSelectionRef.current?.blockId === block.id ? textSelectionRef.current : null;
    if (selection && selection.end > selection.start) {
      const richText = applyColorToRichText(block.richText || plainTextToRichText(block.content || block.text || ""), selection.start, selection.end, normalized);
      updateBlock(block.id, { richText, content: richTextToContent(richText) });
      return;
    }
    updateBlock(block.id, { style: { ...block.style, textColor: normalized } });
  }

  function updatePositions(updater: (position: VisualBlock["position"]) => VisualBlock["position"]) {
    updateLive((draft) => mapBlocks(draft, (block) => selectedIds.includes(block.id) && block.position ? { ...block, position: updater(block.position) } : block));
  }

  function addElement(option: typeof elementOptions[number], position?: { x: number; y: number }) {
    const section = option.section || "body";
    const count = definition.sections[section].length;
    const block: VisualBlock = {
      id: `block-${uniqueId()}`,
      type: option.type,
      section,
      label: option.label,
      content: option.content || defaultContent(option.type),
      binding: option.binding,
      order: (count + 1) * 10,
      visible: true,
      locked: false,
      position: { x: position?.x ?? (option.type === "officerList" ? 8 : clamp(25 + (count % 3) * 8, 0, paperWidth - 60)), y: position?.y ?? (option.type === "officerList" ? 65 : clamp(88 + count * 12, 0, paperHeight - 22)), width: option.type === "logo" ? 60 : option.type === "qrVerification" ? 32 : option.type === "officerList" ? 38 : option.type === "verticalLine" ? 2 : option.type === "horizontalLine" ? 160 : 150, height: option.type === "logo" ? 28 : option.type === "qrVerification" ? 32 : option.type === "officerList" ? 110 : option.type === "verticalLine" ? 160 : option.type === "horizontalLine" ? 2 : option.type === "rectangle" ? 28 : 12, zIndex: 40 + count },
      style: { fontFamily: "Arial", fontSize: option.type === "heading" ? 16 : 11, align: option.type === "heading" ? "center" : "left", fontWeight: option.type === "heading" ? "bold" : "normal", borderColor: option.type === "rectangle" ? "#94a3b8" : undefined, borderWidth: option.type === "rectangle" ? 1 : undefined, lineColor: ["horizontalLine", "verticalLine"].includes(option.type) ? "#64748b" : undefined, lineWidth: ["horizontalLine", "verticalLine"].includes(option.type) ? 1 : undefined, lineStyle: ["horizontalLine", "verticalLine"].includes(option.type) ? "solid" : undefined },
      image: option.type === "logo" ? { src: "{{tenant.logo}}", alt: "Tenant logo", fit: "contain", positionX: "center", positionY: "center", opacity: 1, lockAspectRatio: true } : undefined,
      qr: option.type === "qrVerification" ? { label: "PREVIEW QR — NOT VALID FOR VERIFICATION", instruction: "Scan to verify", showLabel: true, showInstruction: true, squareLocked: true, quietZone: 1 } : undefined,
      table: option.type === "table" ? { rows: [["Label", "Value"], ["", ""]] } : undefined,
      officerList: option.type === "officerList" ? { ...defaultOfficerListConfig } : undefined,
    };
    updateDefinition((draft) => ({ ...draft, sections: { ...draft.sections, [section]: [...draft.sections[section], block] } }));
    setSelectedIds([block.id]);
  }

  function insertField(key: string, dropPosition?: { x: number; y: number }) {
    const current = selected[0];
    if (current && isTextBlock(current)) {
      const value = current.content || "";
      updateBlock(current.id, { content: `${value}${value && !value.endsWith(" ") ? " " : ""}{{${key}}}` });
      return;
    }
    const groupItem = placeholderGroups.flatMap((group) => group.items).find((item) => item.key === key);
    addElement({ type: "text", label: groupItem?.label || key, icon: <Type />, content: `{{${key}}}`, binding: key }, dropPosition);
  }

  function duplicateSelected() {
    if (!selected.length) return;
    const copies = selected.map((block, index) => ({ ...clone(block), id: `block-${uniqueId()}`, position: { ...block.position, x: clamp(block.position.x + 8 + index * 3, 0, paperWidth - block.position.width), y: clamp(block.position.y + 8 + index * 3, 0, paperHeight - block.position.height), zIndex: block.position.zIndex + 1 } }));
    updateDefinition((draft) => ({ ...draft, sections: { ...draft.sections, body: [...draft.sections.body, ...copies] } }));
    setSelectedIds(copies.map((block) => block.id));
  }

  function paste() {
    if (!copiedRef.current.length) return;
    const copies = copiedRef.current.map((block, index) => ({ ...clone(block), id: `block-${uniqueId()}`, position: { ...block.position, x: clamp(block.position.x + 10, 0, paperWidth - block.position.width), y: clamp(block.position.y + 10 + index * 3, 0, paperHeight - block.position.height), zIndex: block.position.zIndex + 2 } }));
    updateDefinition((draft) => ({ ...draft, sections: { ...draft.sections, body: [...draft.sections.body, ...copies] } }));
    setSelectedIds(copies.map((block) => block.id));
  }

  function removeSelected() {
    if (!selected.length || !window.confirm(`Delete ${selected.length === 1 ? "this element" : `${selected.length} elements`}?`)) return;
    updateDefinition((draft) => ({ ...draft, sections: { header: draft.sections.header.filter((block) => !selectedIds.includes(block.id)), body: draft.sections.body.filter((block) => !selectedIds.includes(block.id)), footer: draft.sections.footer.filter((block) => !selectedIds.includes(block.id)) } }));
    setSelectedIds([]);
  }

  function alignSelected(kind: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    if (!selected.length) return;
    updateDefinition((draft) => mapBlocks(draft, (block) => {
      if (!selectedIds.includes(block.id) || !block.position) return block;
      const position = { ...block.position };
      if (kind === "left") position.x = definition.page.margins.left;
      if (kind === "center") position.x = (paperWidth - position.width) / 2;
      if (kind === "right") position.x = paperWidth - definition.page.margins.right - position.width;
      if (kind === "top") position.y = definition.page.margins.top;
      if (kind === "middle") position.y = (paperHeight - position.height) / 2;
      if (kind === "bottom") position.y = paperHeight - definition.page.margins.bottom - position.height;
      return { ...block, position };
    }));
  }

  function layerMove(direction: -1 | 1) {
    updateDefinition((draft) => mapBlocks(draft, (block) => selectedIds.includes(block.id) && block.position ? { ...block, position: { ...block.position, zIndex: Math.max(0, block.position.zIndex + direction) } } : block));
  }

  function beginDrag(event: React.PointerEvent, block: VisualBlock, mode: DragState["mode"] = "move", corner?: DragState["corner"]) {
    if (!props.editable || block.locked || !block.position || isLockedPageRegion(block.position)) return;
    event.stopPropagation();
    if (!selectedIds.includes(block.id)) select(block.id, event.shiftKey || event.metaKey || event.ctrlKey);
    dragRef.current = { mode, id: block.id, corner, startX: event.clientX, startY: event.clientY, origin: { ...block.position }, before: definition, moved: false, lockAspectRatio: mode === "resize" && (block.type === "logo" || block.type === "image") && block.image?.lockAspectRatio !== false };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    const snap = (value: number) => definition.page.canvas.snapToGrid ? Math.round(value / definition.page.canvas.gridSize) * definition.page.canvas.gridSize : value;
    const next = { ...drag.origin };
    if (drag.mode === "move") { next.x = clamp(snap(drag.origin.x + dx), 0, paperWidth - next.width); next.y = clamp(snap(drag.origin.y + dy), 0, paperHeight - next.height); }
    else resizePosition(next, dx, dy, drag.corner || "se", paperWidth, paperHeight, snap, drag.lockAspectRatio);
    updateLive((draft) => mapBlocks(draft, (block) => block.id === drag.id ? { ...block, position: next } : block));
  }

  function endDrag() {
    const drag = dragRef.current;
    if (drag?.moved) { setHistory((items) => [...items.slice(-49), drag.before]); setFuture([]); }
    dragRef.current = null;
  }

  function dropField(event: React.DragEvent) {
    event.preventDefault();
    const key = event.dataTransfer.getData("text/hoahub-placeholder");
    if (!knownPlaceholderKeys.has(key)) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    insertField(key, { x: clamp((event.clientX - rect.left) / scale - 35, 0, paperWidth - 70), y: clamp((event.clientY - rect.top) / scale - 6, 0, paperHeight - 12) });
  }

  const filteredGroups = placeholderGroups.map((group) => ({ ...group, items: group.items.filter((item) => `${item.label} ${item.key} ${item.sample}`.toLowerCase().includes(fieldSearch.toLowerCase())) })).filter((group) => group.items.length);

  return <form action={props.action} className="space-y-0" onSubmit={() => startTransition(() => undefined)}>
    <input type="hidden" name="definitionId" value={props.definitionId} />
    <input type="hidden" name="versionId" value={props.versionId} />
    <input type="hidden" name="loadedUpdatedAt" value={props.updatedAt} />
    <input type="hidden" name="templateDefinitionJson" value={JSON.stringify(definition)} />
    <input type="hidden" name="imageUploadBlockId" value={imageBlockId} />
    <input ref={fileInputRef} className="sr-only" type="file" name="imageFile" accept="image/png,image/jpeg,image/webp" aria-label="Upload template image" />

    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <a className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={props.documentManagementHref}><ArrowLeft className="size-4" /> Document Management</a>
        <div className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
        <div className="min-w-40 flex-1"><p className="truncate text-sm font-black text-slate-950">{props.title}</p><p className="text-[11px] font-bold text-slate-500">{props.code} · {props.status.replaceAll("_", " ")} · {dirty ? "Unsaved changes" : "Saved"}</p></div>
        <ToolbarButton label="Undo" onClick={undo} disabled={!history.length}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Redo" onClick={redo} disabled={!future.length}><Redo2 /></ToolbarButton>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-1"><ToolbarButton label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))}><Minus /></ToolbarButton><span className="w-10 text-center text-xs font-black">{zoom}%</span><ToolbarButton label="Zoom in" onClick={() => setZoom((value) => Math.min(130, value + 10))}><Plus /></ToolbarButton></div>
        <ToolbarButton id="designer-left-toggle" label={leftPanelOpen ? "Hide Elements Panel" : "Show Elements Panel"} expanded={leftPanelOpen} controls="designer-left-panel" onClick={toggleLeftPanel}>{leftPanelOpen ? <PanelLeft /> : <PanelLeftOpen />}</ToolbarButton>
        <ToolbarButton id="designer-focus-toggle" label={focusCanvas ? "Exit Focus Canvas" : "Focus Canvas"} ariaPressed={focusCanvas} onClick={toggleFocusCanvas}>{focusCanvas ? <Minimize2 /> : <Maximize2 />}</ToolbarButton>
        <ToolbarButton id="designer-right-toggle" label={rightPanelOpen ? "Hide Properties Panel" : "Show Properties Panel"} expanded={rightPanelOpen} controls="designer-right-panel" onClick={toggleRightPanel}><PanelRightOpen /></ToolbarButton>
        <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" type="submit" formAction={props.previewHref} formMethod="post" formTarget="_blank" formNoValidate><Printer className="size-4" /> Preview</button>
        {props.editable ? <><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" name="operation" value="saveDraft" disabled={isPending}><Save className="size-4" /> Save Draft</button><button className="btn-primary min-h-9 px-3 py-1.5 text-xs" name="operation" value="publish" disabled={isPending || !validation.valid} onClick={(event) => { if (!window.confirm("Validate and publish this new immutable template version?")) event.preventDefault(); }}><Save className="size-4" /> Publish</button></> : <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Published version is immutable</span>}
        <a className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={props.templateWorkspaceHref}>Version History</a>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2">
        <button type="button" className="btn-secondary min-h-8 px-3 py-1 text-xs" onClick={() => alignSelected("left")} disabled={!selected.length}><AlignLeft className="size-3.5" /> Align</button>
        <ToolbarButton label="Center horizontally" onClick={() => alignSelected("center")} disabled={!selected.length}><AlignCenter /></ToolbarButton><ToolbarButton label="Right align" onClick={() => alignSelected("right")} disabled={!selected.length}><AlignRight /></ToolbarButton>
        <ToolbarButton label="Bring forward" onClick={() => layerMove(1)} disabled={!selected.length}><MoveUp /></ToolbarButton><ToolbarButton label="Send backward" onClick={() => layerMove(-1)} disabled={!selected.length}><MoveDown /></ToolbarButton>
        <ToolbarButton label="Duplicate" onClick={duplicateSelected} disabled={!selected.length}><Copy /></ToolbarButton><ToolbarButton label="Delete" onClick={removeSelected} disabled={!selected.length}><Trash2 /></ToolbarButton>
        <span className="ml-auto text-[11px] font-bold text-slate-500">{selected.length ? `${selected.length} selected` : "Select an element"}</span>
      </div>
    </header>

    <div className={`relative grid min-h-[calc(100vh-132px)] bg-slate-100 ${leftPanelOpen && rightPanelOpen ? "xl:grid-cols-[236px_minmax(0,1fr)_304px]" : leftPanelOpen ? "xl:grid-cols-[236px_minmax(0,1fr)]" : rightPanelOpen ? "xl:grid-cols-[minmax(0,1fr)_304px]" : "xl:grid-cols-[minmax(0,1fr)]"} print:block`}>
      {(!leftPanelOpen || !rightPanelOpen) && <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-between print:hidden"><div>{!leftPanelOpen && <button id="designer-left-edge-toggle" type="button" className="pointer-events-auto inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 outline-none shadow-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-pine-600" title="Show Elements Panel" aria-label="Show Elements Panel" aria-expanded={false} aria-controls="designer-left-panel" onClick={toggleLeftPanel}><PanelLeftOpen className="size-4" /></button>}</div><div>{!rightPanelOpen && <button id="designer-right-edge-toggle" type="button" className="pointer-events-auto inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 outline-none shadow-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-pine-600" title="Show Properties Panel" aria-label="Show Properties Panel" aria-expanded={false} aria-controls="designer-right-panel" onClick={toggleRightPanel}><PanelRightOpen className="size-4" /></button>}</div></div>}
      {leftPanelOpen && <aside id="designer-left-panel" aria-label="Elements and document tools" aria-hidden={false} className="border-r border-slate-200 bg-white p-3 print:hidden max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-20 max-xl:w-[min(86vw,236px)] max-xl:shadow-2xl">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Designer tools">{(["Elements", "Dynamic Fields", "Layers", "Pages"] as LeftTab[]).map((tab) => <button key={tab} type="button" role="tab" aria-selected={leftTab === tab} className={`rounded-md px-1 py-2 text-[10px] font-black ${leftTab === tab ? "bg-white text-pine-800 shadow-sm" : "text-slate-500"}`} onClick={() => setLeftTab(tab)}>{tab === "Dynamic Fields" ? "Fields" : tab}</button>)}</div>
        {leftTab === "Elements" && <div className="mt-4 grid grid-cols-2 gap-2">{elementOptions.map((option) => <button key={`${option.type}-${option.label}`} type="button" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-center text-[10px] font-bold text-slate-700 hover:border-pine-400 hover:bg-pine-50" onClick={() => addElement(option)} disabled={!props.editable}>{option.icon}<span>{option.label}</span></button>)}</div>}
        {leftTab === "Dynamic Fields" && <div className="mt-4 space-y-3"><label className="relative block"><span className="sr-only">Search dynamic fields</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input className="field pl-9 text-xs" value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} placeholder="Search fields" /></label>{filteredGroups.map((group) => <details key={group.group} open><summary className="cursor-pointer text-xs font-black text-pine-800">{group.group}</summary><div className="mt-2 space-y-1">{group.items.map((item) => <button key={item.key} type="button" draggable={props.editable} onDragStart={(event) => { event.dataTransfer.setData("text/hoahub-placeholder", item.key); }} onClick={() => insertField(item.key)} className="w-full rounded-md border border-slate-100 p-2 text-left hover:bg-slate-50"><span className="block text-[11px] font-bold">{item.label}</span><span className="block text-[9px] font-mono text-slate-400">[{item.label}]</span><span className="block truncate text-[9px] text-slate-500">{item.sample}</span></button>)}</div></details>)}{props.customPlaceholders.length > 0 && <details open><summary className="cursor-pointer text-xs font-black text-pine-800">Custom Tenant Fields</summary><div className="mt-2 space-y-1">{props.customPlaceholders.filter((item) => `${item.label} ${item.key} ${item.sample}`.toLowerCase().includes(fieldSearch.toLowerCase())).map((item) => <button key={item.key} type="button" draggable={props.editable} onDragStart={(event) => event.dataTransfer.setData("text/hoahub-placeholder", item.key)} onClick={() => insertField(item.key)} className="w-full rounded-md border border-slate-100 p-2 text-left hover:bg-slate-50"><span className="block text-[11px] font-bold">{item.label}</span><span className="block text-[9px] font-mono text-slate-400">[{item.label}]</span><span className="block truncate text-[9px] text-slate-500">{item.sample} · {item.dataType}</span></button>)}</div></details>}</div>}
        {leftTab === "Layers" && <div className="mt-4 space-y-1">{[...definition.blocks].sort((a, b) => (b.position?.zIndex || 0) - (a.position?.zIndex || 0)).map((block) => <button key={block.id} type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${selectedIds.includes(block.id) ? "bg-pine-800 text-white" : "hover:bg-slate-100"}`} onClick={() => select(block.id, false)}><span className="truncate flex-1">{block.label || block.type}</span>{block.locked ? <Lock className="size-3" /> : null}{block.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}</button>)}</div>}
        {leftTab === "Pages" && <PagePanel definition={definition} editable={props.editable} updatePage={updatePage} />}
        <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Document outline</p>{(["header", "body", "footer"] as const).map((section) => <div key={section} className="mt-3"><p className="text-[10px] font-black uppercase text-pine-700">{section}</p>{definition.sections[section].map((block) => <button key={block.id} type="button" className="mt-1 block w-full truncate rounded px-2 py-1 text-left text-[11px] font-semibold hover:bg-slate-100" onClick={() => select(block.id)}>{block.label || block.type}</button>)}</div>)}</div>
      </aside>}

      <main className="relative min-w-0 overflow-auto p-4 sm:p-7 print:p-0">
          <div className="mx-auto max-w-[1100px]">
          <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-900 sm:hidden">Precise page editing is best on desktop. Preview remains available at every size.</div>
          <div className="mb-3 flex items-center justify-between print:hidden"><div className="flex items-center gap-2 text-xs font-bold text-slate-600"><FileText className="size-4" /> {page.label} · {definition.page.orientation}</div><div className="text-[11px] font-bold text-slate-500">Drag to move · Double-click text to edit</div></div>
          <div className="overflow-auto rounded-xl border border-slate-300 bg-slate-200 p-8 shadow-inner print:overflow-visible print:border-0 print:bg-white print:p-0 print:shadow-none">
            <div className="relative mx-auto" style={{ width: paperWidth * scale, minHeight: paperHeight * scale }}>
              {definition.page.canvas.showRulers && <><div className="absolute -left-8 top-0 flex h-5 items-end text-[9px] font-mono text-slate-500 print:hidden" aria-hidden="true">0&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;50&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;100&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;150&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;200</div><div className="absolute -left-8 top-5 flex w-6 flex-col justify-between text-right text-[9px] font-mono text-slate-500 print:hidden" style={{ height: paperHeight * scale }} aria-hidden="true"><span>0</span><span>{Math.round(paperHeight / 2)}</span><span>{Math.round(paperHeight)}</span></div></>}
              <div
                ref={canvasRef}
                role="button"
                tabIndex={0}
                aria-label="Document page"
                aria-pressed={pageSelected}
                className={`relative overflow-hidden bg-white shadow-xl ring-1 ring-slate-300 outline-none print:shadow-none print:ring-0 ${pageSelected ? "ring-2 ring-pine-600 ring-offset-2" : ""} ${definition.page.canvas.showGrid ? "canvas-grid" : ""}`}
                style={{ width: paperWidth * scale, height: paperHeight * scale, border: definition.page.border.enabled ? `${definition.page.border.width * scale / 3.78}px ${definition.page.border.style} ${definition.page.border.color}` : undefined, backgroundColor: definition.page.backgroundOpacity >= 1 ? definition.page.backgroundColor : "#ffffff", backgroundSize: `${definition.page.canvas.gridSize * scale}px ${definition.page.canvas.gridSize * scale}px` }}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDragOver={(event) => event.preventDefault()}
                onDrop={dropField}
                onClick={selectPage}
                onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPage(); } }}
              >
                {definition.page.backgroundOpacity < 1 && <div className="pointer-events-none absolute inset-0 z-0" style={{ backgroundColor: definition.page.backgroundColor, opacity: definition.page.backgroundOpacity }} />}
                {definition.page.backgroundImage && <img className="pointer-events-none absolute inset-0 z-0 h-full w-full" src={definition.page.backgroundImage.src} alt="" draggable={false} onError={() => setAssetError("Page background image could not be loaded. Re-upload the approved page image.")} style={{ objectFit: definition.page.backgroundImage.fit === "fill" ? "fill" : definition.page.backgroundImage.fit, objectPosition: definition.page.backgroundImage.position, opacity: definition.page.backgroundImage.opacity }} />}
                {definition.page.watermark.enabled && definition.page.watermark.image && <img className={`pointer-events-none absolute left-1/2 z-0 max-h-[35%] max-w-[70%] -translate-x-1/2 ${definition.page.watermark.position === "top" ? "top-[10%]" : definition.page.watermark.position === "bottom" ? "bottom-[10%]" : "top-1/2 -translate-y-1/2"}`} src={definition.page.watermark.image.src} alt="" draggable={false} onError={() => setAssetError("Watermark image could not be loaded. Re-upload the approved watermark image.")} style={{ objectFit: definition.page.watermark.image.fit === "fill" ? "fill" : definition.page.watermark.image.fit, objectPosition: definition.page.watermark.image.position, opacity: definition.page.watermark.image.opacity, transform: `translateX(-50%) ${definition.page.watermark.position === "center" ? "translateY(-50%) " : ""}rotate(${definition.page.watermark.rotation}deg)` }} />}
                {definition.page.watermark.enabled && definition.page.watermark.text && <div className={`pointer-events-none absolute inset-x-0 z-0 text-center font-bold text-slate-500 ${definition.page.watermark.position === "top" ? "top-[10%]" : definition.page.watermark.position === "bottom" ? "bottom-[10%]" : "top-1/2 -translate-y-1/2"}`} style={{ opacity: definition.page.watermark.opacity, fontSize: `${definition.page.watermark.fontSize * scale / 3.78}pt`, transform: `${definition.page.watermark.position === "center" ? "translateY(-50%) " : ""}rotate(${definition.page.watermark.rotation}deg)` }}>{definition.page.watermark.text}</div>}
                {definition.page.safeArea.showNonPrintableArea && <><div className="pointer-events-none absolute inset-x-0 top-0 z-[1] bg-amber-100/50" style={{ height: definition.page.margins.top * scale }} /><div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-amber-100/50" style={{ height: definition.page.margins.bottom * scale }} /><div className="pointer-events-none absolute inset-y-0 left-0 z-[1] bg-amber-100/50" style={{ width: definition.page.margins.left * scale }} /><div className="pointer-events-none absolute inset-y-0 right-0 z-[1] bg-amber-100/50" style={{ width: definition.page.margins.right * scale }} /></>}
                {definition.page.safeArea.showBoundary && definition.page.canvas.showMarginGuides && <div className="pointer-events-none absolute z-[2] border border-dashed border-pine-300" style={{ left: definition.page.margins.left * scale, top: definition.page.margins.top * scale, right: definition.page.margins.right * scale, bottom: definition.page.margins.bottom * scale }} />}
                {definition.page.canvas.showCenterGuides && <><div className="pointer-events-none absolute bottom-0 top-0 z-[2] border-l border-dotted border-sky-300" style={{ left: paperWidth * scale / 2 }} /><div className="pointer-events-none absolute left-0 right-0 z-[2] border-t border-dotted border-sky-300" style={{ top: paperHeight * scale / 2 }} /></>}
                {definition.page.guides.vertical.map((guide, index) => <div key={`v-guide-${index}`} className="pointer-events-none absolute bottom-0 top-0 z-[2] border-l border-dashed border-fuchsia-300" style={{ left: guide.positionMm * scale }} />)}
                {definition.page.guides.horizontal.map((guide, index) => <div key={`h-guide-${index}`} className="pointer-events-none absolute left-0 right-0 z-[2] border-t border-dashed border-fuchsia-300" style={{ top: guide.positionMm * scale }} />)}
                {definition.page.canvas.showMarginGuides && definition.page.showHeaderBoundary && <div className="pointer-events-none absolute left-0 right-0 z-[2] border-t border-amber-400" style={{ top: (definition.page.margins.top + definition.page.headerHeightMm) * scale }} />}
                {definition.page.canvas.showMarginGuides && definition.page.showFooterBoundary && <div className="pointer-events-none absolute left-0 right-0 z-[2] border-t border-amber-400" style={{ top: (paperHeight - definition.page.margins.bottom - definition.page.footerHeightMm) * scale }} />}
                {definition.blocks.filter((block) => block.visible && block.position).sort((a, b) => (a.position?.zIndex || 0) - (b.position?.zIndex || 0)).map((block) => <CanvasBlock key={block.id} block={block as VisualBlock} selected={selectedIds.includes(block.id)} editing={editingId === block.id} editable={props.editable} scale={scale} tenantLogoSrc={props.tenantLogoSrc} onImageError={setAssetError} onTextSelection={(selection) => { textSelectionRef.current = selection; }} onSelect={(event) => select(block.id, event.shiftKey || event.metaKey || event.ctrlKey)} onDoubleClick={() => isTextBlock(block) && setEditingId(block.id)} onChangeText={(content, richText) => updateLive((draft) => mapBlocks(draft, (item) => item.id === block.id ? { ...item, content, richText } : item))} onCommitText={(content, richText) => { setEditingId(""); updateBlock(block.id, { content, richText }); }} onEscape={selectPage} onPointerDown={beginDrag} onResizeStart={beginDrag} onImageUpload={() => { setImageBlockId(block.id); fileInputRef.current?.click(); }} />)}
                {!definition.blocks.length && <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-400">Add an element to start designing.</div>}
              </div>
            </div>
          </div>
          {assetError && <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900 print:hidden"><span>{assetError}</span><button type="button" className="shrink-0 underline" onClick={() => setAssetError("")}>Dismiss</button></div>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-slate-500 print:hidden"><span>Printable area</span><span className="h-3 w-5 border border-dashed border-pine-300" /><span>Grid {definition.page.canvas.gridSize}mm</span><button type="button" className="btn-secondary min-h-7 px-2 py-1 text-[10px]" onClick={() => updateDefinition((draft) => ({ ...draft, page: { ...draft.page, canvas: { ...draft.page.canvas, showGrid: !draft.page.canvas.showGrid } } }))}><Grid2X2 className="size-3" /> {definition.page.canvas.showGrid ? "Hide grid" : "Show grid"}</button></div>
        </div>
      </main>

      {rightPanelOpen && <aside id="designer-right-panel" aria-label="Properties and validation" aria-hidden={false} className="border-l border-slate-200 bg-white p-4 print:hidden max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:w-[min(90vw,304px)] max-xl:shadow-2xl"><PropertiesPanel selected={selected} pageSelected={pageSelected} definition={definition} editable={props.editable} updatePage={updatePage} updateBlock={updateBlock} updateSelectedPatch={updateSelectedPatch} updatePositions={updatePositions} applyTextColor={applyTextColor} duplicate={duplicateSelected} remove={removeSelected} align={alignSelected} layerMove={layerMove} onImageUpload={() => { setImageBlockId(selected[0]?.id || ""); fileInputRef.current?.click(); }} onPageImageUpload={(target) => { setImageBlockId(target); fileInputRef.current?.click(); }} />
        <ValidationPanel errors={validation.errors} warnings={validation.warnings} blocks={definition.blocks} onSelect={select} onSelectPage={selectPage} />
      </aside>}
    </div>
  </form>;
}

function CanvasBlock({ block, selected, editing, editable, scale, tenantLogoSrc, onImageError, onTextSelection, onSelect, onDoubleClick, onChangeText, onCommitText, onEscape, onPointerDown, onResizeStart, onImageUpload }: { block: VisualBlock; selected: boolean; editing: boolean; editable: boolean; scale: number; tenantLogoSrc?: string | null; onImageError: (message: string) => void; onTextSelection: (selection: { blockId: string; start: number; end: number }) => void; onSelect: (event: React.MouseEvent) => void; onDoubleClick: () => void; onChangeText: (content: string, richText?: DocumentRichText) => void; onCommitText: (content: string, richText?: DocumentRichText) => void; onEscape: () => void; onPointerDown: (event: React.PointerEvent, block: VisualBlock) => void; onResizeStart: (event: React.PointerEvent, block: VisualBlock, mode: "resize", corner: "nw" | "ne" | "sw" | "se") => void; onImageUpload: () => void }) {
  const style = block.style || {};
  const css: React.CSSProperties = {
    left: block.position.x * scale,
    top: block.position.y * scale,
    width: block.position.width * scale,
    height: block.position.height * scale,
    zIndex: block.position.zIndex,
    fontFamily: style.fontFamily || "Arial",
    fontSize: `${(style.fontSize || 11) * scale / 3.78}pt`,
    fontWeight: style.fontWeight || "normal",
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
    color: style.textColor || "#111827",
    backgroundColor: style.backgroundColor || (block.type === "rectangle" ? "transparent" : undefined),
    textAlign: style.align || "left",
    lineHeight: style.lineHeight || 1.35,
    padding: (style.padding || 2) * scale / 3.78,
    border: style.borderColor && style.borderWidth ? `${style.borderWidth * scale / 3.78}px solid ${style.borderColor}` : selected ? undefined : "1px solid transparent",
    borderRadius: style.radius,
  };
  const content = editing && isTextBlock(block) ? <RichTextCanvas block={block} onSelection={onTextSelection} onChange={onChangeText} onCommit={onCommitText} onEscape={onEscape} /> : <BlockContent block={block} scale={scale} tenantLogoSrc={tenantLogoSrc} onImageError={onImageError} onImageUpload={onImageUpload} />;
  return <div role="button" tabIndex={0} aria-label={block.accessibility?.ariaLabel || block.label || block.type} className={`absolute select-none overflow-hidden ${selected ? "ring-2 ring-pine-600 ring-offset-1" : "hover:ring-1 hover:ring-pine-300"} ${block.locked ? "cursor-not-allowed opacity-75" : "cursor-move"}`} style={{ ...css, border: isLineBlock(block) ? "0" : css.border }} onClick={(event) => { event.stopPropagation(); onSelect(event); }} onDoubleClick={onDoubleClick} onPointerDown={(event) => { const tag = (event.target as HTMLElement).tagName; if (!editing && tag !== "TEXTAREA" && tag !== "INPUT") onPointerDown(event, block); }}>{content}{selected && editable && !block.locked && <>{(["nw", "ne", "sw", "se"] as const).map((corner) => <button key={corner} type="button" aria-label={`Resize ${corner}`} className={`absolute z-10 size-2.5 border border-white bg-pine-700 ${corner.includes("n") ? "top-[-5px]" : "bottom-[-5px]"} ${corner.includes("w") ? "left-[-5px]" : "right-[-5px]"}`} onPointerDown={(event) => { event.stopPropagation(); onResizeStart(event, block, "resize", corner); }} />)}</>}</div>;
}

function RichTextCanvas({ block, onSelection, onChange, onCommit, onEscape }: { block: VisualBlock; onSelection: (selection: { blockId: string; start: number; end: number }) => void; onChange: (content: string, richText: DocumentRichText) => void; onCommit: (content: string, richText: DocumentRichText) => void; onEscape: () => void }) {
  const value = block.richText || plainTextToRichText(block.content || block.text || "");
  const rememberSelection = (event: React.SyntheticEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !event.currentTarget.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    const start = textOffset(event.currentTarget, range.startContainer, range.startOffset);
    const end = textOffset(event.currentTarget, range.endContainer, range.endOffset);
    onSelection({ blockId: block.id, start: Math.min(start, end), end: Math.max(start, end) });
  };
  return <div contentEditable suppressContentEditableWarning className="h-full w-full overflow-hidden whitespace-pre-wrap break-words outline-none" onFocus={(event) => { if (!richTextToContent(value)) event.currentTarget.replaceChildren(); }} onInput={(event) => { const richText = parseRichTextDom(event.currentTarget); onChange(richTextToContent(richText), richText); }} onMouseUp={rememberSelection} onKeyUp={rememberSelection} onBlur={(event) => { const richText = parseRichTextDom(event.currentTarget); onCommit(richTextToContent(richText), richText); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onEscape(); } }}>{renderEditorRichText(value)}</div>;
}

function BlockContent({ block, scale, tenantLogoSrc, onImageError, onImageUpload }: { block: VisualBlock; scale: number; tenantLogoSrc?: string | null; onImageError: (message: string) => void; onImageUpload: () => void }) {
  const imageSrc = block.image?.src === "{{tenant.logo}}" || (!block.image?.src && block.binding === "tenant.logo") ? tenantLogoSrc || "" : block.image?.src && !block.image.src.startsWith("{{") ? block.image.src : "";
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageSrc]);
  if (block.type === "rectangle") return null;
  if (block.type === "officerList") {
    const config = block.officerList || defaultOfficerListConfig;
    const pt = (value: number) => `${value * scale / 3.78}pt`;
    const spacing = `${config.officerSpacing * scale}px`;
    return <div className="h-full border-r border-pine-700 pr-1" style={{ color: config.positionColor, lineHeight: config.lineHeight }}><div className="bg-pine-800 px-1 py-1 text-center" style={{ color: config.headingColor, fontSize: pt(config.headingFontSize), lineHeight: config.lineHeight, fontWeight: "bold" }}>{config.showHeading === false ? "" : config.heading || "HOA OFFICERS"}</div>{config.showTerm !== false && <p className="py-1 text-center" style={{ color: config.termColor, fontSize: pt(config.termFontSize), lineHeight: config.lineHeight, fontWeight: "bold" }}>[Current term]</p>}<div className="px-1">{Array.from({ length: Math.min(config.maxOfficers || 8, 4) }).map((_, index) => <div key={index} style={{ borderBottom: config.showSeparators === false ? undefined : "1px solid #cbd5e1", paddingBottom: spacing, marginBottom: spacing, lineHeight: config.lineHeight }}><strong className="block" style={{ color: config.nameColor, fontSize: pt(config.nameFontSize), lineHeight: config.lineHeight, fontWeight: config.nameFontWeight }}>[Active officer {index + 1}]</strong><span className="block uppercase" style={{ color: config.positionColor, fontSize: pt(config.positionFontSize), lineHeight: config.lineHeight, fontWeight: config.positionFontWeight }}>[Position]</span></div>)}</div></div>;
  }
  if (block.type === "horizontalLine" || block.type === "divider") return <div className="h-0 w-full border-t" style={{ borderTopColor: block.style?.lineColor || "#64748b", borderTopWidth: `${block.style?.lineWidth || 1}px`, borderTopStyle: block.style?.lineStyle || "solid", opacity: block.style?.opacity || 1 }} />;
  if (block.type === "verticalLine") return <div className="h-full w-0 border-l" style={{ borderLeftColor: block.style?.lineColor || "#64748b", borderLeftWidth: `${block.style?.lineWidth || 1}px`, borderLeftStyle: block.style?.lineStyle || "solid", opacity: block.style?.opacity || 1 }} />;
  if (block.type === "qrVerification") return <div className="flex h-full flex-col items-center justify-center gap-1 overflow-hidden text-[8px] font-bold text-slate-500"><QrCode className="size-[65%]" />{block.qr?.showLabel !== false && <span className="text-center">PREVIEW QR — NOT VALID FOR VERIFICATION</span>}{block.qr?.showInstruction !== false && <small>{block.qr?.instruction || "Scan to verify"}</small>}</div>;
  if (block.type === "logo" || block.type === "image") {
    const fit = block.image?.fit === "stretch" ? "fill" : block.image?.fit || "contain";
    const objectPosition = `${block.image?.positionX || "center"} ${block.image?.positionY || "center"}`;
    return imageSrc && !imageFailed ? <img className="h-full w-full" src={imageSrc} alt={block.image?.alt || block.label || "Document image"} style={{ objectFit: fit, objectPosition, opacity: block.image?.opacity || 1 }} onError={() => { setImageFailed(true); onImageError(`${block.type === "logo" ? "Tenant logo" : "Approved image"} could not be loaded. Re-upload the approved image.`); }} /> : <button type="button" className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-[9px] font-black text-slate-500" onClick={onImageUpload}><ImageIcon className="size-6" /><span>{imageFailed ? "Re-upload image" : block.type === "logo" ? "Tenant logo" : "Add image"}</span></button>;
  }
  if (block.table?.rows?.length) return <table className="w-full border-collapse text-[9px]"><tbody>{block.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-300 p-1">{renderFriendlyText(cell)}</td>)}</tr>)}</tbody></table>;
  const value = block.content || block.text || (block.binding ? `{{${block.binding}}}` : "");
  if (!value && isTextBlock(block)) return <div className="whitespace-pre-wrap break-words italic text-slate-400">Type to edit</div>;
  return <div className="whitespace-pre-wrap break-words">{block.richText ? renderEditorRichText(block.richText) : renderFriendlyText(value)}</div>;
}

function PropertiesPanel({ selected, pageSelected, definition, editable, updatePage, updateBlock, updateSelectedPatch, updatePositions, applyTextColor, duplicate, remove, align, layerMove, onImageUpload, onPageImageUpload }: { selected: VisualBlock[]; pageSelected: boolean; definition: DocumentTemplateDefinition; editable: boolean; updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void; updateSelectedPatch: (patch: Partial<DocumentTemplateBlock>) => void; updatePositions: (updater: (position: VisualBlock["position"]) => VisualBlock["position"] ) => void; applyTextColor: (color: string) => void; duplicate: () => void; remove: () => void; align: (kind: "left" | "center" | "right" | "top" | "middle" | "bottom") => void; layerMove: (direction: -1 | 1) => void; onImageUpload: () => void; onPageImageUpload: (target: "page-background" | "page-watermark") => void }) {
  const block = selected[0];
  if (pageSelected || !block) return <PagePropertiesPanel definition={definition} editable={editable} updatePage={updatePage} onPageImageUpload={onPageImageUpload} />;
  const position = block.position;
  const patchPosition = (key: keyof VisualBlock["position"], value: number) => updatePositions((current) => {
    const next = { ...current, [key]: value };
    if ((block.type === "logo" || block.type === "image") && block.image?.lockAspectRatio !== false && (key === "width" || key === "height")) {
      if (key === "width") next.height = value / Math.max(current.width, 1) * current.height;
      else next.width = value / Math.max(current.height, 1) * current.width;
    }
    return next;
  });
  return <div className="space-y-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Properties</p><h2 className="mt-1 text-sm font-black">{block.label || block.type}</h2><p className="text-[10px] font-mono text-slate-400">{selected.length > 1 ? `+${selected.length - 1} selected` : block.type}</p></div><div className="flex gap-1"><IconAction label="Duplicate" onClick={duplicate}><Copy /></IconAction><IconAction label="Delete" onClick={remove}><Trash2 /></IconAction></div></div>
    <label><span className="label">Element name</span><input className="field text-xs" value={block.label || ""} onChange={(event) => updateSelectedPatch({ label: sanitizeText(event.target.value) })} disabled={!editable} /></label>
    <div><p className="label">Position and size (mm)</p><div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}><span className="sr-only">{key}</span><input className="field text-xs" type="number" min={0} step={1} value={Math.round(position[key] * 10) / 10} onChange={(event) => patchPosition(key, Number(event.target.value))} disabled={!editable || block.locked} aria-label={key} /></label>)}</div></div>
    <div className="grid grid-cols-2 gap-2"><label className="flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-bold"><input type="checkbox" checked={block.locked === true} onChange={(event) => updateSelectedPatch({ locked: event.target.checked })} disabled={!editable} /> Lock</label><label className="flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-bold"><input type="checkbox" checked={block.visible !== false} onChange={(event) => updateSelectedPatch({ visible: event.target.checked })} disabled={!editable} /> Visible</label></div>
    {block.type === "officerList" && <OfficerListSettings block={block} editable={editable} updateBlock={updateBlock} />}
    {isTextBlock(block) && <><div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] font-semibold text-slate-600">Double-click the text on the canvas to edit it. Select a range to color only that text; with no range selected, color applies to the whole element.</div><div className="grid grid-cols-2 gap-2"><label><span className="label">Font</span><select className="field text-xs" value={block.style?.fontFamily || "Arial"} onChange={(event) => updateBlock(block.id, { style: { ...block.style, fontFamily: event.target.value as typeof safeFontFamilies[number] } })} disabled={!editable}>{safeFontFamilies.map((font) => <option key={font}>{font}</option>)}</select></label><label><span className="label">Size</span><input className="field text-xs" type="number" min={6} max={72} value={block.style?.fontSize || 11} onChange={(event) => updateBlock(block.id, { style: { ...block.style, fontSize: Number(event.target.value) } })} disabled={!editable} /></label></div><label><span className="label">Text color</span><input className="h-9 w-full" aria-label="Text color" type="color" value={block.style?.textColor || "#111827"} onChange={(event) => applyTextColor(event.target.value)} disabled={!editable} /></label><div className="flex gap-1"><IconAction label="Left" active={block.style?.align === "left"} onClick={() => updateBlock(block.id, { style: { ...block.style, align: "left" } })}><AlignLeft /></IconAction><IconAction label="Center" active={block.style?.align === "center"} onClick={() => updateBlock(block.id, { style: { ...block.style, align: "center" } })}><AlignCenter /></IconAction><IconAction label="Right" active={block.style?.align === "right"} onClick={() => updateBlock(block.id, { style: { ...block.style, align: "right" } })}><AlignRight /></IconAction><IconAction label="Bold" active={block.style?.fontWeight === "bold"} onClick={() => updateBlock(block.id, { style: { ...block.style, fontWeight: block.style?.fontWeight === "bold" ? "normal" : "bold" } })}><Bold /></IconAction></div></>}
    {(block.type === "logo" || block.type === "image") && <ImageProperties block={block} editable={editable} updateBlock={updateBlock} />}
    {isLineBlock(block) && <LineProperties block={block} editable={editable} updateBlock={updateBlock} />}
    {block.type === "qrVerification" && <QrProperties block={block} editable={editable} updateBlock={updateBlock} updatePositions={updatePositions} />}
    <div><p className="label">Align to page</p><div className="grid grid-cols-3 gap-1"><SmallButton label="Left" onClick={() => align("left")}><AlignLeft /></SmallButton><SmallButton label="Center" onClick={() => align("center")}><AlignCenter /></SmallButton><SmallButton label="Right" onClick={() => align("right")}><AlignRight /></SmallButton><SmallButton label="Top" onClick={() => align("top")}><ChevronUp /></SmallButton><SmallButton label="Middle" onClick={() => align("middle")}><Minus /></SmallButton><SmallButton label="Bottom" onClick={() => align("bottom")}><ChevronDown /></SmallButton></div></div>
    <div><p className="label">Layer order</p><div className="flex gap-1"><SmallButton label="Forward" onClick={() => layerMove(1)}><MoveUp /></SmallButton><SmallButton label="Backward" onClick={() => layerMove(-1)}><MoveDown /></SmallButton></div></div>
    {(block.type === "logo" || block.type === "image") && <button type="button" className="btn-secondary w-full text-xs" onClick={onImageUpload} disabled={!editable}><ImageIcon className="size-4" /> Upload approved image</button>}
    {block.binding && <div className="rounded-lg bg-pine-50 p-3 text-xs"><p className="font-black text-pine-800">Dynamic binding</p><p className="mt-1 font-mono text-pine-700">[{placeholderLabel(block.binding)}]</p><p className="mt-1 text-pine-700">Sample: {sampleTemplateValue(block.binding)}</p></div>}
  </div>;
}

function ImageProperties({ block, editable, updateBlock }: { block: VisualBlock; editable: boolean; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void }) {
  const image = block.image || { fit: "contain" as const, positionX: "center" as const, positionY: "center" as const, opacity: 1, lockAspectRatio: true };
  const update = (patch: Partial<NonNullable<DocumentTemplateBlock["image"]>>) => updateBlock(block.id, { image: { ...image, ...patch } });
  return <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"><p className="label">Image layout</p><div className="grid grid-cols-2 gap-2"><label><span className="label">Fit</span><select className="field text-xs" value={image.fit || "contain"} onChange={(event) => update({ fit: event.target.value as "contain" | "cover" | "stretch" })} disabled={!editable}><option value="contain">Contain</option><option value="cover">Cover</option><option value="stretch">Stretch</option></select></label><label><span className="label">Opacity</span><input className="field text-xs" type="number" min={0.05} max={1} step={0.05} value={image.opacity || 1} onChange={(event) => update({ opacity: Number(event.target.value) })} disabled={!editable} /></label></div><div className="grid grid-cols-2 gap-2"><label><span className="label">Horizontal</span><select className="field text-xs" value={image.positionX || "center"} onChange={(event) => update({ positionX: event.target.value as "left" | "center" | "right" })} disabled={!editable}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span className="label">Vertical</span><select className="field text-xs" value={image.positionY || "center"} onChange={(event) => update({ positionY: event.target.value as "top" | "center" | "bottom" })} disabled={!editable}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label></div><label className="flex min-h-8 items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={image.lockAspectRatio !== false} onChange={(event) => update({ lockAspectRatio: event.target.checked })} disabled={!editable} /> Lock aspect ratio</label><div className="grid grid-cols-2 gap-2"><button type="button" className="btn-secondary text-[10px]" onClick={() => update({ src: "{{tenant.logo}}", alt: "Tenant logo", fit: "contain", positionX: "center", positionY: "center" })} disabled={!editable}>Reset to tenant logo</button><button type="button" className="btn-secondary text-[10px]" onClick={() => update({ width: undefined, height: undefined, lockAspectRatio: true })} disabled={!editable}>Reset natural ratio</button></div><label><span className="label">Alt text</span><input className="field text-xs" value={image.alt || ""} onChange={(event) => update({ alt: sanitizeText(event.target.value) })} disabled={!editable} /></label></section>;
}

function LineProperties({ block, editable, updateBlock }: { block: VisualBlock; editable: boolean; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void }) {
  const style = block.style || {};
  const update = (patch: NonNullable<DocumentTemplateBlock["style"]>) => updateBlock(block.id, { style: { ...style, ...patch } });
  return <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"><p className="label">Line stroke</p><div className="grid grid-cols-3 gap-2"><label><span className="label">Thickness</span><input className="field text-xs" type="number" min={0.25} max={8} step={0.25} value={style.lineWidth || 1} onChange={(event) => update({ lineWidth: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Opacity</span><input className="field text-xs" type="number" min={0.05} max={1} step={0.05} value={style.opacity || 1} onChange={(event) => update({ opacity: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Style</span><select className="field text-xs" value={style.lineStyle || "solid"} onChange={(event) => update({ lineStyle: event.target.value as "solid" | "dashed" | "dotted" })} disabled={!editable}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label></div><label><span className="label">Color</span><input className="h-9 w-full" type="color" value={style.lineColor || "#64748b"} onChange={(event) => update({ lineColor: event.target.value })} disabled={!editable} /></label></section>;
}

function QrProperties({ block, editable, updateBlock, updatePositions }: { block: VisualBlock; editable: boolean; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void; updatePositions: (updater: (position: VisualBlock["position"]) => VisualBlock["position"]) => void }) {
  const qr = block.qr || { label: "PREVIEW QR — NOT VALID FOR VERIFICATION", instruction: "Scan to verify", showLabel: true, showInstruction: true, squareLocked: true, quietZone: 1 };
  const update = (patch: Partial<NonNullable<DocumentTemplateBlock["qr"]>>) => updateBlock(block.id, { qr: { ...qr, ...patch } });
  return <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"><p className="label">QR preview</p><div className="grid grid-cols-2 gap-2"><label><span className="label">Width (mm)</span><input className="field text-xs" type="number" min={12} value={block.position.width} onChange={(event) => updatePositions((position) => ({ ...position, width: Number(event.target.value), height: qr.squareLocked ? Number(event.target.value) : position.height }))} disabled={!editable} /></label><label><span className="label">Height (mm)</span><input className="field text-xs" type="number" min={12} value={block.position.height} onChange={(event) => updatePositions((position) => ({ ...position, height: Number(event.target.value), width: qr.squareLocked ? Number(event.target.value) : position.width }))} disabled={!editable} /></label></div><label className="flex min-h-8 items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={qr.squareLocked} onChange={(event) => update({ squareLocked: event.target.checked })} disabled={!editable} /> Lock square ratio</label><div className="grid grid-cols-2 gap-2"><label><span className="label">Label</span><input className="field text-xs" value={qr.label} onChange={(event) => update({ label: sanitizeText(event.target.value) })} disabled={!editable} /></label><label><span className="label">Instruction</span><input className="field text-xs" value={qr.instruction} onChange={(event) => update({ instruction: sanitizeText(event.target.value) })} disabled={!editable} /></label></div><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={qr.showLabel} onChange={(event) => update({ showLabel: event.target.checked })} disabled={!editable} /> Show label</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={qr.showInstruction} onChange={(event) => update({ showInstruction: event.target.checked })} disabled={!editable} /> Show instruction</label></div><p className="text-[10px] font-semibold text-amber-800">Preview QR is not a valid verification code.</p></section>;
}

function PagePaddingProperties({ page, editable, updatePage }: { page: DocumentTemplateDefinition["page"]; editable: boolean; updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void }) {
  return <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Page padding (mm)</p><div className="grid grid-cols-2 gap-2">{(["top", "right", "bottom", "left"] as const).map((side) => <label key={side}><span className="label capitalize">{side}</span><input className="field text-xs" type="number" min={0} max={30} step={0.1} value={page.padding[side]} onChange={(event) => updatePage({ padding: { ...page.padding, [side]: Number(event.target.value) } })} disabled={!editable} /></label>)}</div></section>;
}

function PageRegionBoundaryProperties({ page, editable, updatePage }: { page: DocumentTemplateDefinition["page"]; editable: boolean; updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void }) {
  return <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Region boundaries</p><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.showHeaderBoundary} onChange={(event) => updatePage({ showHeaderBoundary: event.target.checked })} disabled={!editable} /> Header boundary</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.showFooterBoundary} onChange={(event) => updatePage({ showFooterBoundary: event.target.checked })} disabled={!editable} /> Footer boundary</label></div></section>;
}

function PagePropertiesPanel({ definition, editable, updatePage, onPageImageUpload }: { definition: DocumentTemplateDefinition; editable: boolean; updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void; onPageImageUpload: (target: "page-background" | "page-watermark") => void }) {
  const page = definition.page;
  const [marginsLinked, setMarginsLinked] = useState(false);
  const setMargin = (side: keyof DocumentTemplateDefinition["page"]["margins"], value: number) => {
    const next = clamp(value, 5, 60);
    updatePage({ marginPreset: "custom", margins: marginsLinked ? { top: next, right: next, bottom: next, left: next } : { ...page.margins, [side]: next } });
  };
  const updateCanvas = (patch: Partial<DocumentTemplateDefinition["page"]["canvas"]>) => updatePage({ canvas: { ...page.canvas, ...patch } });
  const updateGuides = (patch: Partial<DocumentTemplateDefinition["page"]["guides"]>) => updatePage({ guides: { ...page.guides, ...patch } });
  return <div className="space-y-4" aria-labelledby="page-properties-heading">
    <PagePaddingProperties page={page} editable={editable} updatePage={updatePage} />
    <PageRegionBoundaryProperties page={page} editable={editable} updatePage={updatePage} />
    <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Page Properties</p><h2 id="page-properties-heading" className="mt-1 text-sm font-black">{documentPageSizes[page.format].label} {page.orientation}</h2><p className="text-[10px] text-slate-500">Page settings are stored in millimetres and do not move elements.</p></div>
    <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Paper</p><div className="grid grid-cols-2 gap-2"><select className="field text-xs" aria-label="Paper size" value={page.format} onChange={(event) => updatePage({ format: event.target.value as DocumentPageFormat })} disabled={!editable}><option value="A4">A4</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option></select><select className="field text-xs" aria-label="Orientation" value={page.orientation} onChange={(event) => updatePage({ orientation: event.target.value as "portrait" | "landscape" })} disabled={!editable}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div><p className="text-[10px] font-mono text-slate-500">{page.widthMm} × {page.heightMm} mm · Page {page.pageNumber}</p></section>
    <section className="space-y-2 border-b border-slate-200 pb-4"><div className="flex items-center justify-between"><p className="label">Margins (mm)</p><button type="button" className="text-[10px] font-bold text-pine-700" onClick={() => updatePage({ marginPreset: "normal", margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } })} disabled={!editable}>Reset safe default</button></div><div className="grid grid-cols-2 gap-2">{(["top", "right", "bottom", "left"] as const).map((side) => <label key={side}><span className="label capitalize">{side}</span><input className="field text-xs" type="number" min={5} max={60} step={0.1} value={page.margins[side]} onChange={(event) => setMargin(side, Number(event.target.value))} disabled={!editable} /></label>)}</div><label className="flex min-h-8 items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={marginsLinked} onChange={(event) => setMarginsLinked(event.target.checked)} /> Link margin values</label></section>
    <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Background</p><div className="grid grid-cols-[1fr_auto] gap-2"><input className="h-9 w-full" type="color" value={page.backgroundColor} onChange={(event) => updatePage({ backgroundColor: event.target.value })} disabled={!editable} /><label className="text-[10px] font-bold">Opacity<input className="field mt-1 w-20 text-xs" type="number" min={0.05} max={1} step={0.05} value={page.backgroundOpacity} onChange={(event) => updatePage({ backgroundOpacity: Number(event.target.value) })} disabled={!editable} /></label></div>{page.backgroundImage ? <div className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-[10px]"><span className="truncate">Tenant-approved image</span><button type="button" className="font-bold text-rose-700" onClick={() => updatePage({ backgroundImage: undefined })} disabled={!editable}>Remove</button></div> : <button type="button" className="btn-secondary w-full text-xs" onClick={() => onPageImageUpload("page-background")} disabled={!editable}><ImageIcon className="size-4" /> Upload approved background</button>}{page.backgroundImage && <div className="grid grid-cols-2 gap-2"><select className="field text-xs" aria-label="Background fit" value={page.backgroundImage.fit} onChange={(event) => updatePage({ backgroundImage: { ...page.backgroundImage!, fit: event.target.value as "cover" | "contain" | "fill" } })} disabled={!editable}><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select><select className="field text-xs" aria-label="Background position" value={page.backgroundImage.position} onChange={(event) => updatePage({ backgroundImage: { ...page.backgroundImage!, position: event.target.value as NonNullable<typeof page.backgroundImage>["position"] } })} disabled={!editable}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></div>}</section>
    <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Page border</p><label className="flex min-h-8 items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.border.enabled} onChange={(event) => updatePage({ border: { ...page.border, enabled: event.target.checked } })} disabled={!editable} /> Show page border</label>{page.border.enabled && <div className="grid grid-cols-3 gap-2"><select className="field text-xs" aria-label="Border style" value={page.border.style} onChange={(event) => updatePage({ border: { ...page.border, style: event.target.value as typeof page.border.style } })} disabled={!editable}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select><input className="field text-xs" aria-label="Border width" type="number" min={0} max={6} step={0.5} value={page.border.width} onChange={(event) => updatePage({ border: { ...page.border, width: Number(event.target.value) } })} disabled={!editable} /><input className="h-9 w-full" aria-label="Border color" type="color" value={page.border.color} onChange={(event) => updatePage({ border: { ...page.border, color: event.target.value } })} disabled={!editable} /></div>}</section>
    <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Grid, rulers, and guides</p><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.canvas.showGrid} onChange={(event) => updateCanvas({ showGrid: event.target.checked })} disabled={!editable} /> Grid</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.canvas.snapToGrid} onChange={(event) => updateCanvas({ snapToGrid: event.target.checked })} disabled={!editable} /> Snap</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.canvas.showRulers} onChange={(event) => updateCanvas({ showRulers: event.target.checked })} disabled={!editable} /> Rulers</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.canvas.showMarginGuides} onChange={(event) => updateCanvas({ showMarginGuides: event.target.checked })} disabled={!editable} /> Margins</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.canvas.showCenterGuides} onChange={(event) => updateCanvas({ showCenterGuides: event.target.checked })} disabled={!editable} /> Center guides</label></div><label><span className="label">Grid spacing (mm)</span><input className="field text-xs" type="number" min={1} max={20} step={1} value={page.canvas.gridSize} onChange={(event) => updateCanvas({ gridSize: Number(event.target.value) })} disabled={!editable} /></label><div className="flex gap-2"><button type="button" className="btn-secondary flex-1 text-[10px]" onClick={() => updateGuides({ horizontal: [...page.guides.horizontal, { positionMm: page.heightMm / 2 }] })} disabled={!editable}>Add horizontal guide</button><button type="button" className="btn-secondary flex-1 text-[10px]" onClick={() => updateGuides({ vertical: [...page.guides.vertical, { positionMm: page.widthMm / 2 }] })} disabled={!editable}>Add vertical guide</button></div>{[...page.guides.horizontal.map((guide, index) => ({ ...guide, index, axis: "horizontal" as const })), ...page.guides.vertical.map((guide, index) => ({ ...guide, index, axis: "vertical" as const }))].map((guide) => <div className="flex items-center gap-2" key={`${guide.axis}-${guide.index}`}><span className="w-4 text-[10px] font-bold uppercase">{guide.axis[0]}</span><input className="field text-xs" type="number" min={0} max={guide.axis === "horizontal" ? page.heightMm : page.widthMm} step={0.1} value={guide.positionMm} onChange={(event) => updateGuides({ [guide.axis]: (guide.axis === "horizontal" ? page.guides.horizontal : page.guides.vertical).map((item, index) => index === guide.index ? { ...item, positionMm: Number(event.target.value) } : item) })} disabled={!editable} /><button type="button" className="text-[10px] font-bold text-rose-700" onClick={() => updateGuides({ [guide.axis]: (guide.axis === "horizontal" ? page.guides.horizontal : page.guides.vertical).filter((_, index) => index !== guide.index) })} disabled={!editable}>Remove</button></div>)}</section>
    <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Header and footer regions</p><div className="grid grid-cols-2 gap-2"><label><span className="label">Header height (mm)</span><input className="field text-xs" type="number" min={0} max={120} step={0.1} value={page.headerHeightMm} onChange={(event) => updatePage({ headerHeightMm: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Footer height (mm)</span><input className="field text-xs" type="number" min={0} max={120} step={0.1} value={page.footerHeightMm} onChange={(event) => updatePage({ footerHeightMm: Number(event.target.value) })} disabled={!editable} /></label></div><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.headerLocked} onChange={(event) => updatePage({ headerLocked: event.target.checked })} disabled={!editable} /> Lock header</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.footerLocked} onChange={(event) => updatePage({ footerLocked: event.target.checked })} disabled={!editable} /> Lock footer</label></div></section>
    <section className="space-y-2 border-b border-slate-200 pb-4"><p className="label">Printable safe area</p><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.safeArea.showBoundary} onChange={(event) => updatePage({ safeArea: { ...page.safeArea, showBoundary: event.target.checked } })} disabled={!editable} /> Boundary</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.safeArea.showNonPrintableArea} onChange={(event) => updatePage({ safeArea: { ...page.safeArea, showNonPrintableArea: event.target.checked } })} disabled={!editable} /> Non-printable</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.safeArea.warnOnOverflow} onChange={(event) => updatePage({ safeArea: { ...page.safeArea, warnOnOverflow: event.target.checked } })} disabled={!editable} /> Warn on overflow</label><label><span className="label">Recommended min (mm)</span><input className="field text-xs" type="number" min={5} max={30} value={page.safeArea.minimumMarginMm} onChange={(event) => updatePage({ safeArea: { ...page.safeArea, minimumMarginMm: Number(event.target.value) } })} disabled={!editable} /></label></div></section>
    <section className="space-y-2"><p className="label">Watermark</p><label className="flex min-h-8 items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={page.watermark.enabled} onChange={(event) => updatePage({ watermark: { ...page.watermark, enabled: event.target.checked } })} disabled={!editable} /> Show watermark</label>{page.watermark.enabled && <><textarea className="field min-h-16 text-xs" aria-label="Watermark text" value={page.watermark.text} onChange={(event) => updatePage({ watermark: { ...page.watermark, text: sanitizeText(event.target.value) } })} disabled={!editable} placeholder="Draft watermark" /><div className="grid grid-cols-3 gap-2"><label><span className="label">Opacity</span><input className="field text-xs" type="number" min={0.02} max={0.3} step={0.01} value={page.watermark.opacity} onChange={(event) => updatePage({ watermark: { ...page.watermark, opacity: Number(event.target.value) } })} disabled={!editable} /></label><label><span className="label">Size</span><input className="field text-xs" type="number" min={12} max={96} value={page.watermark.fontSize} onChange={(event) => updatePage({ watermark: { ...page.watermark, fontSize: Number(event.target.value) } })} disabled={!editable} /></label><label><span className="label">Rotation</span><input className="field text-xs" type="number" min={-45} max={45} value={page.watermark.rotation} onChange={(event) => updatePage({ watermark: { ...page.watermark, rotation: Number(event.target.value) } })} disabled={!editable} /></label></div><select className="field text-xs" aria-label="Watermark position" value={page.watermark.position} onChange={(event) => updatePage({ watermark: { ...page.watermark, position: event.target.value as typeof page.watermark.position } })} disabled={!editable}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select><button type="button" className="btn-secondary w-full text-xs" onClick={() => onPageImageUpload("page-watermark")} disabled={!editable}><ImageIcon className="size-4" /> Upload approved watermark image</button>{page.watermark.image && <button type="button" className="text-[10px] font-bold text-rose-700" onClick={() => updatePage({ watermark: { ...page.watermark, image: undefined } })} disabled={!editable}>Remove watermark image</button>}</>}</section>
  </div>;
}

function OfficerListSettings({ block, editable, updateBlock }: { block: VisualBlock; editable: boolean; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void }) {
  const config = block.officerList || defaultOfficerListConfig;
  const update = (patch: Partial<DocumentOfficerListConfig>) => updateBlock(block.id, { officerList: { ...config, ...patch } });
  return <section className="space-y-3 rounded-lg border border-pine-100 bg-pine-50 p-3"><div><p className="text-xs font-black text-pine-900">HOA officer list</p><p className="mt-1 text-[10px] text-pine-800">Trusted source: active officers from this tenant.</p></div><label><span className="label">Heading</span><input className="field text-xs" value={config.heading} onChange={(event) => update({ heading: sanitizeText(event.target.value) })} disabled={!editable} /></label><label><span className="label">Role filters</span><input className="field text-xs" value={config.roleFilters.join(", ")} onChange={(event) => update({ roleFilters: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="All active roles" disabled={!editable} /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Sort by</span><select className="field text-xs" value={config.sortBy} onChange={(event) => update({ sortBy: event.target.value as DocumentOfficerListConfig["sortBy"] })} disabled={!editable}><option value="displayOrder">Display order</option><option value="position">Position</option><option value="fullName">Name</option></select></label><label><span className="label">Max count</span><input className="field text-xs" type="number" min={1} max={30} value={config.maxOfficers} onChange={(event) => update({ maxOfficers: Number(event.target.value) })} disabled={!editable} /></label></div><label><span className="label">Term label</span><input className="field text-xs" value={config.termLabel} onChange={(event) => update({ termLabel: sanitizeText(event.target.value) })} placeholder="Optional prefix" disabled={!editable} /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Heading size (pt)</span><input className="field text-xs" type="number" min={8} max={18} step={0.5} value={config.headingFontSize} onChange={(event) => update({ headingFontSize: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Term size (pt)</span><input className="field text-xs" type="number" min={6} max={16} step={0.5} value={config.termFontSize} onChange={(event) => update({ termFontSize: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Name size (pt)</span><input className="field text-xs" type="number" min={6} max={16} step={0.5} value={config.nameFontSize} onChange={(event) => update({ nameFontSize: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Position size (pt)</span><input className="field text-xs" type="number" min={6} max={14} step={0.5} value={config.positionFontSize} onChange={(event) => update({ positionFontSize: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Line height</span><input className="field text-xs" type="number" min={0.9} max={2.5} step={0.05} value={config.lineHeight} onChange={(event) => update({ lineHeight: Number(event.target.value) })} disabled={!editable} /></label><label><span className="label">Officer spacing (mm)</span><input className="field text-xs" type="number" min={0} max={12} step={0.5} value={config.officerSpacing} onChange={(event) => update({ officerSpacing: Number(event.target.value) })} disabled={!editable} /></label></div><div className="grid grid-cols-2 gap-2"><label><span className="label">Name weight</span><select className="field text-xs" value={config.nameFontWeight} onChange={(event) => update({ nameFontWeight: event.target.value as DocumentOfficerListConfig["nameFontWeight"] })} disabled={!editable}><option value="normal">Normal</option><option value="bold">Bold</option></select></label><label><span className="label">Position weight</span><select className="field text-xs" value={config.positionFontWeight} onChange={(event) => update({ positionFontWeight: event.target.value as DocumentOfficerListConfig["positionFontWeight"] })} disabled={!editable}><option value="normal">Normal</option><option value="bold">Bold</option></select></label></div><div className="grid grid-cols-2 gap-2"><label><span className="label">Heading color</span><input className="h-9 w-full" aria-label="Officer heading color" type="color" value={config.headingColor} onChange={(event) => update({ headingColor: event.target.value })} disabled={!editable} /></label><label><span className="label">Term color</span><input className="h-9 w-full" aria-label="Officer term color" type="color" value={config.termColor} onChange={(event) => update({ termColor: event.target.value })} disabled={!editable} /></label><label><span className="label">Name color</span><input className="h-9 w-full" aria-label="Officer name color" type="color" value={config.nameColor} onChange={(event) => update({ nameColor: event.target.value })} disabled={!editable} /></label><label><span className="label">Position color</span><input className="h-9 w-full" aria-label="Officer position color" type="color" value={config.positionColor} onChange={(event) => update({ positionColor: event.target.value })} disabled={!editable} /></label></div><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={config.showHeading} onChange={(event) => update({ showHeading: event.target.checked })} disabled={!editable} /> Heading</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={config.showTerm} onChange={(event) => update({ showTerm: event.target.checked })} disabled={!editable} /> Current term</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={config.showSeparators} onChange={(event) => update({ showSeparators: event.target.checked })} disabled={!editable} /> Separators</label></div><div className="grid grid-cols-2 gap-2"><label><span className="label">Background</span><input className="h-9 w-full" type="color" value={block.style?.backgroundColor || "#ffffff"} onChange={(event) => updateBlock(block.id, { style: { ...block.style, backgroundColor: event.target.value } })} disabled={!editable} /></label><label><span className="label">Border</span><input className="h-9 w-full" type="color" value={block.style?.borderColor || "#0b2a63"} onChange={(event) => updateBlock(block.id, { style: { ...block.style, borderColor: event.target.value, borderWidth: 1 } })} disabled={!editable} /></label></div></section>;
}

function PagePanel({ definition, editable, updatePage }: { definition: DocumentTemplateDefinition; editable: boolean; updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void }) {
  return <div className="mt-4 space-y-3"><p className="text-xs font-black text-slate-700">Page setup</p><label><span className="label">Paper</span><select className="field text-xs" value={definition.page.format} onChange={(event) => updatePage({ format: event.target.value as DocumentPageFormat })} disabled={!editable}><option value="A4">A4</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option></select></label><label><span className="label">Orientation</span><select className="field text-xs" value={definition.page.orientation} onChange={(event) => updatePage({ orientation: event.target.value as "portrait" | "landscape" })} disabled={!editable}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label><span className="label">Grid size (mm)</span><input className="field text-xs" type="number" min={1} max={20} value={definition.page.canvas.gridSize} onChange={(event) => updatePage({ canvas: { ...definition.page.canvas, gridSize: Number(event.target.value) } })} disabled={!editable} /></label><label className="flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-bold"><input type="checkbox" checked={definition.page.canvas.snapToGrid} onChange={(event) => updatePage({ canvas: { ...definition.page.canvas, snapToGrid: event.target.checked } })} disabled={!editable} /> Snap to grid</label></div>;
}

function ValidationPanel({ errors, warnings, blocks, onSelect, onSelectPage }: { errors: string[]; warnings: string[]; blocks: DocumentTemplateBlock[]; onSelect: (id: string) => void; onSelectPage: () => void }) {
  return <section className="mt-6 border-t border-slate-200 pt-4" aria-labelledby="template-validation"><div className="flex items-center justify-between"><h2 id="template-validation" className="text-xs font-black uppercase tracking-wide text-slate-600">Validation</h2><span className={`rounded-full px-2 py-1 text-[10px] font-black ${errors.length ? "bg-rose-50 text-rose-700" : warnings.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{errors.length ? `${errors.length} issue${errors.length === 1 ? "" : "s"}` : warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "Ready"}</span></div>{errors.length ? <div className="mt-3 space-y-2">{errors.map((error) => <button key={error} type="button" className="block w-full rounded-lg bg-rose-50 p-2 text-left text-[11px] font-semibold text-rose-800" onClick={() => { const block = blocks.find((item) => error.includes(item.id) || error.includes(item.label || "\u0000")); if (block) onSelect(block.id); else onSelectPage(); }}>{error}</button>)}</div> : null}{warnings.length ? <div className="mt-3 space-y-2">{warnings.map((warning) => <button key={warning} type="button" className="block w-full rounded-lg bg-amber-50 p-2 text-left text-[11px] font-semibold text-amber-900" onClick={onSelectPage}>{warning}</button>)}</div> : null}{!errors.length && !warnings.length && <p className="mt-2 text-[11px] text-slate-500">No unresolved placeholders or printable-boundary errors.</p>}</section>;
}

function ToolbarButton({ id, label, onClick, disabled, expanded, controls, ariaPressed, children }: { id?: string; label: string; onClick: () => void; disabled?: boolean; expanded?: boolean; controls?: string; ariaPressed?: boolean; children: React.ReactNode }) { return <button id={id} type="button" title={label} aria-label={label} aria-expanded={expanded} aria-controls={controls} aria-pressed={ariaPressed} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-pine-600 disabled:opacity-40" onClick={onClick} disabled={disabled}>{children}</button>; }
function SmallButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) { return <button type="button" className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-bold" onClick={onClick} title={label}>{children}</button>; }
function IconAction({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) { return <button type="button" title={label} aria-label={label} className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border p-1.5 ${active ? "border-pine-700 bg-pine-800 text-white" : "border-slate-200 text-slate-700"}`} onClick={onClick}>{children}</button>; }

function materializeVisualLayout(value: unknown, title: string) {
  const normalized = normalizeTemplateDefinition(value, title);
  const sections = { header: materializeSection(normalized.sections.header, "header"), body: materializeSection(normalized.sections.body, "body"), footer: materializeSection(normalized.sections.footer, "footer") };
  return { ...normalized, sections, blocks: [ ...sections.header, ...sections.body, ...sections.footer ] };
}

function materializeSection(blocks: DocumentTemplateBlock[], section: DocumentTemplateSectionName) {
  return blocks.map((block, index) => ({ ...block, position: block.position || defaultPosition(block, section, index) }));
}

function defaultPosition(block: DocumentTemplateBlock, section: DocumentTemplateSectionName, index: number): VisualBlock["position"] {
  const y = section === "header" ? 15 + index * 12 : section === "footer" ? 270 + index * 10 : 82 + index * 16;
  const width = block.type === "logo" ? 60 : block.type === "qrVerification" ? 32 : block.type === "officerList" ? 38 : 160;
  const height = block.type === "logo" ? 28 : block.type === "qrVerification" ? 32 : block.type === "officerList" ? 110 : block.type === "rectangle" ? 28 : 13;
  return { x: block.type === "officerList" ? 8 : block.style?.align === "right" ? 125 : block.style?.align === "center" ? 25 : 25, y: block.type === "officerList" ? 65 : y, width, height, zIndex: index + 10 };
}

function resizePosition(position: VisualBlock["position"], dx: number, dy: number, corner: "nw" | "ne" | "sw" | "se", pageWidth: number, pageHeight: number, snap: (value: number) => number, lockAspectRatio = false) {
  let { x, y, width, height } = position;
  if (corner.includes("e")) width = snap(width + dx); else { x = snap(x + dx); width = snap(width - dx); }
  if (corner.includes("s")) height = snap(height + dy); else { y = snap(y + dy); height = snap(height - dy); }
  if (lockAspectRatio) {
    const ratio = position.width / Math.max(position.height, 1);
    height = snap(width / Math.max(ratio, 0.01));
    if (corner.includes("n")) y = position.y + position.height - height;
  }
  width = clamp(width, 12, pageWidth); height = clamp(height, 8, pageHeight); x = clamp(x, 0, pageWidth - width); y = clamp(y, 0, pageHeight - height);
  position.x = x; position.y = y; position.width = width; position.height = height;
}

function mapBlocks(definition: DocumentTemplateDefinition, updater: (block: DocumentTemplateBlock) => DocumentTemplateBlock): DocumentTemplateDefinition {
  const sections = { header: definition.sections.header.map(updater), body: definition.sections.body.map(updater), footer: definition.sections.footer.map(updater) };
  return { ...definition, sections, blocks: [ ...sections.header, ...sections.body, ...sections.footer ] };
}

function findBlock(definition: DocumentTemplateDefinition, id: string) { return definition.blocks.find((block) => block.id === id) as VisualBlock | undefined; }
function clone<T>(value: T): T { return structuredClone(value); }
function uniqueId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function sanitizeText(value: string) { return value.replace(/[<>]/g, "").replace(/javascript:/gi, "").slice(0, 8000); }
function isTextBlock(block: DocumentTemplateBlock) { return !["logo", "image", "qrVerification", "rectangle", "horizontalLine", "verticalLine", "divider", "table", "officerList"].includes(block.type); }
function isLineBlock(block: DocumentTemplateBlock) { return block.type === "horizontalLine" || block.type === "verticalLine" || block.type === "divider"; }
function defaultContent(type: DocumentTemplateBlockType) { return type === "documentTitle" || type === "heading" ? "Document heading" : type === "verificationText" ? "Verify this document at {{verification.url}}" : type === "documentNumber" ? "Document No. {{document.number}}" : type === "issueDate" ? "Issued on {{document.issueDate}}" : ""; }
function placeholderLabel(key: string) { return placeholderGroups.flatMap((group) => group.items).find((item) => item.key === key)?.label || key; }
function renderFriendlyText(value: string): React.ReactNode { return value.split(/(\{\{\s*[A-Za-z0-9_.]+\s*\}\})/g).map((part, index) => { const match = part.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/); return match ? <span key={index} className="mx-0.5 inline-flex rounded bg-pine-100 px-1 text-[.8em] font-bold text-pine-800">[{placeholderLabel(match[1])}]</span> : <span key={index}>{part}</span>; }); }

function plainTextToRichText(value: string): DocumentRichText {
  return { type: "paragraph", children: splitPlaceholderText(sanitizeText(value)) };
}

function splitPlaceholderText(value: string, marks?: { color?: string; bold?: boolean; italic?: boolean; underline?: boolean }) {
  return value.split(/(\{\{\s*[A-Za-z0-9_.]+\s*\}\})/g).filter(Boolean).map((part) => {
    const match = part.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
    return match ? { type: "placeholder" as const, key: match[1], label: placeholderLabel(match[1]), marks } : { type: "text" as const, text: part, marks };
  });
}

function renderEditorRichText(richText: DocumentRichText): React.ReactNode {
  if (!richText.children.length) return <span contentEditable={false} className="italic text-slate-400">Type to edit</span>;
  return richText.children.map((node, index) => {
    const marks = node.marks || {};
    const style: React.CSSProperties = { color: marks.color, fontWeight: marks.bold ? "bold" : undefined, fontStyle: marks.italic ? "italic" : undefined, textDecoration: marks.underline ? "underline" : undefined };
    if (node.type === "placeholder") return <span key={index} contentEditable={false} data-placeholder-key={node.key} className="mx-0.5 inline-flex rounded bg-pine-100 px-1 text-[.8em] font-bold text-pine-800" style={style}>[{node.label || placeholderLabel(node.key)}]</span>;
    return <span key={index} data-rich-text="true" data-color={marks.color || ""} style={style}>{node.text}</span>;
  });
}

function parseRichTextDom(root: HTMLElement): DocumentRichText {
  const children: DocumentRichText["children"] = [];
  const visit = (node: Node, marks?: { color?: string; bold?: boolean; italic?: boolean; underline?: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = sanitizeText(node.textContent || "");
      if (text) children.push(...splitPlaceholderText(text, marks));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const placeholder = node.dataset.placeholderKey;
    if (placeholder) {
      children.push({ type: "placeholder", key: placeholder, label: placeholderLabel(placeholder), marks });
      return;
    }
    const color = node.dataset.color && /^#[0-9A-Fa-f]{6}$/.test(node.dataset.color) ? node.dataset.color.toUpperCase() : marks?.color;
    visitChildren(node, { color, bold: marks?.bold || node.style.fontWeight === "bold", italic: marks?.italic || node.style.fontStyle === "italic", underline: marks?.underline || node.style.textDecoration.includes("underline") });
  };
  const visitChildren = (element: HTMLElement, marks?: { color?: string; bold?: boolean; italic?: boolean; underline?: boolean }) => Array.from(element.childNodes).forEach((child) => visit(child, marks));
  visitChildren(root);
  return { type: "paragraph", children };
}

function textOffset(root: HTMLElement, target: Node, offset: number) {
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === target) return total + offset;
    total += current.textContent?.length || 0;
    current = walker.nextNode();
  }
  return total;
}

function richTextToContent(richText: DocumentRichText) {
  return richText.children.map((node) => node.type === "placeholder" ? `{{${node.key}}}` : node.text).join("");
}

function applyColorToRichText(richText: DocumentRichText, start: number, end: number, color: string): DocumentRichText {
  let cursor = 0;
  const children = richText.children.flatMap((node) => {
    const display = node.type === "placeholder" ? `[${node.label || placeholderLabel(node.key)}]` : node.text;
    const nodeStart = cursor;
    const nodeEnd = cursor + display.length;
    cursor = nodeEnd;
    if (end <= nodeStart || start >= nodeEnd) return [node];
    const marks = { ...node.marks, color };
    if (node.type === "placeholder") return [{ ...node, marks }];
    const left = Math.max(0, start - nodeStart);
    const right = Math.min(node.text.length, end - nodeStart);
    return [
      ...(left > 0 ? [{ type: "text" as const, text: node.text.slice(0, left), marks: node.marks }] : []),
      ...(right > left ? [{ type: "text" as const, text: node.text.slice(left, right), marks }] : []),
      ...(right < node.text.length ? [{ type: "text" as const, text: node.text.slice(right), marks: node.marks }] : []),
    ];
  });
  return { type: "paragraph", children };
}
