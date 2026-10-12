-- Login by document: CNPJ for a company (one login per company), CPF for a
-- pessoa física or a company collaborator. Digits only; legacy accounts keep
-- logging in by e-mail until they have one.
ALTER TABLE "User" ADD COLUMN "loginId" TEXT;
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");
