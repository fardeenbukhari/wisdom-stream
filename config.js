let config = {
    http : {
        host : '127.0.0.1',
        port : process.env.PORT || 9090
    },

    gateway : {
        host : '127.0.0.1',
        port : process.env.GATEWAY_PORT || 9091
    }
};

export default config;