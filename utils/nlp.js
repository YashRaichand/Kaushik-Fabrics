// ---------------------------------------------------------------------------
// FABRIQUE NLP INTAKE ENGINE (v1 - rule-based)
// Parses free text like: "I have 6 old jeans and 3 cotton shirts, jeans are
// a bit torn" into structured items: [{quantity, category, material}, ...]
// This is the deterministic V1 described in the blueprint. The upgrade path
// (Phase 1+) is to fine-tune a transformer (or call an LLM with structured
// JSON output) on a labeled corpus of real user submissions for far higher
// recall on slang, regional terms, and multi-clause sentences.
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS = {
  jean: 'jeans', jeans: 'jeans', denims: 'jeans',
  shirt: 'shirt', shirts: 'shirt',
  tshirt: 't-shirt', tshirts: 't-shirt',
  kurti: 'kurti', kurtis: 'kurti',
  kurta: 'kurta', kurtas: 'kurta',
  saree: 'saree', sarees: 'saree',
  dress: 'dress', dresses: 'dress',
  jacket: 'jacket', jackets: 'jacket',
  sweater: 'sweater', sweaters: 'sweater',
  sweatshirt: 'sweatshirt', sweatshirts: 'sweatshirt',
  trouser: 'trousers', trousers: 'trousers',
  pant: 'trousers', pants: 'trousers',
  skirt: 'skirt', skirts: 'skirt'
};

const MATERIAL_KEYWORDS = ['cotton', 'denim', 'polyester', 'wool', 'silk', 'linen'];

// Ordered by specificity - more specific phrases must be checked first.
const CONDITION_KEYWORDS = [
  ['like new', 'A'], ['brand new', 'A'], ['excellent', 'A'],
  ['good condition', 'B'], ['lightly used', 'B'], ['good', 'B'],
  ['a bit torn', 'C'], ['slightly worn', 'C'], ['worn out', 'C'], ['faded', 'C'], ['torn', 'C'], ['worn', 'C'],
  ['damaged', 'D'], ['ripped', 'D'], ['bad condition', 'D']
];

function parseFreeText(text) {
  const lower = (text || '').toLowerCase();
  const items = [];
  const materialAlt = MATERIAL_KEYWORDS.join('|');
  const regex = new RegExp('(\\d+)\\s+(?:old|used)?\\s*(?:(' + materialAlt + ')\\s+)?([a-z\\-]+)', 'g');

  let match;
  while ((match = regex.exec(lower)) !== null) {
    const quantity = parseInt(match[1], 10);
    const itemMaterial = match[2] || null;
    const wordRaw = match[3];
    const wordSingular = wordRaw.replace(/s$/, '');
    const category = CATEGORY_KEYWORDS[wordRaw] || CATEGORY_KEYWORDS[wordSingular] || wordSingular;
    if (quantity > 0 && quantity < 500) {
      items.push({ quantity, category, material: itemMaterial, raw: match[0].trim() });
    }
  }

  let globalMaterial = null;
  for (const m of MATERIAL_KEYWORDS) {
    if (lower.includes(m)) { globalMaterial = m; break; }
  }

  let globalCondition = 'B';
  for (const [key, grade] of CONDITION_KEYWORDS) {
    if (lower.includes(key)) { globalCondition = grade; break; }
  }

  return { items, material: globalMaterial, condition: globalCondition, raw: text };
}

module.exports = { parseFreeText };
