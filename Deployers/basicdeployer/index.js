var path   = require('path');
var fs     = require('fs');
var tar    = require('tar-fs');
var _      = require('underscore');
var Q      = require('bluebird');
var Docker = require('dockerode');

function Deployer (options) {
	if (!options) {
		if (process.env.DOCKER_HOST) { 
			// remote access to the daemon. Get parameters from the environment
			var tmp = process.env.DOCKER_HOST.split(':');
			options = {
				port:     tmp.pop(),
			    host:     tmp.pop().slice(2),
			    protocol: 'https',
				ca:       fs.readFileSync(process.env.DOCKER_CERT_PATH + '/ca.pem'),
				cert:     fs.readFileSync(process.env.DOCKER_CERT_PATH + '/cert.pem'),
				key:      fs.readFileSync(process.env.DOCKER_CERT_PATH + '/key.pem')
			};
		} else {
			options = { 
				// local access to the daemon
				socketPath: '/var/run/docker.sock'
			};
		}
	}
	this.docker  = new Docker(options);
};

var optscDefaults = {
  'Hostname': '',
  'name': '',
  'User': '',
  'AttachStdin': false,
  'AttachStdout': false,
  'AttachStderr': false,
  'Tty': false,
  'OpenStdin': false,
  'StdinOnce': false,
  'Env': null,
  'Cmd': null,
  'Dns': null,
  'Image': 'tsir/balancer',
  'Volumes': {},
  'VolumesFrom': ''
};

// Promisified form of running a container for our purposes
// Returns a promise to the inspection object of the running container
// 
Deployer.prototype.runComponent = function (opts, config) {
	var that = this;
	var ops = {
		Image: opts.Image,
		name: "/" + config.instanceId,
		Hostname: config.instanceId,
		HostConfig: {
			ExtraHosts: opts.hosts
		},
		Env: ["NODE_CONFIG=" + JSON.stringify(config)]
	};

	_.defaults(ops,optscDefaults);

	return new Q.Promise(function (resolve, reject) {
		that.docker.createContainer(ops, function (err, container) {
			if (err) {
				reject(err);
				return;
			}
			container.start(function (err, data) {
				if (err) {
					reject(err);
				}
				else {
					container.inspect(function (err, data) {
						if (err) reject(err);
						resolve(data);
					});					
				}
			});
		});
	});
};


// Mutates the deployment object with configuration information
// usable to actually launch the services.
function configureDeployment(deployment) {
	var service    = deployment.service;
	var startOrder = deployment.startOrder = [];

	function configureComponent(componentId) {
		// Initialize nextport for this component, in case it should supply one.
		// This initialization also signals visit to the component.
        deployment.config = deployment.config || {};
		var compConfig    = deployment.config[componentId] = deployment.config[componentId] || {};

		// Avoid processing twice the same component.
		// 
		if (compConfig.provides) return;

		var compLinks    = service.links[componentId];

		// NOTE: our convention for deployable node modules
		// prescribes that the "main" be the config/default.js file
		// which is also used by the "config" utility package.
		// 
		// We need access to this defaults file to get to the information of the
		// endpoints provided/required by the deployable module
		// 
		var compDefaults = require(service.components[componentId].location);

		if (compDefaults.provides) compConfig.provides = {};
		if (compDefaults.requires) compConfig.requires = {};

		var runningPort = deployment.initial_port || 8000;

		for (var provided in compDefaults.provides) {
			compConfig.provides[provided] = runningPort++;
		}

		// Traverse all links required by the component, if any
		for (var required in compLinks) {
			var dependency = compLinks[required][0];
			var provided   = compLinks[required][1];

			configureComponent(dependency);

			compConfig.requires[required] = 
				"tcp://" + dependency + ":" + deployment.config[dependency].provides[provided];
		}
		// once all dependencies have been processed (and added to the startOrder)
		// we add the component to the start order. This ensures any dependency of the component
		// will be started before than the component.
		startOrder.push(componentId);
	}

	// Go through all components declared in the service, and configure them for this deployment.
	for (var componentId in service.components) {
		configureComponent(componentId);
	}
}

// Promissified version of the image building function
// 
Deployer.prototype.buildImage = function (component) {
	var that = this;
	var ipath = path.dirname(path.dirname(component.location));

	return new Q.Promise(function(resolve, reject) {
		that.docker.buildImage(tar.pack(ipath), {t: component.image}, function (err, response) {
			if (err) {
				reject(err);
				return;
			}
			response.pipe(process.stdout);
			response.on('end', function () {
				resolve();
			});
		});
	});
}


Deployer.prototype.deploy = function (deployment) {
	//
	// parameter deployment must be either a deployment object, or 
	// a string with a path pointing to a deployment directory.
	// In this last case, the deployment object is built by simply requiring the path
	// which cannot be relative, but must be absolute
	// 
	if (_.isString(deployment)) {
		deployment = require(deployment);
	}

	if (!deployment.service) {
		deployment.service = require(deployment.servicePath);
	}

	// need to preserve our object accross callbacks
	var that = this;

    var components = deployment.service.components;

    // used to accumulate the host->ip mappings we need to configure
    // the /etc/hosts file within each instance that needs it
    deployment.hosts = {};
	configureDeployment(deployment);

	var imagesBuilt = Q.resolve();
/*
	Q.each(_.keys(components), function(mod) {
		if (components.hasOwnProperty(mod)) {
			return that.buildImage(deployment.service.components[mod]);
		}
		return true;
	});
*/
	imagesBuilt.then (function () {


		// As calls are asynchronous, but we need to guarantee an ordered
		// execution through our ordered list of components to instantiate
		// we need ot use a promise loop construct that gives us the guarantee
		// that each element of an array is executed only after all other elements
		// in the array preceding it have been fully processed.
		// 
		// We need this properties to ensure the host->ip mapping has been computed
		// 
	    Q.each(deployment.startOrder, function (componentId) {
			var hosts = _.pairs(deployment.hosts).map(function (pair) {
				return pair.join(":");
			});

			return Q.map(new Array(deployment.counts[componentId]), function (ignore, iid) {
				deployment.config[componentId].instanceId = componentId + ((iid && "_") || "") + (iid || "")
				return that.runComponent({
					Image: components[componentId].image,
					hosts: hosts			
				}, deployment.config[componentId]);
			}).then(function (instances) {
				deployment.hosts[componentId] = instances[0].NetworkSettings.IPAddress;
			});

	    });
	}).catch(function(err) {
		console.log(err);
	});
}

module.exports = Deployer;

