// ---------------------------------------------------------------------------
// FABRIQUE PRICING ENGINE
// Formula: Price = BaseRate(material) x weight x ConditionMultiplier
//          x BrandMultiplier x DemandIndex x BulkMultiplier x CompanyMargin
// This is the deterministic rule-based version described in the blueprint's
// "Phase 0" plan. Swap BASE_RATES / DEMAND_INDEX for live values from a
// LightGBM model's output once enough transaction data exists (see
// /ml/training in the full architecture doc for the upgrade path).
// ---------------------------------------------------------------------------

const BASE_RATES = {
  cotton: 40,
  denim: 65,
  polyester: 22,
  wool: 90,
  silk: 110,
  linen: 55,
  blend: 32
};

const CONDITION_MULTIPLIERS = { A: 1.3, B: 1.0, C: 0.65, D: 0.35 };

const BRAND_MULTIPLIERS = { premium: 1.5, mid: 1.15, standard: 1.0, unbranded: 0.9 };

// Simulated live demand signal per material (would be pulled from the
// recycler-side marketplace in production - see /company/lots API).
const DEMAND_INDEX = {
  denim: 1.15,
  cotton: 1.05,
  wool: 1.2,
  silk: 1.1,
  polyester: 0.95,
  linen: 1.0,
  blend: 1.0
};

// Company retains this share as margin/operating cost; the rest is paid out.
const COMPANY_MARGIN = 0.72;

function bulkMultiplier(quantity) {
  if (quantity >= 15) return 1.08;
  if (quantity >= 8) return 1.04;
  if (quantity >= 4) return 1.02;
  return 1.0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function calculatePrice({ material, weightKg, conditionGrade, brandTier, quantity }) {
  const mat = (material || 'blend').toLowerCase();
  const grade = (conditionGrade || 'B').toUpperCase();
  const tier = (brandTier || 'standard').toLowerCase();
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const weight = Math.max(0.1, parseFloat(weightKg) || 0.3);

  const baseRate = BASE_RATES[mat] !== undefined ? BASE_RATES[mat] : BASE_RATES.blend;
  const conditionMultiplier = CONDITION_MULTIPLIERS[grade] !== undefined ? CONDITION_MULTIPLIERS[grade] : 1.0;
  const brandMultiplier = BRAND_MULTIPLIERS[tier] !== undefined ? BRAND_MULTIPLIERS[tier] : 1.0;
  const demandIndex = DEMAND_INDEX[mat] !== undefined ? DEMAND_INDEX[mat] : 1.0;
  const bulk = bulkMultiplier(qty);

  const base = baseRate * weight;
  const conditionAdj = base * conditionMultiplier;
  const brandAdj = conditionAdj * brandMultiplier;
  const demandAdj = brandAdj * demandIndex;
  const assessedValue = demandAdj * bulk;
  const payout = assessedValue * COMPANY_MARGIN;

  return {
    breakdown: {
      baseRatePerKg: baseRate,
      weightKg: weight,
      base: round2(base),
      conditionMultiplier,
      brandMultiplier,
      demandIndex,
      bulkMultiplier: bulk,
      companyMarginRetained: round2(1 - COMPANY_MARGIN)
    },
    assessedValue: round2(assessedValue),
    payout: round2(payout)
  };
}

function environmentalImpact(weightKg) {
  const w = parseFloat(weightKg) || 0;
  // Industry-cited approximate savings per kg of textile diverted from
  // virgin production / landfill (cotton-weighted average).
  return {
    waterLitersSaved: Math.round(w * 2700),
    co2KgSaved: Math.round(w * 3.6 * 10) / 10,
    treesEquivalent: Math.round(((w * 3.6) / 21) * 100) / 100
  };
}

function greenPointsForGarment({ weightKg, conditionGrade }) {
  const w = parseFloat(weightKg) || 0;
  const gradeBonusMap = { A: 15, B: 10, C: 6, D: 3 };
  const gradeBonus = gradeBonusMap[(conditionGrade || 'B').toUpperCase()] || 5;
  return Math.round(w * 5) + gradeBonus;
}

module.exports = { calculatePrice, environmentalImpact, greenPointsForGarment, BASE_RATES };
