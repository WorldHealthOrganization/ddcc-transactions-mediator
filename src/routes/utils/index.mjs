"use strict"
//import canvas from "canvas"
//import handlebars from "handlebars"
import nodeHtmlToImage from "node-html-to-image"
import { v4 as uuidv4 } from "uuid"
//import cbor from "cbor"
//import cose from "cose-js"
//import base45 from "base45"
//import qrcode from "qrcode"
import fetch from "node-fetch"
//import zlib from "zlib"
import crypto from "crypto"

//import { createQRPDF } from "./pdf"
import logger from "../../logger"
import { FHIR_SERVER, FOLDER_IDENTIFIER_SYSTEM, PRIVATE_KEY, STANDALONE } from "../../config/config"
//import { doc } from "prettier"

import { processDDCCBundle } from "./ddccBundle"
import { createProvideDocumentBundle } from "./provideDocumentBundle"
//import { processResponses, reverseResponses, reverseQuestionnaireResponse } from "./responses"
import { convertQRToCoreDataSet } from "./logicalModel"
import { addAllContent } from "./qr"


let urn

const initializeDDCCOptions = () => {
  let options = {
    resources: {},
    questionnaire: "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire",
    /*
    content: { 
      who: { data: '', id: '', image: '', data64: '', pdf: '' }, 
      dcc: { data: '', id: '', image: '', data64: '', pdf: '' } 
    },
    */
    version : "RC-2-draft",
    responses: {},
    ids: {},
    images: {},
    pdfs: {},
    dataURLs: {},
    content64: {}
  }
  options.now = new Date().toISOString()

  return options
}

export const setMediatorUrn = (mediatorUrn) => {
  urn = mediatorUrn
}

// The OpenHIM accepts a specific response structure which allows transactions to display correctly
// The openhimTransactionStatus can be one of the following values:
// Successful, Completed, Completed with Errors, Failed, or Processing
export const buildReturnObject = (
  openhimTransactionStatus,
  httpResponseStatusCode,
  responseBody,
  responseContentType
) => {
  let response = responseBody
  if ( !STANDALONE ) {
    response = {
      "x-mediator-urn": urn,
      status: openhimTransactionStatus,
      response: {
        status: httpResponseStatusCode,
        headers: { "content-type": responseContentType || "application/json" },
        body: responseBody,
        timestamp: new Date()
      },
      properties: { property: "Primary Route" }
    }
  }
  return response
}

/*
const renderHtmlToImage = (imgoptions) => {
  logger.info("Rendering " + JSON.stringify(imgoptions))
  return nodeHtmlToImage({
    html:
      "<html><head><style>" +
      (imgoptions.css || "") +
      "</style><style>body{" +
      " width:" +
      (imgoptions.width || 400) +
      " height:" +
      (imgoptions.height || 400) +
      "}</style></head><body>" +
      imgoptions.html,
    puppeteerArgs: {
      headless: true,
      args: ["--no-sandbox"]
    }
  })
}
*/
export const buildErrorObject = (errorMessage) => {
  return buildReturnObject("Failed", 401, errorMessage)
}

export const retrieveDocumentReference = (hcid) => {
  logger.info("Retrieving Document Reference " + hcid)
  return retrieveResource( "DocumentReference/" + hcid )
  /*
  logger.info(FHIR_SERVER + "DocumentReference/" + hcid)
  return new Promise((resolve) => {
    fetch(FHIR_SERVER + "DocumentReference/" + hcid, {
      method: "GET",
      headers: { "Content-Type": "application/fhir+json" }
    })
      .then((res) => res.json())
      .then((json) => {
        logger.info("Retrieved Document Reference ID=" + hcid)
        resolve(json)
      })
      .catch((err) => {
        logger.info("Error retrieving Document Reference ID=" + hcid)
        resolve({ error: JSON.stringify(err) })
      })
  })
  */
}

export const retrieveResource = (id, server) => {
  if (!server) server = FHIR_SERVER
  return new Promise((resolve) => {
    fetch(server + id, {
      method: "GET",
      headers: { 
        "Content-Type": "application/fhir+json", 
        "Cache-Control": "no-cache" 
      }
    })
      .then((res) => res.json())
      .then((json) => {
        logger.info("Retrieved ID="+id)
        resolve(json)
      })
      .catch((err) => {
        logger.info("Error retrieving Resource ID=" + id)
        resolve({ error: JSON.stringify(err) })
      })
  })
}

/*
const processAttachments = (options) => {
  let images = {}
  for (let [key, dataURL] of Object.entries(options.dataURLs)) {
    let [header, image] = dataURL.split(",")
    images[key] = image
  }
  return images
}
*/

//one needs to be defined for each questtonnaire handled
let QResponseInitializers = {
  "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire": initializeDDCCOptions
}
/*
let QResponseProcessors = {
  "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire": processDDCCBundle
}
*/


export const buildHealthCertificate = (DDCCParameters) => {
  return new Promise(async (resolve) => {
    
    let QResponse = undefined
    let options
    if (DDCCParameters.resourceType === "QuestionnaireResponse") {
      QResponse = DDCCParameters
    } else {
      if (DDCCParameters.resourceType !== "Parameters" || !DDCCParameters.parameter) {
        resolve({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "required",
              diagnostics: "Invalid resource submitted."
            }
          ]
        })
      }

      let responseParam = DDCCParameters.parameter.find((param) => param.name === "response")
      if (responseParam && responseParam.resource) {
        QResponse = responseParam.resource
        if (QResponse.resourceType !== "QuestionnaireResponse") {
          resolve({
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "error",
                code: "required",
                diagnostics: "Invalid response resource."
              }
            ]
          })
        }
      } else {
        resolve({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "required",
              diagnostics: "Unable to find response or immunization/hcid parameters."
            }
          ]
        })
      }
    }

    if ( !(QResponse.questionnaire in QResponseInitializers)) {
      return resolve({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Do not know how to handle " + QResponse.questionnaire
          }
        ]
      })
    }

    options = QResponseInitializers[QResponse.questionnaire]()
    options.resources.QuestionnaireResponse = QResponse
    //options.responses = processResponses(QResponse, options)
    options.responses = await convertQRToCoreDataSet(QResponse)
    if ( !options.responses || options.responses.error ) {
      return resolve({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Error converting to core data set: " + options.responses.error
          }
        ]
      })
    } else if ( options.responses.resourceType === "OperationOutcome" ) {
      return resolve(options.responses)
    }
    compileHealthCertificate(options, QResponse).then((results) => {
      return resolve(results)
    })
  })
}

const compileHealthCertificate = (options, QResponse) => {
  return new Promise(async (resolve) => {
    let existingFolder = await retrieveResource(
      "List?identifier=" + FOLDER_IDENTIFIER_SYSTEM + "|" + options.responses.certificate.hcid.value
    )
    if (
      existingFolder &&
      existingFolder.resourceType === "Bundle" &&
      existingFolder.total > 0 &&
      existingFolder.entry &&
      existingFolder.entry[0].resource.resourceType === "List"
    ) {
      options.resources.List = existingFolder.entry[0].resource
    }
    /*
    serializeContent( options )
    createQRs( options )
    */

    let addBundle = await processDDCCBundle(options.responses)
    if ( addBundle.error ) {
      return resolve({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "exception",
            diagnostics: addBundle.error
          }
        ]
      })
    }

    // Still need to add QResponse to the bundle just to save it.

    addBundle.entry.push( {
      resource: QResponse,
      request: {
        method: "POST",
        url: "QuestionnaireResponse"
      }
    })


    let addPatient = addBundle.entry && addBundle.entry.find((entry) => entry.resource && entry.resource.resourceType === "Patient")
    if (addPatient) {
      options.resources.Patient = addPatient.resource
    } else {
      return resolve({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "exception",
            diagnostics: "Missing Patient in addBundle."
          }
        ]
      })
    }

    // Here is where you set the QRs
    try {
      await addAllContent( addBundle, options.responses )
    } catch( err ) {
      logger.error( "Failed to add QR content to addBundle: " + err.message )
    }

    fetch(FHIR_SERVER, {
        method: "POST",
        body: JSON.stringify(addBundle),
        headers: { "Content-Type": "application/fhir+json" }
    }).then( res => res.json() )
    .then( json => {

      let compEntry = addBundle.entry.find( entry => entry.resource && entry.resource.resourceType === "Composition" )
      if ( !compEntry ) {
        return resolve({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "exception",
              diagnostics: "Missing Composition in addBundle."
            }
          ]
        })
      }


      fetch(FHIR_SERVER + "Composition/" + compEntry.resource.id + "/$document")
      .then((res) => res.json())
      .then((doc) => {
        let docId = uuidv4()
        doc.id = docId
        doc.link = [ { relation: "publication", url: "urn:HCID:" + options.responses.certificate.hcid.value } ]

        let docBuffer = Buffer.from(JSON.stringify(doc))
        let sign = crypto.sign("SHA256", docBuffer, PRIVATE_KEY)
        doc.signature = {
          type: [
            {
              system: "urn:iso-astm:E1762-95:2013",
              code: "1.2.840.10065.1.12.1.5"
            }
          ],
          when: options.now,
          who: { identifier: { value: options.responses.certificate.issuer.identifier.value } },
          data: sign.toString("base64")
        }

        fetch(FHIR_SERVER + "Bundle/" + docId, {
          method: "PUT",
          body: JSON.stringify(doc),
          headers: { "Content-Type": "application/fhir+json" }
        })
          .then((res) => res.json())
          .then((docAdded) => {
            
            createProvideDocumentBundle(doc, options)

            resolve(doc)
          })
          .catch((err) => {
            return resolve({
              resourceType: "OperationOutcome",
              issue: [
                {
                  severity: "error",
                  code: "exception",
                  diagnostics: err.message
                }
              ]
            })
          })
      })
      .catch((err) => {
        return resolve({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "exception",
              diagnostics: err.message
            }
          ]
        })
      })

    }).catch( err => {
      return resolve({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "exception",
            diagnostics: err.message
          }
        ]
      })
    })

   
/*
    let addDocDetails = processDDCCDocDetails(options)
    fetch(FHIR_SERVER, {
      method: "POST",
      body: JSON.stringify(addDocDetails),
      headers: { "Content-Type": "application/fhir+json" }
    })
      .then((res) => res.json())
      .then((json) => {
        fetch(FHIR_SERVER + "Composition/" + options.ids.Composition + "/$document")
          .then((res) => res.json())
          .then((doc) => {
            let docId = uuidv4()
            doc.id = docId
            doc.link = [ { relation: "publication", url: "urn:HCID:" + options.responses.certificate.hcid.value } ]

            let docBuffer = Buffer.from(JSON.stringify(doc))
            let sign = crypto.sign("SHA256", docBuffer, privateKey)
            doc.signature = {
              type: [
                {
                  system: "urn:iso-astm:E1762-95:2013",
                  code: "1.2.840.10065.1.12.1.5"
                }
              ],
              when: options.now,
              who: { identifier: { value: options.responses.certificate.hcid.value } },
              data: sign.toString("base64")
            }

            fetch(FHIR_SERVER + "Bundle/" + docId, {
              method: "PUT",
              body: JSON.stringify(doc),
              headers: { "Content-Type": "application/fhir+json" }
            })
              .then((res) => res.json())
              .then((docAdded) => {
                createProvideDocumentBundle(doc, options)

                resolve(doc)
              })
              .catch((err) => {
                return resolve({
                  resourceType: "OperationOutcome",
                  issue: [
                    {
                      severity: "error",
                      code: "exception",
                      diagnostics: err.message
                    }
                  ]
                })
              })
          })
          .catch((err) => {
            return resolve({
              resourceType: "OperationOutcome",
              issue: [
                {
                  severity: "error",
                  code: "exception",
                  diagnostics: err.message
                }
              ]
            })
          })
      })
      .catch((err) => {
        return resolve({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "exception",
              diagnostics: err.message
            }
          ]
        })
      })
*/
    
/*
    //in future should have all the QR codes generated (e.g. DGC, ICAO)
    const headers = {
      p: { alg: "ES256" },
      u: { kid: "11" }
    }
    const signer = {
      key: {
        d: Buffer.from("6c1382765aec5358f117733d281c1c7bdc39884d04a45a1e6c67c858bc206c19", "hex")
      }
    }

    let canvasElementQR = canvas.createCanvas(400, 400)
    let QRContentCBOR = cbor.encode(options.responses)
    let QRContentCOSE = await cose.sign.create(headers, QRContentCBOR, signer)
    let QRContentCOSEZlib = zlib.deflateSync(QRContentCOSE)
    let QRCOSE45 = base45.encode(QRContentCOSEZlib)
*/

/*
    qrcode
      .toCanvas(canvasElementQR, QRCOSE45, { errorCorrectionLevel: "Q" })
      .then(async (canvasElementQR) => {
        const ctxQR = canvasElementQR.getContext("2d")
        let watermark = "WHO-DDCC: " + options.responses.certificate.hcid.value //this is the hcid
        let xoff = Math.max(0, Math.floor((canvasElementQR.width - ctxQR.measureText(watermark).width) / 2))
        ctxQR.fillText(watermark, xoff, 10)

        options.dataURLs = {
          QR: canvasElementQR.toDataURL()
        }

        options.images = processAttachments(options)
        for (let idx in options.images) {
          let pdf = await createQRPDF(options.images[idx])
          options.pdfs[idx] = Buffer.from(pdf).toString("base64")
        }

        //logger.info('a0' )
        let imgoptions = {
          width: 400,
          height: 400
        }
        let textDivImage = await renderHtmlToImage(imgoptions)
        //really we should be doing this at the end after we processed all QR codes generated
        //what is getting attached here is the representation of the DDCC
        //from the the QResps and all of QR codes
        let canvasElement = canvas.createCanvas(
          options.width + canvasElementQR.width + 40,
          Math.max(options.height, canvasElementQR.height)
        )
        const ctx = canvasElement.getContext("2d")
        //logger.info("a2")
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height)
        ctx.drawImage(canvasElementQR, options.width + 20, 0)
        //logger.info('a3.0' + textDivImage) //why is textDivImage a promise still?
        //logger.info('a3 ' + JSON.stringify(textDivImage))

        //ctx.drawImage(canvas.createImageData(new Uint8ClampedArray(textDivImage),imgoptions.width,imgoptions.height),10,0)
        ctx.putImageData(
          canvas.createImageData(new Uint8ClampedArray(textDivImage), imgoptions.width, imgoptions.height),
          10,
          0
        )
        //ctx.putImageData(textDivImage,10,0)
        //logger.info("a4")
        let addBundle = QResponseProcessors[QResponse.questionnaire](options)

        let addPatient = addBundle.entry.find((entry) => entry.resource.resourceType === "Patient")
        if (addPatient && addPatient.resource) {
          options.resources.Patient = addPatient.resource
        } else {
          resolve({
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "error",
                code: "exception",
                diagnostics: "Missing Patient in addBundle."
              }
            ]
          })
        }
        try {
          let res = await fetch(FHIR_SERVER, {
            method: "POST",
            body: JSON.stringify(addBundle),
            headers: { "Content-Type": "application/fhir+json" }
          })
          let json = await res.json()
        } catch (err) {
          resolve({
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "error",
                code: "exception",
                diagnostics: err.message
              }
            ]
          })
        }
        

        let addDocDetails = processDDCCDocDetails(options)
        fetch(FHIR_SERVER, {
          method: "POST",
          body: JSON.stringify(addDocDetails),
          headers: { "Content-Type": "application/fhir+json" }
        })
          .then((res) => res.json())
          .then((json) => {
            fetch(FHIR_SERVER + "Composition/" + options.ids.Composition + "/$document")
              .then((res) => res.json())
              .then((doc) => {
                let docId = uuidv4()
                doc.id = docId
                doc.link = [ { relation: "publication", url: "urn:HCID:" + options.responses.certificate.hcid.value } ]

                let docBuffer = Buffer.from(JSON.stringify(doc))
                let sign = crypto.sign("SHA256", docBuffer, privateKey)
                doc.signature = {
                  type: [
                    {
                      system: "urn:iso-astm:E1762-95:2013",
                      code: "1.2.840.10065.1.12.1.5"
                    }
                  ],
                  when: options.now,
                  who: { identifier: { value: options.responses.certificate.hcid.value } },
                  data: sign.toString("base64")
                }

                fetch(FHIR_SERVER + "Bundle/" + docId, {
                  method: "PUT",
                  body: JSON.stringify(doc),
                  headers: { "Content-Type": "application/fhir+json" }
                })
                  .then((res) => res.json())
                  .then((docAdded) => {
                    createProvideDocumentBundle(doc, options)

                    resolve(doc)
                  })
                  .catch((err) => {
                    resolve({
                      resourceType: "OperationOutcome",
                      issue: [
                        {
                          severity: "error",
                          code: "exception",
                          diagnostics: err.message
                        }
                      ]
                    })
                  })
              })
              .catch((err) => {
                resolve({
                  resourceType: "OperationOutcome",
                  issue: [
                    {
                      severity: "error",
                      code: "exception",
                      diagnostics: err.message
                    }
                  ]
                })
              })
          })
          .catch((err) => {
            resolve({
              resourceType: "OperationOutcome",
              issue: [
                {
                  severity: "error",
                  code: "exception",
                  diagnostics: err.message
                }
              ]
            })
          })

        //resolve( addBundle )
      })
      .catch((err) => {
        resolve({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "exception",
              diagnostics: err.message
            }
          ]
        })
      })
    */
  })
}
