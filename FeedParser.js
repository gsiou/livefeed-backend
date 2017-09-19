var Promise = require('promise')
var request = require('request')
var FeedParser = require('feedparser')
var Feed = require('./models/feed')

function getFeedInfo (feedUrl) {
  return new Promise((resolve, reject) => {
    var feedparser = new FeedParser()
    try {
      request
                .get(feedUrl)
                .on('error', function (err) {
                  console.log(error)
                  reject(error)
                })
                .on('response', function (res) {
                  if (res.statusCode !== 200) {
                    this.emit('error', new Error('Bad status code'))
                  } else {
                    this.pipe(feedparser)
                  }
                })
    } catch (e) {
      reject(e)
    }

    feedparser.on('error', function (error) {
      reject(error)
    })

    feedparser.on('readable', function () {
      var stream = this
      var meta = this.meta

      var feedName = this.meta.title
      var feedDescription = this.meta.description

      var newFeed = new Feed({
        url: feedUrl,
        name: feedName,
        description: feedDescription
      })
      resolve(newFeed)
    })
  })
}

module.exports.getFeedInfo = getFeedInfo
