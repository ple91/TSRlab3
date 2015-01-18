// Hello World client in Node.js
// Connects REQ socket to tcp://localhost:5559
// Sends "Hello" to server, expects "World" back

var configu = require('config');

//var random = require( './randString.js' );

//endpoint URL for the broker's frontend
var endpoint = configu.requires.endpoint; //process.argv[ 2 ];

//Text to be sent in the service request message. 
var request_text = configu.parameter.request_text;  //process.argv[ 3 ];

//Load module zmq into var zmq
var zmq = require( 'zmq' );

// Promises, because why not?
var Q = require( 'q' );

// This function will return a promise of an event happening.
function promisedEvent( eventName, emitter )
{
	var defer = Q.defer();
	emitter.on( eventName, function( data ) {
		defer.resolve( data );
	});
	return defer.promise;
}

//Instantiate a req zmq socket into var requester
var requester = zmq.socket( 'req' );

var eventualMessage = Q.nbind( requester.on, requester );

//ID of the client instance, as a string
requester.identity = (require('config').instanceId +'');// random.get();

//Connect to endpoint
requester.connect( endpoint );

//Send message through connection
requester.send( request_text );


promisedEvent( 'message', requester ).then( function( msg )
{
	console.log( '[RCVD REP]: ' + msg.toString() );
	//Message is received, then we close the connection
	requester.close();
} );
