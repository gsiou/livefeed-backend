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
    },
    description: {
        type: String
    },
    subscribers: {
        type: Number
    }
}));

module.exports = Feed;
