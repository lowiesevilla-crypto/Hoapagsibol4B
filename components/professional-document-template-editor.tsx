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
  Minus,
  MoveDown,
  MoveUp,
  PanelLeft,
  Plus,
  Printer,
  QrCode,
  Redo2,
  Save,
  Search,
  Settings2,
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
  type DocumentPageFormat,
  type DocumentOfficerListConfig,
  type DocumentTemplateBlock,
  type DocumentTemplateBlockType,
  type DocumentTemplateDefinition,
  type DocumentTemplateSectionName,
} from "@/lib/services/document-template-builder";

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
};

const pageSizes: Record<DocumentPageFormat, { width: number; height: number; label: string }> = {
  A4: { width: 210, height: 297, label: "A4" },
  LETTER: { width: 216, height: 279, label: "Letter" },
  LEGAL: { width: 216, height: 356, label: "Legal" },
};

const elementOptions: { type: DocumentTemplateBlockType; label: string; icon: React.ReactNode; content?: string; binding?: string; section?: DocumentTemplateSectionName }[] = [
  { type: "text", label: "Text", icon: <Type /> },
  { type: "heading", label: "Heading", icon: <Type /> },
  { type: "paragraph", label: "Paragraph", icon: <FileText /> },
  { type: "image", label: "Image", icon: <ImageIcon /> },
  { type: "logo", label: "Tenant Logo", icon: <ImageIcon />, binding: "tenant.logo", section: "header" },
  { type: "horizontalLine", label: "Horizontal Line", icon: <Minus /> },
  { type: "rectangle", label: "Rectangle", icon: <Square /> },
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
  const copiedRef = useRef<VisualBlock[]>([]);
  const initialSerialized = useRef(JSON.stringify(materializeVisualLayout(props.template, props.title)));
  const validation = useMemo(() => validateTemplateDefinition(definition, { officerPositions: props.officerPositions, activeOfficerCount: props.activeOfficerCount }), [definition, props.activeOfficerCount, props.officerPositions]);
  const selected = selectedIds.map((id) => findBlock(definition, id)).filter(Boolean) as VisualBlock[];
  const page = pageSizes[definition.page.format];
  const paperWidth = definition.page.orientation === "landscape" ? page.height : page.width;
  const paperHeight = definition.page.orientation === "landscape" ? page.width : page.height;
  const scale = (zoom / 100) * 3.78;
  const dirty = JSON.stringify(definition) !== initialSerialized.current;
  const knownPlaceholderKeys = useMemo(() => new Set<string>([...allowedDocumentPlaceholders, ...props.customPlaceholders.map((item) => item.key)]), [props.customPlaceholders]);

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
      if (editingId || !props.editable || selected.length === 0) return;
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
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
    setSelectedIds((current) => additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id]);
  }

  function updateBlock(id: string, patch: Partial<DocumentTemplateBlock>) {
    updateDefinition((draft) => mapBlocks(draft, (block) => block.id === id ? { ...block, ...patch } : block));
  }

  function updateSelectedPatch(patch: Partial<DocumentTemplateBlock>) {
    if (!selectedIds.length) return;
    updateDefinition((draft) => mapBlocks(draft, (block) => selectedIds.includes(block.id) ? { ...block, ...patch } : block));
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
      position: { x: position?.x ?? (option.type === "officerList" ? 8 : clamp(25 + (count % 3) * 8, 0, paperWidth - 60)), y: position?.y ?? (option.type === "officerList" ? 65 : clamp(88 + count * 12, 0, paperHeight - 22)), width: option.type === "logo" ? 60 : option.type === "qrVerification" ? 32 : option.type === "officerList" ? 38 : option.type === "horizontalLine" ? 160 : 150, height: option.type === "logo" ? 28 : option.type === "qrVerification" ? 32 : option.type === "officerList" ? 110 : option.type === "horizontalLine" ? 2 : option.type === "rectangle" ? 28 : 12, zIndex: 40 + count },
      style: { fontFamily: "Arial", fontSize: option.type === "heading" ? 16 : 11, align: option.type === "heading" ? "center" : "left", fontWeight: option.type === "heading" ? "bold" : "normal", borderColor: option.type === "rectangle" ? "#94a3b8" : undefined, borderWidth: option.type === "rectangle" ? 1 : undefined },
      image: option.type === "logo" ? { src: "{{tenant.logo}}", alt: "Tenant logo" } : undefined,
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
    if (!props.editable || block.locked || !block.position) return;
    event.stopPropagation();
    if (!selectedIds.includes(block.id)) select(block.id, event.shiftKey || event.metaKey || event.ctrlKey);
    dragRef.current = { mode, id: block.id, corner, startX: event.clientX, startY: event.clientY, origin: { ...block.position }, before: definition, moved: false };
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
    else resizePosition(next, dx, dy, drag.corner || "se", paperWidth, paperHeight, snap);
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
        <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" type="button" onClick={() => window.print()}><Printer className="size-4" /> Preview</button>
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

    <div className="grid min-h-[calc(100vh-132px)] bg-slate-100 xl:grid-cols-[236px_1fr_304px] print:block">
      <aside className="border-r border-slate-200 bg-white p-3 print:hidden">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Designer tools">{(["Elements", "Dynamic Fields", "Layers", "Pages"] as LeftTab[]).map((tab) => <button key={tab} type="button" role="tab" aria-selected={leftTab === tab} className={`rounded-md px-1 py-2 text-[10px] font-black ${leftTab === tab ? "bg-white text-pine-800 shadow-sm" : "text-slate-500"}`} onClick={() => setLeftTab(tab)}>{tab === "Dynamic Fields" ? "Fields" : tab}</button>)}</div>
        {leftTab === "Elements" && <div className="mt-4 grid grid-cols-2 gap-2">{elementOptions.map((option) => <button key={`${option.type}-${option.label}`} type="button" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-center text-[10px] font-bold text-slate-700 hover:border-pine-400 hover:bg-pine-50" onClick={() => addElement(option)} disabled={!props.editable}>{option.icon}<span>{option.label}</span></button>)}</div>}
        {leftTab === "Dynamic Fields" && <div className="mt-4 space-y-3"><label className="relative block"><span className="sr-only">Search dynamic fields</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input className="field pl-9 text-xs" value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} placeholder="Search fields" /></label>{filteredGroups.map((group) => <details key={group.group} open><summary className="cursor-pointer text-xs font-black text-pine-800">{group.group}</summary><div className="mt-2 space-y-1">{group.items.map((item) => <button key={item.key} type="button" draggable={props.editable} onDragStart={(event) => { event.dataTransfer.setData("text/hoahub-placeholder", item.key); }} onClick={() => insertField(item.key)} className="w-full rounded-md border border-slate-100 p-2 text-left hover:bg-slate-50"><span className="block text-[11px] font-bold">{item.label}</span><span className="block text-[9px] font-mono text-slate-400">[{item.label}]</span><span className="block truncate text-[9px] text-slate-500">{item.sample}</span></button>)}</div></details>)}{props.customPlaceholders.length > 0 && <details open><summary className="cursor-pointer text-xs font-black text-pine-800">Custom Tenant Fields</summary><div className="mt-2 space-y-1">{props.customPlaceholders.filter((item) => `${item.label} ${item.key} ${item.sample}`.toLowerCase().includes(fieldSearch.toLowerCase())).map((item) => <button key={item.key} type="button" draggable={props.editable} onDragStart={(event) => event.dataTransfer.setData("text/hoahub-placeholder", item.key)} onClick={() => insertField(item.key)} className="w-full rounded-md border border-slate-100 p-2 text-left hover:bg-slate-50"><span className="block text-[11px] font-bold">{item.label}</span><span className="block text-[9px] font-mono text-slate-400">[{item.label}]</span><span className="block truncate text-[9px] text-slate-500">{item.sample} · {item.dataType}</span></button>)}</div></details>}</div>}
        {leftTab === "Layers" && <div className="mt-4 space-y-1">{[...definition.blocks].sort((a, b) => (b.position?.zIndex || 0) - (a.position?.zIndex || 0)).map((block) => <button key={block.id} type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${selectedIds.includes(block.id) ? "bg-pine-800 text-white" : "hover:bg-slate-100"}`} onClick={() => select(block.id, false)}><span className="truncate flex-1">{block.label || block.type}</span>{block.locked ? <Lock className="size-3" /> : null}{block.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}</button>)}</div>}
        {leftTab === "Pages" && <PagePanel definition={definition} updatePage={(patch) => updateDefinition((draft) => ({ ...draft, page: { ...draft.page, ...patch } }))} />}
        <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Document outline</p>{(["header", "body", "footer"] as const).map((section) => <div key={section} className="mt-3"><p className="text-[10px] font-black uppercase text-pine-700">{section}</p>{definition.sections[section].map((block) => <button key={block.id} type="button" className="mt-1 block w-full truncate rounded px-2 py-1 text-left text-[11px] font-semibold hover:bg-slate-100" onClick={() => select(block.id)}>{block.label || block.type}</button>)}</div>)}</div>
      </aside>

      <main className="min-w-0 overflow-auto p-4 sm:p-7 print:p-0">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-3 flex items-center justify-between print:hidden"><div className="flex items-center gap-2 text-xs font-bold text-slate-600"><FileText className="size-4" /> {page.label} · {definition.page.orientation}</div><div className="text-[11px] font-bold text-slate-500">Drag to move · Double-click text to edit</div></div>
          <div className="overflow-auto rounded-xl border border-slate-300 bg-slate-200 p-8 shadow-inner print:overflow-visible print:border-0 print:bg-white print:p-0 print:shadow-none">
            <div className="relative mx-auto" style={{ width: paperWidth * scale, minHeight: paperHeight * scale }}>
              <div className="absolute -left-8 top-0 flex h-5 items-end text-[9px] font-mono text-slate-500 print:hidden">0&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;50&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;100&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;150&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;200</div>
              <div ref={canvasRef} className={`relative overflow-hidden bg-white shadow-xl ring-1 ring-slate-300 print:shadow-none print:ring-0 ${definition.page.canvas.showGrid ? "canvas-grid" : ""}`} style={{ width: paperWidth * scale, height: paperHeight * scale, backgroundColor: definition.page.backgroundColor, backgroundSize: `${definition.page.canvas.gridSize * scale}px ${definition.page.canvas.gridSize * scale}px` }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onDragOver={(event) => event.preventDefault()} onDrop={dropField} onClick={() => setSelectedIds([])}>
                <div className="pointer-events-none absolute border border-dashed border-pine-300" style={{ left: definition.page.margins.left * scale, top: definition.page.margins.top * scale, right: definition.page.margins.right * scale, bottom: definition.page.margins.bottom * scale }} />
                {definition.blocks.filter((block) => block.visible && block.position).sort((a, b) => (a.position?.zIndex || 0) - (b.position?.zIndex || 0)).map((block) => <CanvasBlock key={block.id} block={block as VisualBlock} selected={selectedIds.includes(block.id)} editing={editingId === block.id} editable={props.editable} scale={scale} onSelect={(event) => select(block.id, event.shiftKey || event.metaKey || event.ctrlKey)} onDoubleClick={() => isTextBlock(block) && setEditingId(block.id)} onChangeText={(content) => updateLive((draft) => mapBlocks(draft, (item) => item.id === block.id ? { ...item, content } : item))} onCommitText={(content) => { setEditingId(""); updateBlock(block.id, { content }); }} onPointerDown={beginDrag} onResizeStart={beginDrag} onImageUpload={() => { setImageBlockId(block.id); fileInputRef.current?.click(); }} />)}
                {!definition.blocks.length && <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-400">Add an element to start designing.</div>}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-slate-500 print:hidden"><span>Printable area</span><span className="h-3 w-5 border border-dashed border-pine-300" /><span>Grid {definition.page.canvas.gridSize}mm</span><button type="button" className="btn-secondary min-h-7 px-2 py-1 text-[10px]" onClick={() => updateDefinition((draft) => ({ ...draft, page: { ...draft.page, canvas: { ...draft.page.canvas, showGrid: !draft.page.canvas.showGrid } } }))}><Grid2X2 className="size-3" /> {definition.page.canvas.showGrid ? "Hide grid" : "Show grid"}</button></div>
        </div>
      </main>

      <aside className="border-l border-slate-200 bg-white p-4 print:hidden"><PropertiesPanel selected={selected} editable={props.editable} updateBlock={updateBlock} updateSelectedPatch={updateSelectedPatch} updatePositions={updatePositions} duplicate={duplicateSelected} remove={removeSelected} align={alignSelected} layerMove={layerMove} onImageUpload={() => { setImageBlockId(selected[0]?.id || ""); fileInputRef.current?.click(); }} />
        <ValidationPanel errors={validation.errors} blocks={definition.blocks} onSelect={select} />
      </aside>
    </div>
  </form>;
}

function CanvasBlock({ block, selected, editing, editable, scale, onSelect, onDoubleClick, onChangeText, onCommitText, onPointerDown, onResizeStart, onImageUpload }: { block: VisualBlock; selected: boolean; editing: boolean; editable: boolean; scale: number; onSelect: (event: React.MouseEvent) => void; onDoubleClick: () => void; onChangeText: (content: string) => void; onCommitText: (content: string) => void; onPointerDown: (event: React.PointerEvent, block: VisualBlock) => void; onResizeStart: (event: React.PointerEvent, block: VisualBlock, mode: "resize", corner: "nw" | "ne" | "sw" | "se") => void; onImageUpload: () => void }) {
  const [draft, setDraft] = useState(block.content || block.text || "");
  useEffect(() => { if (!editing) setDraft(block.content || block.text || ""); }, [block.content, block.text, editing]);
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
  const content = editing ? <textarea autoFocus className="h-full w-full resize-none border-0 bg-transparent p-0 text-inherit outline-none" value={draft} onChange={(event) => { const value = sanitizeText(event.target.value); setDraft(value); onChangeText(value); }} onBlur={() => onCommitText(draft)} onKeyDown={(event) => { if (event.key === "Escape") { setDraft(block.content || ""); onCommitText(block.content || ""); } }} /> : <BlockContent block={block} onImageUpload={onImageUpload} />;
  return <div role="button" tabIndex={0} aria-label={block.accessibility?.ariaLabel || block.label || block.type} className={`absolute select-none overflow-hidden ${selected ? "ring-2 ring-pine-600 ring-offset-1" : "hover:ring-1 hover:ring-pine-300"} ${block.locked ? "cursor-not-allowed opacity-75" : "cursor-move"}`} style={css} onClick={(event) => { event.stopPropagation(); onSelect(event); }} onDoubleClick={onDoubleClick} onPointerDown={(event) => { if ((event.target as HTMLElement).tagName !== "TEXTAREA") onPointerDown(event, block); }}>{content}{selected && editable && !block.locked && <>{(["nw", "ne", "sw", "se"] as const).map((corner) => <button key={corner} type="button" aria-label={`Resize ${corner}`} className={`absolute z-10 size-2.5 border border-white bg-pine-700 ${corner.includes("n") ? "top-[-5px]" : "bottom-[-5px]"} ${corner.includes("w") ? "left-[-5px]" : "right-[-5px]"}`} onPointerDown={(event) => { event.stopPropagation(); onResizeStart(event, block, "resize", corner); }} />)}</>}</div>;
}

function BlockContent({ block, onImageUpload }: { block: VisualBlock; onImageUpload: () => void }) {
  if (block.type === "rectangle") return null;
  if (block.type === "officerList") {
    const config = block.officerList;
    return <div className="h-full border-r border-pine-700 pr-1 text-pine-900"><div className="bg-pine-800 px-1 py-1 text-center text-[8px] font-black text-white">{config?.showHeading === false ? "" : config?.heading || "HOA OFFICERS"}</div>{config?.showTerm !== false && <p className="py-1 text-center text-[7px] font-black">[Current term]</p>}<div className="space-y-1 px-1 text-[7px]">{Array.from({ length: Math.min(config?.maxOfficers || 8, 4) }).map((_, index) => <div key={index} className={config?.showSeparators === false ? "" : "border-b border-slate-300 pb-1"}><strong className="block">[Active officer {index + 1}]</strong><span className="block font-bold uppercase">[Position]</span></div>)}</div></div>;
  }
  if (block.type === "horizontalLine" || block.type === "divider") return <div className="mt-1 h-px w-full bg-slate-500" />;
  if (block.type === "qrVerification") return <div className="flex h-full flex-col items-center justify-center gap-1 text-[8px] font-bold text-slate-500"><QrCode className="size-[65%]" /><span>Verification QR</span></div>;
  if (block.type === "logo" || block.type === "image") {
    const src = block.image?.src && !block.image.src.startsWith("{{") ? block.image.src : "";
    return src ? <img className="h-full w-full object-contain" src={src} alt={block.image?.alt || block.label || "Document image"} onError={onImageUpload} /> : <button type="button" className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-[9px] font-black text-slate-500" onClick={onImageUpload}><ImageIcon className="size-6" /><span>{block.type === "logo" ? "Tenant logo" : "Add image"}</span></button>;
  }
  if (block.table?.rows?.length) return <table className="w-full border-collapse text-[9px]"><tbody>{block.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-300 p-1">{renderFriendlyText(cell)}</td>)}</tr>)}</tbody></table>;
  const value = block.content || block.text || (block.binding ? `{{${block.binding}}}` : block.label || block.type);
  return <div className="whitespace-pre-wrap break-words">{renderFriendlyText(value)}</div>;
}

function PropertiesPanel({ selected, editable, updateBlock, updateSelectedPatch, updatePositions, duplicate, remove, align, layerMove, onImageUpload }: { selected: VisualBlock[]; editable: boolean; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void; updateSelectedPatch: (patch: Partial<DocumentTemplateBlock>) => void; updatePositions: (updater: (position: VisualBlock["position"]) => VisualBlock["position"]) => void; duplicate: () => void; remove: () => void; align: (kind: "left" | "center" | "right" | "top" | "middle" | "bottom") => void; layerMove: (direction: -1 | 1) => void; onImageUpload: () => void }) {
  const block = selected[0];
  if (!block) return <div className="text-sm text-slate-500"><Settings2 className="mb-2 size-5" /><p>Select an element to edit its properties.</p></div>;
  const position = block.position;
  const patchPosition = (key: keyof VisualBlock["position"], value: number) => updatePositions((current) => ({ ...current, [key]: value }));
  return <div className="space-y-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Properties</p><h2 className="mt-1 text-sm font-black">{block.label || block.type}</h2><p className="text-[10px] font-mono text-slate-400">{selected.length > 1 ? `+${selected.length - 1} selected` : block.type}</p></div><div className="flex gap-1"><IconAction label="Duplicate" onClick={duplicate}><Copy /></IconAction><IconAction label="Delete" onClick={remove}><Trash2 /></IconAction></div></div>
    <label><span className="label">Element name</span><input className="field text-xs" value={block.label || ""} onChange={(event) => updateSelectedPatch({ label: sanitizeText(event.target.value) })} disabled={!editable} /></label>
    <div><p className="label">Position and size (mm)</p><div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}><span className="sr-only">{key}</span><input className="field text-xs" type="number" min={0} step={1} value={Math.round(position[key] * 10) / 10} onChange={(event) => patchPosition(key, Number(event.target.value))} disabled={!editable || block.locked} aria-label={key} /></label>)}</div></div>
    <div className="grid grid-cols-2 gap-2"><label className="flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-bold"><input type="checkbox" checked={block.locked === true} onChange={(event) => updateSelectedPatch({ locked: event.target.checked })} disabled={!editable} /> Lock</label><label className="flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-bold"><input type="checkbox" checked={block.visible !== false} onChange={(event) => updateSelectedPatch({ visible: event.target.checked })} disabled={!editable} /> Visible</label></div>
    {block.type === "officerList" && <OfficerListSettings block={block} editable={editable} updateBlock={updateBlock} />}
    {isTextBlock(block) && <><label><span className="label">Text content</span><textarea className="field min-h-24 text-xs" value={block.content || block.text || ""} onChange={(event) => updateSelectedPatch({ content: sanitizeText(event.target.value) })} disabled={!editable} /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Font</span><select className="field text-xs" value={block.style?.fontFamily || "Arial"} onChange={(event) => updateBlock(block.id, { style: { ...block.style, fontFamily: event.target.value as typeof safeFontFamilies[number] } })} disabled={!editable}>{safeFontFamilies.map((font) => <option key={font}>{font}</option>)}</select></label><label><span className="label">Size</span><input className="field text-xs" type="number" min={6} max={72} value={block.style?.fontSize || 11} onChange={(event) => updateBlock(block.id, { style: { ...block.style, fontSize: Number(event.target.value) } })} disabled={!editable} /></label></div><div className="flex gap-1"><IconAction label="Left" active={block.style?.align === "left"} onClick={() => updateBlock(block.id, { style: { ...block.style, align: "left" } })}><AlignLeft /></IconAction><IconAction label="Center" active={block.style?.align === "center"} onClick={() => updateBlock(block.id, { style: { ...block.style, align: "center" } })}><AlignCenter /></IconAction><IconAction label="Right" active={block.style?.align === "right"} onClick={() => updateBlock(block.id, { style: { ...block.style, align: "right" } })}><AlignRight /></IconAction><IconAction label="Bold" active={block.style?.fontWeight === "bold"} onClick={() => updateBlock(block.id, { style: { ...block.style, fontWeight: block.style?.fontWeight === "bold" ? "normal" : "bold" } })}><Bold /></IconAction></div></>}
    <div><p className="label">Align to page</p><div className="grid grid-cols-3 gap-1"><SmallButton label="Left" onClick={() => align("left")}><AlignLeft /></SmallButton><SmallButton label="Center" onClick={() => align("center")}><AlignCenter /></SmallButton><SmallButton label="Right" onClick={() => align("right")}><AlignRight /></SmallButton><SmallButton label="Top" onClick={() => align("top")}><ChevronUp /></SmallButton><SmallButton label="Middle" onClick={() => align("middle")}><Minus /></SmallButton><SmallButton label="Bottom" onClick={() => align("bottom")}><ChevronDown /></SmallButton></div></div>
    <div><p className="label">Layer order</p><div className="flex gap-1"><SmallButton label="Forward" onClick={() => layerMove(1)}><MoveUp /></SmallButton><SmallButton label="Backward" onClick={() => layerMove(-1)}><MoveDown /></SmallButton></div></div>
    {(block.type === "logo" || block.type === "image") && <button type="button" className="btn-secondary w-full text-xs" onClick={onImageUpload} disabled={!editable}><ImageIcon className="size-4" /> Upload approved image</button>}
    {block.binding && <div className="rounded-lg bg-pine-50 p-3 text-xs"><p className="font-black text-pine-800">Dynamic binding</p><p className="mt-1 font-mono text-pine-700">[{placeholderLabel(block.binding)}]</p><p className="mt-1 text-pine-700">Sample: {sampleTemplateValue(block.binding)}</p></div>}
  </div>;
}

function OfficerListSettings({ block, editable, updateBlock }: { block: VisualBlock; editable: boolean; updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void }) {
  const config = block.officerList || defaultOfficerListConfig;
  const update = (patch: Partial<DocumentOfficerListConfig>) => updateBlock(block.id, { officerList: { ...config, ...patch } });
  return <section className="space-y-3 rounded-lg border border-pine-100 bg-pine-50 p-3"><div><p className="text-xs font-black text-pine-900">HOA officer list</p><p className="mt-1 text-[10px] text-pine-800">Trusted source: active officers from this tenant.</p></div><label><span className="label">Heading</span><input className="field text-xs" value={config.heading} onChange={(event) => update({ heading: sanitizeText(event.target.value) })} disabled={!editable} /></label><label><span className="label">Role filters</span><input className="field text-xs" value={config.roleFilters.join(", ")} onChange={(event) => update({ roleFilters: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="All active roles" disabled={!editable} /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Sort by</span><select className="field text-xs" value={config.sortBy} onChange={(event) => update({ sortBy: event.target.value as DocumentOfficerListConfig["sortBy"] })} disabled={!editable}><option value="displayOrder">Display order</option><option value="position">Position</option><option value="fullName">Name</option></select></label><label><span className="label">Max count</span><input className="field text-xs" type="number" min={1} max={30} value={config.maxOfficers} onChange={(event) => update({ maxOfficers: Number(event.target.value) })} disabled={!editable} /></label></div><label><span className="label">Term label</span><input className="field text-xs" value={config.termLabel} onChange={(event) => update({ termLabel: sanitizeText(event.target.value) })} placeholder="Optional prefix" disabled={!editable} /></label><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={config.showHeading} onChange={(event) => update({ showHeading: event.target.checked })} disabled={!editable} /> Heading</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={config.showTerm} onChange={(event) => update({ showTerm: event.target.checked })} disabled={!editable} /> Current term</label><label className="flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={config.showSeparators} onChange={(event) => update({ showSeparators: event.target.checked })} disabled={!editable} /> Separators</label></div><div className="grid grid-cols-2 gap-2"><label><span className="label">Background</span><input className="h-9 w-full" type="color" value={block.style?.backgroundColor || "#ffffff"} onChange={(event) => updateBlock(block.id, { style: { ...block.style, backgroundColor: event.target.value } })} disabled={!editable} /></label><label><span className="label">Border</span><input className="h-9 w-full" type="color" value={block.style?.borderColor || "#0b2a63"} onChange={(event) => updateBlock(block.id, { style: { ...block.style, borderColor: event.target.value, borderWidth: 1 } })} disabled={!editable} /></label></div></section>;
}

function PagePanel({ definition, updatePage }: { definition: DocumentTemplateDefinition; updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void }) {
  return <div className="mt-4 space-y-3"><p className="text-xs font-black text-slate-700">Page setup</p><label><span className="label">Paper</span><select className="field text-xs" value={definition.page.format} onChange={(event) => updatePage({ format: event.target.value as DocumentPageFormat })}><option value="A4">A4</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option></select></label><label><span className="label">Orientation</span><select className="field text-xs" value={definition.page.orientation} onChange={(event) => updatePage({ orientation: event.target.value as "portrait" | "landscape" })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label><span className="label">Grid size (mm)</span><input className="field text-xs" type="number" min={1} max={20} value={definition.page.canvas.gridSize} onChange={(event) => updatePage({ canvas: { ...definition.page.canvas, gridSize: Number(event.target.value) } })} /></label><label className="flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-bold"><input type="checkbox" checked={definition.page.canvas.snapToGrid} onChange={(event) => updatePage({ canvas: { ...definition.page.canvas, snapToGrid: event.target.checked } })} /> Snap to grid</label></div>;
}

function ValidationPanel({ errors, blocks, onSelect }: { errors: string[]; blocks: DocumentTemplateBlock[]; onSelect: (id: string) => void }) {
  return <section className="mt-6 border-t border-slate-200 pt-4" aria-labelledby="template-validation"><div className="flex items-center justify-between"><h2 id="template-validation" className="text-xs font-black uppercase tracking-wide text-slate-600">Validation</h2><span className={`rounded-full px-2 py-1 text-[10px] font-black ${errors.length ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{errors.length ? `${errors.length} issue${errors.length === 1 ? "" : "s"}` : "Ready"}</span></div>{errors.length ? <div className="mt-3 space-y-2">{errors.map((error) => <button key={error} type="button" className="block w-full rounded-lg bg-rose-50 p-2 text-left text-[11px] font-semibold text-rose-800" onClick={() => { const block = blocks.find((item) => error.includes(item.id) || error.includes(item.label || "\u0000")); if (block) onSelect(block.id); }}>{error}</button>)}</div> : <p className="mt-2 text-[11px] text-slate-500">No unresolved placeholders or printable-boundary errors.</p>}</section>;
}

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) { return <button type="button" title={label} aria-label={label} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" onClick={onClick} disabled={disabled}>{children}</button>; }
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

function resizePosition(position: VisualBlock["position"], dx: number, dy: number, corner: "nw" | "ne" | "sw" | "se", pageWidth: number, pageHeight: number, snap: (value: number) => number) {
  let { x, y, width, height } = position;
  if (corner.includes("e")) width = snap(width + dx); else { x = snap(x + dx); width = snap(width - dx); }
  if (corner.includes("s")) height = snap(height + dy); else { y = snap(y + dy); height = snap(height - dy); }
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
function isTextBlock(block: DocumentTemplateBlock) { return !["logo", "image", "qrVerification", "rectangle", "horizontalLine", "divider", "table", "officerList"].includes(block.type); }
function defaultContent(type: DocumentTemplateBlockType) { return type === "documentTitle" || type === "heading" ? "Document heading" : type === "paragraph" || type === "bodyText" ? "Type your official HOA wording here." : type === "horizontalLine" ? "" : type === "verificationText" ? "Verify this document at {{verification.url}}" : type === "documentNumber" ? "Document No. {{document.number}}" : type === "issueDate" ? "Issued on {{document.issueDate}}" : "Type to edit"; }
function placeholderLabel(key: string) { return placeholderGroups.flatMap((group) => group.items).find((item) => item.key === key)?.label || key; }
function renderFriendlyText(value: string): React.ReactNode { return value.split(/(\{\{\s*[A-Za-z0-9_.]+\s*\}\})/g).map((part, index) => { const match = part.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/); return match ? <span key={index} className="mx-0.5 inline-flex rounded bg-pine-100 px-1 text-[.8em] font-bold text-pine-800">[{placeholderLabel(match[1])}]</span> : <span key={index}>{part}</span>; }); }
