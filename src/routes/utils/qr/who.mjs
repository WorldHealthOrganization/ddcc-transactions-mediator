import { PRIVATE_KEY, PUBLIC_KEY } from "../keys"
import { makeCWT, signAndPack } from "@pathcheck/dcc-sdk"

export const serialize = ( data, id ) => {
  return data
}

export const qrContent = ( data ) => {
  return new Promise( async (resolve, reject) => {
    try {
      let cwt = await makeCWT(data)
      const qrUri = await signAndPack( cwt, PUBLIC_KEY, PRIVATE_KEY )
      resolve(qrUri)
    } catch(err) {
      reject(err)
    }
  })
}