const config = {
    http: {
        // 0.0.0.0 lets other devices on the same Wi-Fi join your watch party
        host: process.env.HOST || '0.0.0.0',
        port: Number(process.env.PORT) || 9090
    }
};

export default config;
