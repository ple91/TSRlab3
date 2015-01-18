var Q = require( 'q' );
var configu = require('config');
console.log( "[INIT]");
// Assign arguments to variables.
frontend_port = configu.provides.frontendPort;//process.argv[ 2 ];
backend_port = configu.provides.backendPort;//process.argv[ 3 ];
config_port = configu.provides.configPort;//process.argv[ 4 ];
verbose = configu.parameter.verbose;//( process.argv[ 5 ] == "true" );

// Require dependencies.
var zmq = require( 'zmq' );
// Create sockets.
var frontend = zmq.socket( 'router' );
var backend = zmq.socket( 'router' );
var config = zmq.socket( 'rep' );


// Bind sockets.
frontend.bind( 'tcp://*:' + frontend_port );
backend.bind( 'tcp://*:' + backend_port );
config.bind( 'tcp://*:' + config_port );

// Verbose mode.
if ( verbose ) console.log( "[INIT] Frontend listening on: " + frontend_port );
if ( verbose ) console.log( "[INIT]  Backend listening on: " + backend_port );
if ( verbose ) console.log( "[INIT]  Configuration listening on: " + config_port );

// Buffer of pending requests.
var pending_requests = [];

// Constructor of class worker.
function worker( id, statusEndpoint, load )
{
	this.isReady = true;
	this.id = id;
	this.statusEndpoint = statusEndpoint;
	this.load = load;
	this.waitingLoad = false;
	this.count = 0;
}

// This array will store all workers.
var workers = [];

// This function will return the next worker to be used or null if no worker available.
function get_next_worker()
{
	// If no available workers, return null.
	if ( workers.length < 1 ) return null;

	// Here we will store the worker.
	var worker = null;

	// Work done by the laziest worker.
	for ( var i in workers )
		if ( workers[ i ].isReady && ( worker === null || workers[ i ].load < worker.load ) )
			worker = workers[ i ];

	return worker;
}

var factor;

function get_next_worker_equitable()
{
	// Implement a fair forwarding with a correction factor of 'factor'
	var avg = 0;
	var i;
	for ( i in workers )
	{
		avg += workers[ i ];
	}
	avg /= workers.length;

	var lazy = [],
		busy = [];

	for ( i in workers )
	{
		if ( workers[ i ].count > avg ) busy.push( workers[ i ] );
		else lazy.push( workers[ i ] );
	}

	if ( lazy.length > 0 && ( ( Math.random() + factor ) < 1 || busy.length === 0 ) )
	{
		return lazy[ Math.floor( Math.random() * lazy.length ) ];
	}
	else if ( busy.length > 0 )
	{

		return busy[ Math.floor( Math.random() * busy.length ) ];
	}
	return false;
}

var period;
var lowLoad;

function get_next_worker_lower_load()
{
	// Implement a forwarding that each 'period' seconds, it updates the selected worker with
	// a random one out of the 'lowLoad' with lesser load

	return workers[ Math.floor( Math.random() * lowLoad ) ];
}

function periodic_worker_sort()
{
	workers.sort( function ( w1, w2 )
	{
		return w1.count - w2.count;
	} );
}

var next_worker = get_next_worker;

// We check the load of the workers each 5 seconds.
var check_load = setInterval( function ()
{
	console.log( "[LOADP]: Sending load request" );
	for ( var n in workers )

		if ( workers[ n ].isReady && worker !== null )
		{
			if ( workers[ n ].waitingLoad )
			{
				workers[ n ].isReady = false;
			}

			// Promise about getting the load of a worker.
			var defer_status = Q.defer();
			var defer_promise = defer_status.promise;

			// Socket to ask for the load.
			var requester = zmq.socket( 'req' );
			// We connect to the worker...
			requester.connect( workers[ n ].statusEndpoint );
			// We store the worker number in the socket (we need it later!)...
			requester.WORKER_N = n;
			// We store here the defer of the promise about getting the load...
			requester._swag_defer_status = defer_status;
			// We ask for the load with our best manners.
			requester.send( 'Gimme ur load doge, or imma kill ur famly' );
			// We change the status of this worker to "waiting for response",
			// if the worker doesn't reply, then we know that it is down.
			workers[ n ].waitingLoad = true;
			// When we have the response....
			requester.on( 'message', function ( data )
			{
				// We resolve the promise, giving the number of worker and the load received.
				this._swag_defer_status.resolve( [ this.WORKER_N, data ] );
			} );
			// When we know the load...
			defer_promise.then( function ( array )
			{
				var n = array[ 0 ];
				var data = array[ 1 ];
				// We update the worker with its new load and update its status.
				workers[ n ].load = data;
				workers[ n ].waitingLoad = false;
				// And print something in stdout.
				if ( verbose ) console.log( "[RECVLOAD] Received effective load <" + workers[ n ].load + "> from worker " + workers[ n ].id );
			} );

		}
}, 1000 * 1 * 5 );

// This function is in charge of processing a given request.
function process_request( args )
{
	if ( verbose ) console.log( "[RQST] Received request from client <" + args[ 0 ] + ">." );

	var frontend_defer = Q.defer();
	var frontend_promise = frontend_defer.promise;

	frontend_defer.resolve( [ args, verbose ] );

	frontend_promise.then( function ( data )
	{

		// Get the worker that will handle it.
		var worker = next_worker();
		// If we have a worker...
		if ( worker )
		{
			// Set worker as busy.
			worker.isReady = false;
			// Increase counter of requests handled by this worker.
			if ( verbose ) console.log( "[WORK] Worker <" + worker.id + "> will handle the request." );
			// Put the worker ID.
			args.unshift( "" );
			args.unshift( worker.id );
			// Send to that worker.
			backend.send( args );
			// Increase the counter of attented requests.
			worker.count++;
		}
		else if ( verbose )
		{
			console.log( "[ERROR] No workers registered!" );
			pending_requests.push( args );
		}

	} );

}

// When a message from a client arrives...
frontend.on( 'message', function ()
{
	// Get args.
	var args = Array.apply( null, arguments );
	process_request( args );
} );


backend.on( 'message', function ()
{
	// Get args.
	var args = Array.apply( null, arguments );

	var index = -1;
	// For every worker
	for ( var i in workers )
	{
		// If message is sent by already active worker, save that worker's index.
		if ( workers[ i ].id == args[ 0 ] ) index = i;
	}

	// If workerID is a new ID, create worker entry.
	if ( index == -1 )
	{
		if ( verbose ) console.log( "[ARQE] Registered new worker <" + args[ 0 ] + " (" + args[ 2 ] + ") (" + args[ 3 ] + ")>" );
		var new_worker = new worker( args[ 0 ].toString(), args[ 2 ].toString(), args[ 3 ].toString() );

		workers.push( new_worker );

	}
	else
	{ // Else take out workerID from message and send to client.
		args = args.slice( 2 );
		frontend.send( args );
		workers[ index ].isReady = true;

		var backend_defer = Q.defer();
		var backend_promise = backend_defer.promise;

		backend_defer.resolve( [ args, verbose ] );

		backend_promise.then( function ( data )
		{
			var args = data[ 0 ];
			var verbose = data[ 1 ];

			if ( verbose ) console.log( "[ OK ] Message sent to client <" + args[ 0 ] + ">. Reactivated worker <" + workers[ index ].id + ">" );
		} );
	}
} );

config.on( 'message', function ( json )
{
	var msg = JSON.parse( json );

	if ( period !== undefined ) clearInterval( period );

	switch ( msg.distribution )
	{
	case 'equitable':
		next_worker = get_next_worker_equitable;
		factor = msg.adjustFactor;
		if ( verbose ) console.log( "[ CONF ] Established equitable worker forwarding policy with { factor = ", factor, " }" );
		if ( check_load !== undefined )
		{
			clearInterval( check_load );
			check_load = undefined;
		}
		break;
	case 'lowerLoad':
		next_worker = get_next_worker_lower_load;
		period = setInterval( periodic_worker_sort, msg.periodicity * 1000 );
		lowLoad = msg.lowLoadWorkers;
		if ( verbose ) console.log( "[ CONF ] Established lower load worker forwarding policy with { period = ", msg.periodicity, " sec, numLoadWorkers = ", lowLoad, " }" );
		if ( check_load !== undefined )
		{
			clearInterval( check_load );
			check_load = undefined;
		}
		break;
	}

	// Necessary action, unnecessary message
	config.send( "YOLO" );
} );

// Try to send a pending request each second, if there are no pending requests then do nothing.
setInterval( function ()
{
	if ( pending_requests.length > 0 )
		process_request( pending_requests.pop() );
}, 1000 );


// After 1 minute, show statistics of usage.
// We wait 1 minute because workers will be closed
// so no more requests will be hanlded.

if ( verbose )
{

	setTimeout( function ()
	{
		console.log( "[STAT] Worker statistics:" );
		for ( var i in workers )
			console.log( "\t" + workers[ i ].id + " has a attented " + workers[ i ].count + " requests." );
		process.exit( 0 );
	}, 1000 * 1 * 66 );

}
