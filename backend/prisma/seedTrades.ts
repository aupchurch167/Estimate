import type { PrismaClient, TradeCategory } from '@prisma/client';

interface TradeDef {
  name: string;
  code: string;
  category: TradeCategory;
}

const CANONICAL_TRADES: TradeDef[] = [
  { name: 'Electrical', code: 'E', category: 'ELECTRICAL' },
  { name: 'Plumbing', code: 'P', category: 'PLUMBING' },
  { name: 'HVAC', code: 'M', category: 'MECHANICAL' },
  { name: 'Fire Protection / Sprinkler', code: 'FP', category: 'FIRE_PROTECTION' },
  { name: 'Low Voltage', code: 'LV', category: 'ELECTRICAL' },
  { name: 'Concrete', code: 'C', category: 'STRUCTURAL' },
  { name: 'Concrete Flatwork', code: 'CF', category: 'STRUCTURAL' },
  { name: 'Masonry', code: 'MS', category: 'STRUCTURAL' },
  { name: 'Steel / Structural Steel', code: 'ST', category: 'STRUCTURAL' },
  { name: 'Framing — Wood', code: 'FW', category: 'STRUCTURAL' },
  { name: 'Framing — Metal Stud', code: 'FM', category: 'STRUCTURAL' },
  { name: 'Roofing', code: 'R', category: 'EXTERIOR' },
  { name: 'Waterproofing', code: 'WP', category: 'EXTERIOR' },
  { name: 'Insulation', code: 'IN', category: 'ARCHITECTURAL' },
  { name: 'Drywall', code: 'D', category: 'FINISHES' },
  { name: 'Acoustic Ceilings', code: 'AC', category: 'FINISHES' },
  { name: 'Flooring — Hard Surface', code: 'FH', category: 'FINISHES' },
  { name: 'Flooring — Carpet', code: 'FC', category: 'FINISHES' },
  { name: 'Tile', code: 'TL', category: 'FINISHES' },
  { name: 'Paint', code: 'PT', category: 'FINISHES' },
  { name: 'Wall Coverings', code: 'WC', category: 'FINISHES' },
  { name: 'Millwork', code: 'MW', category: 'ARCHITECTURAL' },
  { name: 'Casework', code: 'CW', category: 'ARCHITECTURAL' },
  { name: 'Doors & Hardware', code: 'DH', category: 'ARCHITECTURAL' },
  { name: 'Glass & Glazing', code: 'GG', category: 'ARCHITECTURAL' },
  { name: 'Specialties', code: 'SP', category: 'SPECIALTIES' },
  { name: 'Demolition', code: 'DM', category: 'GENERAL' },
  { name: 'Site Work / Earthwork', code: 'SW', category: 'SITE' },
  { name: 'Landscaping', code: 'LS', category: 'SITE' },
  { name: 'Asphalt / Paving', code: 'AP', category: 'SITE' },
  { name: 'Site Utilities', code: 'SU', category: 'SITE' },
  { name: 'Kitchen Equipment', code: 'KE', category: 'EQUIPMENT' },
  { name: 'Appliances', code: 'AQ', category: 'EQUIPMENT' },
  { name: 'Elevators / Lifts', code: 'EL', category: 'EQUIPMENT' },
  { name: 'Signage', code: 'SG', category: 'SPECIALTIES' },
  { name: 'General Conditions', code: 'GC', category: 'GENERAL' },
  { name: 'Other', code: 'OT', category: 'GENERAL' },
];

const SAMPLE_MAPPINGS: Record<string, string> = {
  'electrical work': 'E',
  'electric': 'E',
  'elec': 'E',
  'plumbing & piping': 'P',
  'plumber': 'P',
  'heating ventilation and air conditioning': 'M',
  'hvac mechanical': 'M',
  'mechanical': 'M',
  'fire sprinkler': 'FP',
  'sprinkler': 'FP',
  'data / comm': 'LV',
  'low voltage / data': 'LV',
  'concrete foundations': 'C',
  'flatwork': 'CF',
  'block / masonry': 'MS',
  'structural steel erection': 'ST',
  'steel erection': 'ST',
  'metal framing': 'FM',
  'wood framing': 'FW',
  'roofing & sheet metal': 'R',
  'waterproofing & caulking': 'WP',
  'drywall & framing': 'D',
  'acoustical ceilings': 'AC',
  'flooring': 'FH',
  'carpet': 'FC',
  'ceramic tile': 'TL',
  'painting': 'PT',
  'painting & wall covering': 'PT',
  'finish carpentry': 'MW',
  'cabinets': 'CW',
  'doors hardware': 'DH',
  'glazing': 'GG',
  'demo': 'DM',
  'demolition & abatement': 'DM',
  'earthwork': 'SW',
  'paving': 'AP',
  'landscape': 'LS',
  'elevator': 'EL',
  'signs': 'SG',
};

export async function seedTrades(prisma: PrismaClient, orgId?: string) {
  const codeToId = new Map<string, string>();

  for (let i = 0; i < CANONICAL_TRADES.length; i++) {
    const t = CANONICAL_TRADES[i];
    const record = await prisma.tradeCanonical.upsert({
      where: { code: t.code },
      update: { name: t.name, category: t.category, displayOrder: i + 1 },
      create: { name: t.name, code: t.code, category: t.category, displayOrder: i + 1 },
    });
    codeToId.set(t.code, record.id);
  }

  console.log(`[seedTrades] upserted ${CANONICAL_TRADES.length} canonical trades`);

  if (!orgId) return;

  let mappingCount = 0;
  for (const [rawTrade, code] of Object.entries(SAMPLE_MAPPINGS)) {
    const canonicalId = codeToId.get(code);
    if (!canonicalId) continue;

    await prisma.tradeMapping.upsert({
      where: {
        organizationId_rawTrade: { organizationId: orgId, rawTrade },
      },
      update: { tradeCanonicalId: canonicalId },
      create: {
        organizationId: orgId,
        rawTrade,
        tradeCanonicalId: canonicalId,
      },
    });
    mappingCount++;
  }

  console.log(`[seedTrades] upserted ${mappingCount} trade mappings for org ${orgId}`);
}
