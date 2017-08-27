var assert = require('assert');
var FeedParser = require('../FeedParser');

describe('FeedParser', function() {
    describe('getFeedInfo', function() {
        it('should find the meta info from an rss feed link', function() {
            return FeedParser.getFeedInfo("http://rss.slashdot.org/Slashdot/slashdotMain")
            .then((info) => {
                assert.equal(info.name, 'Slashdot');
            });
        });
    });
});
