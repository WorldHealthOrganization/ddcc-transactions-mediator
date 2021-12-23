import * as who from "./who"
import * as dcc from "./dcc"
import * as shc from "./shc"
import logger from "../../../logger"
import { createQRPDF } from "../pdf"
import qrcode from "qrcode"

const qrModules = { who, dcc, shc }

export const addContent = ( qrDocRef, data ) => {
  return new Promise( async (resolve, reject) => {
    let typeCode
    qrDocRef.category.map( (category) => typeCode = category.coding.find( (coding) => coding.system === "http://worldhealthorganization.github.io/ddcc/CodeSystem/DDCC-QR-Category-Usage-CodeSystem"))
    if ( !typeCode ) {
      return reject(new Error("Failed to find category in docRef."))
    }
    let modName = typeCode.code
    if ( qrModules.hasOwnProperty(modName) ) {
      let serialized = qrModules[modName].serialize( data, qrDocRef.id )
      let serialized64 = Buffer.from( JSON.stringify( serialized ) ).toString('base64')
      let serialAttachment = qrDocRef.content.find( content => content.format && content.format.code === "serialized" )
      if ( serialAttachment ) {
        serialAttachment.attachment = {
          contentType: "application/json",
          data: serialized64
        }
      }
      try {
        let qrContent = await qrModules[modName].qrContent( serialized )
        qrcode.toDataURL( qrContent, {errorCorrectionLevel: "Q" } ).then( async (url) => {
          let qr64 = url.replace(/^data:image\/.+;base64,/, '')
          let pdf = await createQRPDF(qr64)
          let pdf64 = Buffer.from(pdf).toString("base64")
          let imageAttachment = qrDocRef.content.find( content => content.format && content.format.code === "image" )
          if ( imageAttachment ) {
            imageAttachment.attachment = {
              contentType: "image/png",
              data: qr64
            }
          }
          let pdfAttachment = qrDocRef.content.find( content => content.format && content.format.code === "pdf" )
          if ( pdfAttachment ) {
            pdfAttachment.attachment = {
              contentType: "application/pdf",
              data: pdf64
            }
          }
          resolve()

        }).catch(err => {
          reject(err)
        })
      } catch(err) {
        reject(err)
      }
    } else {
      reject(new Error("No supported category code found."))
    }
  } )
}

export const addAllContent = ( bundle, data ) => {
  return new Promise( async (resolve, reject) => {
    try {
      let docRefs = bundle.entry.filter((entry) => entry.resource.resourceType === "DocumentReference")
      for( let ref of docRefs ) {
        await addContent( ref.resource, data )
      }
      resolve()
    } catch(err) {
      reject(err)
    }
  })
}
