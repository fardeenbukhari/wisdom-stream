let config = {
    http : {
        host : '127.0.0.1',
        port : 9090 || process.env.PORT
    },

    gateway : {
        host : '127.0.0.1',
        port : 9091 || process.env.PORT
    }
};

export default config;