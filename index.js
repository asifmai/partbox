const Helper = require('./puppeteerhelper');
const fs = require('fs');
const path = require('path');
const _ = require('underscore');
const pLimit = require('p-limit');
let browser;
let categories = [];
categories = JSON.parse(fs.readFileSync('categories.json', 'utf8'));
const excludedCategories = ['Part-Box VIP Gift Card', 'Tools']
const {siteLink} = require('./config');
let products = [];
products = JSON.parse(fs.readFileSync('products.json', 'utf8'));

String.prototype.tru =
     function( n, useWordBoundary ){
         if (this.length <= n) { return this; }
         var subString = this.substr(0, n-1);
         return (useWordBoundary 
            ? subString.substr(0, subString.lastIndexOf(' ')) 
            : subString);
      };

async function run() {
  try {
    browser = await Helper.launchBrowser(true);

    // Fetch Categories
    await fetchCategories();
    await correctCategories();
    fs.writeFileSync('categories.json', JSON.stringify(categories));
    
    // Fetch Product Urls
    await fetchProductsUrls();
    console.log(`Number of Products Links fetched: ${products.length}`);
    fs.writeFileSync('products.json', JSON.stringify(products));

    // Fetch Products Details
    await fetchProducts();

    await browser.close();
    return true;
  } catch (error) {
    console.log(`Bot Run Error: ${error}`);
    return false;
  }
}

// PRODUCT DETAILS FUNCTIONS
const fetchProducts = () => new Promise(async (resolve, reject) => {
  try {
    console.log('Fetching Products Details...');
    const csvHeader = 'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item\r\n';
    fs.writeFileSync('productDetails.csv', csvHeader);

    const limit = pLimit(10);
    const promises = []
    for (let i = 0; i < products.length; i++) {
      promises.push(limit(() => fetchProductDetails(i)));
    }
    await Promise.all(promises);

    resolve();
  } catch (error) {
    console.log(`fetchProducts Error: ${error}`);
    reject(error);
  }
});

const fetchProductDetails = (prodIndex) => new Promise(async (resolve, reject) => {
  try {
    const product = {};
    console.log(`${prodIndex+1}/${products.length} - Fetching Product Details: ${products[prodIndex].url}`);
    const page = await Helper.launchPage(browser, true);
    await page.goto(products[prodIndex].url, {timeout: 0, waitUntil: 'networkidle2'});

    product.url = products[prodIndex].url;
    product.handle = getHandle(products[prodIndex].url);
    product.title = await getTitle(page);
    product.body = await getBody(page);
    product.vendor = await Helper.fetchInnerText('.description > .brand-logo > .brand-logo-text', page);
    product.vendor = product.vendor.replace(/"/gi, "'");
    product.type = products[prodIndex].category;
    product.tags = `${products[prodIndex].category}, ${product.vendor}`;
    product.price = await Helper.fetchAttribute('ul.price > .product-price > span[itemprop="price"]', 'content', page);
    product.image = await Helper.fetchAttribute('.left > .image > a > img', 'src', page);
    product.imageAlt = product.title;
    product.seoTitle = await getSEOTitle(page);
    product.seoDescription = await getSEODescription(page);

    console.log(product);
    let csvLine = `"${product.handle}","${product.title}","${product.body}","${product.vendor}","${product.type}"`
    csvLine += `,"${product.tags}","TRUE","","","","","","","","","","","deny","manual","${product.price}"`;
    csvLine += `,"","TRUE","TRUE","","${product.image}","1","${product.imageAlt}","","${product.seoTitle}"`;
    csvLine += `,"${product.seoDescription}","","","","","","","","","","","","","","","","",""\r\n`;
    fs.appendFileSync('productDetails.csv', csvLine);
    await page.close()
    resolve()
  } catch (error) {
    console.log(`fetchProductDetails (${products[prodIndex].url}) Error: ${error}`);
    reject(error);
  }
});

const getHandle = (url) => {
  let handle = '';
  const handleRegEx = /(?<=\.com\/).*$/gi
  if (handleRegEx.test(url)) {
    handle = url.match(handleRegEx)[0]
  }

  return handle;
}

const getTitle = (page) => new Promise(async (resolve, reject) => {
  try {
    let title = await Helper.fetchInnerText('ul.breadcrumb > li:last-child > a', page);
    title = title.replace(/"/gi, "'");
    let productCode = await Helper.fetchInnerText('.description > .p-model > span.p-model', page);
    productCode = productCode.replace(/"/gi, "'");

    resolve(`${title} ${productCode}`);
  } catch (error) {
    console.log(`getTitle Error: ${error}`);
    reject(error);
  }
})

const getBody = (page) => new Promise(async (resolve, reject) => {
  try {
    let description = await Helper.fetchInnerHTML('.product-tabs > .tabs-content > .tab-pane:first-of-type', page);
    description = description.replace(/"/gi, "'");
    let applications = '';
    const secondTabName = await Helper.fetchInnerText('.product-tabs > ul#tabs > li:nth-of-type(2)', page);
    if (secondTabName == 'Applications') {
      console.log('Application Found');
      applications = await Helper.fetchInnerHTML('.product-tabs > .tabs-content > .tab-pane:nth-of-type(2)', page);
      applications = applications.replace(/"/gi, "'");
    } else {
      console.log('No Application Found');
    }

    resolve(`${description}${applications}`);
  } catch (error) {
    console.log(`getBody Error: ${error}`);
    reject(error);
  }
})

const getSEOTitle = (page) => new Promise(async (resolve, reject) => {
  try {
    let title = await Helper.fetchInnerText('ul.breadcrumb > li:last-child > a', page);
    title = title.replace(/"/gi, "'");
    if (title !== '' && title.length > 70) {
      const maxLength = 70
      title = title.substr(0, maxLength);
      title = title.substr(0, Math.min(title.length, title.lastIndexOf(" ")))
      if (title.endsWith('-')) title = title.substring(0, title.length - 1).trim();
    }
    resolve(title);
  } catch (error) {
    console.log(`getSEOTitle Error: ${error}`);
    reject(error);
  }
})

const getSEODescription = (page) => new Promise(async (resolve, reject) => {
  try {
    let description = await Helper.fetchInnerText('.product-tabs > .tabs-content > .tab-pane:first-of-type', page);
    description = description.replace(/"/gi, "'");
    if (description != '' && description.length > 320) {
      const maxLength = 320;
      description = description.substr(0, maxLength);
      description = description.substr(0, Math.min(description.length, description.lastIndexOf(" ")))
      description = description.substring(0, description.length - 1).trim()
    }
    resolve(description);
  } catch (error) {
    console.log(`getSEODescription Error: ${error}`);
    reject(error);
  }
})

// PRODUCT URLS FUNCTIONS
const fetchProductsUrls = () => new Promise(async (resolve, reject) => {
  try {
    console.log('Fetching Products Links...');
    
    for (let i = 0; i < categories.length; i++) {
      await getProductLinksFromCategory(categories[i], i);
    }
    
    resolve();
  } catch (error) {
    console.log(`fetchProductsUrls Error: ${error}`);
    reject(error);
  }
});

const getProductLinksFromCategory = (cat, index) => new Promise(async (resolve, reject) => {
  try {
    console.log(`${index+1}/${categories.length} - Fetching Product Links from Category: ${cat.url}`);
    const page = await Helper.launchPage(browser, false);
    await page.goto(`${cat.url}#/sort=p.sort_order/order=ASC/limit=100`, {timeout: 0, waitUntil: 'networkidle2'});
    const gotProducts = await page.$('.pagination');
    if (gotProducts) {
      await fetchActualLinks(cat.name, cat.url, page);
    } else {
      const subcats = await page.$$eval(
        '.refine-images > .refine-image > a',
        elms => elms.map(elm => elm.getAttribute('href'))
      );
      console.log(`Category got Subcategories: ${subcats.length}`);
      for (let i = 0; i < subcats.length; i++) {
        await page.goto(`${subcats[i]}#/sort=p.sort_order/order=ASC/limit=100`, {timeout: 0, waitUntil: 'networkidle2'});
        await page.$('.pagination');
        await fetchActualLinks(cat.name, subcats[i], page)
      }
    }
    
    await page.close();
    resolve();
  } catch (error) {
    console.log(`getProductLinksFromCategory(${cat.name}) Error: ${error}`);
    reject(error);
  }
});

const fetchActualLinks = (catname, caturl, page) => new Promise(async (resolve, reject) => {
  try {
    await page.waitFor(10000);
    let noOfPages = 0;
    const gotPages = await page.$('.pagination ul > li:last-child > a');
    if (gotPages) {
      noOfPages = await page.$eval(
          '.pagination ul > li:last-child > a',
          elm => elm.getAttribute('href').match(/(?<=page\=).*$/g)[0]
      )
    } else {
      noOfPages = 1;
    }

    for (let i = 0; i < noOfPages; i++) {
      if (i > 0) {
        await page.goto(`${caturl}#/sort=p.sort_order/order=ASC/limit=100/page=${i+1}`, {timeout: 0, waitUntil: 'networkidle2'});
      }
      await page.waitFor(5000);
      const gotProducts = await page.$('.product-list > .product-list-item .image > a');
      if (gotProducts) {
        const pageUrls = await page.$$eval(
            '.product-list > .product-list-item .image > a',
            elms => elms.map(elm => elm.getAttribute('href'))
        );
        for (let j = 0; j < pageUrls.length; j++) {
          const newProduct = {
            category: catname,
            url: pageUrls[j]
          }
          products.push(newProduct);
        }
      }
    }    
    resolve();
  } catch (error) {
    console.log(`fetchActualLinks Error: ${error}`);
    reject(error);
  }
});

// CATEGORIES FUNCTIONS
const fetchCategories = () => new Promise(async (resolve, reject) => {
  try {
    console.log('Fetching Categories...');

    const page = await Helper.launchPage(browser, true);
    await page.goto(siteLink, {timeout: 0, waitUntil: 'networkidle2'});

    await page.waitForSelector('.mega-menu-categories');
    const categoryBlocks = await page.$$('.mega-menu-categories > .mega-menu > div > .mega-menu-item');
    
    for (let i = 0; i < categoryBlocks.length; i++) {
      const categoryTitle = await categoryBlocks[i].$eval(
          'h3', elm => elm.innerText.trim()
      );
      console.log(`${i + 1}/${categoryBlocks.length} - Fetching category (${categoryTitle})`);

      if (!excludedCategories.includes(categoryTitle)) {
        const subCategories = await categoryBlocks[i].$$('ul > li');
        if (subCategories.length > 0) {
          const lastItem = await categoryBlocks[i].$eval(
            'ul > li:last-child', elm => elm.innerText.trim()
          );
          if (lastItem !== 'View More') {
            for (let i = 0; i < subCategories.length; i++) {
              const category = {
                parent: categoryTitle,
                name: await page.evaluate(elm => elm.innerText.trim(), subCategories[i]),
                url: await subCategories[i].$eval('a', elm => elm.getAttribute('href')),
              }
              if (category.name == 'Other') category.name = `${category.parent} ${category.name}`
              categories.push(category);
            }
          } else {
            const viewMoreUrl = await categoryBlocks[i].$eval(
              'ul > li:last-child > a', elm => elm.getAttribute('href')
            );
            await fetchMoreCategory(viewMoreUrl, categoryTitle);
          }
        }
      }
    }
    
    await page.close();
    resolve(true);
  } catch (error) {
    console.log(`fetchCategories Error: ${error}`);
    reject(error);
  }
});

const fetchMoreCategory = (url, categoryTitle) => new Promise(async (resolve, reject) => {
  try {
    const page = await Helper.launchPage(browser, true);
    await page.goto(url, {timeout: 0, waitUntil: 'networkidle2'});
    await page.waitForSelector('.refine-images > .refine-image');
    const subCategories = await page.$$('.refine-images > .refine-image');
    for (let i = 0; i < subCategories.length; i++) {
      const category = {
        parent: categoryTitle,
        name: await subCategories[i].$eval('a > span', elm => elm.innerText.trim()),
        url: await subCategories[i].$eval('a', elm => elm.getAttribute('href')),
      }
      if (category.name == 'Other') category.name = `${category.parent} ${category.name}`
      categories.push(category);
    }

    await page.close();
    resolve(true);
  } catch (error) {
    console.log(`fetchMoreCategory(${url}) Error: ${error}`);
  }
});

const correctCategories = () => {
  let newCategories = [];

  for (let i = 0; i < categories.length; i++) {
    const newCat = {
      name: categories[i].name,
      url: categories[i].url,
    }
    if (categories[i].parent == 'Wheels' && categories[i].name == 'Accessories') newCat.name = 'Wheels Accessories'
    if (categories[i].parent == 'Accessports' && categories[i].name == 'Accessories') newCat.name = 'Accessports Accessories'
    newCategories.push(newCat);
  }

  newCategories.push({
    name: 'General Products',
    url: 'https://www.part-box.com/general-products',
  })
  newCategories.push({
    name: 'Lights',
    url: 'https://www.part-box.com/lights-1569252543',
  })

  categories = newCategories;

  return '';
}

run()