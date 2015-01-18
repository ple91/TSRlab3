var zmq    = require('zmq');
var fs     = require('fs');
var Q      = require('bluebird');
var config = require('config');
var url    = require('url');

var dealersock = zmq.socket('dealer');

dealersock.identity = config.instanceId || process.argv[2];
dealersock.connect(config.requires.balancerurl);


// Each HELLO message gives the balancer one ticket to send us requests
// the configuration parameter "load" determines the number of tickets
// this component gives the load balancer
//
for (var i = 0; i < config.parameter.maxload; i++) {
    dealersock.send('HELLO');
}

// ongoing requests. Initially none.
var requests = {};


// very simple front-end
// it deals with basic request/response patterns.
// We assume a NEW message carries all the load of the request.
// we cannot deal for now with extra DATA packets...
// 
dealersock.on('message', function () {
	var args  = Array.prototype.slice.call(arguments);

    var op    = args.shift().toString();
	var reqId = args.shift().toString();

    console.log('got message', op, reqId);
    switch (op) {
    	case 'NEW':
    		if (requests[reqId]) {
    			console.log('ReqId already exists');
    			return;
    		}
    		requests[reqId] = args;

            processRequest(args)
            .then(function (resp) {
        		dealersock.send(['HEADERS', reqId, JSON.stringify(resp[0])])
        		dealersock.send(['DATA',    reqId, resp[1]]);
        		dealersock.send(["CLOSE",   reqId]);
        		dealersock.send(['HELLO']); // make myself available again
            })
            .catch(function (err) {
                dealersock.send(['ERROR', reqId, err[0], err[1]]);
                delete requests[reqId];
                dealersock.send('HELLO'); // make myself available again
            });
    		// end the request
    		break;
        case 'CLOSE':
        	delete requests[reqId];
        	dealersock.send('HELLO'); // make myself available again
        	break;
        case 'DATA':
        	console.log("Got data. Can't handle it");
        	break;
    }

});

// processor, where things happen.
function processRequest(args) {
	var request  = JSON.parse(args[0].toString());
    var purl     = url.parse(request.url, true);

    return new Q.Promise(function (res, rej) {
        switch (purl.pathname) {
            case '/':
                res([{'Content-Type': 'text/html'}, fs.readFileSync(__dirname + '/public/templates/formulario_rotulo.html')]);
                break;
            case '/tsr.css':
                res([{'Content-Type': 'text/css'}, fs.readFileSync(__dirname + '/public/stylesheets/tsr.css')]);
                break;
            default:
                fs.readFile(__dirname + '/public/images/vendetta.png', function (err, data) {
                    if (err) {
                        rej(['400', "Server error"]);
                    } else {
                        res([{'Content-Type': 'image/png', 'Content-Length': data.length}, data])
                    }
                });
    	}
    });
}
