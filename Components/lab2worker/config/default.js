module.exports = {
		requires : {
			endpoint : "tcp://localhost:8001"
		},
		provides : {
			loadEndpoint : "tcp://localhost:8002"
		},
    		parameter: {
     			registerMessage : "TESTregisterMessage",
			resultMessage : "TESTresultMessage",
			verbose : false
    		}
};
