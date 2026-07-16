import { DocumentFieldType } from "@prisma/client";
import { normalizeDocumentFields, validateDocumentRequestData } from "../lib/services/document-field-validation";

const fields = normalizeDocumentFields([
  { key: "residentName", label: "Resident Name", fieldType: DocumentFieldType.TEXT, required: true, active: true, displayOrder: 10, validation: { minLength: 3, maxLength: 80, pattern: "^[A-Za-z ]+$" }, defaultValue: "Juan Dela Cruz" },
  { key: "yearsOfResidency", label: "Years of Residency", fieldType: DocumentFieldType.NUMBER, required: true, active: true, displayOrder: 20, validation: { min: 1, max: 99 }, defaultValue: "1" },
  { key: "petTypeString", label: "Pet Type", fieldType: DocumentFieldType.SELECT, required: true, active: true, displayOrder: 30, options: ["Dog", "Cat", "Bird"], defaultValue: "Cat" },
  { key: "petTypeObject", label: "Pet Type", fieldType: DocumentFieldType.SELECT, required: true, active: true, displayOrder: 40, options: [{ label: "Dog", value: "DOG" }, { label: "Cat", value: "CAT" }], defaultValue: "DOG" },
  { key: "attestation", label: "Attestation", fieldType: DocumentFieldType.CHECKBOX, required: true, active: true, displayOrder: 50, defaultValue: false },
]);

assert(fields.find((field) => field.key === "petTypeString")?.options[0]?.value === "Dog", "String SELECT options normalize to value strings.");
assert(fields.find((field) => field.key === "petTypeObject")?.options[0]?.value === "DOG", "Object SELECT options normalize to configured values.");
assert(fields.find((field) => field.key === "petTypeObject")?.options[0]?.label === "Dog", "Object SELECT options preserve labels.");

expectError({ residentName: "Jo", yearsOfResidency: "1", petTypeString: "Dog", petTypeObject: "DOG", attestation: "on" }, "Resident Name must be at least 3 characters.");
expectError({ residentName: "J".repeat(81), yearsOfResidency: "1", petTypeString: "Dog", petTypeObject: "DOG", attestation: "on" }, "Resident Name must not exceed 80 characters.");
expectError({ residentName: "Juan 123", yearsOfResidency: "1", petTypeString: "Dog", petTypeObject: "DOG", attestation: "on" }, "Resident Name has an invalid format.");
expectError({ residentName: "Juan", yearsOfResidency: "0", petTypeString: "Dog", petTypeObject: "DOG", attestation: "on" }, "Years of Residency must be at least 1.");
expectError({ residentName: "Juan", yearsOfResidency: "100", petTypeString: "Dog", petTypeObject: "DOG", attestation: "on" }, "Years of Residency must be at most 99.");
expectError({ residentName: "Juan", yearsOfResidency: "1", petTypeString: "", petTypeObject: "DOG", attestation: "on" }, "Select a Pet Type.");
expectError({ residentName: "Juan", yearsOfResidency: "1", petTypeString: "Fish", petTypeObject: "DOG", attestation: "on" }, "Pet Type must be one of the configured options.");
expectError({ residentName: "Juan", yearsOfResidency: "1", petTypeString: "Dog", petTypeObject: "FISH", attestation: "on" }, "Pet Type must be one of the configured options.");
expectError({ residentName: "Juan", yearsOfResidency: "1", petTypeString: "Dog", petTypeObject: "DOG" }, "Attestation must be checked.");

const valid = validateDocumentRequestData(fields, { residentName: "Juan", yearsOfResidency: "12", petTypeString: "Bird", petTypeObject: "CAT", attestation: "on" });
assert(valid.errors.length === 0, `Expected valid submission, got ${valid.errors.join("; ")}`);
assert(valid.values.petTypeObject === "CAT", "Normalized snapshot stores SELECT submitted value.");
assert(valid.values.attestation === true, "Normalized snapshot stores CHECKBOX as boolean true.");

const customNoPurpose = validateDocumentRequestData(normalizeDocumentFields([
  { key: "residentName", label: "Resident Name", fieldType: DocumentFieldType.TEXT, required: true, active: true, displayOrder: 10 },
]), { residentName: "Juan" });
assert(customNoPurpose.errors.length === 0, "Custom definition without purpose field validates without synthetic purpose.");

console.log("PASS: dynamic field constraints, SELECT option formats, required checkbox, and custom no-purpose validation verified.");

function expectError(values: Record<string, string>, expected: string) {
  const result = validateDocumentRequestData(fields, values);
  assert(result.errors.includes(expected), `Expected error "${expected}", got ${result.errors.join("; ")}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
