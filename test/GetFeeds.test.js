var assert = require('assert');
var GetFeeds = require('../GetFeeds');
describe('GetFeeds', function() {
    describe('getLinks', function() {
        it('should find a link in harcoded html', function() {
            var linksFound = GetFeeds.getLinks("<a href='http://example.com'>I am a link</a>").length;
            assert.equal(linksFound, 1);
        });
        it('should find multiple links nested in other html', function() {
            var links = GetFeeds.getLinks(`
                <div class='dummy'><a href='http://example.com'>This is my <strong>Link!</strong></div>
                <p><a href='http://example2.com'>This is my second link</a></p>
            `);
            assert.deepEqual({href: 'http://example.com', text: 'This is my Link!'}, links[0]);
        });
    });
    describe('getFeedsOfLinks', function() {
        it('should find a feed if keyword rss is referenced in href', function() {
            var links  = GetFeeds.getLinks("<a href='http://example.com/rss.php'>RSS</a>");
            var feedsFound = GetFeeds.getFeedsOfLinks(links).length;
            assert.equal(feedsFound, 1);
        });
        it('should find a feed if keyword rss is referenced in link text', function() {
            var links  = GetFeeds.getLinks("<a href='http://example.com/rss.php'>RSS</a>");
            var feedsFound = GetFeeds.getFeedsOfLinks(links).length;
            assert.equal(feedsFound, 1);
        });
        it('should find a feed if keyword feed is referenced in href', function() {
            var links  = GetFeeds.getLinks("<a href='http://example.com/feed.php'>RSS</a>");
            var feedsFound = GetFeeds.getFeedsOfLinks(links).length;
            assert.equal(feedsFound, 1);
        });
        it('should find a feed if keyword feed is referenced in link text', function() {
            var links  = GetFeeds.getLinks("<a href='http://example.com/rss.php'>Feed</a>");
            var feedsFound = GetFeeds.getFeedsOfLinks(links).length;
            assert.equal(feedsFound, 1);
        });
    });
    describe('getRels', function() {
        it('should find a <link> in hardcoded html', function() {
            var linkTags = GetFeeds.getRels('<link rel="alternate" title="Slashdot RSS" href="http://rss.slashdot.org/Slashdot/slashdotDevelopers" type="application/rss+xml">');
            assert.equal(linkTags.length, 1);
        });
    });
    describe('getFeedsOfRels', function() {
        it('should find a feed by type', function() {
            var linkTags = GetFeeds.getRels('<link rel="alternate" title="Slashdot RSS" href="http://rss.slashdot.org/Slashdot/slashdotDevelopers" type="application/rss+xml">');
            var feeds = GetFeeds.getFeedsOfRels(linkTags);
            assert.equal(feeds[0].href, 'http://rss.slashdot.org/Slashdot/slashdotDevelopers');
        });
        it('should ignore a <link> that does not contain a tag', function() {
            var linkTags = GetFeeds.getRels('<link rel="search" title="Search Slashdot" href="//developers.slashdot.org/search.pl">');
            var feeds = GetFeeds.getFeedsOfRels(linkTags);
            assert.equal(feeds.length, 0);
        });
        it('should not crash on missing hrefs', function() {
            var linkTags = GetFeeds.getRels('<link rel="search" title="Search Slashdot">');
            var feeds = GetFeeds.getFeedsOfRels(linkTags);
            assert.equal(feeds.length, 0);
        })
    });
});
