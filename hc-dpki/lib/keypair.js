const msgpack = require('msgpack-lite')

const { AsyncClass } = require('n3h-common')
const mosodium = require('mosodium')

const util = require('./util')

/**
 * Actually, more like 2 keypairs...
 */
class Keypair extends AsyncClass {
  /**
   */
  static async newFromSeed (seed) {
    const { publicKey: signPub, secretKey: signPriv } =
      mosodium.sign.seedKeypair(seed, seed.lockLevel())
    const { publicKey: encPub, secretKey: encPriv } =
      mosodium.kx.seedKeypair(seed, seed.lockLevel())
    const pubkeys = util.encodeId(signPub, encPub)
    return new Keypair({
      pubkeys,
      signPriv,
      encPriv
    })
  }

  /**
   */
  static async fromBundle (bundle, passphrase) {
    bundle = msgpack.decode(await util.pwDec(
      Buffer.from(bundle.data, 'base64'), passphrase))
    return new Keypair({
      pubkeys: util.encodeId(bundle[0], bundle[1]),
      signPriv: mosodium.SecBuf.from(bundle[2]),
      encPriv: mosodium.SecBuf.from(bundle[3])
    })
  }

  /**
   */
  async init (opt) {
    await super.init()

    if (
      typeof opt !== 'object' ||
      typeof opt.pubkeys !== 'string'
    ) {
      throw new Error('opt.pubkeys must be a base64 encoded pubkey pair (sign / enc)')
    }

    if (opt.signPriv && !(opt.signPriv instanceof mosodium.SecBuf)) {
      throw new Error('if opt.signPriv is specified, it must be a SecBuf')
    }

    if (opt.encPriv && !(opt.encPriv instanceof mosodium.SecBuf)) {
      throw new Error('if opt.encPriv is specified, it must be a SecBuf')
    }

    this._pubkeys = util.decodeId(opt.pubkeys)
    this._signPub = this._pubkeys.signPub
    this._encPub = this._pubkeys.encPub
    this._pubkeys = util.encodeId(this._signPub, this._encPub)

    if (this._pubkeys !== opt.pubkeys) {
      throw new Error('error parsing opt.pubkeys')
    }

    this._signPriv = opt.signPriv
    this._encPriv = opt.encPriv
  }

  /**
   */
  async getBundle (passphrase, hint) {
    if (typeof hint !== 'string') {
      throw new Error('hint must be a string')
    }

    this._signPriv.$makeReadable()
    this._encPriv.$makeReadable()
    const out = {
      type: 'hcKeypair',
      hint,
      data: (await util.pwEnc(msgpack.encode([
        this._signPub, this._encPub,
        this._signPriv._, this._encPriv._
      ]), passphrase))
    }
    this._signPriv.$restoreProtection()
    this._encPriv.$restoreProtection()

    return out
  }

  /**
   */
  getId () {
    return this._pubkeys
  }

  /**
   */
  sign (data) {
    if (!this._signPriv) {
      throw new Error('no signPriv - cannot sign data')
    }
    return mosodium.sign.sign(data, this._signPriv)
  }

  /**
   */
  verify (signature, data) {
    return util.verify(signature, data, this._pubkeys)
  }

  /**
   */
  encrypt (recipientIds, data) {
    const symSecret = new mosodium.SecBuf(32)
    symSecret.randomize()

    // we will call the encryptor (us) the "server"
    // and the recipients the "client"
    const out = []
    for (let id of recipientIds) {
      const recipPub = Buffer.from(id, 'base64').slice(32, 64)
      // XXX lru cache these so we don't have to re-gen every time?
      const { tx } = mosodium.kx.serverSession(
        this._encPub, this._encPriv, recipPub)
      symSecret.readable(_ss => {
        const { nonce, cipher } = mosodium.aead.enc(
          _ss, tx)
        out.push(nonce)
        out.push(cipher)
      })
    }

    const { nonce, cipher } = mosodium.aead.enc(data, symSecret)
    out.push(nonce)
    out.push(cipher)

    return msgpack.encode(out)
  }

  /**
   */
  decrypt (sourceId, cipher) {
    cipher = msgpack.decode(cipher)
    sourceId = Buffer.from(sourceId, 'base64').slice(32, 64)

    // we will call the encryptor the "server"
    // and the recipient (us) the "client"
    // XXX cache?
    const { rx } = mosodium.kx.clientSession(
      this._encPub, this._encPriv, sourceId)

    let symSecret = null
    for (let i = 0; i < cipher.length - 2; i += 2) {
      const n = cipher[i]
      const c = cipher[i + 1]
      try {
        symSecret = mosodium.aead.dec(n, c, rx)
        symSecret = mosodium.SecBuf.from(symSecret)
      } catch (e) { /* pass */ }
    }

    if (!symSecret) {
      throw new Error('could not decrypt - not a recipient?')
    }

    return mosodium.aead.dec(
      cipher[cipher.length - 2], cipher[cipher.length - 1], symSecret)
  }
}

exports.Keypair = Keypair
