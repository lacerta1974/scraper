var express = require('express');
var app = express();
var bodyParser = require('body-parser');

// Create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.use(express.static('public'));

app.get('/index.html', function (req, res) {
    res.sendFile( __dirname + "/" + "index.html" );
});

app.post('/get_page', urlencodedParser, function(req, res){
    var request = require('request');
    var c = require('cheerio');
    var fs = require('fs');
    var path = require('path');
    var dirname = req.body.saveDirName;

    var site = "http://" + req.body.webAddress;

    request(site, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var $ = c.load(body);
            var list = $("a.overlay");
            var fileuri = '';
            list.each(function(i, element){
                fileuri = element.attribs.href;
                var callback = function(){
                    console.log("finished downloading file # " + i);
                };
                var filename = getBaseName(fileuri);

                var fullPath = dirname + "/" + filename;

                var dirExists = false;

                // console.log("fullpath: " + fullPath);
                if(checkDirExistence(dirname)){
                    request(fileuri).pipe(fs.createWriteStream(fullPath).on('close', callback));
                };
            });

        }
        else{
            console.log("Error requesting site");
        }
    });
    res.end('DONE');
});

function checkDirExistence (dirname){
    var fs = require('fs');
    if (fs.existsSync(dirname)) {
        return true;
    }

    fs.mkdirSync(dirname);
    checkDirExistence(dirname);
};

function getBaseName (fileuri){
    var path = require('path');
    return path.basename(fileuri);
}

var server = app.listen(8081, function () {
    var host = server.address().address
    var port = server.address().port

    console.log("Example app listening at http://%s:%s", host, port)

})