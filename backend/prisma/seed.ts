/**
 * Quill — development seed.
 *
 * Idempotent. Safe to run repeatedly in dev (deletes and re-creates the MAC
 * organization and its data). Refuses to run in production if any users
 * already exist.
 *
 *   npm --workspace backend run db:seed
 */

import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/lib/env.js';
import { seedTrades } from './seedTrades.js';

const SEED_PASSWORD = 'password123';
const ORG_SLUG = 'mark-allan-contracting';

// ─── helpers ────────────────────────────────────────────────────────────────

const dec = (n: number | string) => new Prisma.Decimal(n);

function lineCost(quantity: number, unitMaterial: number, unitLabor: number) {
  return quantity * (unitMaterial + unitLabor);
}

function lineSell(cost: number, markup: number) {
  return cost * (1 + markup);
}

async function assertNotProductionWithUsers() {
  if (env.NODE_ENV !== 'production') return;
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.error(
      '[seed] Refusing to run: NODE_ENV=production with existing users.\n' +
        '[seed] Production seeding is disabled to prevent data loss.',
    );
    process.exit(1);
  }
}

async function wipeOrgScopedData(orgId: string) {
  // Delete in FK-safe order (children → parents).
  await prisma.notification.deleteMany({ where: { organizationId: orgId } });
  await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.reviewAction.deleteMany({ where: { organizationId: orgId } });
  await prisma.comment.deleteMany({ where: { organizationId: orgId } });
  await prisma.aIMessage.deleteMany({ where: { organizationId: orgId } });
  await prisma.aIRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.aIConversation.deleteMany({ where: { organizationId: orgId } });
  await prisma.estimateExport.deleteMany({ where: { organizationId: orgId } });
  await prisma.estimateSnapshot.deleteMany({ where: { organizationId: orgId } });
  await prisma.sourceInput.deleteMany({ where: { organizationId: orgId } });
  await prisma.lineItem.deleteMany({ where: { organizationId: orgId } });
  await prisma.scopeSection.deleteMany({ where: { organizationId: orgId } });
  await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
  await prisma.priceBookEntry.deleteMany({ where: { organizationId: orgId } });
  await prisma.priceBookCategory.deleteMany({ where: { organizationId: orgId } });
  await prisma.markupRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.priceBook.deleteMany({ where: { organizationId: orgId } });
  await prisma.bidReminder.deleteMany({ where: { organizationId: orgId } });
  await prisma.bidDocument.deleteMany({ where: { organizationId: orgId } });
  await prisma.bidResponseAttachment.deleteMany({
    where: { bidResponse: { organizationId: orgId } },
  });
  await prisma.bidResponseLineItem.deleteMany({
    where: { bidResponse: { organizationId: orgId } },
  });
  await prisma.bidResponse.deleteMany({ where: { organizationId: orgId } });
  await prisma.bidRequest.deleteMany({ where: { organizationId: orgId } });
  await prisma.bidPackage.deleteMany({ where: { organizationId: orgId } });
  await prisma.coreVendorCache.deleteMany({ where: { organizationId: orgId } });
  await prisma.coreProjectCache.deleteMany({ where: { organizationId: orgId } });
  await prisma.tradeMapping.deleteMany({ where: { organizationId: orgId } });
  await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
}

// ─── data sets ──────────────────────────────────────────────────────────────

type CategoryDef = { name: string; defaultMarkupPercent: string };

const CATEGORIES: CategoryDef[] = [
  { name: 'Demolition', defaultMarkupPercent: '0.20' },
  { name: 'Framing', defaultMarkupPercent: '0.20' },
  { name: 'Drywall', defaultMarkupPercent: '0.20' },
  { name: 'Electrical', defaultMarkupPercent: '0.25' },
  { name: 'Plumbing', defaultMarkupPercent: '0.25' },
  { name: 'HVAC', defaultMarkupPercent: '0.25' },
  { name: 'Flooring', defaultMarkupPercent: '0.20' },
  { name: 'Paint', defaultMarkupPercent: '0.20' },
  { name: 'Ceilings', defaultMarkupPercent: '0.20' },
  { name: 'Doors/Hardware', defaultMarkupPercent: '0.20' },
  { name: 'Millwork', defaultMarkupPercent: '0.25' },
  { name: 'General Conditions', defaultMarkupPercent: '0.10' },
];

type EntryDef = {
  category: string;
  code: string;
  description: string;
  unitOfMeasure: Prisma.PriceBookEntryCreateInput['unitOfMeasure'];
  unitCostMaterial: string;
  unitCostLabor: string;
  defaultMarkupPercent: string;
  aiKeywords: string;
};

const ENTRIES: EntryDef[] = [
  // Demolition
  {
    category: 'Demolition',
    code: 'DEMO-001',
    description: 'Demo existing drywall partition, one side, haul off',
    unitOfMeasure: 'SF',
    unitCostMaterial: '0.50',
    unitCostLabor: '2.00',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'demo drywall partition sheetrock one-sided demolition remove existing wall',
  },
  {
    category: 'Demolition',
    code: 'DEMO-010',
    description: 'Selective ceiling tile demo and disposal',
    unitOfMeasure: 'SF',
    unitCostMaterial: '0.30',
    unitCostLabor: '0.80',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'demo ceiling tile acoustical drop ceiling remove disposal',
  },
  // Framing
  {
    category: 'Framing',
    code: 'FRAM-100',
    description: 'Metal stud non-load-bearing wall, 3-5/8", 16" OC, to 10\' high',
    unitOfMeasure: 'LF',
    unitCostMaterial: '4.50',
    unitCostLabor: '8.00',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'metal stud framing partition wall non-bearing 3-5/8 16 OC',
  },
  {
    category: 'Framing',
    code: 'FRAM-201',
    description: 'Wood blocking in walls for cabinet/grab-bar support',
    unitOfMeasure: 'LF',
    unitCostMaterial: '1.80',
    unitCostLabor: '3.50',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'wood blocking backing fire treated 2x cabinet grab bar',
  },
  // Drywall
  {
    category: 'Drywall',
    code: 'DRYW-058',
    description: '5/8" Type X gypsum board, one side, taped and finished to Level 4',
    unitOfMeasure: 'SF',
    unitCostMaterial: '1.20',
    unitCostLabor: '2.10',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'drywall gypsum sheetrock type x level 4 finish 5/8',
  },
  {
    category: 'Drywall',
    code: 'DRYW-INS',
    description: 'Sound attenuation insulation in stud cavity',
    unitOfMeasure: 'SF',
    unitCostMaterial: '0.85',
    unitCostLabor: '0.45',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'acoustic batt insulation sound stc sound attenuation cavity',
  },
  // Electrical
  {
    category: 'Electrical',
    code: 'ELEC-REC',
    description: '20-amp duplex receptacle, commercial grade, with cover plate',
    unitOfMeasure: 'EA',
    unitCostMaterial: '18.00',
    unitCostLabor: '65.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'outlet receptacle duplex 20 amp commercial cover plate',
  },
  {
    category: 'Electrical',
    code: 'ELEC-2X4',
    description: '2x4 LED recessed flat-panel troffer, supply and install',
    unitOfMeasure: 'EA',
    unitCostMaterial: '165.00',
    unitCostLabor: '85.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'led troffer 2x4 recessed flat panel commercial light fixture',
  },
  // Plumbing
  {
    category: 'Plumbing',
    code: 'PLMB-LAV',
    description: 'ADA wall-hung china lavatory with metering faucet',
    unitOfMeasure: 'EA',
    unitCostMaterial: '480.00',
    unitCostLabor: '280.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'lavatory sink ada wall hung china bathroom metering faucet',
  },
  {
    category: 'Plumbing',
    code: 'PLMB-WC',
    description: '1.6 GPF flushometer water closet, vitreous china',
    unitOfMeasure: 'EA',
    unitCostMaterial: '540.00',
    unitCostLabor: '320.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'toilet wc flushometer water closet ada vitreous china',
  },
  // HVAC
  {
    category: 'HVAC',
    code: 'HVAC-VAV',
    description: 'VAV box with hot-water reheat, ducted to existing trunk, 1000-1500 CFM',
    unitOfMeasure: 'EA',
    unitCostMaterial: '1850.00',
    unitCostLabor: '950.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'vav variable air volume box reheat hvac hot water 1000 1500 cfm',
  },
  {
    category: 'HVAC',
    code: 'HVAC-DCT',
    description: 'Spiral round duct, galvanized, 8-inch diameter, with hangers',
    unitOfMeasure: 'LF',
    unitCostMaterial: '18.00',
    unitCostLabor: '22.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'spiral duct round galvanized hvac sheet metal 8 inch hanger',
  },
  // Flooring
  {
    category: 'Flooring',
    code: 'FLR-LVT',
    description: 'LVT plank flooring, glue-down, commercial grade, with underlayment prep',
    unitOfMeasure: 'SF',
    unitCostMaterial: '4.20',
    unitCostLabor: '2.80',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'lvt luxury vinyl tile plank flooring commercial glue down underlayment',
  },
  {
    category: 'Flooring',
    code: 'FLR-CPT',
    description: 'Carpet tile, 24x24, glue-down, with edge trim',
    unitOfMeasure: 'SF',
    unitCostMaterial: '3.40',
    unitCostLabor: '1.60',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'carpet tile carpet square commercial 24 glue down edge trim',
  },
  // Paint
  {
    category: 'Paint',
    code: 'PNT-EGG',
    description: 'Two-coat eggshell latex on prepared drywall, walls',
    unitOfMeasure: 'SF',
    unitCostMaterial: '0.35',
    unitCostLabor: '0.75',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'paint walls latex eggshell two coat drywall interior',
  },
  // Ceilings
  {
    category: 'Ceilings',
    code: 'CLG-2X2',
    description: '2x2 acoustical ceiling tile and grid, standard 15/16" suspension',
    unitOfMeasure: 'SF',
    unitCostMaterial: '1.40',
    unitCostLabor: '1.80',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'acoustical ceiling tile grid drop suspended 2x2 15/16 act',
  },
  // Doors/Hardware
  {
    category: 'Doors/Hardware',
    code: 'DR-HM',
    description: 'Hollow-metal door, 3070, with frame and standard commercial hardware set',
    unitOfMeasure: 'EA',
    unitCostMaterial: '720.00',
    unitCostLabor: '240.00',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'hollow metal door hm frame hardware 3070 commercial',
  },
  {
    category: 'Doors/Hardware',
    code: 'DR-WD',
    description: 'Solid-core wood door with frame and lever hardware',
    unitOfMeasure: 'EA',
    unitCostMaterial: '540.00',
    unitCostLabor: '180.00',
    defaultMarkupPercent: '0.20',
    aiKeywords: 'solid core wood door birch frame lever hardware interior',
  },
  // Millwork
  {
    category: 'Millwork',
    code: 'MW-BASE',
    description: 'Plastic-laminate lower base cabinets with countertop, per linear foot',
    unitOfMeasure: 'LF',
    unitCostMaterial: '240.00',
    unitCostLabor: '180.00',
    defaultMarkupPercent: '0.25',
    aiKeywords: 'base cabinet plastic laminate countertop millwork lower',
  },
  // General Conditions
  {
    category: 'General Conditions',
    code: 'GC-DUMP',
    description: 'Dumpster, 30 cubic yard, including hauling and tipping',
    unitOfMeasure: 'EA',
    unitCostMaterial: '580.00',
    unitCostLabor: '0.00',
    defaultMarkupPercent: '0.10',
    aiKeywords: 'dumpster waste removal trash haul-off general conditions 30 yard',
  },
];

// ─── seed orchestrator ──────────────────────────────────────────────────────

async function main() {
  await assertNotProductionWithUsers();

  // Wipe any existing MAC org so the seed is idempotent in dev.
  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existing) {
    console.log(`[seed] Existing MAC org found (${existing.id}); wiping for re-seed…`);
    await wipeOrgScopedData(existing.id);
  }

  // 1. Organization + OrgSettings
  const org = await prisma.organization.create({
    data: {
      name: 'Mark Allan Contracting',
      slug: ORG_SLUG,
      settings: {
        create: {
          companyLegalName: 'Mark Allan Contracting, LLC',
          primaryColorHex: '#1A1A1A',
          contactPhone: '(555) 555-1212',
          contactEmail: 'office@markallancontracting.com',
          addressLine1: '1234 Builder Way',
          city: 'Charlotte',
          state: 'NC',
          postalCode: '28202',
          estimateNumberPrefix: 'MAC',
          defaultMarkupPercent: dec('0.20'),
          drafterCanSend: true,
          timezone: 'America/New_York',
          monthlyAiCostCapUsd: dec('200.00'),
        },
      },
    },
  });

  // 2. Users
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const [adam, justin, nick, viewer] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'adam@markallancontracting.com',
        passwordHash,
        firstName: 'Adam',
        lastName: 'Mark',
        role: 'OWNER',
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'justin@markallancontracting.com',
        passwordHash,
        firstName: 'Justin',
        lastName: 'Upchurch',
        role: 'ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'nick@markallancontracting.com',
        passwordHash,
        firstName: 'Nick',
        lastName: 'Test',
        role: 'PM',
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'viewer@markallancontracting.com',
        passwordHash,
        firstName: 'Test',
        lastName: 'Viewer',
        role: 'VIEWER',
      },
    }),
  ]);

  // 3. PriceBook + categories + entries
  const priceBook = await prisma.priceBook.create({
    data: {
      organizationId: org.id,
      name: 'MAC Standard Commercial',
      description: 'Default price book for Mark Allan Contracting commercial work.',
      isDefault: true,
      isActive: true,
    },
  });

  const categoryByName = new Map<string, string>();
  for (const [i, def] of CATEGORIES.entries()) {
    const cat = await prisma.priceBookCategory.create({
      data: {
        organizationId: org.id,
        priceBookId: priceBook.id,
        name: def.name,
        defaultMarkupPercent: dec(def.defaultMarkupPercent),
        order: i + 1,
      },
    });
    categoryByName.set(def.name, cat.id);
  }

  const entriesByCode = new Map<string, { id: string; def: EntryDef }>();
  for (const def of ENTRIES) {
    const categoryId = categoryByName.get(def.category);
    if (!categoryId) throw new Error(`Unknown category in seed entry: ${def.category}`);
    const entry = await prisma.priceBookEntry.create({
      data: {
        organizationId: org.id,
        priceBookId: priceBook.id,
        categoryId,
        code: def.code,
        description: def.description,
        unitOfMeasure: def.unitOfMeasure,
        unitCostMaterial: dec(def.unitCostMaterial),
        unitCostLabor: dec(def.unitCostLabor),
        defaultMarkupPercent: dec(def.defaultMarkupPercent),
        aiKeywords: def.aiKeywords,
      },
    });
    entriesByCode.set(def.code, { id: entry.id, def });
  }

  // 4. Estimates — DRAFT + IN_REVIEW (other states will be exercised through
  //    the application's state-machine endpoints once those phases land).

  type LineSpec = {
    entryCode: string;
    quantity: number;
    customDescription?: string;
    aiAssumption?: string;
    aiConfidence?: string;
    status?: Prisma.LineItemCreateInput['status'];
  };
  type SectionSpec = {
    name: string;
    categoryName: string;
    items: LineSpec[];
  };

  async function createEstimateWithSections(opts: {
    number: string;
    title: string;
    description: string;
    status: Prisma.EstimateCreateInput['status'];
    drafterId: string;
    reviewerId: string | null;
    client: { name: string; contact: string; email: string; phone: string };
    project: { line1: string; city: string; state: string; postalCode: string };
    sections: SectionSpec[];
    sources: { type: Prisma.SourceInputCreateInput['type']; title: string; content: string }[];
  }) {
    const estimate = await prisma.estimate.create({
      data: {
        organizationId: org.id,
        number: opts.number,
        title: opts.title,
        description: opts.description,
        status: opts.status,
        drafterId: opts.drafterId,
        reviewerId: opts.reviewerId,
        clientCompanyName: opts.client.name,
        clientContactName: opts.client.contact,
        clientContactEmail: opts.client.email,
        clientContactPhone: opts.client.phone,
        projectAddressLine1: opts.project.line1,
        projectCity: opts.project.city,
        projectState: opts.project.state,
        projectPostalCode: opts.project.postalCode,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Sources
    for (const src of opts.sources) {
      await prisma.sourceInput.create({
        data: {
          organizationId: org.id,
          estimateId: estimate.id,
          type: src.type,
          title: src.title,
          content: src.content,
          addedById: opts.drafterId,
        },
      });
    }

    // Sections + line items + running totals
    let sectionOrder = 1;
    let totalCost = 0;
    let totalSell = 0;

    for (const section of opts.sections) {
      const categoryId = categoryByName.get(section.categoryName);
      const scopeSection = await prisma.scopeSection.create({
        data: {
          organizationId: org.id,
          estimateId: estimate.id,
          name: section.name,
          categoryId,
          order: sectionOrder++,
        },
      });

      for (const [itemIdx, item] of section.items.entries()) {
        const entry = entriesByCode.get(item.entryCode);
        if (!entry) throw new Error(`Unknown entry code in seed: ${item.entryCode}`);
        const mat = Number(entry.def.unitCostMaterial);
        const lab = Number(entry.def.unitCostLabor);
        const markup = Number(entry.def.defaultMarkupPercent);
        const cost = lineCost(item.quantity, mat, lab);
        const sell = lineSell(cost, markup);
        totalCost += cost;
        totalSell += sell;

        await prisma.lineItem.create({
          data: {
            organizationId: org.id,
            estimateId: estimate.id,
            scopeSectionId: scopeSection.id,
            priceBookEntryId: entry.id,
            description: item.customDescription ?? entry.def.description,
            quantity: dec(item.quantity),
            unitOfMeasure: entry.def.unitOfMeasure,
            unitCostMaterial: dec(entry.def.unitCostMaterial),
            unitCostLabor: dec(entry.def.unitCostLabor),
            markupPercent: dec(entry.def.defaultMarkupPercent),
            lineCost: dec(cost.toFixed(2)),
            lineSellPrice: dec(sell.toFixed(2)),
            status: item.status ?? 'DRAFT',
            source: 'PRICEBOOK',
            aiConfidence: item.aiConfidence ? dec(item.aiConfidence) : null,
            aiAssumption: item.aiAssumption ?? null,
            order: itemIdx + 1,
          },
        });
      }
    }

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        totalCost: dec(totalCost.toFixed(2)),
        totalMarkup: dec((totalSell - totalCost).toFixed(2)),
        totalSellPrice: dec(totalSell.toFixed(2)),
      },
    });

    return estimate;
  }

  // 4a. DRAFT — Acme Corp Suite 400 TI
  const draft = await createEstimateWithSections({
    number: 'MAC-26-001',
    title: 'Acme Corp Suite 400 TI',
    description: 'Tenant improvement build-out for Acme Corp on the 4th floor.',
    status: 'DRAFT',
    drafterId: adam.id,
    reviewerId: justin.id,
    client: {
      name: 'Acme Corp',
      contact: 'Lori Chen',
      email: 'lori.chen@acme.example',
      phone: '(555) 444-1010',
    },
    project: {
      line1: '500 Tryon St, Suite 400',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28202',
    },
    sources: [
      {
        type: 'SCOPE_NOTES',
        title: 'Walkthrough notes — 2026-04-22',
        content:
          'Demo two existing offices to combine into a conference room. New ' +
          'glass front. New paint and LVT. ACT ceiling intact except where ' +
          'partitions were removed.',
      },
      {
        type: 'EMAIL',
        title: 'Lori at Acme — scope confirmation',
        content:
          'Confirmed: combine offices 412 and 414 into a single conference ' +
          'room. Add 4 LED troffers to match existing. Floor: LVT, color TBD.',
      },
    ],
    sections: [
      {
        name: 'Demolition',
        categoryName: 'Demolition',
        items: [
          { entryCode: 'DEMO-001', quantity: 240 },
          { entryCode: 'DEMO-010', quantity: 180 },
        ],
      },
      {
        name: 'Framing & Drywall',
        categoryName: 'Drywall',
        items: [
          { entryCode: 'FRAM-100', quantity: 60 },
          { entryCode: 'DRYW-058', quantity: 480 },
          { entryCode: 'DRYW-INS', quantity: 240 },
        ],
      },
      {
        name: 'Finishes',
        categoryName: 'Paint',
        items: [
          { entryCode: 'PNT-EGG', quantity: 480 },
          { entryCode: 'FLR-LVT', quantity: 320 },
        ],
      },
      {
        name: 'Electrical',
        categoryName: 'Electrical',
        items: [
          { entryCode: 'ELEC-2X4', quantity: 4 },
          { entryCode: 'ELEC-REC', quantity: 6 },
        ],
      },
    ],
  });

  // 4b. IN_REVIEW — Beta LLC Warehouse, with 2 comments
  const inReview = await createEstimateWithSections({
    number: 'MAC-26-002',
    title: 'Beta LLC Warehouse Office Buildout',
    description: 'Office and restroom buildout inside an existing warehouse shell.',
    status: 'IN_REVIEW',
    drafterId: adam.id,
    reviewerId: justin.id,
    client: {
      name: 'Beta LLC',
      contact: 'Marcus Reyes',
      email: 'marcus@beta-llc.example',
      phone: '(555) 222-9090',
    },
    project: {
      line1: '8800 Industrial Pkwy',
      city: 'Concord',
      state: 'NC',
      postalCode: '28025',
    },
    sources: [
      {
        type: 'TRANSCRIPT',
        title: 'Site visit transcript — Marcus walkthrough',
        content:
          'Marcus walked me through the warehouse. Wants two private offices ' +
          'and an ADA restroom in the southeast corner. ACT ceiling, LVT ' +
          'flooring, hollow-metal doors. Existing electrical is sufficient ' +
          'but we will need to add a VAV for the new conditioned space.',
      },
      {
        type: 'EMAIL',
        title: 'Marcus follow-up — restroom must be ADA',
        content:
          'Per zoning, the restroom must be ADA-compliant. Confirmed wall-' +
          'hung lavatory and flushometer water closet. Grab bars required.',
      },
      {
        type: 'SCOPE_NOTES',
        title: 'Internal scope notes',
        content:
          'ROM check: ~$48-55k all in. Sub quotes likely needed for VAV and ' +
          'HM door package. LVT vs. polished concrete — owner picked LVT.',
      },
    ],
    sections: [
      {
        name: 'Demolition',
        categoryName: 'Demolition',
        items: [{ entryCode: 'DEMO-010', quantity: 100 }],
      },
      {
        name: 'Framing',
        categoryName: 'Framing',
        items: [
          { entryCode: 'FRAM-100', quantity: 120 },
          { entryCode: 'FRAM-201', quantity: 80 },
        ],
      },
      {
        name: 'Drywall & Insulation',
        categoryName: 'Drywall',
        items: [
          { entryCode: 'DRYW-058', quantity: 960 },
          { entryCode: 'DRYW-INS', quantity: 480 },
        ],
      },
      {
        name: 'Doors & Hardware',
        categoryName: 'Doors/Hardware',
        items: [
          { entryCode: 'DR-HM', quantity: 3 },
          { entryCode: 'DR-WD', quantity: 1 },
        ],
      },
      {
        name: 'Restroom MEP',
        categoryName: 'Plumbing',
        items: [
          { entryCode: 'PLMB-LAV', quantity: 1 },
          { entryCode: 'PLMB-WC', quantity: 1 },
          {
            entryCode: 'HVAC-VAV',
            quantity: 1,
            aiConfidence: '0.65',
            aiAssumption: 'Assumes existing trunk has sufficient static pressure for one new VAV.',
          },
          { entryCode: 'HVAC-DCT', quantity: 35 },
        ],
      },
    ],
  });

  await prisma.comment.create({
    data: {
      organizationId: org.id,
      estimateId: inReview.id,
      authorId: justin.id,
      body:
        'The VAV assumption needs confirmation — please get a quote from ' +
        'Carolina Mechanical before approving.',
    },
  });
  await prisma.comment.create({
    data: {
      organizationId: org.id,
      estimateId: inReview.id,
      authorId: justin.id,
      body: 'Markup on doors looks light vs. our last warehouse job. Worth a second look.',
    },
  });

  // 5. Trades
  await seedTrades(prisma, org.id);

  // 6. Summary
  const counts = {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    priceBooks: await prisma.priceBook.count(),
    priceBookCategories: await prisma.priceBookCategory.count(),
    priceBookEntries: await prisma.priceBookEntry.count(),
    estimates: await prisma.estimate.count(),
    scopeSections: await prisma.scopeSection.count(),
    lineItems: await prisma.lineItem.count(),
    sourceInputs: await prisma.sourceInput.count(),
    comments: await prisma.comment.count(),
    tradeCanonicals: await prisma.tradeCanonical.count(),
    tradeMappings: await prisma.tradeMapping.count(),
  };

  console.log('\n[seed] complete.');
  console.log(`  org:                 ${org.name} (slug: ${org.slug})`);
  console.log(`  organizations:       ${counts.organizations}`);
  console.log(`  users:               ${counts.users}`);
  console.log(`  price books:         ${counts.priceBooks}`);
  console.log(`  pricebook categories:${counts.priceBookCategories}`);
  console.log(`  pricebook entries:   ${counts.priceBookEntries}`);
  console.log(`  estimates:           ${counts.estimates}`);
  console.log(`  scope sections:      ${counts.scopeSections}`);
  console.log(`  line items:          ${counts.lineItems}`);
  console.log(`  source inputs:       ${counts.sourceInputs}`);
  console.log(`  comments:            ${counts.comments}`);
  console.log(`  trade canonicals:    ${counts.tradeCanonicals}`);
  console.log(`  trade mappings:      ${counts.tradeMappings}`);

  if (env.NODE_ENV === 'development') {
    console.log('\n[seed] dev login credentials (DO NOT USE IN PRODUCTION):');
    console.log(`  ${adam.email}    / ${SEED_PASSWORD}    (OWNER)`);
    console.log(`  ${justin.email} / ${SEED_PASSWORD}    (ADMIN)`);
    console.log(`  ${nick.email}   / ${SEED_PASSWORD}    (PM)`);
    console.log(`  ${viewer.email} / ${SEED_PASSWORD}    (VIEWER)`);
  }

  void draft;
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
