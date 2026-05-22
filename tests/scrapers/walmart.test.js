const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseNextData,
  extractItems,
  isSoldByWalmart,
  isPokemonProduct,
  getStockStatus,
  normalizeItem,
} = require('../../scrapers/walmart');

const WALMART_SELLER_ID = 'F55CDC31AB754BB68FE0B39041159D63';

const makeItem = (overrides = {}) => ({
  usItemId: 'W001',
  name: 'Pokemon Trading Card Game: Booster Pack',
  brand: 'The Pokemon Company',
  sellerName: 'Walmart.com',
  sellerId: WALMART_SELLER_ID,
  price: 4.99,
  priceInfo: { linePrice: '$4.99', wasPrice: null },
  isOutOfStock: false,
  availabilityStatusV2: { value: 'IN_STOCK' },
  preOrder: { isPreOrder: false },
  canonicalUrl: '/ip/pokemon-tcg-booster-pack/W001',
  ...overrides,
});

function makeNextDataHtml(items) {
  const nextData = {
    props: {
      pageProps: {
        initialData: {
          searchResult: {
            itemStacks: [{ items }],
            paginationV2: { maxPage: 2 },
            aggregatedCount: items.length,
          },
        },
      },
    },
  };
  return `<html><head></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
  </body></html>`;
}

describe('Walmart scraper — parseNextData', () => {
  it('extracts __NEXT_DATA__ from HTML', () => {
    const html = makeNextDataHtml([makeItem()]);
    const result = parseNextData(html);
    assert.ok(result !== null);
    assert.ok(result.props?.pageProps?.initialData?.searchResult);
  });

  it('returns null when script tag is absent', () => {
    assert.equal(parseNextData('<html><body></body></html>'), null);
  });

  it('returns null when JSON is malformed', () => {
    const html = '<script id="__NEXT_DATA__">{invalid json</script>';
    assert.equal(parseNextData(html), null);
  });
});

describe('Walmart scraper — extractItems', () => {
  it('returns items from itemStacks', () => {
    const html = makeNextDataHtml([makeItem(), makeItem({ usItemId: 'W002' })]);
    const nextData = parseNextData(html);
    const items = extractItems(nextData);
    assert.equal(items.length, 2);
    assert.equal(items[0].usItemId, 'W001');
  });

  it('returns empty array when no itemStacks', () => {
    const items = extractItems({ props: { pageProps: { initialData: {} } } });
    assert.deepEqual(items, []);
  });
});

describe('Walmart scraper — isSoldByWalmart', () => {
  it('returns true for Walmart.com seller name', () => {
    assert.equal(isSoldByWalmart(makeItem()), true);
  });

  it('returns true matching by sellerId when name differs', () => {
    assert.equal(isSoldByWalmart(makeItem({ sellerName: 'Something Else', sellerId: WALMART_SELLER_ID })), true);
  });

  it('returns false for third-party seller', () => {
    assert.equal(isSoldByWalmart(makeItem({ sellerName: 'ToyMart', sellerId: 'DIFFERENT' })), false);
  });
});

describe('Walmart scraper — isPokemonProduct', () => {
  it('matches items with "pokemon" in name', () => {
    assert.equal(isPokemonProduct(makeItem()), true);
  });

  it('matches "pokémon" with accent', () => {
    assert.equal(isPokemonProduct(makeItem({ name: 'Pokémon TCG Elite Trainer Box' })), true);
  });

  it('rejects non-Pokemon items', () => {
    assert.equal(isPokemonProduct(makeItem({ name: 'Board Game Collection Set' })), false);
  });
});

describe('Walmart scraper — getStockStatus', () => {
  it('returns in_stock when availabilityStatusV2 is IN_STOCK', () => {
    assert.equal(getStockStatus(makeItem()), 'in_stock');
  });

  it('returns out_of_stock when isOutOfStock is true', () => {
    assert.equal(getStockStatus(makeItem({ isOutOfStock: true })), 'out_of_stock');
  });

  it('returns out_of_stock when availabilityStatusV2 is OUT_OF_STOCK', () => {
    assert.equal(getStockStatus(makeItem({ availabilityStatusV2: { value: 'OUT_OF_STOCK' } })), 'out_of_stock');
  });

  it('returns pre_order when preOrder.isPreOrder is true', () => {
    assert.equal(getStockStatus(makeItem({ preOrder: { isPreOrder: true } })), 'pre_order');
  });

  it('returns in_stock when canAddToCart is true and no other signals', () => {
    const item = makeItem({ availabilityStatusV2: { value: '' }, isOutOfStock: false, canAddToCart: true });
    assert.equal(getStockStatus(item), 'in_stock');
  });
});

describe('Walmart scraper — normalizeItem', () => {
  it('produces the correct shape', () => {
    const p = normalizeItem(makeItem());
    assert.equal(p.id, 'walmart-W001');
    assert.equal(p.retailer, 'walmart');
    assert.equal(p.name, 'Pokemon Trading Card Game: Booster Pack');
    assert.equal(p.price, '$4.99');
    assert.equal(p.priceNumeric, 4.99);
    assert.equal(p.regularPrice, null);
    assert.equal(p.inStock, true);
    assert.equal(p.stockStatus, 'in_stock');
    assert.ok(p.url.includes('walmart.com'));
  });

  it('includes regularPrice when wasPrice differs', () => {
    const p = normalizeItem(makeItem({ priceInfo: { linePrice: '$4.49', wasPrice: '$4.99' } }));
    assert.equal(p.regularPrice, '$4.99');
  });
});
