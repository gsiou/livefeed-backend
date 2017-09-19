var request = require('request')
var cheerio = require('cheerio')

function getLinks (html) {
  $ = cheerio.load(html)
  pageLinks = $('a')
  var pageLinksCollection = []
  $(pageLinks).each(function (i, link) {
    pageLinksCollection.push({
      text: $(link).text(),
      href: $(link).attr('href')
    })
  })
  return pageLinksCollection
}

function getFeedsOfLinks (links) {
  var feeds = links.filter(link => {
    var text = link.text.toLowerCase()
    var href = link.text.toLowerCase()
    return text.indexOf('rss') !== -1 || text.indexOf('feed') !== -1 ||
                href.indexOf('rss') !== -1 || href.indexOf('feed') !== -1
  })
  return feeds
}

function getRels (html) {
  $ = cheerio.load(html)
  links = $('link')
  var linkTags = []
  links.each(function (i, link) {
    linkTags.push({
      href: $(link).attr('href'),
      type: $(link).attr('type')
    })
  })
  return linkTags
}

function getFeedsOfRels (rels) {
  return rels.filter(rel => rel.type === 'application/rss+xml')
}

module.exports.getLinks = getLinks
module.exports.getFeedsOfLinks = getFeedsOfLinks
module.exports.getRels = getRels
module.exports.getFeedsOfRels = getFeedsOfRels
