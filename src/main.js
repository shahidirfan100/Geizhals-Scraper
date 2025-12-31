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
            // Strategy 1: Direct pagination link
            const nextPageNum = currentPage + 1;
            const nextLink = $(`.gpagenav a[href*="pg=${nextPageNum}"]`).first().attr('href');
            if (nextLink) return toAbs(nextLink, base);

            // Strategy 2: rel="next"
            const relNext = $('a[rel="next"]').attr('href');
            if (relNext) return toAbs(relNext, base);

            // Strategy 3: Text-based detection
            const nextBtn = $('.gpagenav a, .pagination a').filter((_, el) => {
                const text = $(el).text().trim().toLowerCase();
                return text.includes('nächste') || text.includes('next') || text === '›' || text === '»';
            }).first().attr('href');
            if (nextBtn) return toAbs(nextBtn, base);

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
                        // Quick scrape from listing page
                        const remaining = RESULTS_WANTED - saved;
                        const products = [];

                        // Try multiple selector strategies
                        const $items = $('.productlist__item, .listview__item, [class*="product"]').filter((_, el) => {
                            return $(el).find('a[href*="-a"]').length > 0;
                        });

                        $items.slice(0, remaining).each((_, el) => {
                            try {
                                const $el = $(el);
                                const $link = $el.find('a[href*="-a"]').first();
                                const productLink = $link.attr('href');
                                const productName = $link.text().trim() || $el.find('h2, h3, [class*="name"], [class*="title"]').first().text().trim();

                                const priceText = $el.find('.gh_price, [class*="price"]').first().text().trim();
                                const price = parsePrice(priceText);

                                if (productLink && productName) {
                                    const product = {
                                        name: productName,
                                        price,
                                        currency: 'EUR',
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

                        // Extract from HTML with multiple strategies
                        const productName = $('h1[class*="variant"], h1[class*="product"], h1').first().text().trim() || null;
                        const description = $('.variant__description, .product__description, [class*="description"]').first().text().trim() || null;
                        const brand = $('.variant__header__manufacturer, .product__brand, [class*="brand"], [class*="manufacturer"]').first().text().trim() || null;
                        const $img = $('img[class*="variant"], img[class*="product"], .product img').first();
                        const image = $img.attr('src') || $img.attr('data-src') || null;

                        const priceText = $('.gh_price, .offer__price, [class*="price"]').first().text().trim();
                        const price = parsePrice(priceText);

                        const ratingText = $('.variant__rating__value, .rating__value, [class*="rating"]').first().text().trim();
                        const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : null;
                        const reviewCount = parseInt($('.variant__rating__count, .rating__count, [class*="review"]').first().text().replace(/\D/g, '')) || null;

                        // Extract specifications
                        const specifications = {};
                        $('.variant__specs li, .product__specs li, [class*="specs"] li, .specs dt, .specs dd').each((_, spec) => {
                            const $spec = $(spec);
                            const text = $spec.text().trim();
                            const match = text.match(/^([^:•]+)[:|•]\s*(.+)$/);
                            if (match) {
                                specifications[match[1].trim()] = match[2].trim();
                            }
                        });

                        // Extract offers/merchants
                        const offers = [];
                        $('.offer__item, .merchant__item, [class*="offer"]').each((_, offer) => {
                            try {
                                const $offer = $(offer);
                                const merchantName = $offer.find('.offer__merchant, .merchant__name, [class*="merchant"]').text().trim();
                                const offerPrice = $offer.find('.offer__price, [class*="price"]').text().trim();
                                const parsedPrice = parsePrice(offerPrice);

                                if (merchantName && parsedPrice) {
                                    offers.push({
                                        merchant: merchantName,
                                        price: parsedPrice,
                                        currency: 'EUR',
                                    });
                                }
                            } catch (err) {
                                crawlerLog.debug(`Error extracting offer: ${err.message}`);
                            }
                        });

                        const item = {
                            name: jsonLd?.name || productName,
                            description: jsonLd?.description || description,
                            brand: jsonLd?.brand || brand,
                            image: jsonLd?.image || (image ? toAbs(image, request.url) : null),
                            sku: jsonLd?.sku || null,
                            product_id: extractProductId(request.url),
                            price: jsonLd?.offers?.price || price,
                            currency: jsonLd?.offers?.currency || 'EUR',
                            rating: jsonLd?.aggregateRating?.ratingValue || rating,
                            review_count: jsonLd?.aggregateRating?.reviewCount || reviewCount,
                            specifications: Object.keys(specifications).length > 0 ? specifications : null,
                            offers: offers.length > 0 ? offers : null,
                            offers_count: offers.length || null,
                            lowest_price: offers.length > 0 ? Math.min(...offers.map(o => o.price)) : price,
                            url: request.url,
                            scraped_from: 'detail',
                            scraped_at: new Date().toISOString(),
                        };

                        if (validateProduct(item)) {
                            await Dataset.pushData(item);
                            saved++;
                            crawlerLog.info(`✅ Saved: ${item.name} (${saved}/${RESULTS_WANTED})`);
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
