/**
 * Phase 0.3 smoke-test.
 *
 * Confirms the Prisma client connects, the singleton is wired correctly, and
 * every model in the schema is reachable. Counts every table — they should
 * all return 0 immediately after the first migration.
 *
 *   npx tsx backend/scripts/smoke-prisma.ts
 */

import { prisma } from '../src/lib/prisma.js';

async function main() {
  // The eponymous test from the playbook.
  const orgCount = await prisma.organization.count();
  console.log(`organizations: ${orgCount}`);

  // Touch every model to prove the schema and client are aligned. If any
  // delegate is missing the script fails loudly.
  const counts = await Promise.all(
    [
      ['Organization', prisma.organization.count()],
      ['OrgSettings', prisma.orgSettings.count()],
      ['User', prisma.user.count()],
      ['Invitation', prisma.invitation.count()],
      ['Estimate', prisma.estimate.count()],
      ['ScopeSection', prisma.scopeSection.count()],
      ['LineItem', prisma.lineItem.count()],
      ['EstimateSnapshot', prisma.estimateSnapshot.count()],
      ['SourceInput', prisma.sourceInput.count()],
      ['EstimateExport', prisma.estimateExport.count()],
      ['PriceBook', prisma.priceBook.count()],
      ['PriceBookCategory', prisma.priceBookCategory.count()],
      ['PriceBookEntry', prisma.priceBookEntry.count()],
      ['MarkupRule', prisma.markupRule.count()],
      ['AIConversation', prisma.aIConversation.count()],
      ['AIMessage', prisma.aIMessage.count()],
      ['AIRun', prisma.aIRun.count()],
      ['Comment', prisma.comment.count()],
      ['ReviewAction', prisma.reviewAction.count()],
      ['ActivityEvent', prisma.activityEvent.count()],
      ['Notification', prisma.notification.count()],
    ].map(async ([name, p]) => [name, await p] as const),
  );

  console.log('\nAll 21 models reachable:');
  for (const [name, count] of counts) {
    console.log(`  ${name.toString().padEnd(20)} ${count}`);
  }
}

main()
  .catch((err) => {
    console.error('[smoke-prisma] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
