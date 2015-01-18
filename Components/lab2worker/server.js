// Required dependencies.
var zmq = require( 'zmq' );
var configu = require('config');
// Promises! Promises everywhere!
var Q = require( 'q' );



// Socket to talk to broker.
var broker = zmq.socket( 'req' );

//var random = require( './randString.js' );
var utils = require( './auxfunctions.js' );

var total_requests_handled = 0;
// This is just to force a fair distribution of requests, as load if a factor very difficult to debug.
// utils.getLoad = function() { return total_requests_handled; };

//ID of the worker instance, as a string
broker.identity = (require('config').instanceId +'');//random.get();

// Assign arguments to variables.
var endpoint = configu.requires.endpoint; //process.argv[ 2 ];
var registerMessage = configu.parameter.registerMessage; //process.argv[ 3 ];
var resultMessage = configu.parameter.resultMessage; //process.argv[ 4 ];
var verbose = configu.parameter.verbose; // ( process.argv[ 5 ] == "true" );
var loadEndpoint = configu.provides.loadEndpoint; //process.argv[ 6 ];
var loadPort = loadEndpoint.split( ":" );
loadPort = loadPort[ loadPort.length - 1 ];
//loadPort = Math.floor(Math.random() * (8090 - 8003) + 8003);

// Create load socket.
var loadSocket = zmq.socket( 'rep' );
loadSocket.bind( "tcp://*:" + loadPort );


// Reply with load on any request.
loadSocket.on( "message", function ()
{
	var defer = Q.defer();
	defer.resolve();
	defer.promise.then( function ()
	{
		var load = utils.getLoad();
		if ( verbose ) console.log( "[LOAD] ", load );
		loadSocket.send( load );
	} );
} );

// Connect to broker.
if ( verbose ) console.log( "[INIT] Worker ready to work for <" + endpoint + ">" );
broker.connect( endpoint );
// Register with broker.
//broker.send( registerMessage );
var _load = utils.getLoad();
broker.send( [ loadEndpoint, _load ] );

// On message received...
broker.on( "message", function ()
{
	var args = Array.apply( null, arguments );

	var defer = Q.defer();
	defer.resolve( args );
	defer.promise.then( function ( args )
	{

		var i;

		// Get fragments.
		for ( i in args ) args[ i ] = args[ i ].toString();

		if ( verbose )
		{
			console.log( "[RQST] Request received: " );
			for ( i in args )
				console.log( "\t[" + ( parseInt( i, 10 ) + 1 ) + " of " + args.length + "] " + args[ i ] );
		}

		// Get client.
		var client = args[ 0 ];
		// Get rest of fragments.
		var fragments = args.slice( 2 );
		// Compose final message ( all of the client message in a single String for better processing ).
		var message = fragments.join( " " );

		// Create response.
		var response = [ client, "", resultMessage ];
		// Send response.
		broker.send( response );

		// Increase local counter of requests.
		total_requests_handled++;

	} );
} );

// If SIGINT signal received, close socket.
process.on( 'SIGINT', function ()
{
	broker.close();
} );

// Close worker after 1 minute.
setTimeout( function ()
{
	// Close socket.
	broker.close();
	// Finish process.
	process.exit( 0 );
}, 1000 * 1 * 60 );
