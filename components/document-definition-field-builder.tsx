"use client";

import { useMemo, useState } from "react";
import { saveDocumentDefinitionFieldsAction } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

const fieldTypes = ["TEXT", "TEXTAREA", "DATE", "NUMBER", "MONEY", "SELECT", "CHECKBOX"] as const;

type FieldType = (typeof fieldTypes)[number];

type InitialField = {
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  active: boolean;
  options?: unknown;
  validation?: unknown;
  defaultValue?: unknown;
};

type EditableField = {
  uid: string;
  key: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  active: boolean;
  optionsText: string;
  defaultValue: string;
  minLength: string;
  maxLength: string;
  min: string;
  max: string;
  pattern: string;
};

export function DocumentDefinitionFieldBuilder({ definitionId, fields }: { definitionId: string; fields: InitialField[] }) {
  const [rows, setRows] = useState<EditableField[]>(() => fields.length ? fields.map(toEditableField) : [blankField()]);
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    rows.forEach((row) => {
      const key = row.key.trim();
      if (!key) return;
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    });
    return duplicates;
  }, [rows]);
  const serializedFields = useMemo(() => JSON.stringify(rows.map(toServerField)), [rows]);

  const updateRow = (uid: string, patch: Partial<EditableField>) => setRows((current) => current.map((row) => row.uid === uid ? { ...row, ...patch } : row));
  const moveRow = (uid: string, direction: -1 | 1) => setRows((current) => {
    const index = current.findIndex((row) => row.uid === uid);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const removeRow = (uid: string) => setRows((current) => current.length === 1 ? current : current.filter((row) => row.uid !== uid));

  return <form action={saveDocumentDefinitionFieldsAction} className="mt-4 space-y-4">
    <input type="hidden" name="definitionId" value={definitionId} />
    <input type="hidden" name="fieldsJson" value={serializedFields} />
    <div className="space-y-3">
      {rows.map((row, index) => {
        const duplicate = duplicateKeys.has(row.key.trim());
        return <div key={row.uid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">Field {index + 1}</p>
              <h4 className="mt-1 font-black">{row.label || row.key || "New field"}</h4>
              {duplicate && <p className="mt-1 text-xs font-bold text-rose-700">This field key is duplicated.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => moveRow(row.uid, -1)} disabled={index === 0}>Move up</button>
              <button type="button" className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => moveRow(row.uid, 1)} disabled={index === rows.length - 1}>Move down</button>
              <button type="button" className="btn-danger min-h-9 px-3 py-1 text-xs" onClick={() => removeRow(row.uid)} disabled={rows.length === 1}>Remove</button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label><span className="label">Field key</span><input className="field font-mono text-sm" value={row.key} onChange={(event) => updateRow(row.uid, { key: normalizeKey(event.currentTarget.value) })} placeholder="purpose" required /></label>
            <label><span className="label">Label</span><input className="field" value={row.label} onChange={(event) => updateRow(row.uid, { label: event.currentTarget.value })} placeholder="Purpose" required /></label>
            <label><span className="label">Field type</span><select className="field" value={row.fieldType} onChange={(event) => updateRow(row.uid, { fieldType: event.currentTarget.value as FieldType })}>{fieldTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
            <label><span className="label">Default value</span><input className="field" value={row.defaultValue} onChange={(event) => updateRow(row.uid, { defaultValue: event.currentTarget.value })} placeholder="Optional" /></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><input type="checkbox" checked={row.required} onChange={(event) => updateRow(row.uid, { required: event.currentTarget.checked })} /> Required</label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><input type="checkbox" checked={row.active} onChange={(event) => updateRow(row.uid, { active: event.currentTarget.checked })} /> Active</label>
            <label><span className="label">Minimum</span><input className="field" value={row.min} onChange={(event) => updateRow(row.uid, { min: event.currentTarget.value })} inputMode="decimal" placeholder="Optional" /></label>
            <label><span className="label">Maximum</span><input className="field" value={row.max} onChange={(event) => updateRow(row.uid, { max: event.currentTarget.value })} inputMode="decimal" placeholder="Optional" /></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label><span className="label">Minimum length</span><input className="field" value={row.minLength} onChange={(event) => updateRow(row.uid, { minLength: digitsOnly(event.currentTarget.value) })} inputMode="numeric" placeholder="Optional" /></label>
            <label><span className="label">Maximum length</span><input className="field" value={row.maxLength} onChange={(event) => updateRow(row.uid, { maxLength: digitsOnly(event.currentTarget.value) })} inputMode="numeric" placeholder="Optional" /></label>
            <label className="md:col-span-2"><span className="label">Pattern</span><input className="field" value={row.pattern} onChange={(event) => updateRow(row.uid, { pattern: event.currentTarget.value })} placeholder="Optional safe regex pattern" /></label>
          </div>
          {row.fieldType === "SELECT" && <label className="mt-3 block"><span className="label">Select options</span><textarea className="field min-h-24" value={row.optionsText} onChange={(event) => updateRow(row.uid, { optionsText: event.currentTarget.value })} placeholder={"One option per line"} /></label>}
        </div>;
      })}
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn-secondary" onClick={() => setRows((current) => [...current, blankField()])}>Add field</button>
      <SubmitButton>Save fields</SubmitButton>
    </div>
  </form>;
}

function blankField(): EditableField {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return { uid: id, key: "", label: "", fieldType: "TEXT", required: false, active: true, optionsText: "", defaultValue: "", minLength: "", maxLength: "", min: "", max: "", pattern: "" };
}

function toEditableField(field: InitialField, index: number): EditableField {
  const validation = isRecord(field.validation) ? field.validation : {};
  return {
    uid: `${field.key || "field"}-${index}`,
    key: field.key,
    label: field.label,
    fieldType: fieldTypes.includes(field.fieldType as FieldType) ? field.fieldType as FieldType : "TEXT",
    required: Boolean(field.required),
    active: field.active !== false,
    optionsText: Array.isArray(field.options) ? field.options.map(optionLine).filter(Boolean).join("\n") : "",
    defaultValue: field.defaultValue == null ? "" : String(field.defaultValue),
    minLength: validation.minLength == null ? "" : String(validation.minLength),
    maxLength: validation.maxLength == null ? "" : String(validation.maxLength),
    min: validation.min == null ? "" : String(validation.min),
    max: validation.max == null ? "" : String(validation.max),
    pattern: validation.pattern == null ? "" : String(validation.pattern),
  };
}

function toServerField(row: EditableField) {
  const validation = Object.fromEntries([
    ["minLength", integerOrUndefined(row.minLength)],
    ["maxLength", integerOrUndefined(row.maxLength)],
    ["min", numberOrUndefined(row.min)],
    ["max", numberOrUndefined(row.max)],
    ["pattern", row.pattern.trim() || undefined],
  ].filter(([, value]) => value !== undefined));
  return {
    key: row.key.trim(),
    label: row.label.trim(),
    fieldType: row.fieldType,
    required: row.required,
    active: row.active,
    options: row.fieldType === "SELECT" ? row.optionsText.split(/\r?\n/).map(parseOptionLine).filter(Boolean) : undefined,
    defaultValue: row.defaultValue.trim() || undefined,
    validation: Object.keys(validation).length ? validation : undefined,
  };
}

function normalizeKey(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([^A-Za-z])/, "");
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function integerOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined;
}

function numberOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionLine(option: unknown) {
  if (isRecord(option)) {
    const value = String(option.value ?? option.label ?? "").trim();
    const label = String(option.label ?? option.value ?? "").trim();
    return value && label && value !== label ? `${label}|${value}` : value || label;
  }
  return String(option ?? "").trim();
}

function parseOptionLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [label, value] = trimmed.includes("|") ? trimmed.split("|", 2).map((part) => part.trim()) : [trimmed, trimmed];
  return value ? { label: label || value, value } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
