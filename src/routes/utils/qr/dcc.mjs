import {transliterate} from 'transliteration'
import { PRIVATE_KEY, PUBLIC_KEY } from "../keys"
import { makeCWT, signAndPack } from "@pathcheck/dcc-sdk"

export const serialize = ( data, id ) => {
  //Not the best option, but something for now
  let names = data.name.match(/(.+)\s(\S+)/)
  let surname
  let firstname
  if ( names ) {
    surname = names[2]
    firstname = names[1]
  } else {
    surname = data.name
    firstname = ''
  }
  return {
    ver: '1.3.0',
    nam: {
      fnt: convertToMRZ(surname),
      fn: surname,
      gnt: convertToMRZ(firstname),
      gn: firstname
    },
    dob: data.birthDate,
    v: [
      {
        tg: data.vaccination.disease.code,
        vp: data.vaccination.vaccine.code,
        mp: data.vaccination.brand.code,
        ma: data.vaccination.manufacturer.code || data.vaccination[0].maholder.code,
        dn: data.vaccination.dose || 1,
        sd: data.vaccination.totalDoses || 1,
        dt: data.vaccination.date,
        co: data.vaccination.country.code,
        is: data.certificate.issuer.identifier.value,
        ci: "URN:UVCI:01:WHO:" + id
      }

    ]
  }
}

const convertToMRZ = (name) => {
  return transliterate(name).toUpperCase().replace(/'/ig, '').replace(/[^A-Z]/ig, '<')
}

export const qrContent = ( data ) => {
  return new Promise( async (resolve, reject) => {
    try {
      const qrUri = await signAndPack( await makeCWT(data), PUBLIC_KEY, PRIVATE_KEY )
      resolve(qrUri)
    } catch(err) {
      reject(err)
    }
  })
}