export default {
  app: {
    name: 'test-plugin-filesystem',
    clients: {
      test: { runtime: 'node' },
    },
  },
  env: {
    port: 8080,
    serverAddress: '127.0.0.1',
    useHttps: false,
    verbose: false,
  },
};
