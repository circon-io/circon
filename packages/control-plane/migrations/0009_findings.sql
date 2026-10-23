-- Advisory findings a run produced once its plan was done: the design review of
-- its screenshots, and the whole-repository security audit. JSON arrays of
-- strings; NULL when the pass did not run, [] when it found nothing.
ALTER TABLE runs ADD COLUMN design_findings TEXT;
ALTER TABLE runs ADD COLUMN audit_findings TEXT;
