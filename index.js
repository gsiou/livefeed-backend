var express = require('express')
var app = express()
var bcrypt = require('bcryptjs')
var bodyParser = require('body-parser')
var crypto = require('crypto')
var morgan = require('morgan')
var mongoose = require('mongoose')
var jwt = require('jsonwebtoken')
var morgan = require('morgan')
var User = require('./models/user')
var Feed = require('./models/feed')
var FeedParser = require('feedparser')
var FeedParserWrapper = require('./FeedParser')
var request = require('request')
var cors = require('cors')
var sanitizeHtml = require('sanitize-html')
var GetFeeds = require('./GetFeeds.js')
var url = require('url')
var normalizeUrl = require('normalize-url')
var fs = require('fs')
var https = require('https')
require('dotenv').config()

var port = process.env.PORT || 8080

mongoose.connect(process.env.DB, { useMongoClient: true }, err => {
  if (err) {
    console.log('DB Could not connect:', err.message)
    process.exit(1)
  }
})

app.set('secret', process.env.SECRET)

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(morgan('dev'))
app.use(cors())

var protectedRoutes = express.Router()

protectedRoutes.get('/', function (req, res) {
  return res.json({ message: 'Hello World' })
})

protectedRoutes.get('/feeds', function (req, res) {
  var userEmail = req.decoded.email
  // Returns feeds of user
  User.findOne({ email: userEmail }, function (err, user) {
    return res.send({ feeds: user.feeds })
  })
})

protectedRoutes.get('/alerts', function (req, res) {
  var userEmail = req.decoded.email
  User.findOne({ email: userEmail }, function (err, user) {
    if (!user) {
      return res.status(400).send({
        message: 'Invalid user',
        alerts: [],
        success: false
      })
    } else {
      return res.send({
        message: '',
        alerts: user.alerts,
        success: true
      })
    }
  })
})

protectedRoutes.post('/alert', function (req, res) {
  if (!req.body.alert) {
    return res.status(400).send({ message: 'Alert not given', success: false })
  }
  var newAlert = req.body.alert
  var userEmail = req.decoded.email
  // Check if alert already exists
  User.findOne({ email: userEmail }, function (err, user) {
    if (!user) {
      return res.status(400).send({ message: 'Invalid user', success: false })
    } else {
      for (var i = 0; i < user.alerts.length; i++) {
        if (user.alerts[i] === newAlert) {
          res.send({ message: 'Alert already exists', success: false })
        }
      }

      user.alerts.push(newAlert)
      user.save(function (error, user, rows) {
        if (error) {
          return res.status(500).send({ message: error, success: false })
        } else {
          return res.json({ success: true })
        }
      })
    }
  })
})

protectedRoutes.get('/articles', function (req, res) {
  if (req.query.url === undefined) {
    return res.status(412).send({
      message: 'Missing url',
      articles: []
    })
  }

  Feed.findOne({ url: req.query.url }, function (err, feed) {
    var articles = []

    if (!feed) {
      return res.status(400).send({
        message: 'Invalid feed',
        articles: []
      })
    } else {
      // Return articles of feed
      var feedUrl = req.query.url

      var feedparser = new FeedParser()
      try {
        request
          .get(feedUrl)
          .on('error', function (err) {
            return res.status(400).send('Url does not exist')
          })
          .on('response', function (res) {
            if (res.statusCode !== 200) {
              this.emit('error', new Error('Bad status code'))
            } else {
              this.pipe(feedparser)
            }
          })
      } catch (e) {
        return res.status(400).send('Could not send a request to the url given')
      }

      feedparser.on('error', function (error) {
        return res.status(422).send('Url is not a feed')
      })

      feedparser.on('readable', function () {
        var stream = this
        var meta = this.meta

        var feedName = this.meta.title
        var feedDescription = this.meta.description
        var item
        while ((item = stream.read())) {
          item.summary = sanitizeHtml(item.summary, {
            allowedTags: [],
            allowedAttributes: []
          })
          const respItem = {
            title: item.title,
            description: item.description,
            summary: item.summary,
            author: item.author,
            link: item.link,
            pubdate: item.pubdate
          }
          articles.push(respItem)
        }
      })

      feedparser.on('end', function () {
        return res.send({
          articles: articles
        })
      })
    }
  })
})

protectedRoutes.delete('/feed', function (req, res) {
  if (req.body.url === undefined) {
    return res.status(412).send({
      message: 'Missing name or url'
    })
  }

  var userEmail = req.decoded.email
  User.update(
    { email: userEmail },
    { $pull: { feeds: { url: [req.body.url] } } },
    {},
    function (err, mod) {
      if (err) {
        return res.status(400).json({
          message: err,
          success: false
        })
      } else if (mod.nModified === 0) {
        return res.status(200).json({
          message: 'User does not have specified feed',
          success: false
        })
      } else {
        console.log(mod)
        return res.status(200).json({
          message: 'Feed deleted',
          success: true
        })
      }
    }
  )
})

protectedRoutes.post('/feed', function (req, res) {
  if (req.body.url === undefined) {
    return res.status(412).send({
      message: 'Missing name or url'
    })
  }

  var givenUrl = normalizeUrl(req.body.url)
  var possibleFeeds = [givenUrl]

  // Get content of url given
  request(givenUrl, (err, resp, body) => {
    if (err) {
      return res.status(400).send({
        message: err,
        success: false
      })
    }

    // Gather all possible feeds
    var linkTags = GetFeeds.getFeedsOfRels(GetFeeds.getRels(body)).map(
      l => l.href
    )
    var aTags = GetFeeds.getFeedsOfLinks(GetFeeds.getLinks(body)).map(
      a => a.href
    )
    if (linkTags.length > 0) {
      possibleFeeds.push(linkTags[0])
    }
    var limit = Math.min(2, aTags.length) // Get 2 or less from aTags
    possibleFeeds = possibleFeeds.concat(aTags.slice(0, limit))

    var feedsPromises = possibleFeeds.map(possibleFeed => {
      return FeedParserWrapper.getFeedInfo(url.resolve(givenUrl, possibleFeed))
    })

    // Check all links at the same time and keep the first that works
    // Inverting idea by: https://stackoverflow.com/a/39941616
    const invert = p => new Promise((res, rej) => p.then(rej, res))
    const firstOf = ps => invert(Promise.all(ps.map(invert)))
    firstOf(feedsPromises)
      .then(feedInfo => {
        Feed.findOne({ url: feedInfo.url }, function (err, feed) {
          if (!feed) {
            feedInfo.save(function (error, feed, rows) {
              if (error) {
                // Handle this
                console.log(error)
              } else {
                addFeedToUser(req, res, feed)
              }
            })
          } else {
            addFeedToUser(req, res, feed)
          }
        })
      })
      .catch(error => {
        return res.status(400).json({
          message: error,
          success: false
        })
      })
  })
})

const addFeedToUser = function (req, res, feed) {
  var userEmail = req.decoded.email
  // Add a new feed to user
  User.findOne({ email: userEmail }, function (err, user) {
    if (err) {
      return res.status(400).json({
        message: 'Invalid user',
        success: false
      })
    }

    // Check if user already has feed
    for (var i = 0; i < user.feeds.length; i++) {
      if (user.feeds[i].url === feed.url) {
        return res.status(200).json({
          message: 'Feed already exists',
          success: false
        })
      }
    }

    user.feeds.push({
      url: feed.url,
      name: feed.name,
      description: feed.description
    })

    user.save(function (error, user, rows) {
      if (error) {
        return res.status(500).send({ message: error, success: false })
      } else {
        // update feed subscribers
        Feed.update(
          { url: feed.url },
          { $inc: { subscribers: 1 } },
          {},
          function () {
            return res.json({ success: true })
          }
        )
      }
    })
  })
}

protectedRoutes.get('/users', function (req, res) {
  User.find({}, function (err, users) {
    return res.json(users)
  })
})

console.log('Listening at ' + port)

app.use('/api/*', function (req, res, next) {
  var token = req.body.token || req.query.token || req.headers['x-access-token']

  console.log('Trying to verify token: ' + token)

  if (!token) {
    return res.status(403).send({
      verified: false,
      message: 'Could not find a token'
    })
  } else {
    jwt.verify(token, app.get('secret'), function (err, decoded) {
      if (err) {
        return res
          .status(403)
          .send({ verified: false, message: 'Failed to verify token' })
      } else {
        req.decoded = decoded
        next()
      }
    })
  }
})

app.use('/api', protectedRoutes)

app.post('/authenticate', function (req, res) {
  if (req.body.email === undefined || req.body.password === undefined) {
    return res.status(412).send({ message: 'Specify email/password' })
  }
  User.findOne(
    {
      email: req.body.email
    },
    function (err, user) {
      if (err) throw err

      if (!user) {
        res.json({
          success: false,
          message: 'Invalid email/password combination'
        })
      } else {
        var hashed_password = bcrypt.hashSync(req.body.password, user.salt)
        if (user.password !== hashed_password) {
          res.json({
            success: false,
            message: 'Invalid email/password combination'
          })
        } else {
          var token = jwt.sign({ email: user.email }, app.get('secret'), {
            expiresIn: '7d'
          })

          res.json({
            success: true,
            message: 'you are now logged in',
            token: token
          })
        }
      }
    }
  )
})

app.post('/register', function (req, res) {
  // Check if correct parameters were given
  if (req.body.email === undefined || req.body.password === undefined) {
    return res.status(500).send('Missing username or password')
  }

  // Check if username already exists.
  User.findOne({ email: req.body.email })
    .then(function (user) {
      if (user) {
        return res.status(500).send('User already exists')
      }

      // Create random salt
      var salt = bcrypt.genSaltSync(10)

      // Hash password + salt
      var hashed_password = bcrypt.hashSync(req.body.password, salt)

      // Create new user.
      var newUser = new User({
        email: req.body.email,
        password: hashed_password,
        salt: salt,
        lastFetch: null
      })

      newUser.save(function (error) {
        if (error) {
          return res
            .status(500)
            .send('Could not save user to the database:' + error)
        }

        res.json({ success: true })
      })
    })
    .catch(function (error) {
      return res.status(500).send({ message: error, success: false })
    })
})

if (process.env.NODE_ENV === 'production') {
  https
    .createServer(
    {
      key: fs.readFileSync(process.env.KEY_PATH),
      cert: fs.readFileSync(process.env.CERT_PATH)
    },
      app
    )
    .listen(port)
} else {
  app.listen(port)
}
