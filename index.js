const rp = require('request-promise');
const cheerio = require('cheerio');
const URL = require('url').URL;
const uniqBy = require('lodash').uniqBy;
const pug = require('pug');
const Email = require('email-templates');
var postmark = require("postmark");
const config = require('./config');

const options = {
  uri: config.url,
  transform: function (body) {
    return cheerio.load(body);
  }
};

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json')
const db = low(adapter)

if(!db.get('items')) {
  // Set some defaults (required if your JSON file is empty)
  db.defaults({ items: [] })
    .write();
}

rp(options)
  .then(($) => {
    items = [];
    const existing_items = db.get('items').value();
    $('.classified').each(function(i, elem) {
      obj = {};
      //keep location, title and url
      obj['location'] = $(this).find('.short-location').text();
      obj['title'] = $(this).find('.title').text();
      obj['url'] = $(this).find('.title').find('a').attr('href');

      var priceRegex = /([0-9\.]+)/;
      obj['price'] = $(this).find('.price').text().match(priceRegex)[0].replace('\.','');

      var dateRegex = /([0-9\/]+)/;
      obj['date'] = $(this).find('.short-date').text().match(dateRegex)[0];

      const item_url = new URL(obj['url']);
      obj['id'] = parseInt(item_url.searchParams.get('id'))

      //initialize all new ads with sent=false
      obj['sent'] = (existing_items.map(item => item.id).indexOf(obj['id']) > -1) ? true : false;

      items.push(obj);
    });

    const old_items = db.get('items').value();
    const new_items = old_items.concat(items);
    let res = db.set('items', uniqBy(new_items, 'id'))
      .write();

    const itemsToSend = db.get('items').filter({sent: false}).value();

    if(itemsToSend.length > 0) {
      // Compile the source code
      const compiledFunction = pug.compileFile('emails/email/html.pug');

      // Render a set of data
      const emailTemplate = compiledFunction({
        items: itemsToSend
      });

      // console.log(emailTemplate);

      var client = new postmark.ServerClient(config.email_token);

      client
        .sendEmail({
          "From": config.email,
          "To": config.email,
          "Subject": config.email_subject,
          "TextBody": emailTemplate,
          "HtmlBody": emailTemplate,
        })
        .then((response) => {
          const toSaveItems = db.get('items').map((item, index) => {
            if(itemsToSend.map((itemSend) => { return itemSend.id }).indexOf(item.id) > -1) {
              item.sent = true;
            }
            return item;
          })
          //console.log(toSaveItems.value());
          db.set('items', toSaveItems.value())
            .write();
        })
        .catch((err) => {
          console.log(err);
        })
    } else {
      console.log("Καμία καινούρια αγγελία")
    }

  })
  .catch((err) => {
    console.log(err);
  });
