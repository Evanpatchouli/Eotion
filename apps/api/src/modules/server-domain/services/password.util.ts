import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const SALT_BYTES = 32
const KEY_BYTES = 64
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 }
const HASH_PREFIX = 'scrypt$16384$8$1$'
const DUMMY_PASSWORD_HASH = `${HASH_PREFIX}${Buffer.alloc(SALT_BYTES).toString('base64url')}$${Buffer.alloc(KEY_BYTES).toString('base64url')}`

export { DUMMY_PASSWORD_HASH }

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error('Password must not be empty')
  const salt = randomBytes(SALT_BYTES)
  const derivedKey = await scrypt(password, salt)
  return `${HASH_PREFIX}${salt.toString('base64url')}$${derivedKey.toString('base64url')}`
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (password.length === 0) return false
  if (!encodedHash.startsWith(HASH_PREFIX)) return false
  const [encodedSalt, encodedKey, extra] = encodedHash.slice(HASH_PREFIX.length).split('$')
  if (!encodedSalt || !encodedKey || extra !== undefined) return false

  const salt = Buffer.from(encodedSalt, 'base64url')
  const expectedKey = Buffer.from(encodedKey, 'base64url')
  if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_BYTES) return false

  const actualKey = await scrypt(password, salt)
  return timingSafeEqual(actualKey, expectedKey)
}
