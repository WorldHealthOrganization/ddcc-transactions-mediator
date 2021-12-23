import logger from "../../../logger"
import { transform } from "../structureMaps"
import { PRIVATE_KEY_EC, SHC_ISSUER } from "../../../config/config"
const {signAndPack, makeJWT} = require('@pathcheck/shc-sdk');

export const serialize = ( data, id ) => {
  return new Promise((resolve) => {
    transform( "ddcc-to-shc", data )
      .then((transformed) => {
        logger.info("Converted Bundle to SHC")
        const payload = {
          "type": [
            "https://smarthealth.cards#health-card",
            "https://smarthealth.cards#immunization",
            "https://smarthealth.cards#covid19"
          ],
          "credentialSubject": {
            "fhirVersion": "4.0.1",
            "fhirBundle": transformed
          }
        };
        resolve(payload)
      }).catch((err) => {
        logger.info("Error converting Bundle to SHC")
        resolve({ error: JSON.stringify(err) })
      })
    })
}

export const qrContent = ( data ) => {
  return new Promise( async (resolve, reject) => {
    try {
      const qrUri = await signAndPack(await makeJWT(data, null, SHC_ISSUER, new Date()), PRIVATE_KEY_EC);
      resolve(qrUri)
    } catch(err) {
      reject(err)
    }
  })
}