-- Personal note an estimator can include at the top of every bid invitation
-- email for a package. Composed and reviewed on the email preview page before
-- the package is published.
ALTER TABLE "BidPackage" ADD COLUMN "personalNote" TEXT;
