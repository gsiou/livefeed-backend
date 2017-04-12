var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var Feed = mongoose.model('Feed', new Schema({
    url: {
        type: String,
        unique: true,
        required: true
    },
    name: {
        type: String,
        unique: true
    },
    description: {
        type: String
    }
}));

module.exports = Feed;
