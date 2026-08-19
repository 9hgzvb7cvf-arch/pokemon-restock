const axios = require('axios');

const SEARCH_URL = 'https://www.costco.com/CatalogSearch?dept=All&keyword=pokemon';

function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeCostco() {
  console.log('[Costco] Searching for Pokemon cards');

  try {
    const response = await axios.get(SEARCH_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      timeout: 30000,
    });

    const html = response.data || '';
    const products = [];

    const linkRegex =
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = cleanText(match[2]);

      if (!text) continue;

      const lower = text.toLowerCase();

      if (
        !lower.includes('pokemon') &&
        !lower.includes('pokémon')
      ) {
        continue;
      }

      const url = href.startsWith('http')
        ? href
        : `https://www.costco.com${href}`;

      const id =
        url.match(/product\.([0-9]+)/i)?.[1] ||
        Buffer.from(url).toString('base64').slice(0, 20);

      products.push({
        id: `costco-${id}`,
        retailer: 'costco',
        name: text,
        price: 'Check Costco',
        priceNumeric: null,
        url,
        inStock: true,
        stockStatus: 'in_stock',
        inStoreStatus: null,
        releaseDate: null,
      });
    }

    const unique = Array.from(
      new Map(products.map(product => [product.url, product])).values(),
    );

    console.log(`[Costco] Found ${unique.length} Pokemon products`);

    return unique;
  } catch (err) {
    console.error(`[Costco] Failed: ${err.message}`);
    return [];
  }
}

if (require.main === module) {
  scrapeCostco()
    .then(products => console.log(JSON.stringify(products, null, 2)))
    .catch(err => {
      console.error('[Costco] Fatal:', err.message);
      process.exit(1);
    });
}

module.exports = { scrapeCostco };
