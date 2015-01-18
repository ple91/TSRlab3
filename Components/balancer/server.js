
var http   = require('http');
var zmq    = require('zmq');
var config = require('config');

// We use the timestamp of the instanciation as the
// instance identifier to reject answers from previous
// instances that may have failed.

var gbinstance = {
    incarnationid: (new Date()).toJSON() + "/",
    reqnum: 0,
    newRequestId: function() {
        return this.incarnationid + this.reqnum++;
    }
}

// Build the local url for binding the router
// from the port configured through the routerport
// provides configuration parameter
// 
var localaddress = "*";
var localport    = config.provides.routerport;
var bindingurl   = "tcp://" + localaddress + ":" + localport;

// Set up the configured extrnal port for the web server
// 
var httpPort     = config.external.web;

// Set up the router endpoint
// 
var zmqPort = zmq.socket('router');
zmqPort.bindSync(bindingurl);

// list of available workers
// 
var available = [];

// Set of ongoing requests
// 
var ongoing   = {};

// Handler for messages arriving from front-ends
// 
zmqPort.on('message', function () {
	var args     = Array.prototype.slice.call(arguments);

    var worker   = args.shift().toString();
    var op       = args.shift().toString();

    if (op == 'HELLO') {
        available.push(worker);
        return;
    }

    // If this is not a HELLO message, we have a request ID
    // uniquified with the incarnationid prefix.
    // Thus, ongoing will only have this reqId registered
    // if it was originated within this instance of the balancer.
    //
    var reqId    = args.shift().toString();
    var response = ongoing[reqId];

    if (!response) {
        console.log("Got response for gone request or old balancer")
        return;
    }
   
    switch (op) {
        case 'HEADERS':
            var headers = JSON.parse(args.shift().toString());
            for (var h in headers) {
                response.setHeader(h, headers[h])
            }
            break;
        case 'DATA':
            response.write(args.shift());
            break;
        case 'ERROR':
            response.statusCode = args.shift().toString();
            response.write(args.shift());
            // NO BREAK, on purpose
        default: //CLOSE
            response.end();
            delete ongoing[reqId];
    }

    console.log('got message', op, reqId, worker)

});


// Main web server logic
// 
var server = http.createServer(function (request, response) {
    var worker  = available.shift();

    // Check if we have any worker available
    // 
    if (!worker) {
    	// send back an error that the server is busy
    	// clean up and return
    	console.log ("server busy");
        response.statusCode('400');
        response.end('server busy');
    	return;
    }

    var reqId   = gbinstance.newRequestId();

    // Store state for the new request so that we can match
    // the responses form the front-ends
    // 
    ongoing[reqId] = response;

    zmqPort.send([worker, "NEW", reqId, JSON.stringify({
    	headers: request.headers,
    	method:  request.method,
    	url:     request.url
    })]);

    request.on('data', function (d) {
    	// Assuming lossless FIFO channel
    	zmqPort.send([worker, "DATA", reqId, d])
    });

    request.on('close', function () {
    	zmqPort.send([worker, "CLOSE", reqId]);
    });

})

server.listen(httpPort)