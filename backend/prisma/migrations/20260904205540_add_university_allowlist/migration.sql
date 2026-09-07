-- CreateEnum
CREATE TYPE "University" AS ENUM ('UOFT', 'TMU', 'LAURIER', 'YORK', 'ONTARIO_TECH', 'MCMASTER', 'WATERLOO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "university" "University";
