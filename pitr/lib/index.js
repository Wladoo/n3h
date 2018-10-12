const path = require('path')
const os = require('os')
const { URL } = require('url')

const { AsyncClass, Moduleit, mkdirp } = require('n3h-common')
const { PitrIpcServer } = require('./ipc-server')

/**
 */
class Pitr extends AsyncClass {
  /**
   */
  async init (modules) {
    await super.init()

    this._workDir = 'N3H_WORK_DIR' in process.env
      ? process.env.N3H_WORK_DIR
      : path.resolve(path.join(
        os.homedir(), '.nh3'))

    await mkdirp(this._workDir)
    process.chdir(this._workDir)

    this._ipcUri = 'N3H_IPC_SOCKET' in process.env
      ? process.env.N3H_IPC_SOCKET
      : 'ipc://' + path.resolve(path.join(
        os.homedir(), '.n3h', 'n3h-ipc.socket'))

    const tmpUri = new URL(this._ipcUri)
    if (tmpUri.protocol === 'ipc:') {
      await mkdirp(path.dirname(tmpUri.pathname))
    }

    if (!Array.isArray(modules)) {
      throw new Error('modules must be an array')
    }
    modules.push({
      moduleitRegister: (register) => {
        register({
          type: 'ipc',
          name: '_builtin_',
          defaultConfig: {},
          construct: async () => this.ipc
        })
      }
    })

    this._modules = await new Moduleit(modules)

    this.$pushDestructor(async () => {
      await Promise.all([
        this._ipc.destroy()
      ])
      this._ipc = null
      if (typeof this._resolve === 'function') {
        this._resolve()
      }
      this._resolve = null
      this._reject = null
    })

    await this._startupServices()
  }

  run () {
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject

      console.log('up and running')
    })
  }

  // -- private -- //

  /**
   */
  async _startupServices () {
    this._ipc = await new PitrIpcServer(this._ipcUri)
    console.log('#IPC-READY#')
    this._ipc.on('configReady', async () => {
      console.log('@@ modules initialized!!')
    })
  }
}

exports.Pitr = Pitr
