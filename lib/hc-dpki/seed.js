const { AsyncClass } = require('../n3h-common')
const mosodium = require('../mosodium')
const bip39 = require('bip39')

const { KeyBundle } = require('./keybundle')
const util = require('./util')

/**
 * Superclass of all other seed types
 */
class Seed extends AsyncClass {
  /**
   * Get the proper seed type from a persistence blob
   * @param {object} blob - the persistence blob
   * @param {string} passphrase - the decryption passphrase
   * @return {RootSeed|DeviceSeed|DevicePinSeed}
   */
  static async fromBlob (blob, passphrase) {
    let Class = null
    switch (blob.type) {
      case 'hcDeviceSeed':
        Class = DeviceSeed
        break
      case 'hcDevicePinSeed':
        Class = DevicePinSeed
        break
      case 'hcRootSeed':
        Class = RootSeed
        break
      default:
        throw new Error('unrecognized blob type: "' + blob.type + '"')
    }
    return new Class(mosodium.SecBuf.from(await util.pwDec(
      Buffer.from(blob.data, 'base64'), passphrase)))
  }

  /**
   * Initialize this seed class with persistence blob type and private seed
   * @param {string} type - the persistence blob type
   * @param {SecBuf|string} seed - the private seed data (as a buffer or mnemonic)
   */
  async init (type, seed) {
    await super.init()

    if (typeof type !== 'string') {
      throw new Error('type must be specified for bundling')
    }
    this._type = type

    if (seed instanceof mosodium.SecBuf && seed.size() === 32) {
      this._seed = seed
    } else if (typeof seed === 'string' && seed.split(/\s/g).length === 24) {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('invalid mnemonic string')
      }
      this._seed = mosodium.SecBuf.from(
        Buffer.from(bip39.mnemonicToEntropy(seed), 'hex'))
    } else {
      throw new Error('`seed` must be a 32 byte mosodium.SecBuf or 24 word bip39 mnemonic string')
    }

    this.$pushDestructor(async () => {
      this._seed.free()
      this._seed = null
    })
  }

  /**
   * generate a persistence blob with hint info
   * @param {string} passphrase - the encryption passphrase
   * @param {string} hint - additional info / description for persistence
   */
  async getBlob (passphrase, hint) {
    if (typeof hint !== 'string') {
      throw new Error('hint must be a string')
    }

    this._seed.$makeReadable()
    const out = {
      type: this._type,
      hint,
      data: (await util.pwEnc(this._seed._, passphrase)).toString('base64')
    }
    this._seed.$restoreProtection()

    return out
  }

  /**
   * generate a bip39 mnemonic based on the private seed entropy
   */
  getMnemonic () {
    let out = null
    return this._seed.readable(s => {
      out = bip39.entropyToMnemonic(s.toString('hex'))
    }).then(() => { return out })
  }
}

exports.Seed = Seed

/**
 * This is a device seed that has been PIN derived
 */
class DevicePinSeed extends Seed {
  /**
   * delegate to base class
   */
  async init (seed) {
    await super.init('hcDevicePinSeed', seed)
  }

  /**
   * generate an application KeyBundle given an index based on this seed
   * @param {number} index
   * @return {KeyBundle}
   */
  async getApplicationKeyBundle (index) {
    if (typeof index !== 'number' || parseInt(index, 10) !== index || index < 1) {
      throw new Error('invalid index')
    }

    const appSeed = mosodium.kdf.derive(
      index, Buffer.from('HCAPPLIC'), this._seed)

    return KeyBundle.newFromSeed(appSeed)
  }
}

exports.DevicePinSeed = DevicePinSeed

/**
 * This is a device seed that is waiting for PIN derivation
 */
class DeviceSeed extends Seed {
  /**
   * delegate to base class
   */
  async init (seed) {
    await super.init('hcDeviceSeed', seed)
  }

  /**
   * generate a device pin seed by applying pwhash of pin with this seed as the salt
   * @param {string} pin - should be >= 4 characters 1-9
   * @return {DevicePinSeed}
   */
  async getDevicePinSeed (pin) {
    if (typeof pin !== 'string' || pin.length < 4) {
      throw new Error('pin must be a string >= 4 characters')
    }
    pin = Buffer.from(pin, 'utf8')
    const pass = mosodium.SecBuf.from(Buffer.from(pin, 'utf8'))

    this._seed.$makeReadable()
    const seed = await util.pwHash(pass, this._seed._)
    this._seed.$restoreProtection()

    return new DevicePinSeed(seed.hash)
  }
}

exports.DeviceSeed = DeviceSeed

/**
 * This root seed should be pure entropy
 */
class RootSeed extends Seed {
  /**
   * Get a new, completely random root seed
   */
  static async newRandom () {
    const seed = await mosodium.SecBuf.secure(32)
    seed.randomize()
    return new RootSeed(seed)
  }

  /**
   * delegate to base class
   */
  async init (seed) {
    await super.init('hcRootSeed', seed)
  }

  /**
   * generate a device seed given an index based on this seed
   * @param {number} index
   * @return {DeviceSeed}
   */
  async getDeviceSeed (index) {
    if (typeof index !== 'number' || parseInt(index, 10) !== index || index < 1) {
      throw new Error('invalid index')
    }

    const seed = mosodium.kdf.derive(
      index, Buffer.from('HCDEVICE'), this._seed)

    return new DeviceSeed(seed)
  }
}

exports.RootSeed = RootSeed
