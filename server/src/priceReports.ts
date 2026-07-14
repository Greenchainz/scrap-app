// Crowd-sourced + staff-called + scraped price data layer.
// This is the GasBuddy-style pricing engine for Scrappalot.

import { db, schema } from './db';
import { desc, eq, inArray } from 'drizzle-orm';
import type { YardPriceReport } from './schema';

export { type YardPriceReport };

// Canonical list of tradeable scrap metal grades.
// Both server and mobile use this — add new grades here only.
export const METAL_TYPES = [
  { id: 'copper_bare_bright', label: 'Bare Bright Copper',  category: 'copper'    },
  { id: 'copper_1',           label: '#1 Copper',           category: 'copper'    },
  { id: 'copper_2',           label: '#2 Copper',           category: 'copper'    },
  { id: 'copper_3',           label: '#3 Copper',           category: 'copper'    },
  { id: 'copper_wire_ins',    label: 'Insulated Wire',      category: 'copper'    },
  { id: 'aluminum_cans',      label: 'Aluminum Cans',       category: 'aluminum'  },
  { id: 'aluminum_cast',      label: 'Cast Aluminum',       category: 'aluminum'  },
  { id: 'aluminum_extrusion', label: 'Extrusion (6061)',    category: 'aluminum'  },
  { id: 'aluminum_wheels',    label: 'Aluminum Wheels',     category: 'aluminum'  },
  { id: 'aluminum_siding',    label: 'Aluminum Siding',     category: 'aluminum'  },
  { id: 'steel_hms1',         label: 'HMS #1',              category: 'steel'     },
  { id: 'steel_hms2',         label: 'HMS #2',              category: 'steel'     },
  { id: 'steel_light',        label: 'Light Iron',          category: 'steel'     },
  { id: 'steel_shredded',     label: 'Shredded Steel',      category: 'steel'     },
  { id: 'stainless_304',      label: '304 Stainless',       category: 'stainless' },
  { id: 'stainless_316',      label: '316 Stainless',       category: 'stainless' },
  { id: 'brass_yellow',       label: 'Yellow Brass',        category: 'brass'     },
  { id: 'brass_red',          label: 'Red Brass / Bronze',  category: 'brass'     },
  { id: 'lead',               label: 'Lead',                category: 'lead'      },
  { id: 'zinc',               label: 'Zinc / Die Cast',     category: 'zinc'      },
] as const;

export type MetalTypeId = typeof METAL_TYPES[number]['id'];
export type PriceSource = 'user' | 'staff' | 'scraped';

export const METAL_TYPE_IDS: string[] = METAL_TYPES.map(m => m.id);

// Sanity bounds ($/lb) — reject obviously wrong submissions before they pollute the data.
export const PRICE_BOUNDS: Partial<Record<MetalTypeId, [number, number]>> = {
  copper_bare_bright: [1.5,  8.0],
  copper_1:           [1.2,  7.5],
  copper_2:           [1.0,  7.0],
  copper_3:           [0.5,  6.0],
  copper_wire_ins:    [0.05, 3.0],
  aluminum_cans:      [0.05, 1.5],
  aluminum_cast:      [0.05, 1.5],
  aluminum_extrusion: [0.05, 2.0],
  aluminum_wheels:    [0.05, 1.5],
  aluminum_siding:    [0.05, 1.5],
  steel_hms1:         [0.01, 0.5],
  steel_hms2:         [0.01, 0.4],
  steel_light:        [0.01, 0.3],
  steel_shredded:     [0.01, 0.35],
  stainless_304:      [0.05, 2.5],
  stainless_316:      [0.05, 3.0],
  brass_yellow:       [0.3,  5.0],
  brass_red:          [0.3,  5.5],
  lead:               [0.05, 1.5],
  zinc:               [0.05, 1.5],
};

export function validatePriceBounds(metalType: string, pricePerLb: number): boolean {
  const bounds = PRICE_BOUNDS[metalType as MetalTypeId];
  if (!bounds) return true;
  return pricePerLb >= bounds[0] && pricePerLb <= bounds[1];
}

export async function submitPriceReport(params: {
  yardId: string;
  metalType: string;
  pricePerLb: number;
  source: PriceSource;
  userId?: string;
  notes?: string;
  verified?: boolean;
}): Promise<YardPriceReport> {
  const [report] = await db
    .insert(schema.yardPriceReports)
    .values({
      yardId:     params.yardId,
      metalType:  params.metalType,
      pricePerLb: params.pricePerLb,
      source:     params.source,
      userId:     params.userId ?? null,
      notes:      params.notes ?? null,
      verified:   params.verified ?? false,
    })
    .returning();
  return report!;
}

// Returns the most-recent report per metal type for a single yard.
export async function getLatestPricesForYard(yardId: string): Promise<YardPriceReport[]> {
  const all = await db
    .select()
    .from(schema.yardPriceReports)
    .where(eq(schema.yardPriceReports.yardId, yardId))
    .orderBy(desc(schema.yardPriceReports.reportedAt))
    .limit(200);

  const seen = new Set<string>();
  const latest: YardPriceReport[] = [];
  for (const r of all) {
    if (!seen.has(r.metalType)) {
      seen.add(r.metalType);
      latest.push(r);
    }
  }
  return latest;
}

// Batch fetch for compareYards — returns { yardId: latestReports[] }.
// One report per metal type per yard (most recent wins).
export async function getLatestPricesForYards(
  yardIds: string[],
): Promise<Record<string, YardPriceReport[]>> {
  if (yardIds.length === 0) return {};

  const all = await db
    .select()
    .from(schema.yardPriceReports)
    .where(inArray(schema.yardPriceReports.yardId, yardIds))
    .orderBy(desc(schema.yardPriceReports.reportedAt));

  const byYard: Record<string, YardPriceReport[]> = {};
  for (const r of all) {
    if (!byYard[r.yardId]) byYard[r.yardId] = [];
    const list = byYard[r.yardId]!;
    if (!list.some(e => e.metalType === r.metalType)) {
      list.push(r);
    }
  }
  return byYard;
}
