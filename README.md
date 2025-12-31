# Geizhals Price Comparison Scraper

Powerful and efficient data extraction tool for Geizhals.eu, Europe's leading price comparison platform. Scrape product listings, detailed specifications, merchant offers, ratings, and pricing information across thousands of electronics, home appliances, and consumer products.

## What You Can Extract

Extract comprehensive product data from Geizhals.eu including:

- **Product Information**: Names, brands, model numbers, descriptions
- **Pricing Data**: Current prices, price ranges, currency information
- **Merchant Offers**: Multiple vendor prices for each product
- **Product Specifications**: Technical details and features
- **Ratings & Reviews**: User ratings, review counts, and quality scores
- **Images**: Product images and thumbnails
- **Availability**: Stock status and shipping information

Perfect for price monitoring, market research, competitive analysis, product catalog building, and e-commerce intelligence.

## Key Features

<ul>
<li><strong>Multi-Domain Support</strong> - Scrape from Geizhals.eu, Geizhals.de, or Geizhals.at</li>
<li><strong>Smart Pagination</strong> - Automatically navigates through multiple result pages</li>
<li><strong>Flexible Filtering</strong> - Filter by category, price range, and search queries</li>
<li><strong>Detail Extraction</strong> - Optional deep scraping of individual product pages</li>
<li><strong>Structured Output</strong> - Clean, consistent JSON format for easy integration</li>
<li><strong>Proxy Support</strong> - Built-in proxy rotation to prevent blocking</li>
<li><strong>Fast Performance</strong> - HTTP-based scraping using CheerioCrawler (no browsers required)</li>
<li><strong>Duplicate Prevention</strong> - Automatic URL deduplication</li>
</ul>

## Input Configuration

Configure the scraper with these parameters to customize your data extraction:

### Basic Settings

<table>
<thead>
<tr>
<th>Parameter</th>
<th>Type</th>
<th>Description</th>
<th>Required</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>category</code></td>
<td>String</td>
<td>Geizhals category code (e.g., <code>hvent</code> for ventilators, <code>nb</code> for notebooks). Find codes in Geizhals URLs.</td>
<td>No</td>
</tr>
<tr>
<td><code>searchQuery</code></td>
<td>String</td>
<td>Search keyword to filter products within category (e.g., "Dyson", "Samsung")</td>
<td>No</td>
</tr>
<tr>
<td><code>startUrl</code></td>
<td>String</td>
<td>Direct Geizhals URL to start scraping from. Overrides category/search parameters.</td>
<td>No</td>
</tr>
<tr>
<td><code>country</code></td>
<td>String</td>
<td>Target domain: <code>eu</code> (Europe), <code>de</code> (Germany), or <code>at</code> (Austria)</td>
<td>No (default: <code>eu</code>)</td>
</tr>
</tbody>
</table>

### Filtering Options

<table>
<thead>
<tr>
<th>Parameter</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>minPrice</code></td>
<td>Number</td>
<td>Minimum product price in EUR</td>
</tr>
<tr>
<td><code>maxPrice</code></td>
<td>Number</td>
<td>Maximum product price in EUR</td>
</tr>
<tr>
<td><code>results_wanted</code></td>
<td>Integer</td>
<td>Maximum number of products to extract (default: 100)</td>
</tr>
<tr>
<td><code>max_pages</code></td>
<td>Integer</td>
<td>Limit on listing pages to visit (default: 20)</td>
</tr>
</tbody>
</table>

### Extraction Settings

<table>
<thead>
<tr>
<th>Parameter</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>collectDetails</code></td>
<td>Boolean</td>
<td>Extract full product specifications and offers from detail pages (default: <code>true</code>)</td>
</tr>
<tr>
<td><code>proxyConfiguration</code></td>
<td>Object</td>
<td>Proxy settings for reliable scraping (recommended: residential proxies)</td>
</tr>
</tbody>
</table>

## Input Examples

### Example 1: Scrape Ventilators Category

```json
{
  "category": "hvent",
  "results_wanted": 50,
  "max_pages": 5,
  "collectDetails": true,
  "country": "eu"
}
```

### Example 2: Search for Specific Brand

```json
{
  "category": "nb",
  "searchQuery": "ThinkPad",
  "minPrice": 500,
  "maxPrice": 1500,
  "results_wanted": 100,
  "country": "de"
}
```

### Example 3: Scrape from Direct URL

```json
{
  "startUrl": "https://geizhals.eu/?cat=hvent&xf=9810_Dyson",
  "collectDetails": true,
  "results_wanted": 30
}
```

## Output Data

The scraper provides structured JSON data with comprehensive product information.

### Output Structure

<table>
<thead>
<tr>
<th>Field</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>name</code></td>
<td>String</td>
<td>Product name/title</td>
</tr>
<tr>
<td><code>brand</code></td>
<td>String</td>
<td>Product brand/manufacturer</td>
</tr>
<tr>
<td><code>description</code></td>
<td>String</td>
<td>Product description</td>
</tr>
<tr>
<td><code>price</code></td>
<td>Number</td>
<td>Current price (lowest available)</td>
</tr>
<tr>
<td><code>currency</code></td>
<td>String</td>
<td>Price currency (typically EUR)</td>
</tr>
<tr>
<td><code>rating</code></td>
<td>Number</td>
<td>Average user rating (1-5 scale)</td>
</tr>
<tr>
<td><code>review_count</code></td>
<td>Number</td>
<td>Total number of reviews</td>
</tr>
<tr>
<td><code>image</code></td>
<td>String</td>
<td>Product image URL</td>
</tr>
<tr>
<td><code>sku</code></td>
<td>String</td>
<td>Product SKU/model number</td>
</tr>
<tr>
<td><code>specifications</code></td>
<td>Object</td>
<td>Technical specifications (when <code>collectDetails: true</code>)</td>
</tr>
<tr>
<td><code>offers</code></td>
<td>Array</td>
<td>List of merchant offers with prices (when <code>collectDetails: true</code>)</td>
</tr>
<tr>
<td><code>offers_count</code></td>
<td>Number</td>
<td>Total number of available offers</td>
</tr>
<tr>
<td><code>url</code></td>
<td>String</td>
<td>Product detail page URL</td>
</tr>
<tr>
<td><code>scraped_from</code></td>
<td>String</td>
<td>Source type: <code>listing</code> or <code>detail</code></td>
</tr>
</tbody>
</table>

### Example Output

```json
{
  "name": "Dyson Cool AM07 Tower Fan",
  "brand": "Dyson",
  "description": "Tower fan with Air Multiplier technology",
  "price": 275.00,
  "currency": "EUR",
  "rating": 4.5,
  "review_count": 28,
  "image": "https://geizhals.eu/p/123456.jpg",
  "sku": "AM07",
  "specifications": {
    "Type": "Tower Fan",
    "Power": "56W",
    "Height": "100cm",
    "Features": "Remote control, Sleep timer"
  },
  "offers": [
    {
      "merchant": "Amazon.de",
      "price": 275.00,
      "currency": "EUR"
    },
    {
      "merchant": "MediaMarkt",
      "price": 289.99,
      "currency": "EUR"
    }
  ],
  "offers_count": 12,
  "url": "https://geizhals.eu/dyson-cool-am07-tower-fan-a123456.html",
  "scraped_from": "detail"
}
```

## How to Use

### Using Apify Console

<ol>
<li>Navigate to the Actor page in Apify Console</li>
<li>Configure input parameters in the Input tab</li>
<li>Click "Start" to begin scraping</li>
<li>Monitor progress in the Log tab</li>
<li>Download results from the Dataset tab</li>
</ol>

### Using Apify API

```javascript
const ApifyClient = require('apify-client');

const client = new ApifyClient({
    token: 'YOUR_APIFY_TOKEN',
});

const input = {
    category: 'hvent',
    results_wanted: 50,
    collectDetails: true,
};

const run = await client.actor('YOUR_ACTOR_ID').call(input);
const { items } = await client.dataset(run.defaultDatasetId).listItems();

console.log(items);
```

### Using Apify CLI

```bash
apify call YOUR_ACTOR_ID --input='{"category":"hvent","results_wanted":50}'
```

## Common Use Cases

### Price Monitoring
Track product prices across multiple merchants to identify the best deals and price trends over time.

### Market Research
Analyze product availability, pricing strategies, and competitive positioning across different categories.

### Product Catalog Building
Build comprehensive product catalogs with specifications, images, and pricing for e-commerce platforms.

### Competitive Intelligence
Monitor competitor product offerings, pricing, and merchant partnerships.

### Price Comparison Tools
Power your own price comparison service with fresh, accurate data from Geizhals.

## Performance & Costs

<table>
<thead>
<tr>
<th>Metric</th>
<th>Details</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Speed</strong></td>
<td>~50-100 products per minute (with detail scraping)<br>~200-300 products per minute (listing only)</td>
</tr>
<tr>
<td><strong>Resource Usage</strong></td>
<td>Low memory footprint, HTTP-based (no browser)</td>
</tr>
<tr>
<td><strong>Recommended Proxy</strong></td>
<td>Residential proxies for optimal reliability</td>
</tr>
<tr>
<td><strong>Compute Units</strong></td>
<td>~0.01 CU per 100 products (approximate)</td>
</tr>
</tbody>
</table>

## Best Practices

<ul>
<li><strong>Use Residential Proxies</strong> - Geizhals may rate-limit datacenter IPs. Residential proxies ensure reliable scraping.</li>
<li><strong>Set Reasonable Limits</strong> - Use <code>results_wanted</code> and <code>max_pages</code> to avoid unnecessarily long runs.</li>
<li><strong>Enable Detail Scraping Selectively</strong> - Set <code>collectDetails: false</code> for faster scraping if you only need basic product information.</li>
<li><strong>Category Codes</strong> - Find category codes by browsing Geizhals.eu and extracting the <code>cat</code> parameter from URLs.</li>
<li><strong>Price Filtering</strong> - Use <code>minPrice</code> and <code>maxPrice</code> to focus on specific price ranges.</li>
<li><strong>Schedule Regular Runs</strong> - Set up scheduled runs to monitor price changes and product availability.</li>
</ul>

## Troubleshooting

### No Results Returned

<ul>
<li>Verify the category code is correct</li>
<li>Check if the search query matches existing products</li>
<li>Ensure price filters aren't too restrictive</li>
<li>Try increasing <code>max_pages</code></li>
</ul>

### Rate Limiting / Blocking

<ul>
<li>Enable residential proxies in <code>proxyConfiguration</code></li>
<li>Reduce <code>maxConcurrency</code> if making custom modifications</li>
<li>Add delays between requests if needed</li>
</ul>

### Missing Product Details

<ul>
<li>Ensure <code>collectDetails</code> is set to <code>true</code></li>
<li>Some products may have limited information available</li>
<li>Check if the product URL is accessible</li>
</ul>

## Data Freshness

Data is scraped in real-time during each Actor run, ensuring you receive the most current pricing and availability information directly from Geizhals.

## Legal & Ethical Considerations

This Actor is designed for legitimate use cases such as market research, price monitoring, and data analysis. Please ensure your use complies with:

<ul>
<li>Geizhals.eu Terms of Service</li>
<li>Applicable data protection regulations (GDPR, etc.)</li>
<li>Robots.txt guidelines</li>
<li>Fair use principles (reasonable request rates, proxy usage)</li>
</ul>

Respect rate limits and use proxies to avoid overloading the target server.

## Support & Feedback

Have questions or need assistance? Contact support through the Apify platform or leave feedback on the Actor page.

## Version History

- **v1.0.0** - Initial release with full Geizhals scraping capabilities

---

Built with ❤️ using Apify SDK and Crawlee
