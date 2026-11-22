ALTER TABLE "users" ADD COLUMN "username" TEXT;
UPDATE "users" SET "username" = 'lara jane' WHERE "email" = 'admin@faciload.local';
