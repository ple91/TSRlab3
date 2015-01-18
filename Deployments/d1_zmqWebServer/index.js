module.exports = {
	servicePath: require.resolve("../../Services/zmqWebServer"),
	counts: {
		balancer: 1,
		frontend: 3
	},
	config: {
		balancer: {
			external: {
				web: 80
			}
		},
		frontend: {
			parameter: {
				maxload: 2
			}
		}
	}
};