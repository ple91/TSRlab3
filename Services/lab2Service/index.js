module.exports = {
	components: {
		broker: {
			location: require.resolve("../../Components/lab2broker"),
			image: "tsir/lab2broker"
		},
	    	client: {
	    		location: require.resolve("../../Components/lab2client"),
	    		image: "tsir/lab2client"
	    	},
		worker: {
			location: require.resolve("../../Components/lab2worker"),
			image: "tsir/lab2worker"
		}
	},
	links: {
		lab2client: {
			endpoint: ["lab2broker", "frontendPort"]
		},
		lab2worker: {
			endpoint: ["lab2broker", "backendPort"]
		}
	}
};
