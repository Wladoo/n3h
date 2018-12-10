const crypto = require('crypto')

const getLoc = exports.getLoc = function getLoc (hash) {
  let loc = hash.readInt8(0)
  for (let i = 1; i < 32; i += 1) {
    loc = loc ^ hash.readInt8(i)
  }
  const b = Buffer.alloc(1)
  b.writeInt8(loc, 0)
  return b.toString('hex')
}

const getHash = exports.getHash = function getHash (buffer) {
  const hasher = crypto.createHash('sha256')
  hasher.update(buffer)
  return hasher.digest()
}

const getEntry = exports.getEntry = function getEntry (data) {
  const buffer = Buffer.from(JSON.stringify(data), 'utf8')
  const hash = getHash(buffer)
  return {
    loc: getLoc(hash),
    hash: hash.toString('base64'),
    buffer
  }
}

class Mem {
  constructor () {
    this._data = {}
    this._indexers = []
  }

  registerIndexer (fn) {
    const store = {}
    this._indexers.push([store, fn])
    return store
  }

  insert (data) {
    const entry = getEntry(data)
    if (!(entry.loc in this._data)) {
      this._data[entry.loc] = {}
    }
    if (entry.hash in this._data[entry.loc]) {
      return false
    }
    this._data[entry.loc][entry.hash] = entry
    for (let idx of this._indexers) {
      idx[1](idx[0], entry.hash, data)
    }
    return true
  }

  has (hash) {
    const loc = getLoc(Buffer.from(hash, 'base64'))
    if (!(loc in this._data)) {
      return false
    }
    if (hash in this._data[loc]) {
      return true
    }
    return false
  }

  get (hash) {
    const loc = getLoc(Buffer.from(hash, 'base64'))
    if (!(loc in this._data)) {
      return
    }
    if (hash in this._data[loc]) {
      return JSON.parse(this._data[loc][hash].buffer.toString('utf8'))
    }
  }

  toJSON () {
    const out = {}
    for (let loc in this._data) {
      for (let hash in this._data[loc]) {
        out[hash] = JSON.parse(this._data[loc][hash].buffer.toString('utf8'))
      }
    }
    return out
  }

  getHashHashForLoc (loc) {
    return getHash(Buffer.concat(Object.keys(this._data[loc]).map(
      h => Buffer.from(h, 'base64')))).toString('base64')
  }

  getGossipHashHash () {
    const out = {}
    for (let loc in this._data) {
      out[loc] = this.getHashHashForLoc(loc)
    }
    return out
  }

  getGossipLocListForGossipHashHash (gossipHashHash) {
    const out = []
    for (let loc in gossipHashHash) {
      if (loc in this._data) {
        if (gossipHashHash[loc] !== this.getHashHashForLoc(loc)) {
          out.push(loc)
        }
      } else {
        out.push(loc)
      }
    }
    return out
  }

  getGossipHashesForGossipLocList (gossipLocList) {
    const out = []
    for (let loc of gossipLocList) {
      if (loc in this._data) {
        for (let hash in this._data[loc]) {
          out.push(hash)
        }
      }
    }
    return out
  }
}

exports.Mem = Mem
