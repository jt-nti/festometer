/**
 * Module dependencies.
 */

require('dotenv').load();

var express = require('express'), routes = require('./routes'), user = require('./routes/user'), http = require('http'), path = require('path'), fs = require('fs');

var app = express();

var db, nlc;

var cloudant;

var fileToUpload;

var dbCredentials = {
	dbName : 'festometer_db'
};

var classifierId = process.env.NLC_ID;

var async = require('async');
var moment = require('moment');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var multipart = require('connect-multiparty');
var watson = require('watson-developer-cloud');

var multipartMiddleware = multipart();
var textParser = bodyParser.text();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(logger('dev'));
//app.use(bodyParser.urlencoded({ extended: true }));
//app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/style', express.static(path.join(__dirname, '/views/style')));

// development only
if ('development' == app.get('env')) {
	app.use(errorHandler());
}

function initDBConnection() {
	
	if(process.env.VCAP_SERVICES) {
		var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
		if(vcapServices.cloudantNoSQLDB) {
			dbCredentials.host = vcapServices.cloudantNoSQLDB[0].credentials.host;
			dbCredentials.port = vcapServices.cloudantNoSQLDB[0].credentials.port;
			dbCredentials.user = vcapServices.cloudantNoSQLDB[0].credentials.username;
			dbCredentials.password = vcapServices.cloudantNoSQLDB[0].credentials.password;
			dbCredentials.url = vcapServices.cloudantNoSQLDB[0].credentials.url;

			cloudant = require('cloudant')(dbCredentials.url);
			
			// check if DB exists if not create
			cloudant.db.create(dbCredentials.dbName, function (err, res) {
				if (err) { console.log('could not create db ', err); }
		    });
			
			db = cloudant.use(dbCredentials.dbName);
			
		} else {
			console.warn('Could not find Cloudant credentials in VCAP_SERVICES environment variable - data will be unavailable to the UI');
		}
	} else{
		console.warn('VCAP_SERVICES environment variable not set - data will be unavailable to the UI');
		// For running this app locally you can get your Cloudant credentials 
		// from Bluemix (VCAP_SERVICES in "cf env" output or the Environment 
		// Variables section for an app in the Bluemix console dashboard).
		// Alternately you could point to a local database here instead of a 
		// Bluemix service.
		//dbCredentials.host = "REPLACE ME";
		//dbCredentials.port = REPLACE ME;
		//dbCredentials.user = "REPLACE ME";
		//dbCredentials.password = "REPLACE ME";
		//dbCredentials.url = "REPLACE ME";
	}
}

function initNlcConnection() {
    var nlcCredentials = {};

    if(process.env.VCAP_SERVICES) {
        var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
        if(vcapServices.natural_language_classifier) {
            nlcCredentials.url = vcapServices.natural_language_classifier[0].credentials.url;
            nlcCredentials.username = vcapServices.natural_language_classifier[0].credentials.username;
            nlcCredentials.password = vcapServices.natural_language_classifier[0].credentials.password;
            nlcCredentials.version = process.env.NLC_VERSION || 'v1';

            nlc = watson.natural_language_classifier(nlcCredentials);
        } else {
            console.warn('Could not find NLC credentials in VCAP_SERVICES environment variable');
        }
    } else {
        console.warn('VCAP_SERVICES environment variable is not available');
    }
}

initDBConnection();
initNlcConnection();

//app.get('/', routes.index);
app.use('/bower_components', express.static('bower_components'));
app.use(express.static('public'));
//app.set('appPath', __dirname);

app.get('/api/yule-logs', function handleGetYuleLogs (req, res) {
    // TODO show history based on social login
    var date = new Date();
    var quote = '"403 Forbidden" (Scrooge, ';
    quote = quote + date.getFullYear() + ')';

    res.status(403).type('text/plain').send(quote);
});

function classifyText(text, finalCallback) {
    async.waterfall([
        function doClassify(callback){
            nlc.classify(
                {
                    text: text,
                    classifier_id: classifierId
                }, function(err, nlcResponse) {
                    callback(err, nlcResponse);
                });
        },
        function processNlcResponse(nlcResponse, callback){
            // add a timestamp
            var now = moment().utc();
            nlcResponse.created_at = now.format();

            // add the fest-o-meter quote
            var quote = '"' + nlcResponse.text + '" (';
            quote = quote + nlcResponse.top_class.charAt(0).toUpperCase();
            quote = quote + nlcResponse.top_class.slice(1).toLowerCase();
            quote = quote + ', ' + now.year() + ')';
            nlcResponse.quote = quote;

            //console.log(JSON.stringify(nlcResponse, null, 2));

            callback(null, nlcResponse);
        },
        function storeResponse(festiveResponse, callback){
            var id = '';
            db.insert(festiveResponse, id, function(err, doc) {
                //console.log(JSON.stringify(doc, null, 2));
                callback(err, festiveResponse, doc);
            });
        },
        function processCloudantResponse(festiveResponse, doc, callback){
            // add doc id
            festiveResponse.id = doc.id;

            callback(null, festiveResponse);
        }
    ], function (err, result) {
        console.log(JSON.stringify(result, null, 2));
        finalCallback(err, result);
    });
}

app.post('/api/yule-logs', textParser, function handlePostYuleLogs (req, res) {
	if (!req.body) {
        return res.sendStatus(400);
    }

    classifyText(req.body, function handleClssificationResult (err, result) {
        if (err) {
            console.log('error:', err);
            res.sendStatus(500);
        } else {
            //res.type('text/plain').send(result.quote);
            res.json(result);
        }
    });
});

function updateClassification(id, expectedClass, finalCallback) {
    async.waterfall([
        function retreiveDoc(callback){
            db.get(id, callback)
        },
        function updateDoc(getBody, getHeader, callback){
            getBody.expected_class = expectedClass;

            var now = moment().utc();
            getBody.updated_at = now.format();

            callback(null, getBody)
        },
        function storeUpdatedDoc(doc, callback){
            db.insert(doc, callback)
        },
        function prepareResponse(insertBody, insertHeader, callback) {
            var result = {};
            result.id = id;
            result.expected_class = expectedClass;

            callback(null, result);
        }
    ], function (err, result) {
        finalCallback(err, result);
    });
}

app.put('/api/yule-logs/:id', textParser, function handlePutYuleLogs (req, res) {
    if (!req.body) {
        return res.sendStatus(400);
    }

    var idParam = req.params.id;
    var actualClass;

    if (req.body.toLowerCase() === 'cratchit') {
        actualClass = 'cratchit'
    } else if (req.body.toLowerCase() === 'scrooge') {
        actualClass = 'scrooge'
    }

    if (actualClass) {
        updateClassification(idParam, actualClass, function handleUpdateResult (err, result) {
            if (err) {
                console.log('error:', err);
                res.sendStatus(500);
            } else {
                res.json(result);
            }
        })
    } else {
        res.sendStatus(400);
    }
});

//app.post('/api/yule-logs', textParser, function handlePostYuleLogs (req, res) {
//    if (!req.body) {
//        return res.sendStatus(400);
//    }
//
//    nlc.classify(
//        {
//            text: req.body,
//            classifier_id: classifierId
//        },
//        function(err, nlcResponse) {
//            if (err) {
//                console.log('error:', err);
//                res.sendStatus(500);
//            } else {
//                console.log(JSON.stringify(nlcResponse, null, 2));
//
//                // store result in cloudant
//                // TODO tidy this up!
//                var now = moment().utc();
//                nlcResponse.created_at = now.format();
//                var id = '';
//                db.insert(nlcResponse, id, function(err, doc) {
//                    if(err) {
//                        console.log(err);
//                        //response.sendStatus(500);
//                    } else {
//                        console.log(JSON.stringify(doc, null, 2));
//                        //response.sendStatus(200);
//                    }
//                    //response.end();
//                });
//
//
//                var quote = '"' + nlcResponse.text + '" (';
//                if (nlcResponse.top_class === 'cratchit') {
//                    quote = quote + 'Cratchit, ';
//                } else {
//                    quote = quote + 'Scrooge, ';
//                }
//
//                var date = new Date();
//                quote = quote + date.getFullYear() + ')';
//
//                res.type('text/plain').send(quote);
//            }
//
//        }
//    );
//});

//function createResponseData(id, name, value, attachments) {
//
//	var responseData = {
//		id : id,
//		name : name,
//		value : value,
//		attachements : []
//	};
//
//
//	attachments.forEach (function(item, index) {
//		var attachmentData = {
//			content_type : item.type,
//			key : item.key,
//			url : 'http://' + dbCredentials.user + ":" + dbCredentials.password
//					+ '@' + dbCredentials.host + '/' + dbCredentials.dbName
//					+ "/" + id + '/' + item.key
//		};
//		responseData.attachements.push(attachmentData);
//
//	});
//	return responseData;
//}
//
//
//var saveDocument = function(id, name, value, response) {
//
//	if(id === undefined) {
//		// Generated random id
//		id = '';
//	}
//
//	db.insert({
//		name : name,
//		value : value
//	}, id, function(err, doc) {
//		if(err) {
//			console.log(err);
//			response.sendStatus(500);
//		} else
//			response.sendStatus(200);
//		response.end();
//	});
//
//}
//
//app.post('/api/favorites/attach', multipartMiddleware, function(request, response) {
//
//	console.log("Upload File Invoked..");
//	console.log('Request: ' + JSON.stringify(request.headers));
//
//	var id;
//
//	db.get(request.query.id, function(err, existingdoc) {
//
//		var isExistingDoc = false;
//		if (!existingdoc) {
//			id = '-1';
//		} else {
//			id = existingdoc.id;
//			isExistingDoc = true;
//		}
//
//		var name = request.query.name;
//		var value = request.query.value;
//
//		var file = request.files.file;
//		var newPath = './public/uploads/' + file.name;
//
//		var insertAttachment = function(file, id, rev, name, value, response) {
//
//			fs.readFile(file.path, function(err, data) {
//				if (!err) {
//
//					if (file) {
//
//						db.attachment.insert(id, file.name, data, file.type, {rev: rev}, function(err, document) {
//							if (!err) {
//								console.log('Attachment saved successfully.. ');
//
//								db.get(document.id, function(err, doc) {
//									console.log('Attachements from server --> ' + JSON.stringify(doc._attachments));
//
//									var attachements = [];
//									var attachData;
//									for(var attachment in doc._attachments) {
//										if(attachment == value) {
//											attachData = {"key": attachment, "type": file.type};
//										} else {
//											attachData = {"key": attachment, "type": doc._attachments[attachment]['content_type']};
//										}
//										attachements.push(attachData);
//									}
//									var responseData = createResponseData(
//											id,
//											name,
//											value,
//											attachements);
//									console.log('Response after attachment: \n'+JSON.stringify(responseData));
//									response.write(JSON.stringify(responseData));
//									response.end();
//									return;
//								});
//							} else {
//								console.log(err);
//							}
//						});
//					}
//				}
//			});
//		}
//
//		if (!isExistingDoc) {
//			existingdoc = {
//				name : name,
//				value : value,
//				create_date : new Date()
//			};
//
//			// save doc
//			db.insert({
//				name : name,
//				value : value
//			}, '', function(err, doc) {
//				if(err) {
//					console.log(err);
//				} else {
//
//					existingdoc = doc;
//					console.log("New doc created ..");
//					console.log(existingdoc);
//					insertAttachment(file, existingdoc.id, existingdoc.rev, name, value, response);
//
//				}
//			});
//
//		} else {
//			console.log('Adding attachment to existing doc.');
//			console.log(existingdoc);
//			insertAttachment(file, existingdoc._id, existingdoc._rev, name, value, response);
//		}
//
//	});
//
//});
//
//app.post('/api/favorites', function(request, response) {
//
//	console.log("Create Invoked..");
//	console.log("Name: " + request.body.name);
//	console.log("Value: " + request.body.value);
//
//	// var id = request.body.id;
//	var name = request.body.name;
//	var value = request.body.value;
//
//	saveDocument(null, name, value, response);
//
//});
//
//app.delete('/api/favorites', function(request, response) {
//
//	console.log("Delete Invoked..");
//	var id = request.query.id;
//	// var rev = request.query.rev; // Rev can be fetched from request. if
//	// needed, send the rev from client
//	console.log("Removing document of ID: " + id);
//	console.log('Request Query: '+JSON.stringify(request.query));
//
//	db.get(id, { revs_info: true }, function(err, doc) {
//		if (!err) {
//			db.destroy(doc._id, doc._rev, function (err, res) {
//			     // Handle response
//				 if(err) {
//					 console.log(err);
//					 response.sendStatus(500);
//				 } else {
//					 response.sendStatus(200);
//				 }
//			});
//		}
//	});
//
//});
//
//app.put('/api/favorites', function(request, response) {
//
//	console.log("Update Invoked..");
//
//	var id = request.body.id;
//	var name = request.body.name;
//	var value = request.body.value;
//
//	console.log("ID: " + id);
//
//	db.get(id, { revs_info: true }, function(err, doc) {
//		if (!err) {
//			console.log(doc);
//			doc.name = name;
//			doc.value = value;
//			db.insert(doc, doc.id, function(err, doc) {
//				if(err) {
//					console.log('Error inserting data\n'+err);
//					return 500;
//				}
//				return 200;
//			});
//		}
//	});
//});
//
//app.get('/api/favorites', function(request, response) {
//
//	console.log("Get method invoked.. ")
//
//	db = cloudant.use(dbCredentials.dbName);
//	var docList = [];
//	var i = 0;
//	db.list(function(err, body) {
//		if (!err) {
//			var len = body.rows.length;
//			console.log('total # of docs -> '+len);
//			if(len == 0) {
//				// push sample data
//				// save doc
//				var docName = 'sample_doc';
//				var docDesc = 'A sample Document';
//				db.insert({
//					name : docName,
//					value : 'A sample Document'
//				}, '', function(err, doc) {
//					if(err) {
//						console.log(err);
//					} else {
//
//						console.log('Document : '+JSON.stringify(doc));
//						var responseData = createResponseData(
//							doc.id,
//							docName,
//							docDesc,
//							[]);
//						docList.push(responseData);
//						response.write(JSON.stringify(docList));
//						console.log(JSON.stringify(docList));
//						console.log('ending response...');
//						response.end();
//					}
//				});
//			} else {
//
//				body.rows.forEach(function(document) {
//
//					db.get(document.id, { revs_info: true }, function(err, doc) {
//						if (!err) {
//							if(doc['_attachments']) {
//
//								var attachments = [];
//								for(var attribute in doc['_attachments']){
//
//									if(doc['_attachments'][attribute] && doc['_attachments'][attribute]['content_type']) {
//										attachments.push({"key": attribute, "type": doc['_attachments'][attribute]['content_type']});
//									}
//									console.log(attribute+": "+JSON.stringify(doc['_attachments'][attribute]));
//								}
//								var responseData = createResponseData(
//										doc._id,
//										doc.name,
//										doc.value,
//										attachments);
//
//							} else {
//								var responseData = createResponseData(
//										doc._id,
//										doc.name,
//										doc.value,
//										[]);
//							}
//
//							docList.push(responseData);
//							i++;
//							if(i >= len) {
//								response.write(JSON.stringify(docList));
//								console.log('ending response...');
//								response.end();
//							}
//						} else {
//							console.log(err);
//						}
//					});
//
//				});
//			}
//
//		} else {
//			console.log(err);
//		}
//	});
//
//});


http.createServer(app).listen(app.get('port'), '0.0.0.0', function() {
	console.log('Express server listening on port ' + app.get('port'));
});

