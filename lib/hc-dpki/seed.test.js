const { expect } = require('chai')

const mosodium = require('../mosodium')

const util = require('./util')

// speed up the unit tests
util.pwhashOpslimit = mosodium.pwhash.OPSLIMIT_INTERACTIVE
util.pwhashMemlimit = mosodium.pwhash.MEMLIMIT_INTERACTIVE

const { Seed, RootSeed, DeviceSeed, DevicePinSeed } = require('./index')

describe('seed Suite', () => {
  it('should initialize with a SecBuf', async () => {
    const seed = await mosodium.SecBuf.secure(32)
    await seed.randomize()
    const rs = await new RootSeed(seed)
    const mnem = await rs.getMnemonic()
    expect(mnem.split(/\s/g).length).equals(24)
    await rs.destroy()
  })

  it('should work with static newRandom', async () => {
    const rs = await RootSeed.newRandom()
    const mnem = await rs.getMnemonic()
    expect(mnem.split(/\s/g).length).equals(24)
    await rs.destroy()
  })

  it('should blob / unblob', async () => {
    const rs = await RootSeed.newRandom()
    const m = await rs.getMnemonic()
    const b = await rs.getBlob(await mosodium.SecBuf.ref(Buffer.from('hello')), 'hola')
    await rs.destroy()
    expect(b.hint).equals('hola')
    expect(b.type).equals('hcRootSeed')
    const rs2 = await Seed.fromBlob(
      b, await mosodium.SecBuf.ref(Buffer.from('hello')))
    expect(await rs2.getMnemonic()).equals(m)
    expect(rs2 instanceof RootSeed).equals(true)
    await rs2.destroy()
  })

  it('should throw on bad blob hint', async () => {
    const rs = await RootSeed.newRandom()
    try {
      await rs.getBlob(mosodium.SecBuf.from(Buffer.from('hello')))
    } catch (e) {
      await rs.destroy()
      return
    }
    await rs.destroy()
    throw new Error('expected exception, got success')
  })

  it('should throw on bad blob type', async () => {
    try {
      await Seed.fromBlob({
        type: 'badBlobType'
      })
    } catch (e) {
      return
    }
    throw new Error('expected exception, got success')
  })

  it('should throw on bad init type', async () => {
    try {
      await new Seed(2)
    } catch (e) {
      return
    }
    throw new Error('expected exception, got success')
  })

  it('should throw on bad mnemonic string', async () => {
    try {
      await new Seed('hcRootSeed')
    } catch (e) {
      return
    }
    throw new Error('expected exception, got success')
  })

  it('should throw on bad mnemonic string (validate)', async () => {
    try {
      await new Seed('hcRootSeed', 'a a a a a a a a a a a a a a a a a a a a a a a a')
    } catch (e) {
      return
    }
    throw new Error('expected exception, got success')
  })

  it('should work with a mnemonic', async () => {
    const rs1 = await RootSeed.newRandom()
    const mn1 = await rs1.getMnemonic()
    const rs2 = await new RootSeed(mn1)
    const mn2 = await rs2.getMnemonic()
    expect(mn2.split(/\s/g).length).equals(24)
    expect(mn1).equals(mn2)
    await rs1.destroy()
    await rs2.destroy()
  })

  describe('device seed subsuite', () => {
    let seed = null
    let rs = null
    let ds = null
    let dps = null

    beforeEach(async () => {
      seed = await mosodium.SecBuf.secure(32)
      rs = await new RootSeed(seed)
      ds = await rs.getDeviceSeed(384)
      dps = await ds.getDevicePinSeed('123456')
    })

    afterEach(async () => {
      await Promise.all([
        rs.destroy(),
        ds.destroy(),
        dps.destroy()
      ])
    })

    it('should derive device seed', async () => {
      expect(await ds.getMnemonic()).equals('lecture butter globe amused sure visa festival soon power robot leaf razor chief napkin pole pupil oak pupil gauge nest dentist demise arm sweet')
    })

    it('should throw on bad device seed index', async () => {
      try {
        await rs.getDeviceSeed('a')
      } catch (e) {
        return
      }
      throw new Error('expected exception, got success')
    })

    it('should throw on bad device seed pin', async () => {
      try {
        await ds.getDevicePinSeed('a')
      } catch (e) {
        return
      }
      throw new Error('expected exception, got success')
    })

    it('should derive application KeyBundle', async () => {
      const kp = await dps.getApplicationKeyBundle(1952)
      expect(kp.getId()).equals('HcScI6FM9xnh8Xvgfrc4q3s7i676r7m85MmdmS6ibmoit388ckt8iFhScatpsai')
      await kp.destroy()
    })

    it('should throw on bad application KeyBundle index', async () => {
      try {
        await dps.getApplicationKeyBundle('a')
      } catch (e) {
        return
      }
      throw new Error('expected exception, got success')
    })

    it('should blob / unblob', async () => {
      const m = await ds.getMnemonic()
      const b = await ds.getBlob(await mosodium.SecBuf.ref(Buffer.from('hello')), 'hola')
      expect(b.hint).equals('hola')
      expect(b.type).equals('hcDeviceSeed')
      const ds2 = await Seed.fromBlob(
        b, await mosodium.SecBuf.ref(Buffer.from('hello')))
      expect(await ds2.getMnemonic()).equals(m)
      expect(ds2 instanceof DeviceSeed).equals(true)
      await ds2.destroy()
    })

    it('should blob / unblob (pin seed)', async () => {
      const m = await dps.getMnemonic()
      const b = await dps.getBlob(await mosodium.SecBuf.ref(Buffer.from('hello')), 'hola')
      expect(b.hint).equals('hola')
      expect(b.type).equals('hcDevicePinSeed')
      const dps2 = await Seed.fromBlob(
        b, await mosodium.SecBuf.ref(Buffer.from('hello')))
      expect(await dps2.getMnemonic()).equals(m)
      expect(dps2 instanceof DevicePinSeed).equals(true)
      await dps2.destroy()
    })
  })
})
