"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type React from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FileText,
  Highlighter,
  ImageIcon,
  Italic,
  LayoutTemplate,
  List,
  ListOrdered,
  Palette,
  Pilcrow,
  Printer,
  QrCode,
  Redo2,
  Save,
  ScanLine,
  Settings2,
  Signature,
  Table2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import {
  allowedDocumentPlaceholders,
  normalizeTemplateDefinition,
  placeholderGroups,
  sampleTemplateValue,
  safeFontFamilies,
  validateTemplateDefinition,
  type AllowedDocumentPlaceholder,
  type DocumentPageFormat,
  type DocumentPageOrientation,
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
};

const ribbonTabs = ["Home", "Insert", "Layout", "Table", "Header/Footer", "Dynamic Fields", "Review"] as const;
const pageSizes: Record<DocumentPageFormat, { width: number; height: number; label: string }> = {
  A4: { width: 210, height: 297, label: "A4" },
  LETTER: { width: 216, height: 279, label: "Letter" },
  LEGAL: { width: 216, height: 356, label: "Legal" },
};
const marginPresets = {
  normal: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  moderate: { top: 19, right: 19, bottom: 19, left: 19 },
  wide: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
};

export function ProfessionalDocumentTemplateEditor(props: Props) {
  const [definition, setDefinition] = useState(() => normalizeTemplateDefinition(props.template, props.title));
  const [selectedBlockId, setSelectedBlockId] = useState(definition.sections.body[0]?.id || definition.blocks[0]?.id || "");
  const [activeTab, setActiveTab] = useState<(typeof ribbonTabs)[number]>("Home");
  const [sidePanel, setSidePanel] = useState<"properties" | "fields" | "review">("properties");
  const [zoom, setZoom] = useState(82);
  const [imageBlockId, setImageBlockId] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validation = useMemo(() => validateTemplateDefinition(definition), [definition]);
  const selected = definition.blocks.find((block) => block.id === selectedBlockId) || definition.blocks[0];
  const page = pageSizes[definition.page.format];
  const paperWidth = definition.page.orientation === "landscape" ? page.height : page.width;
  const paperHeight = definition.page.orientation === "landscape" ? page.width : page.height;

  function updateTemplate(updater: (draft: DocumentTemplateDefinition) => DocumentTemplateDefinition) {
    setDefinition((current) => normalizeTemplateDefinition(updater(structuredClone(current)), props.title));
  }

  function updatePage(patch: Partial<DocumentTemplateDefinition["page"]>) {
    updateTemplate((draft) => ({ ...draft, page: { ...draft.page, ...patch } }));
  }

  function updateBlock(id: string, patch: Partial<DocumentTemplateBlock>) {
    updateTemplate((draft) => {
      const sections = mapBlocks(draft, (block) => block.id === id ? { ...block, ...patch } : block);
      return { ...draft, sections };
    });
  }

  function updateBlockStyle(id: string, style: NonNullable<DocumentTemplateBlock["style"]>) {
    updateTemplate((draft) => {
      const sections = mapBlocks(draft, (block) => block.id === id ? { ...block, style: { ...block.style, ...style } } : block);
      return { ...draft, sections };
    });
  }

  function addBlock(type: DocumentTemplateBlockType, section: DocumentTemplateSectionName = "body") {
    const block: DocumentTemplateBlock = {
      id: `block-${uniqueId()}`,
      type,
      section,
      label: readableBlockType(type),
      content: defaultContentForBlock(type),
      binding: defaultBindingForBlock(type),
      order: (definition.sections[section].length + 1) * 10,
      visible: true,
      style: { fontFamily: "Arial", fontSize: type === "documentTitle" ? 18 : 12, align: type === "documentTitle" ? "center" : "left" },
      table: type === "table" ? { rows: [["Label", "Value"], ["", ""]] } : undefined,
      image: type === "logo" ? { src: "{{tenant.logo}}", alt: "Tenant logo", width: 72, height: 72 } : undefined,
    };
    updateTemplate((draft) => ({ ...draft, sections: { ...draft.sections, [section]: renumber([...draft.sections[section], block]) } }));
    setSelectedBlockId(block.id);
  }

  function moveBlock(id: string, direction: -1 | 1) {
    updateTemplate((draft) => {
      const block = draft.blocks.find((item) => item.id === id);
      if (!block) return draft;
      const blocks = [...draft.sections[block.section]];
      const index = blocks.findIndex((item) => item.id === id);
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return draft;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...draft, sections: { ...draft.sections, [block.section]: renumber(blocks) } };
    });
  }

  function removeBlock(id: string) {
    updateTemplate((draft) => {
      const block = draft.blocks.find((item) => item.id === id);
      if (!block) return draft;
      const remaining = draft.sections[block.section].filter((item) => item.id !== id);
      const next = { ...draft, sections: { ...draft.sections, [block.section]: renumber(remaining) } };
      const nextBlocks = normalizeTemplateDefinition(next, props.title).blocks;
      setSelectedBlockId(nextBlocks[0]?.id || "");
      return next;
    });
  }

  function insertPlaceholder(placeholder: AllowedDocumentPlaceholder) {
    if (!selected) return;
    const current = selected.content ?? selected.text ?? "";
    updateBlock(selected.id, { content: `${current}${current.endsWith(" ") || !current ? "" : " "}{{${placeholder}}}` });
    setSidePanel("properties");
  }

  function applyMarginPreset(name: keyof typeof marginPresets) {
    updatePage({ marginPreset: name, margins: marginPresets[name] });
  }

  function setTableCell(block: DocumentTemplateBlock, rowIndex: number, cellIndex: number, value: string) {
    const rows = block.table?.rows ? block.table.rows.map((row) => [...row]) : [[""]];
    rows[rowIndex][cellIndex] = value;
    updateBlock(block.id, { table: { rows } });
  }

  function addTableRow(block: DocumentTemplateBlock) {
    const rows = block.table?.rows || [[""]];
    updateBlock(block.id, { table: { rows: [...rows, Array(rows[0]?.length || 2).fill("")] } });
  }

  function addTableColumn(block: DocumentTemplateBlock) {
    const rows = block.table?.rows || [[""]];
    updateBlock(block.id, { table: { rows: rows.map((row) => [...row, ""]) } });
  }

  function queueImageUpload(block: DocumentTemplateBlock) {
    setImageBlockId(block.id);
    fileInputRef.current?.click();
  }

  return <form action={props.action} className="space-y-0" onSubmit={() => startTransition(() => undefined)}>
    <input type="hidden" name="definitionId" value={props.definitionId} />
    <input type="hidden" name="versionId" value={props.versionId} />
    <input type="hidden" name="loadedUpdatedAt" value={props.updatedAt} />
    <input type="hidden" name="templateDefinitionJson" value={JSON.stringify(definition)} />
    <input type="hidden" name="imageUploadBlockId" value={imageBlockId} />
    <input ref={fileInputRef} className="sr-only" type="file" name="imageFile" accept="image/png,image/jpeg,image/webp" aria-label="Upload template image" />
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-pine-700">Professional Template Editor</p>
          <h1 className="truncate text-xl font-black text-slate-950">{props.title}</h1>
          <p className="text-xs font-bold text-slate-500">{props.code} | {props.status.replaceAll("_", " ")} | {validation.valid ? "Ready to save" : `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary min-h-10 px-3 py-2 text-sm" href={props.documentManagementHref}>Document Management</a>
          <a className="btn-secondary min-h-10 px-3 py-2 text-sm" href={props.templateWorkspaceHref}>Versions</a>
          <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Preview print</button>
          {props.editable ? <><button className="btn-secondary min-h-10 px-3 py-2 text-sm" name="operation" value="saveDraft" disabled={isPending}><Save className="h-4 w-4" aria-hidden /> Save Draft</button><button className="btn-primary min-h-10 px-3 py-2 text-sm" name="operation" value="publish" disabled={isPending || !validation.valid}>Publish</button></> : <span className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">Published versions are immutable</span>}
        </div>
      </div>
      <div className="overflow-x-auto border-t border-slate-100 px-4">
        <div className="flex min-w-max gap-1 py-2" role="tablist" aria-label="Editor ribbon">
          {ribbonTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={`rounded-lg px-3 py-2 text-xs font-black ${activeTab === tab ? "bg-pine-800 text-white" : "text-slate-700 hover:bg-slate-100"}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto border-t border-slate-100 px-4 py-3">
        <Ribbon activeTab={activeTab} selected={selected} editable={props.editable} definition={definition} updateBlockStyle={updateBlockStyle} addBlock={addBlock} updatePage={updatePage} applyMarginPreset={applyMarginPreset} insertPlaceholder={insertPlaceholder} setSidePanel={setSidePanel} queueImageUpload={queueImageUpload} />
      </div>
    </div>

    <div className="grid min-h-[calc(100vh-220px)] gap-0 bg-slate-100 xl:grid-cols-[240px_1fr_320px]">
      <aside className="border-r border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-black uppercase text-slate-500">Document Outline</h2>
        {(["header", "body", "footer"] as const).map((section) => <div key={section} className="mb-4">
          <p className="mb-2 text-xs font-black uppercase text-pine-700">{section === "body" ? "Page Body" : section}</p>
          <div className="space-y-1">{definition.sections[section].map((block) => <button key={block.id} type="button" className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold ${selectedBlockId === block.id ? "bg-pine-800 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`} onClick={() => setSelectedBlockId(block.id)}>{block.label || readableBlockType(block.type)}{!block.visible ? " (hidden)" : ""}</button>)}</div>
        </div>)}
      </aside>

      <main className="overflow-auto p-4 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600"><FileText className="h-4 w-4" aria-hidden /> {page.label} {definition.page.orientation}</div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary min-h-8 px-2 py-1 text-xs" onClick={() => setZoom((value) => Math.max(50, value - 10))}>-</button>
            <span className="text-xs font-black text-slate-500">{zoom}%</span>
            <button type="button" className="btn-secondary min-h-8 px-2 py-1 text-xs" onClick={() => setZoom((value) => Math.min(130, value + 10))}>+</button>
          </div>
        </div>
        <div className="mx-auto origin-top overflow-visible" style={{ width: `${paperWidth * (zoom / 100) * 3.6}px`, maxWidth: "100%" }}>
          <article className="relative mx-auto bg-white text-slate-950 shadow-xl ring-1 ring-slate-200 print:shadow-none print:ring-0" style={{ width: `${paperWidth * (zoom / 100) * 3.6}px`, minHeight: `${paperHeight * (zoom / 100) * 3.6}px`, backgroundColor: definition.page.backgroundColor, border: definition.page.border.enabled ? `${definition.page.border.width}px ${definition.page.border.style} ${definition.page.border.color}` : undefined }}>
            {definition.page.watermark.enabled && definition.page.watermark.text && <div className="pointer-events-none absolute inset-0 flex rotate-[-32deg] items-center justify-center text-6xl font-black uppercase text-slate-300" style={{ opacity: definition.page.watermark.opacity }}>{definition.page.watermark.text}</div>}
            <div style={{ paddingTop: mm(definition.page.margins.top, zoom), paddingRight: mm(definition.page.margins.right, zoom), paddingBottom: mm(definition.page.margins.bottom, zoom), paddingLeft: mm(definition.page.margins.left, zoom) }}>
              <TemplateSection blocks={definition.sections.header} selectedId={selectedBlockId} onSelect={setSelectedBlockId} />
              <div className="my-5 min-h-[420px]" style={{ columnCount: definition.page.columns.count, columnGap: mm(definition.page.columns.gap, zoom) }}>
                <TemplateSection blocks={definition.sections.body} selectedId={selectedBlockId} onSelect={setSelectedBlockId} />
              </div>
              <TemplateSection blocks={definition.sections.footer} selectedId={selectedBlockId} onSelect={setSelectedBlockId} />
            </div>
          </article>
        </div>
      </main>

      <aside className="border-l border-slate-200 bg-white p-4">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" className={`rounded-lg px-2 py-2 text-xs font-black ${sidePanel === "properties" ? "bg-white shadow-sm" : ""}`} onClick={() => setSidePanel("properties")}>Properties</button>
          <button type="button" className={`rounded-lg px-2 py-2 text-xs font-black ${sidePanel === "fields" ? "bg-white shadow-sm" : ""}`} onClick={() => setSidePanel("fields")}>Fields</button>
          <button type="button" className={`rounded-lg px-2 py-2 text-xs font-black ${sidePanel === "review" ? "bg-white shadow-sm" : ""}`} onClick={() => setSidePanel("review")}>Review</button>
        </div>
        {sidePanel === "properties" && selected && <PropertiesPanel block={selected} editable={props.editable} updateBlock={updateBlock} updateBlockStyle={updateBlockStyle} moveBlock={moveBlock} removeBlock={removeBlock} setTableCell={setTableCell} addTableRow={addTableRow} addTableColumn={addTableColumn} queueImageUpload={queueImageUpload} />}
        {sidePanel === "fields" && <PlaceholderPanel insertPlaceholder={insertPlaceholder} />}
        {sidePanel === "review" && <ReviewPanel validation={validation} definition={definition} />}
      </aside>
    </div>
  </form>;
}

function Ribbon({ activeTab, selected, editable, definition, updateBlockStyle, addBlock, updatePage, applyMarginPreset, insertPlaceholder, setSidePanel, queueImageUpload }: {
  activeTab: string;
  selected?: DocumentTemplateBlock;
  editable: boolean;
  definition: DocumentTemplateDefinition;
  updateBlockStyle: (id: string, style: NonNullable<DocumentTemplateBlock["style"]>) => void;
  addBlock: (type: DocumentTemplateBlockType, section?: DocumentTemplateSectionName) => void;
  updatePage: (patch: Partial<DocumentTemplateDefinition["page"]>) => void;
  applyMarginPreset: (name: keyof typeof marginPresets) => void;
  insertPlaceholder: (placeholder: AllowedDocumentPlaceholder) => void;
  setSidePanel: (panel: "properties" | "fields" | "review") => void;
  queueImageUpload: (block: DocumentTemplateBlock) => void;
}) {
  if (!selected) return null;
  const disabled = !editable;
  if (activeTab === "Home") return <RibbonGroup>
    <SelectTool label="Font" value={selected.style?.fontFamily || "Arial"} onChange={(value) => updateBlockStyle(selected.id, { fontFamily: value as typeof safeFontFamilies[number] })} disabled={disabled}>{safeFontFamilies.map((font) => <option key={font} value={font}>{font}</option>)}</SelectTool>
    <NumberTool label="Size" value={selected.style?.fontSize || 12} min={6} max={72} onChange={(fontSize) => updateBlockStyle(selected.id, { fontSize })} disabled={disabled} />
    <IconButton label="Bold" active={selected.style?.fontWeight === "bold"} onClick={() => updateBlockStyle(selected.id, { fontWeight: selected.style?.fontWeight === "bold" ? "normal" : "bold" })} disabled={disabled}><Bold /></IconButton>
    <IconButton label="Italic" active={selected.style?.italic} onClick={() => updateBlockStyle(selected.id, { italic: !selected.style?.italic })} disabled={disabled}><Italic /></IconButton>
    <IconButton label="Underline" active={selected.style?.underline} onClick={() => updateBlockStyle(selected.id, { underline: !selected.style?.underline })} disabled={disabled}><Underline /></IconButton>
    <IconButton label="Left align" active={selected.style?.align === "left"} onClick={() => updateBlockStyle(selected.id, { align: "left" })} disabled={disabled}><AlignLeft /></IconButton>
    <IconButton label="Center align" active={selected.style?.align === "center"} onClick={() => updateBlockStyle(selected.id, { align: "center" })} disabled={disabled}><AlignCenter /></IconButton>
    <IconButton label="Right align" active={selected.style?.align === "right"} onClick={() => updateBlockStyle(selected.id, { align: "right" })} disabled={disabled}><AlignRight /></IconButton>
    <IconButton label="Justify" active={selected.style?.align === "justify"} onClick={() => updateBlockStyle(selected.id, { align: "justify" })} disabled={disabled}><AlignJustify /></IconButton>
    <ColorTool label="Text" value={selected.style?.textColor || "#111827"} onChange={(textColor) => updateBlockStyle(selected.id, { textColor })} disabled={disabled} />
    <ColorTool label="Highlight" value={selected.style?.highlightColor || "#ffffff"} onChange={(highlightColor) => updateBlockStyle(selected.id, { highlightColor })} disabled={disabled} icon={<Highlighter />} />
  </RibbonGroup>;
  if (activeTab === "Insert") return <RibbonGroup>
    <ToolButton label="Text" onClick={() => addBlock("bodyText")} disabled={disabled}><Pilcrow /></ToolButton>
    <ToolButton label="Text box" onClick={() => addBlock("textBox")} disabled={disabled}><Type /></ToolButton>
    <ToolButton label="Table" onClick={() => addBlock("table")} disabled={disabled}><Table2 /></ToolButton>
    <ToolButton label="Line" onClick={() => addBlock("horizontalLine")} disabled={disabled}><ScanLine /></ToolButton>
    <ToolButton label="Image" onClick={() => addBlock("image")} disabled={disabled}><ImageIcon /></ToolButton>
    <ToolButton label="Tenant logo" onClick={() => addBlock("logo", "header")} disabled={disabled}><ImageIcon /></ToolButton>
    <ToolButton label="Signature" onClick={() => addBlock("signature")} disabled={disabled}><Signature /></ToolButton>
    <ToolButton label="QR" onClick={() => addBlock("qrVerification", "footer")} disabled={disabled}><QrCode /></ToolButton>
    {selected.type === "image" && <ToolButton label="Upload image" onClick={() => queueImageUpload(selected)} disabled={disabled}><ImageIcon /></ToolButton>}
  </RibbonGroup>;
  if (activeTab === "Layout") return <RibbonGroup>
    <SelectTool label="Size" value={definition.page.format} onChange={(format) => updatePage({ format: format as DocumentPageFormat })} disabled={disabled}>{Object.keys(pageSizes).map((format) => <option key={format} value={format}>{pageSizes[format as DocumentPageFormat].label}</option>)}</SelectTool>
    <SelectTool label="Orientation" value={definition.page.orientation} onChange={(orientation) => updatePage({ orientation: orientation as DocumentPageOrientation })} disabled={disabled}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></SelectTool>
    <SelectTool label="Margins" value={definition.page.marginPreset} onChange={(preset) => preset === "custom" ? updatePage({ marginPreset: "custom" }) : applyMarginPreset(preset as keyof typeof marginPresets)} disabled={disabled}><option value="normal">Normal</option><option value="narrow">Narrow</option><option value="moderate">Moderate</option><option value="wide">Wide</option><option value="custom">Custom</option></SelectTool>
    <SelectTool label="Columns" value={String(definition.page.columns.count)} onChange={(count) => updatePage({ columns: { ...definition.page.columns, count: Number(count) as 1 | 2 | 3 } })} disabled={disabled}><option value="1">One</option><option value="2">Two</option><option value="3">Three</option></SelectTool>
    <ColorTool label="Page" value={definition.page.backgroundColor} onChange={(backgroundColor) => updatePage({ backgroundColor })} disabled={disabled} icon={<Palette />} />
  </RibbonGroup>;
  if (activeTab === "Table") return <RibbonGroup>
    <ToolButton label="Insert table" onClick={() => addBlock("table")} disabled={disabled}><Table2 /></ToolButton>
    <ToolButton label="Bullet list" onClick={() => updateBlockStyle(selected.id, { listStyle: selected.style?.listStyle === "bullet" ? "none" : "bullet" })} disabled={disabled}><List /></ToolButton>
    <ToolButton label="Number list" onClick={() => updateBlockStyle(selected.id, { listStyle: selected.style?.listStyle === "number" ? "none" : "number" })} disabled={disabled}><ListOrdered /></ToolButton>
  </RibbonGroup>;
  if (activeTab === "Header/Footer") return <RibbonGroup>
    <ToolButton label="Header text" onClick={() => addBlock("text", "header")} disabled={disabled}><LayoutTemplate /></ToolButton>
    <ToolButton label="Footer text" onClick={() => addBlock("footer", "footer")} disabled={disabled}><LayoutTemplate /></ToolButton>
    <NumberTool label="Header mm" value={definition.page.headerDistance} min={0} max={40} onChange={(headerDistance) => updatePage({ headerDistance })} disabled={disabled} />
    <NumberTool label="Footer mm" value={definition.page.footerDistance} min={0} max={40} onChange={(footerDistance) => updatePage({ footerDistance })} disabled={disabled} />
  </RibbonGroup>;
  if (activeTab === "Dynamic Fields") return <RibbonGroup>
    <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm font-black" onClick={() => setSidePanel("fields")}>Open field picker</button>
    {allowedDocumentPlaceholders.slice(0, 8).map((placeholder) => <button key={placeholder} type="button" className="rounded-xl border bg-white px-3 py-2 text-xs font-bold" onClick={() => insertPlaceholder(placeholder)} disabled={disabled}>{placeholder}</button>)}
  </RibbonGroup>;
  return <RibbonGroup>
    <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm font-black" onClick={() => setSidePanel("review")}><Settings2 className="mr-2 inline h-4 w-4" /> Validate</button>
    <span className={`rounded-xl px-3 py-2 text-xs font-black ${validateTemplateDefinition(definition).valid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{validateTemplateDefinition(definition).valid ? "No blocking issues" : "Needs attention"}</span>
    <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm font-black opacity-60" disabled><Undo2 className="mr-2 inline h-4 w-4" /> Undo</button>
    <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm font-black opacity-60" disabled><Redo2 className="mr-2 inline h-4 w-4" /> Redo</button>
  </RibbonGroup>;
}

function TemplateSection({ blocks, selectedId, onSelect }: { blocks: DocumentTemplateBlock[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="space-y-3">{blocks.filter((block) => block.visible).map((block) => <button key={block.id} type="button" onClick={() => onSelect(block.id)} className={`block w-full rounded-sm border text-left transition ${selectedId === block.id ? "border-pine-600 bg-pine-50/50 ring-2 ring-pine-200" : "border-transparent hover:border-slate-200"}`} style={{ padding: block.style?.padding, marginTop: block.style?.margin, marginBottom: block.style?.paragraphSpacing }}>
    <PreviewBlock block={block} />
  </button>)}</div>;
}

function PreviewBlock({ block }: { block: DocumentTemplateBlock }) {
  const text = replaceSampleValues(block.content ?? block.text ?? (block.binding ? `{{${block.binding}}}` : block.label || readableBlockType(block.type)));
  const style = {
    textAlign: block.style?.align,
    fontFamily: block.style?.fontFamily,
    fontSize: block.style?.fontSize ? `${block.style.fontSize}px` : undefined,
    fontWeight: block.style?.fontWeight,
    fontStyle: block.style?.italic ? "italic" : undefined,
    textDecoration: [block.style?.underline ? "underline" : "", block.style?.strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
    color: block.style?.textColor,
    backgroundColor: block.style?.highlightColor || block.style?.backgroundColor,
    lineHeight: block.style?.lineHeight,
    paddingLeft: block.style?.indent,
  } as React.CSSProperties;
  if (block.type === "spacer") return <div style={{ height: block.style?.height || 24 }} />;
  if (block.type === "divider" || block.type === "horizontalLine") return <hr className="border-slate-400" />;
  if (block.type === "verticalLine") return <div className="mx-auto h-16 w-px bg-slate-400" />;
  if (block.type === "pageBreak") return <div className="border-y border-dashed border-slate-300 py-2 text-center text-xs font-bold text-slate-500">Page break</div>;
  if (block.type === "logo" || block.type === "image") return <div className={block.style?.align === "center" ? "text-center" : block.style?.align === "right" ? "text-right" : ""}>{block.image?.src && block.image.src !== "{{tenant.logo}}" ? <img src={block.image.src} alt={block.image.alt || readableBlockType(block.type)} className="inline-block max-h-24 max-w-32 object-contain" /> : <div className="inline-flex h-16 w-16 items-center justify-center rounded border border-slate-300 bg-slate-50 text-xs font-bold text-slate-500">Logo</div>}</div>;
  if (block.type === "qrVerification") return <div className={block.style?.align === "center" ? "text-center" : ""}><div className="inline-flex h-20 w-20 items-center justify-center border border-slate-400 text-xs font-bold">QR</div><p className="mt-1 text-xs">{replaceSampleValues("{{verification.code}}")}</p></div>;
  if (block.type === "signature") return <div style={style}><div className="mb-1 mt-10 inline-block min-w-52 border-t border-slate-700 pt-1">{text}</div></div>;
  if (block.type === "table") return <table className="w-full border-collapse text-sm" style={style}><tbody>{(block.table?.rows || [["Label", "Value"]]).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="border border-slate-300 px-2 py-1">{replaceSampleValues(cell)}</td>)}</tr>)}</tbody></table>;
  return <p className="whitespace-pre-wrap" style={style}>{text}</p>;
}

function PropertiesPanel({ block, editable, updateBlock, updateBlockStyle, moveBlock, removeBlock, setTableCell, addTableRow, addTableColumn, queueImageUpload }: {
  block: DocumentTemplateBlock;
  editable: boolean;
  updateBlock: (id: string, patch: Partial<DocumentTemplateBlock>) => void;
  updateBlockStyle: (id: string, style: NonNullable<DocumentTemplateBlock["style"]>) => void;
  moveBlock: (id: string, direction: -1 | 1) => void;
  removeBlock: (id: string) => void;
  setTableCell: (block: DocumentTemplateBlock, rowIndex: number, cellIndex: number, value: string) => void;
  addTableRow: (block: DocumentTemplateBlock) => void;
  addTableColumn: (block: DocumentTemplateBlock) => void;
  queueImageUpload: (block: DocumentTemplateBlock) => void;
}) {
  return <div className="space-y-4">
    <div><h2 className="font-black">{block.label || readableBlockType(block.type)}</h2><p className="text-xs font-bold text-slate-500">{block.section} | {block.type}</p></div>
    <Field label="Label"><input className="field" value={block.label || ""} onChange={(event) => updateBlock(block.id, { label: event.target.value })} disabled={!editable} /></Field>
    <Field label="Content"><textarea className="field min-h-32" value={block.content ?? block.text ?? ""} onChange={(event) => updateBlock(block.id, { content: event.target.value })} disabled={!editable} /></Field>
    <Field label="Placeholder binding"><select className="field" value={block.binding || ""} onChange={(event) => updateBlock(block.id, { binding: event.target.value as AllowedDocumentPlaceholder || undefined })} disabled={!editable}><option value="">No binding</option>{allowedDocumentPlaceholders.map((placeholder) => <option key={placeholder} value={placeholder}>{placeholder}</option>)}</select></Field>
    <label className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-bold"><input type="checkbox" checked={block.visible} onChange={(event) => updateBlock(block.id, { visible: event.target.checked })} disabled={!editable} /> Visible</label>
    {(block.type === "image" || block.type === "logo") && <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <Field label="Image source"><input className="field" value={block.image?.src || ""} onChange={(event) => updateBlock(block.id, { image: { ...block.image, src: event.target.value } })} disabled={!editable} placeholder="{{tenant.logo}} or /uploads/..." /></Field>
      <Field label="Alt text"><input className="field" value={block.image?.alt || ""} onChange={(event) => updateBlock(block.id, { image: { ...block.image, alt: event.target.value } })} disabled={!editable} /></Field>
      <button type="button" className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => queueImageUpload(block)} disabled={!editable}>Upload image</button>
    </div>}
    {block.type === "table" && <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-black">Table cells</p>
      {(block.table?.rows || [["", ""]]).map((row, rowIndex) => <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length || 1}, minmax(0, 1fr))` }}>{row.map((cell, cellIndex) => <input key={`${rowIndex}-${cellIndex}`} className="field" value={cell} onChange={(event) => setTableCell(block, rowIndex, cellIndex, event.target.value)} disabled={!editable} />)}</div>)}
      <div className="flex gap-2"><button type="button" className="btn-secondary min-h-8 px-3 py-1 text-xs" onClick={() => addTableRow(block)} disabled={!editable}>Add row</button><button type="button" className="btn-secondary min-h-8 px-3 py-1 text-xs" onClick={() => addTableColumn(block)} disabled={!editable}>Add column</button></div>
    </div>}
    <div className="grid grid-cols-3 gap-2">
      <button type="button" className="btn-secondary min-h-9 px-2 py-1 text-xs" onClick={() => moveBlock(block.id, -1)} disabled={!editable}>Move up</button>
      <button type="button" className="btn-secondary min-h-9 px-2 py-1 text-xs" onClick={() => moveBlock(block.id, 1)} disabled={!editable}>Move down</button>
      <button type="button" className="btn-danger min-h-9 px-2 py-1 text-xs" onClick={() => removeBlock(block.id)} disabled={!editable}>Remove</button>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <NumberInput label="Padding" value={block.style?.padding || 0} onChange={(padding) => updateBlockStyle(block.id, { padding })} disabled={!editable} />
      <NumberInput label="Spacing" value={block.style?.paragraphSpacing || 0} onChange={(paragraphSpacing) => updateBlockStyle(block.id, { paragraphSpacing })} disabled={!editable} />
      <NumberInput label="Indent" value={block.style?.indent || 0} onChange={(indent) => updateBlockStyle(block.id, { indent })} disabled={!editable} />
      <NumberInput label="Line height" value={block.style?.lineHeight || 1.4} step={0.1} onChange={(lineHeight) => updateBlockStyle(block.id, { lineHeight })} disabled={!editable} />
    </div>
  </div>;
}

function PlaceholderPanel({ insertPlaceholder }: { insertPlaceholder: (placeholder: AllowedDocumentPlaceholder) => void }) {
  return <div className="space-y-4">
    <div><h2 className="font-black">Dynamic Fields</h2><p className="text-sm text-slate-500">Insert allowlisted placeholders into the selected block.</p></div>
    {placeholderGroups.map((group) => <section key={group.group} className="space-y-2"><h3 className="text-xs font-black uppercase text-pine-700">{group.group}</h3>{group.items.map((item) => <button key={item.key} type="button" className="w-full rounded-xl border bg-white p-3 text-left hover:bg-pine-50" onClick={() => insertPlaceholder(item.key)}><p className="text-sm font-black">{item.label}</p><p className="font-mono text-xs text-slate-500">{`{{${item.key}}}`}</p></button>)}</section>)}
  </div>;
}

function ReviewPanel({ validation, definition }: { validation: ReturnType<typeof validateTemplateDefinition>; definition: DocumentTemplateDefinition }) {
  return <div className="space-y-4">
    <div><h2 className="font-black">Validation</h2><p className="text-sm text-slate-500">Checks storage safety, placeholders, page setup, and publishability.</p></div>
    <div className={`rounded-xl p-4 text-sm font-bold ${validation.valid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{validation.valid ? "Template is valid for draft save and publishing." : "Resolve the blocking issues before publishing."}</div>
    {!validation.valid && <ul className="space-y-2 text-sm font-semibold text-amber-900">{validation.errors.map((error) => <li key={error} className="rounded-xl bg-amber-50 p-3">{error}</li>)}</ul>}
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <p><span className="font-bold text-slate-500">Page:</span> {definition.page.format} {definition.page.orientation}</p>
      <p><span className="font-bold text-slate-500">Blocks:</span> {definition.blocks.length}</p>
      <p><span className="font-bold text-slate-500">Visible:</span> {definition.blocks.filter((block) => block.visible).length}</p>
    </div>
  </div>;
}

function RibbonGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-max flex-wrap items-end gap-2">{children}</div>;
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-black hover:bg-slate-50 disabled:opacity-50" onClick={onClick} disabled={disabled}>{iconChild(children)} {label}</button>;
}

function IconButton({ label, active, onClick, disabled, children }: { label: string; active?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${active ? "bg-pine-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"} disabled:opacity-50`} onClick={onClick} disabled={disabled}>{iconChild(children)}</button>;
}

function SelectTool({ label, value, onChange, disabled, children }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-black text-slate-500"><span>{label}</span><select className="field h-11 min-w-32 py-1 text-sm" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select></label>;
}

function NumberTool({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <label className="grid gap-1 text-xs font-black text-slate-500"><span>{label}</span><input className="field h-11 w-24 py-1 text-sm" type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} /></label>;
}

function ColorTool({ label, value, onChange, disabled, icon }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; icon?: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-black text-slate-500"><span>{label}</span><span className="flex h-11 items-center gap-2 rounded-xl border bg-white px-2">{icon ? iconChild(icon) : null}<input type="color" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={label} /></span></label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="label">{label}</span>{children}</label>;
}

function NumberInput({ label, value, onChange, disabled, step = 1 }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; step?: number }) {
  return <Field label={label}><input className="field" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} /></Field>;
}

function mapBlocks(definition: DocumentTemplateDefinition, mapper: (block: DocumentTemplateBlock) => DocumentTemplateBlock) {
  return {
    header: renumber(definition.sections.header.map(mapper).filter((block) => block.section === "header")),
    body: renumber(definition.sections.body.map(mapper).filter((block) => block.section === "body")),
    footer: renumber(definition.sections.footer.map(mapper).filter((block) => block.section === "footer")),
  };
}

function renumber(blocks: DocumentTemplateBlock[]) {
  return blocks.map((block, index) => ({ ...block, order: (index + 1) * 10 }));
}

function replaceSampleValues(text: string) {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => sampleTemplateValue(key));
}

function readableBlockType(type: string) {
  return type.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function defaultContentForBlock(type: DocumentTemplateBlockType) {
  if (type === "documentTitle") return "{{document.title}}";
  if (type === "tenantName") return "{{tenant.name}}";
  if (type === "address") return "{{tenant.address}}";
  if (type === "tin") return "TIN: {{tenant.tin}}";
  if (type === "secRegistration") return "SEC Registration: {{tenant.secRegistration}}";
  if (type === "subjectInfo") return "Issued to: {{subject.fullName}}";
  if (type === "propertyInfo") return "Property: {{property.accountLabel}}";
  if (type === "purpose") return "Purpose: {{request.purpose}}";
  if (type === "remarks") return "Remarks: {{request.remarks}}";
  if (type === "issueDate") return "Issue date: {{document.issueDate}}";
  if (type === "validityDate") return "Valid until: {{document.validUntil}}";
  if (type === "documentNumber") return "Document No. {{document.number}}";
  if (type === "signatory") return "{{signatory.name}}\n{{signatory.position}}";
  if (type === "footer") return "{{tenant.name}} | {{document.number}}";
  if (type === "watermark") return "{{tenant.name}}";
  return "";
}

function defaultBindingForBlock(type: DocumentTemplateBlockType): AllowedDocumentPlaceholder | undefined {
  if (type === "tenantName") return "tenant.name";
  if (type === "address") return "tenant.address";
  if (type === "logo") return "tenant.logo";
  if (type === "documentTitle") return "document.title";
  if (type === "subjectInfo") return "subject.fullName";
  if (type === "propertyInfo") return "property.accountLabel";
  if (type === "purpose") return "request.purpose";
  if (type === "remarks") return "request.remarks";
  if (type === "signatory") return "signatory.name";
  if (type === "qrVerification") return "verification.url";
  return undefined;
}

function uniqueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function mm(value: number, zoom: number) {
  return `${value * (zoom / 100) * 3.6}px`;
}

function iconChild(child: React.ReactNode) {
  return child;
}
