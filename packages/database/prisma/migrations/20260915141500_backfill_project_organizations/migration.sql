-- Give every organizationless legacy project its own organization.
-- Reusing the project UUID makes the project-to-organization mapping
-- deterministic and avoids requiring a temporary mapping table.
INSERT INTO "Organization" (
    "id",
    "slug",
    "name",
    "createdAt",
    "updatedAt"
)
SELECT
    project."id",
    'legacy-project-' || project."id"::text,
    project."name" || ' Legacy organization',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project" AS project
WHERE project."organizationId" IS NULL;

-- Attach each legacy project to the organization created from its UUID.
UPDATE "Project" AS project
SET "organizationId" = project."id"
WHERE project."organizationId" IS NULL;
