-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "intent" TEXT,
    "targetDuration" INTEGER,
    "edl" JSONB,
    "suggestions" JSONB,
    "musicBlocks" JSONB,
    "planVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("createdAt", "edl", "id", "intent", "musicBlocks", "name", "suggestions", "targetDuration", "updatedAt") SELECT "createdAt", "edl", "id", "intent", "musicBlocks", "name", "suggestions", "targetDuration", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
