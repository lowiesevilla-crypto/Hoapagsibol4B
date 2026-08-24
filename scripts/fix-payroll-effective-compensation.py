from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

schema_path = ROOT / "prisma/schema.prisma"
schema = schema_path.read_text(encoding="utf-8")
old_schema = "  @@index([tenantId, employeeId, effectiveFrom, effectiveTo])"
new_schema = "  @@index([tenantId, employeeId, effectiveFrom, effectiveTo], map: \"EmpComp_scope_effective_idx\")"
if schema.count(old_schema) != 1:
    raise RuntimeError(f"expected one schema index match, found {schema.count(old_schema)}")
schema_path.write_text(schema.replace(old_schema, new_schema, 1), encoding="utf-8")

migration_path = ROOT / "prisma/migrations/20260824130000_payroll_effective_compensation/migration.sql"
migration = migration_path.read_text(encoding="utf-8")
old_migration = "EmployeeCompensation_tenantId_employeeId_effectiveFrom_effectiveTo_idx"
new_migration = "EmpComp_scope_effective_idx"
if migration.count(old_migration) != 1:
    raise RuntimeError(f"expected one migration index match, found {migration.count(old_migration)}")
migration_path.write_text(migration.replace(old_migration, new_migration, 1), encoding="utf-8")

(ROOT / ".github/workflows/payroll-effective-compensation-fix.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
