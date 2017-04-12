var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Feed = require('./feed.js');

var User = mongoose.model('User', new Schema({
    email: {
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String, 
        required: true,
    },
    lastFetch: {
        type: Date
    },
    salt: {
        type: String,
        required: true
    },
    feeds: [{
        url: String,
        name: String,
        description: String
    }],
    alerts: [] // alert keyword and lastChecked date
}));

User.schema.pre('save', function(next) {
    console.log("Middleware function");
});

module.exports = User;
