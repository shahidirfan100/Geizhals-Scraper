// Geizhals.eu Price Comparison Scraper - Production-Ready Implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

// Single-entrypoint main
await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            category = 'hvent',
            searchQuery = '',
            results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 20,
            collectDetails = true,
            startUrl,
            startUrls,
            url,
            proxyConfiguration,
            minPrice,
            maxPrice,
            country = 'eu',
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 20;

        log.info('🚀 Starting Geizhals scraper', {
            category,
            searchQuery,
            results_wanted: RESULTS_WANTED,
            max_pages: MAX_PAGES,
            collectDetails,
            country,
        });

        const toAbs = (href, base = 'https://geizhals.eu') => {
            try {
                return new URL(href, base).href;
            } catch {
                return null;
            }
        };

        const buildStartUrl = (cat, query, minP, maxP) => {
            const domain = country === 'at' ? 'geizhals.at' : country === 'de' ? 'geizhals.de' : 'geizhals.eu';
            const u = new URL(`https://${domain}/`);
            if (cat) u.searchParams.set('cat', String(cat).trim());
            if (query) u.searchParams.set('fs', String(query).trim());
            if (minP) {
                u.searchParams.set('v', 'e');
                u.searchParams.set('plz', String(minP));
            }
            if (maxP) u.searchParams.set('plh', String(maxP));
            return u.href;
        };

        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) {
            initial.push(...startUrls);
        }
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) {
            initial.push(buildStartUrl(category, searchQuery, minPrice, maxPrice));
        }

        log.info(`📍 Start URL(s): ${initial.join(', ')}`);

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        let pagesVisited = 0;
        const seenUrls = new Set();

        // Extract product ID from Geizhals URL
        function extractProductId(url) {
            const match = url.match(/-a(\d+)\.html/);
            return match ? match[1] : null;
        }

        // Extract from JSON-LD
        function extractProductFromJsonLd($) {
            const scripts = $('script[type="application/ld+json"]');
            for (let i = 0; i < scripts.length; i++) {
                try {
                    const parsed = JSON.parse($(scripts[i]).html() || '');
                    const arr = Array.isArray(parsed) ? parsed : [parsed];
                    for (const e of arr) {
                        if (!e) continue;
                        const t = e['@type'] || e.type;
                        if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) {
                            return {
                                name: e.name || null,
                                description: e.description || null,
                                brand: e.brand?.name || null,
                                image: e.image || null,
                                sku: e.sku || e.mpn || null,
                                offers: e.offers ? {
                                    price: e.offers.price || e.offers.lowPrice || null,
                                    currency: e.offers.priceCurrency || 'EUR',
                                    availability: e.offers.availability || null,
                                } : null,
                                aggregateRating: e.aggregateRating ? {
                                    ratingValue: e.aggregateRating.ratingValue || null,
                                    reviewCount: e.aggregateRating.reviewCount || null,
                                } : null,
                            };
                        }
                    }
                } catch (e) {
                    /* ignore parsing errors */
                }
            }
            return null;
        }

        // Find product links with multiple selector strategies
        function findProductLinks($, base) {
            const links = new Set();

            // Strategy 1: Direct product card links
            $('.productlist__item a[href*="-a"], .listview__item a[href*="-a"]').each((_, a) => {
                const href = $(a).attr('href');
                if (href && /-a\d+\.html/i.test(href)) {
                    const abs = toAbs(href, base);
                    if (abs && !seenUrls.has(abs)) {
                        links.add(abs);
                        seenUrls.add(abs);
                    }
                }
            });

            // Strategy 2: All links matching product URL pattern
            if (links.size === 0) {
                $('a[href]').each((_, a) => {
                    const href = $(a).attr('href');
                    if (href && /-a\d+\.html/i.test(href)) {
                        const abs = toAbs(href, base);
                        if (abs && !seenUrls.has(abs)) {
                            links.add(abs);
                            seenUrls.add(abs);
                        }
                    }
                });
            }

            return [...links];
        }

        // Find next page with multiple strategies
        function findNextPage($, base, currentPage) {
            // Strategy 1: Look for "weiter" (next) button in Geizhals pagination
            let nextBtn = $('.xfsearchlink a, .listnavig a, a.listnavig__link').filter((_, el) => {
                const text = $(el).text().trim().toLowerCase();
                const title = $(el).attr('title')?.toLowerCase() || '';
                return text === 'weiter' || title.includes('weiter') || text === '»' || 
                       text.includes('nächste') || text.includes('next');
            }).first();
            
            if (nextBtn.length > 0) {
                const href = nextBtn.attr('href');
                if (href) return toAbs(href, base);
            }

            // Strategy 2: Build next page URL with pg parameter
            const nextPageNum = currentPage + 1;
            if (base.includes('?')) {
                // Check if current page has pg parameter
                if (base.includes('&pg=') || base.includes('?pg=')) {
                    return base.replace(/(\?|&)pg=\d+/, `$1pg=${nextPageNum}`);
                } else {
                    return `${base}&pg=${nextPageNum}`;
                }
            }

            // Strategy 3: rel="next"
            const relNext = $('a[rel="next"]').attr('href');
            if (relNext) return toAbs(relNext, base);

            return null;
        }

        // Parse price from text
        function parsePrice(priceText) {
            if (!priceText) return null;
            const cleaned = priceText.replace(/[^\d,.]/g, '').replace(',', '.');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? null : parsed;
        }

        // Validate product data
        function validateProduct(product) {
            if (!product.name || product.name.length < 3) {
                log.softFail('Product missing valid name', { product });
                return false;
            }
            return true;
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 5,
            useSessionPool: true,
            persistCookiesPerSession: true,
            maxConcurrency: 5,
            minConcurrency: 1,
            requestHandlerTimeoutSecs: 90,
            
            // Stealth headers
            preNavigationHooks: [
                async ({ request, session }, gotOptions) => {
                    gotOptions.headers = {
                        ...gotOptions.headers,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'max-age=0',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                    };

                    // Add referer for non-initial requests
                    if (request.userData?.referrer) {
                        gotOptions.headers['Referer'] = request.userData.referrer;
                    }
                },
            ],

            async requestHandler({ request, $, enqueueLinks, log: crawlerLog, session }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 1;

                crawlerLog.debug(`Processing ${label} page ${pageNo}: ${request.url}`);

                if (label === 'LIST') {
                    pagesVisited++;
                    const links = findProductLinks($, request.url);
                    crawlerLog.info(`📄 LIST page ${pageNo} -> found ${links.length} products (${saved}/${RESULTS_WANTED} collected)`);

                    if (links.length === 0) {
                        crawlerLog.warning(`⚠️ No product links found on page ${pageNo}. Selectors may need adjustment.`);
                        crawlerLog.debug(`Page title: ${$('title').text()}`);
                        crawlerLog.debug(`Sample content: ${$.root().text().substring(0, 500)}`);
                    }

                    if (collectDetails && links.length > 0) {
                        const remaining = RESULTS_WANTED - saved;
                        const toEnqueue = links.slice(0, Math.max(0, remaining));
                        if (toEnqueue.length) {
                            await enqueueLinks({
                                urls: toEnqueue,
                                userData: { label: 'DETAIL', referrer: request.url },
                            });
                            crawlerLog.info(`➕ Enqueued ${toEnqueue.length} detail pages`);
                        }
                    } else if (!collectDetails && links.length > 0) {
                        // Quick scrape from listing page - clean data extraction
                        const remaining = RESULTS_WANTED - saved;
                        const products = [];

                        // Target specific Geizhals product list items (avoid ads, filters, banners)
                        const $items = $('.productlist__item, .listview__item, [data-product-id]').filter((_, el) => {
                            const $el = $(el);
                            // Must have a product link with Geizhals product pattern
                            return $el.find('a[href*="-a"]').length > 0;
                        });

                        $items.slice(0, remaining).each((_, el) => {
                            try {
                                const $el = $(el);
                                
                                // Extract product link and name
                                const $link = $el.find('a.productlist__link, a[href*="-a"]').first();
                                const productLink = $link.attr('href');
                                let productName = $link.attr('title') || $link.text().trim();
                                
                                // Fallback to structured elements if link text is empty
                                if (!productName || productName.length < 3) {
                                    productName = $el.find('.productlist__title, h2, h3, [class*="product-name"]').first().text().trim();
                                }

                                // Extract price (avoid merchant/shop prices)
                                const priceText = $el.find('.gh_price, .productlist__price').first().text().trim();
                                const price = parsePrice(priceText);

                                // Extract basic info if available (optional for listing mode)
                                const brand = $el.find('.productlist__manufacturer, [class*="brand"]').first().text().trim() || null;
                                const imageUrl = $el.find('img.productlist__image, img[data-src]').first().attr('data-src') || 
                                               $el.find('img').first().attr('src') || null;

                                if (productLink && productName && productName.length > 3) {
                                    const product = {
                                        name: productName.replace(/\s+/g, ' ').trim(), // Clean whitespace
                                        brand,
                                        price,
                                        currency: 'EUR',
                                        image: imageUrl ? toAbs(imageUrl, request.url) : null,
                                        url: toAbs(productLink, request.url),
                                        product_id: extractProductId(productLink),
                                        scraped_from: 'listing',
                                        scraped_at: new Date().toISOString(),
                                    };

                                    if (validateProduct(product)) {
                                        products.push(product);
                                    }
                                }
                            } catch (err) {
                                crawlerLog.debug(`Error extracting product from listing: ${err.message}`);
                            }
                        });

                        if (products.length) {
                            await Dataset.pushData(products);
                            saved += products.length;
                            crawlerLog.info(`✅ Saved ${products.length} products from listing (total: ${saved})`);
                        }
                    }

                    // Pagination
                    if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const next = findNextPage($, request.url, pageNo);
                        if (next) {
                            crawlerLog.info(`➡️ Enqueueing page ${pageNo + 1}: ${next}`);
                            await enqueueLinks({
                                urls: [next],
                                userData: { label: 'LIST', pageNo: pageNo + 1, referrer: request.url },
                            });
                        } else {
                            crawlerLog.info('📍 Pagination complete - no more pages found');
                        }
                    } else {
                        if (saved >= RESULTS_WANTED) {
                            crawlerLog.info(`✅ Target reached: ${saved}/${RESULTS_WANTED} products`);
                        }
                        if (pageNo >= MAX_PAGES) {
                            crawlerLog.info(`📍 Max pages reached: ${pageNo}/${MAX_PAGES}`);
                        }
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) {
                        crawlerLog.debug('Skipping detail page - target reached');
                        return;
                    }

                    try {
                        const jsonLd = extractProductFromJsonLd($);

                        // Extract from HTML with Geizhals-specific selectors (prioritize precise over generic)
                        let productName = $('h1.variant__header__headline, h1[itemprop="name"]').first().text().trim();
                        if (!productName) productName = $('h1').first().text().trim() || null;
                        
                        // Description: Check multiple possible locations
                        let description = null;
                        const $descBlocks = $('#description__text, .variant__description__text, [itemprop="description"]');
                        if ($descBlocks.length > 0) {
                            description = $descBlocks.first().text().trim();
                        }
                        // Also try meta description
                        if (!description || description.length < 20) {
                            description = $('meta[name="description"]').attr('content') || null;
                        }
                        // Filter out Geizhals boilerplate text
                        if (description && (description.includes('Geizhals is an independent') || description.length < 20)) {
                            description = null;
                        }
                        
                        // Brand: multiple strategies
                        let brand = $('.variant__header__manufacturer a, .variant__header__manufacturer').first().text().trim();
                        if (!brand) brand = $('[itemprop="brand"] [itemprop="name"], [itemprop="brand"]').first().text().trim() || null;
                        
                        // Image: check multiple attributes
                        const $img = $('img.variant__header__image, img[itemprop="image"], .variant__header img').first();
                        let image = $img.attr('data-src') || $img.attr('src') || $img.attr('data-lazy') || null;
                        if (!image) {
                            image = $('meta[property="og:image"]').attr('content') || null;
                        }

                        // Price: try multiple selectors
                        const priceText = $('.gh_price, .variant__header__price, [itemprop="price"]').first().text().trim();
                        const price = parsePrice(priceText);

                        // SKU/EAN: Try multiple sources
                        let sku = null;
                        const $eanEl = $('.variant__header__ean, [itemprop="sku"], [itemprop="gtin"], [itemprop="productID"]').first();
                        if ($eanEl.length > 0) {
                            sku = $eanEl.text().trim().replace(/^(EAN|SKU|GTIN):\s*/i, '') || null;
                        }

                        // Rating: Target PRODUCT ratings only (not merchant/shop ratings)
                        let rating = null;
                        let reviewCount = null;
                        
                        // Try itemprop first (most reliable)
                        const $ratingValue = $('[itemprop="ratingValue"]').first();
                        if ($ratingValue.length > 0) {
                            rating = parseFloat($ratingValue.text().trim().replace(',', '.')) || null;
                        }
                        const $reviewCount = $('[itemprop="reviewCount"]').first();
                        if ($reviewCount.length > 0) {
                            reviewCount = parseInt($reviewCount.text().trim().replace(/\D/g, '')) || null;
                        }
                        
                        // Fallback: check variant__rating block
                        if (!rating) {
                            const ratingText = $('.variant__rating__value, .rating__value').first().text().trim();
                            rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : null;
                        }
                        if (!reviewCount) {
                            const reviewText = $('.variant__rating__count, .rating__count').first().text().trim();
                            reviewCount = reviewText ? parseInt(reviewText.replace(/\D/g, '')) : null;
                        }

                        // Extract specifications (product features)
                        const specifications = {};
                        
                        // Try structured data first
                        $('[itemtype*="PropertyValue"]').each((_, prop) => {
                            const $prop = $(prop);
                            const key = $prop.find('[itemprop="name"]').text().trim();
                            const value = $prop.find('[itemprop="value"]').text().trim();
                            if (key && value) {
                                specifications[key] = value;
                            }
                        });
                        
                        // Also parse from variant specs list
                        $('.variant__specs li, .variant__specs__item').each((_, spec) => {
                            const $spec = $(spec);
                            let text = $spec.text().trim();
                            // Match "Label: Value" patterns
                            const match = text.match(/^([^:]+):\s*(.+)$/);
                            if (match) {
                                const key = match[1].trim();
                                const value = match[2].trim();
                                // Skip if it looks like merchant/shop info
                                if (!key.match(/shop|merchant|vendor|rating|review|preis|price/i)) {
                                    specifications[key] = value;
                                }
                            }
                        });

                        // Extract offers/merchants - be more selective to avoid duplicates
                        const offers = [];
                        const seenMerchants = new Set();
                        
                        // Target Geizhals offer list items
                        $('.offer__item, .offerlist__item, tr[class*="offer"]').each((_, offer) => {
                            try {
                                const $offer = $(offer);
                                
                                // Extract merchant name - try multiple selectors
                                let merchantName = $offer.find('.offer__merchant-name, .offerlist__shopinfo__name a').first().text().trim();
                                if (!merchantName) {
                                    merchantName = $offer.find('a[href*="/gh.html"], a[href*="/go.html"]').first().text().trim();
                                }
                                if (!merchantName) {
                                    merchantName = $offer.find('.shop-name, .merchant-name').first().text().trim();
                                }
                                
                                // Extract price - look for price in offer row
                                let offerPrice = $offer.find('.offer__price, .gh_price').first().text().trim();
                                if (!offerPrice) {
                                    offerPrice = $offer.find('td:nth-child(2), .price').first().text().trim();
                                }
                                const parsedPrice = parsePrice(offerPrice);

                                // Clean merchant name
                                merchantName = merchantName.replace(/\s*\([^)]*\)\s*/g, '').trim();

                                // Only add if valid and unique merchant
                                if (merchantName && merchantName.length > 1 && parsedPrice && !seenMerchants.has(merchantName)) {
                                    // Filter out non-merchant text (ratings, info, etc.)
                                    if (!merchantName.match(/rating|bewertung|information|agb|^[0-9.,€$]+$/i)) {
                                        offers.push({
                                            merchant: merchantName,
                                            price: parsedPrice,
                                            currency: 'EUR',
                                        });
                                        seenMerchants.add(merchantName);
                                    }
                                }
                            } catch (err) {
                                crawlerLog.debug(`Error extracting offer: ${err.message}`);
                            }
                        });

                        // Limit offers to top 10 to avoid data bloat
                        const topOffers = offers.slice(0, 10);

                        const item = {
                            name: jsonLd?.name || productName,
                            description: jsonLd?.description || description,
                            brand: jsonLd?.brand || brand,
                            image: jsonLd?.image || (image ? toAbs(image, request.url) : null),
                            sku: jsonLd?.sku || sku,
                            product_id: extractProductId(request.url),
                            price: jsonLd?.offers?.price || price,
                            currency: jsonLd?.offers?.currency || 'EUR',
                            rating: jsonLd?.aggregateRating?.ratingValue || rating,
                            review_count: jsonLd?.aggregateRating?.reviewCount || reviewCount,
                            specifications: Object.keys(specifications).length > 0 ? specifications : null,
                            offers: topOffers.length > 0 ? topOffers : null,
                            offers_count: topOffers.length || null,
                            lowest_price: topOffers.length > 0 ? Math.min(...topOffers.map(o => o.price)) : price,
                            url: request.url,
                            scraped_from: 'detail',
                            scraped_at: new Date().toISOString(),
                        };

                        if (validateProduct(item)) {
                            await Dataset.pushData(item);
                            saved++;
                            // Log extracted fields for debugging
                            const fieldsExtracted = [];
                            if (item.description) fieldsExtracted.push('desc');
                            if (item.brand) fieldsExtracted.push('brand');
                            if (item.image) fieldsExtracted.push('img');
                            if (item.sku) fieldsExtracted.push('sku');
                            if (item.rating) fieldsExtracted.push('rating');
                            if (item.specifications) fieldsExtracted.push('specs');
                            if (item.offers?.length) fieldsExtracted.push(`${item.offers.length}offers`);
                            
                            crawlerLog.info(`✅ Saved: ${item.name} [${fieldsExtracted.join(', ') || 'basic'}] (${saved}/${RESULTS_WANTED})`);
                        } else {
                            crawlerLog.warning(`⚠️ Invalid product data for ${request.url}`);
                        }
                    } catch (err) {
                        crawlerLog.error(`❌ DETAIL extraction failed for ${request.url}: ${err.message}`, { error: err.stack });
                        // Don't throw - continue with other products
                    }
                }
            },

            failedRequestHandler: async ({ request }, error) => {
                log.error(`❌ Request failed: ${request.url}`, {
                    error: error.message,
                    label: request.userData?.label,
                    retryCount: request.retryCount,
                });
            },
        });

        await crawler.run(initial.map((u) => ({ url: u, userData: { label: 'LIST', pageNo: 1 } })));

        log.info('🎉 Scraping completed', {
            products_saved: saved,
            pages_visited: pagesVisited,
            target: RESULTS_WANTED,
            success_rate: saved > 0 ? '100%' : '0%',
        });

        if (saved === 0) {
            log.error('⚠️ No products were scraped! This may indicate:');
            log.error('  1. Selectors need updating (website structure changed)');
            log.error('  2. Proxy issues or IP blocking');
            log.error('  3. Category code is invalid');
            log.error('  4. Network/connectivity problems');
        }
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    log.exception(err, 'Fatal error in main()');
    process.exit(1);
});
