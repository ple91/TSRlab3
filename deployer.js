var Deployer = require("./Deployers/basicdeployer");

var deployer = new Deployer(undefined,true);

if (process.argv.length != 3) {
	console.log("Usage: node desplegador.js <deployment description>");
}

var path = process.argv[2];
switch (path[0]) {
	case '.':
	case '/':
		break;
	default:
		path = "./" + path;
}

deployer.deploy(require(path));
