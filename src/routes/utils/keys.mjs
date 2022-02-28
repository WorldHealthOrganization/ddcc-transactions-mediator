
import fs from 'fs'
import crypto from 'crypto'

import logger from "../../logger"
import { PRIVATE_KEY_FILE } from "../../config/config"

let privateKey, publicKey

if ( fs.existsSync( PRIVATE_KEY_FILE ) ) {
  logger.info("Loaded private key: " + PRIVATE_KEY_FILE)
  const privKey = fs.readFileSync(PRIVATE_KEY_FILE) || null
  publicKey = crypto.createPublicKey( { key: privKey, format: 'pem' } )
  privateKey = crypto.createPrivateKey( { key: privKey, format: 'pem' } )
} else {
  logger.error("Failed to find private key so creating: " + PRIVATE_KEY_FILE)
  let keyPair = crypto.generateKeyPairSync( 'ec', { namedCurve: 'P-256' } )
  privateKey = keyPair.privateKey
  publicKey = keyPair.publicKey
}

export const PRIVATE_KEY = privateKey.export( { format: 'pem', type: 'pkcs8' } )
export const PUBLIC_KEY = publicKey.export( { format: 'pem', type: 'spki' } )

export const PRIVATE_KEY_JWK = privateKey.export( {format:'jwk', type:'spki'})
export const PUBLIC_KEY_JWK = publicKey.export( {format:'jwk', type:'spki'})
