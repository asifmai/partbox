const Helper = require('./puppeteerhelper');
const fs = require('fs');
const path = require('path');
const _ = require('underscore');
let browser;
// let categories = [];
let categories = JSON.parse(fs.readFileSync('categories.json', 'utf8'));
const excludedCategories = ['Part-Box VIP Gift Card', 'Tools']
const {siteLink} = require('./config');
const products = [];

async function run() {
  try {
    browser = await Helper.launchBrowser(true);

    // Fetch Categories
    // await fetchCategories();
    // await correctCategories();
    // fs.writeFileSync('categories.json', JSON.stringify(categories));
    
    // Fetch Product Urls
    await fetchProductsUrls();
    await correctProducts();
    fs.writeFileSync('products.json', JSON.stringify(products));

    await browser.close();
    return true;
  } catch (error) {
    console.log(`Bot Run Error: ${error}`);
    return false;
  }
}

const fetchProductsUrls = () => new Promise(async (resolve, reject) => {
  try {
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
    cat.products = [];
    console.log(`${index+1}/${categories.length} - Fetching Product Links from Category: ${cat.url}`);
    const page = await Helper.launchPage(browser, false);
    await page.goto(`${cat.url}#/sort=p.sort_order/order=ASC/limit=100`, {timeout: 0, waitUntil: 'networkidle2'});
    await page.waitFor(10000);
    await page.waitForSelector('.pagination');
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
    console.log(`No of Pages found in Category: ${noOfPages}`);

    for (let i = 0; i < noOfPages; i++) {
      if (i > 0) {
        await page.goto(`${cat.url}#/sort=p.sort_order/order=ASC/limit=100/page=${i+1}`, {timeout: 0, waitUntil: 'networkidle2'});
      }
      await page.waitFor(5000);
      await page.waitForSelector('.product-list > .product-list-item .image > a');
      const pageUrls = await page.$$eval(
          '.product-list > .product-list-item .image > a',
          elms => elms.map(elm => elm.getAttribute('href'))
      );
      cat.products.push(...pageUrls);
    }

    console.log(`No of Products found in Category: ${cat.products.length}`);
    
    await page.close();
    resolve();
  } catch (error) {
    console.log(`getProductLinksFromCategory(${cat.name}) Error: ${error}`);
    reject(error);
  }
});

const correctProducts = () => {
  for (let i = 0; i < categories.length; i++) {
    for (let j = 0; j < categories[i].products.length; j++) {
      const newProduct = {
        category: categories[i].name,
        url: categories[i].products[j],
      }
      products.push(newProduct)
    }
  }
}

const fetchCategories = () => new Promise(async (resolve, reject) => {
  try {
    console.log('Fetching Categories');
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