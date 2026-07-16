-- Additive compatibility change for custom document definitions.
-- Existing legacy enum values remain unchanged; new custom definition-backed
-- requests may store NULL while using definitionId and immutable snapshots.
ALTER TABLE `DocumentRequest`
  MODIFY `type` ENUM(
    'CERTIFICATE_OF_RESIDENCY',
    'CERTIFICATE_OF_GOOD_STANDING',
    'CLEARANCE_CERTIFICATE',
    'PAYMENT_CERTIFICATION',
    'CONSTRUCTION_BOND_CERTIFICATION',
    'CONTRACTOR_BOND_CERTIFICATION',
    'GATE_PASS',
    'MOVE_IN_OUT_PASS'
  ) NULL;
