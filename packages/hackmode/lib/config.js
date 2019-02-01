const { config } = require('@holochain/n3h-common')

module.exports = exports = config.createDefinition({
  webproxy: {
    connection: {
      rsaBits: config.entry({
        type: 'number',
        // TODO - default to 4096, allow setting to 1024 for unit testing
        default: 1024
      }),
      bind: config.entry({
        type: 'arrayOf.string',
        // TODO - default ['wss://0.0.0.0:8443/'], allow random port for tests
        default: ['wss://0.0.0.0:0/']
      })
    },
    wssAdvertise: config.entry({
      type: 'string',
      default: 'auto'
    }),
    wssRelayPeers: config.entry({
      type: 'arrayOf.string'
      // no default, null unless specified
    })
  }
})
