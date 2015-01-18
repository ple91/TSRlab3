module.exports = {
	components: {
		balancer: {
			location: require.resolve("../../Components/balancer"),
			image: "tsir/balancer"
		},
	    frontend: {
	    	location: require.resolve("../../Components/frontend"),
	    	image: "tsir/frontend"
	    }
	},
	links: {
		frontend: {
			balancerurl: ["balancer", "routerport"]
		}
	}
};
