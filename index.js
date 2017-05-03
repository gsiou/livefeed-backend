var express      = require('express');
var app          = express();
var bcrypt       = require('bcryptjs');
var bodyParser   = require('body-parser');
var crypto       = require('crypto');
var morgan       = require('morgan');
var mongoose     = require('mongoose');
var jwt          = require('jsonwebtoken');
var morgan       = require('morgan');
var config       = require('./config');
var User         = require('./models/user');
var Feed         = require('./models/feed');
var FeedParser   = require('feedparser');
var request      = require('request');
var cors         = require('cors');
var sanitizeHtml = require('sanitize-html');


var port = process.env.PORT || 8080;
mongoose.connect(config.database);
app.set('secret', config.secret);

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(cors());

var protectedRoutes = express.Router();

protectedRoutes.get('/', function(req, res) {
    return res.json({message: "Hello World"});
});

protectedRoutes.get('/feeds', function(req, res) {
    var userEmail = req.decoded.email;
    // Returns feeds of user
    User.findOne({email: userEmail}, function(err, user) {
        return res.send({feeds: user.feeds});
    });
});

protectedRoutes.get('/articles', function(req, res) {
    if (req.query.url === undefined) {
        return res.status(412).send({
            message: "Missing url",
            articles: []
        });
    }

    Feed.findOne({url: req.query.url}, function(err, feed) {
        var articles = [];

        if(!feed) {
            return res.status(400).send({
                message: "Invalid feed",
                articles: []
            });
        } else {
            // Return articles of feed
            var feedUrl = req.query.url;

            var feedparser = new FeedParser();
            try {
                request
                    .get(feedUrl)
                    .on('error', function(err) {
                        return res.status(400).send("Url does not exist");
                    })
                    .on('response', function(res) {
                        if (res.statusCode !== 200) {
                            this.emit('error', new Error('Bad status code'));
                        }
                        else {
                            this.pipe(feedparser);
                        }
                    });
            } catch (e) {
                return res.status(400).send("Could not send a request to the url given");
            }

            feedparser.on('error', function (error) {
                return res.status(422).send("Url is not a feed");
            });

            feedparser.on('readable', function () {
                var stream = this;
                var meta = this.meta;

                var feedName = this.meta.title;
                var feedDescription = this.meta.description;
                var item;
                while (item = stream.read()) {
                    item.summary = sanitizeHtml(item.summary, {
                        allowedTags: [],
                        allowedAttributes: []
                    });
                    articles.push(item);
                }
            });

            feedparser.on('end', function() {
                return res.send({
                    articles: articles
                });
            });
        }
    });
});

protectedRoutes.post('/feed', function(req, res) {
    if(req.body.url === undefined) {
        return res.status(412).send({
            message: "Missing name or url"
        });
    }

    // Check if feed exists
    Feed.findOne({url: req.body.url}, function(err, feed){
        if(!feed) {
            // Parse given feed information and validate
            var feedUrl = req.body.url;

            var feedparser = new FeedParser();
            try {
                request
                    .get(feedUrl)
                    .on('error', function(err) {
                        console.log(error);
                        return res.status(400).send("Url does not exist");
                    })
                    .on('response', function(res) {
                        if (res.statusCode !== 200) {
                            this.emit('error', new Error('Bad status code'));
                        }
                        else {
                            this.pipe(feedparser);
                        }
                    });
            } catch (e) {
                return res.status(400).send("Could not send a request to the url given");
            }

            feedparser.on('error', function (error) {
                // always handle errors
                return res.status(422).send("Url is not a feed");
            });

            feedparser.on('readable', function () {
                var stream = this;
                var meta = this.meta;

                var feedName = this.meta.title;
                var feedDescription = this.meta.description;

                var newFeed = new Feed({
                    url: feedUrl,
                    name: feedName,
                    description: feedDescription
                });

                newFeed.save(function(error, feed, rows) {
                    if(error) {
                        // Handle this
                        console.log(error);
                    }
                    else {
                        addFeedToUser(req, res, feed);
                    }
                });
            });
        }
        else {
            addFeedToUser(req, res, feed);
        }
    });

});

const addFeedToUser = function(req, res, feed) {
    var userEmail = req.decoded.email;
    // Add a new feed to user
    User.findOne({email: userEmail}, function(err, user) {
        if(err) {
            return res.status(400).json({
                message: 'Invalid user',
                success: false
            });
        }

        // Check if user already has feed
        for(var i = 0; i < user.feeds.length; i++) {
            if(user.feeds[i].url === feed.url) {
                return res.status(200).json({
                    message: 'Feed already exists',
                    success: false
                });
            }
        }

        user.feeds.push({
            url: feed.url,
            name: feed.name,
            description: feed.description
        });

        user.save(function(error, user, rows) {
            if(error) {
                // TODO: Handle this
                console.log(error);
            }
            else {
                return res.json({success: true});
            }
        });
    });
};

protectedRoutes.get('/users', function(req, res){
    User.find({}, function(err, users){
        return res.json(users);
    });
});

console.log("Listening at " + port);

app.use('/api/*', function(req, res, next) {
    var token = req.body.token
        || req.query.token
        || req.headers['x-access-token'];


    console.log("Trying to verify token: " + token);

    if(!token) {
        return res.status(403).send({
            verified: false,
            message: 'Could not find a token'
        });
    }
    else {
        jwt.verify(token, app.get('secret'), function(err, decoded) {
            if(err) {
                return res.json({verified: false, message: 'Failed to verify token'});
            }
            else {
                req.decoded = decoded;
                next();
            }
        });
    }
});

app.use('/api', protectedRoutes);


app.post('/authenticate', function(req, res){
    if(req.body.email === undefined || req.body.password === undefined) {
        return res.status(412).send({message: "Specify email/password"});
    }
    User.findOne({
        email: req.body.email
    }, function(err, user){
        if(err) throw err;

        if(!user) {
            res.json({success: false, message: 'Invalid email/password combination'});
        } else {
            var hashed_password = bcrypt.hashSync(req.body.password, user.salt);
            if(user.password != hashed_password) {
                res.json({success: false, message: 'Invalid email/password combination'});
            } else {
                var token = jwt.sign({email: user.email}, app.get('secret'), {
                    expiresIn: '7d'
                });

                res.json({
                    success: true,
                    message: 'you are now logged in',
                    token: token
                });
            }
        }
    });
});

app.post('/register', function(req, res) {
    // Check if correct parameters were given
    if(req.body.email === undefined || req.body.password === undefined) {
        return res.status(500).send("Missing username or password");
    }

    // Check if username already exists.
    User.findOne({email: req.body.email})
    .then(function(user) {
        if(user) {
            return res.status(500).send("User already exists");
        }

        // Create random salt
        var salt = bcrypt.genSaltSync(10);

        // Hash password + salt
        var hashed_password = bcrypt.hashSync(req.body.password, salt);

        // Create new user.
        var newUser = new User({
            email: req.body.email,
            password: hashed_password,
            salt: salt,
            lastFetch: null
        });

        newUser.save(function(error) {
            if(error) {
                return res.status(500).send("Could not save user to the database:" + error);
            }

            res.json({success: true});
        });
    }).catch(function(error){
        // TODO: fix this
        console.log(error);
    });
});

app.listen(port);
