-- Umrah journey: a published final file is either a pilgrim's VISA or a
-- document of the services included in the package (SERVICE: tickets,
-- accommodation, transport). Additive only: existing rows keep their kind
-- (an Umrah GENERAL file still counts as that pilgrim's visa).
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'VISA';
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'SERVICE';
