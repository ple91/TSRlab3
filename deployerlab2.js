var Deployer = require("./Deployers/basicdeployer");

var deployer = new Deployer(undefined,true);

if (process.argv.length != 4) {
	console.log("Usage: node desplegador.js <client no> <worker no>");
}


var clntNum = parseInt(process.argv[2]);
var wrkrNum = parseInt(process.argv[3]);

deployer.deploy(
module.exports = {
	servicePath: require.resolve("./Services/lab2Service"),
	counts: {
		broker: 1,
		client: clntNum,
		worker: wrkrNum
	}
}
);