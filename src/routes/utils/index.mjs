"use strict"

import { v4 as uuidv4 } from "uuid"

import fetch from "node-fetch"
import crypto from "crypto"

import logger from "../../logger"
import { FHIR_SERVER, FOLDER_IDENTIFIER_SYSTEM, STANDALONE, DDCC_IDENTIFIER_SYSTEM } from "../../config/config"

import { processDDCCBundle } from "./ddccBundle"
import { createProvideDocumentBundle } from "./provideDocumentBundle"
import { convertQRToCoreDataSet, convertIPSToCoreDataSet } from "./logicalModel"
import { addAllContent } from "./qr"

import { PRIVATE_KEY } from "./keys"

import canonicalize from "./canonicalize"

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


export const buildErrorObject = (errorMessage) => {
  return buildReturnObject("Failed", 401, errorMessage)
}

export const retrieveDocumentReference = (hcid) => {
  logger.info("Retrieving Document Reference " + hcid)
  return retrieveResource( "DocumentReference/" + hcid )
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



//one needs to be defined for each questtonnaire handled
let QResponseInitializers = {
  "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire": initializeDDCCOptions
}

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
/*
For IPS method:

* set up options as above (line 177) for each logical model in return bundle from IPS structuremap.
* call compileHealthCertificate for each.  return last result
  * update compileHealthCertificate to make QResponse argument optional
*/

export const buildIPSCertificate = (ips) => {
  return new Promise( async (resolve) => {
    let lmBundle = await convertIPSToCoreDataSet( ips )
    if ( !lmBundle || lmBundle.error ) {
      return resolve({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Error converting to core data set: " + lmBundle.error
          }
        ]
      })      
    } else {
      let results
      for( let lmEntry of lmBundle.entry ) {
        let options = QResponseInitializers["http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire"]()
        options.responses = lmBundle.entry.resource
        results = await compileHealthCertificate(options)
      }
      return resolve(results)
    }
  } )
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

    if ( QResponse ) {
      addBundle.entry.push( {
        resource: QResponse,
        request: {
          method: "POST",
          url: "QuestionnaireResponse"
        }
      })
    }


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
        let docId = (options.responses.certificate.ddccid && options.responses.certificate.ddccid.value) || uuidv4()
        doc.identifier = [ {
          system: DDCC_IDENTIFIER_SYSTEM,
          value: docId
        } ]
        doc.link = [ { relation: "publication", url: "urn:HCID:" + options.responses.certificate.hcid.value } ]
        doc.entry = addBundle.entry;

        let sign = crypto.sign("SHA256", canonicalize(doc), PRIVATE_KEY)

        doc.id = docId

        /*
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
        */

        let provenance = {
          resourceType: "Provenance",
          id: uuidv4(),
          target: { reference: "Document/"+docId },
          occurredDateTime: options.now,
          recorded: options.now,
          activity: {
            coding: [ {
              system: "http://terminology.hl7.org/CodeSystem/v3-DocumentCompletion",
              code: "LA"
            } ]
          },
          agent: [ {
            who: { identifier: { value: options.responses.certificate.issuer.identifier.value } }
          } ],
          signature: {
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
        }

        let docBundle = {
          resourceType: "Bundle",
          type: "transaction",
          entry: [
            {
              fullUrl: "urn:uuid:" + docId,
              resource: doc,
              request: {
                method: "PUT",
                url: "Bundle/"+docId
              }
            },
            {
              fullUrl: "urn:uuid:" + provenance.id,
              resource: provenance,
              request: {
                method: "PUT",
                url: "Provenance/"+provenance.id
              }
            }
          ]
        }

        fetch(FHIR_SERVER, {
          method: "POST",
          body: JSON.stringify(docBundle),
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
  })
}
