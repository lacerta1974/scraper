var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var request = require('request');
var c = require('cheerio');
var fs = require('fs');
var path = require('path');

// Create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.use(express.static('public'));
app.set('view engine', 'pug')
app.set('views',  __dirname + '/views')

// -----------------------------------------------------------------------------
app.get(['/index.html', '/'], function (req, res)
{
    res.sendFile( __dirname + "/" + "index.html" );
});

// -----------------------------------------------------------------------------
function logObject(object)
{
   for (prop in object)
   {
      if (object.hasOwnProperty(prop))
      {
         console.log(`${prop} = ${object[prop]}`)
      }
   }
}

// -----------------------------------------------------------------------------
// returns list files that will be downloaded from page
function getScrapedFiles(scrapePage, scrapeConfig)
{
   console.log(`getScrapedFiles()`)
   // console.log(`scrape page = ${scrapePage}`)
   logObject(scrapeConfig)

   scrapedFiles = []

   var $ = c.load(scrapePage);

   selectorString = "a"
   if ( '' != scrapeConfig.anchorClass)
   {
      selectorString += '.' + scrapeConfig.anchorClass
   }
   var list = $(selectorString);
   console.log(`'${selectorString}' selected ${list.length} elements`)

   list.each(function(i, element)
   {
      if ('' != scrapeConfig.hrefRegex)
      {
         if (element.attribs.href.match(scrapeConfig.hrefRegex))
         {
            scrapedFiles.push(element.attribs.href)
         }
      }
      else
      {
         scrapedFiles.push(element.attribs.href)
      }
   })

   console.log(`found ${scrapedFiles.length} files`)
   return scrapedFiles
}

// -----------------------------------------------------------------------------
app.post('/analyze_page', urlencodedParser, function(req, res)
{
   console.log(`analyzing page: ${req.body.pageAddress}`)

   if (req.body.pageAddress && '' != req.body.pageAddress)
   {
      var scrapedFiles = []

      var site = "http://" + req.body.pageAddress;

      request(site, function (error, response, body)
      {
         // console.log(`site=${site}`)
         // console.log(`hrefRegex = ${req.body.hrefRegex}  anchorClass = ${req.body.anchorClass}`)

         if (!error && response.statusCode == 200)
         {
            scrapedFiles = getScrapedFiles(body, {anchorClass:req.body.anchorClass, hrefRegex:req.body.hrefRegex})

            console.log(`returning ${scrapedFiles.length} files`)

            res.send({'files':scrapedFiles, 'error':'0'})
         }
         else
         {
            console.log(`Error requesting site:${site} for analyze`);
            res.send({files:0, error:`status:${response.statusCode}`})
         }
      });
   }
   else
   {
      console.log('no address given')
      res.send({files:0, error:'no address given'})
   }
   // res.end('DONE');
})

// -----------------------------------------------------------------------------
// app.post('/return_page', urlencodedParser, function(req, res)
// {
//    var site = "http://" + req.body.pageAddress;
//
//    console.log(`pageAddress = ${req.body.pageAddress}`)
//    console.log(`site = ${site}`)
//
//    request(site, function (error, response, body)
//    {
//       if (!error && response.statusCode == 200)
//       {
//          res.send(body)
//       }
//       else
//       {
//          console.log("Error requesting site");
//          console.log(`error code: ${error}`);
//          res.send('error')
//       }
//    });
//    // res.end('DONE');
// }
// )

// -----------------------------------------------------------------------------
function toBatches(scrapedFilesList, batchSize)
{
   // --- collect batches ---
   batches = []
   scrapedFilesList.forEach(function(fileuri, i)
   {
      var batchIndex = Math.trunc(i / batchSize)
      console.log(`adding index ${i} at ${batchIndex}`)

      if (undefined == batches[batchIndex])
      {
         batches[batchIndex] = []
      }
      batches[batchIndex].push(fileuri)
   })

   return batches
}

// -----------------------------------------------------------------------------
app.post('/scrape_page', urlencodedParser, function(req, res)
{
   console.log('scraping page')
   console.log(`batch size:${req.body.batchSize}`)

   // --- handle params ---
   // site
   var site = "http://" + req.body.pageAddress;

   // dirName
   var dirname = req.body.saveDirName;
   if ('' == dirname)
   {
      dirname = 'scraped'
   }
   if (dirname[dirname.length-1] != '/')
   {
      dirname += '/'
   }
   console.log(`dirname = ${dirname}`)
   checkDirExistence(dirname)

   // batchSize
   var batchSize = req.body.batchSize && req.body.batchSize > 0 ? req.body.batchSize : scrapedFilesList.length
   console.log(`batch size:${batchSize}`)

   // --- begin ---
   request(site, function (error, response, body)
   {
      if (!error && response.statusCode == 200)
      {
         scrapedFilesList = getScrapedFiles(body, {anchorClass:req.body.anchorClass, hrefRegex:req.body.hrefRegex})

         var fileSequence = 0

         if (scrapedFiles.length > 0)
         {
            var numScrapedFiles = 0
            var numInProgress = 0
            var batches = toBatches(scrapedFilesList, batchSize)

            // ------------------------------------
            function issueBatch(batch)
            {
               batch.forEach(function(currentFile)
               {
                  // to prepend files with number
                  // var numTextPrefix = `_NUM_${fileSequence++}_`
                  var numTextPrefix = '
                  '
                  var filename = getBaseName(currentFile);
                  var fullPath = dirname + numTextPrefix + filename;
                  request(currentFile).pipe(fs.createWriteStream(fullPath).on('close', fileDoneCallback));
                  numInProgress++;
               })
            }
            // --------------------------------------
            function fileDoneCallback()
            {
               numScrapedFiles++;
               numInProgress--;
               // console.log(`done callback:numInProgress:${numInProgress}  numScraped:${numScrapedFiles}`)

               // current batch done?
               if (numInProgress == 0)
               {
                  // remaining batches?
                  if (batches.length > 0)
                  {
                     console.log(`issuing next batch...`)
                     currentBatch = batches.pop()
                     issueBatch(currentBatch)
                  }
                  else
                  {
                     console.log(`Done, ${numScrapedFiles} files scraped`)
                  }
               }
            } // end fileDoneCallback

            // --- begin ---
            // issue first batch
            firstBatch = batches.pop()
            issueBatch(firstBatch)
            res.send({numFiles:scrapedFilesList.length,error:''})
         } // end if scraped files length > 0
         else
         {
            console.log('no files found to scrape')
            res.send({numFiles:0, error:'no files found'})
         }
      } // end if status 200
   })  // end request callback
})  // end /scrape_page

function checkDirExistence (dirname)
{
    var fs = require('fs');
    if (fs.existsSync(dirname))
    {
        return true;
    }

    fs.mkdirSync(dirname);
    checkDirExistence(dirname);
};

function getBaseName (fileuri)
{
    var path = require('path');
    return path.basename(fileuri);
}

var server = app.listen(8081, function ()
{
    var host = server.address().address
    var port = server.address().port

    console.log("Example app listening at http://%s:%s", host, port)
})
