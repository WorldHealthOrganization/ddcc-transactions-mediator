// @strip-block
'use strict'

const { v4: uuidv4 } = require('uuid')
const cbor = require('cbor')
const base45 = require('base45')
const qrcode = require('qrcode')
const fetch = require('node-fetch')
import {FHIR_SERVER} from '../config/config'

let urn

export const setMediatorUrn = mediatorUrn => {
  urn = mediatorUrn
}

// The OpenHIM accepts a specific response structure which allows transactions to display correctly
// The openhimTransactionStatus can be one of the following values:
// Successful, Completed, Completed with Errors, Failed, or Processing
export const buildReturnObject = (
  openhimTransactionStatus,
  httpResponseStatusCode,
  responseBody
) => {
  let response = responseBody
  /* openhim:start */
  response = {
    'x-mediator-urn': urn,
    status: openhimTransactionStatus,
    response: {
      status: httpResponseStatusCode,
      headers: {'content-type': 'application/json'},
      body: responseBody,
      timestamp: new Date()
    },
    properties: {property: 'Primary Route'}
  }
  /* openhim:end */
  return response
}

export const buildErrorObject = (
  errorMessage
) => {
  return buildReturnObject( 'Failed', 401, errorMessage )
}

export const buildHealthCertificate = (
  SHCParameters
) => {
  return new Promise( (resolve) => {

    if ( SHCParameters.resourceType !== "Parameters" || !SHCParameters.parameter ) {
      resolve( {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Invalid resource submitted."
          }
        ]
      } ) 
    }
    let parameter = SHCParameters.parameter.find( param => param.name === "response" )
    if ( !parameter || !parameter.resource ) {
      resolve( {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Unable to find response parameter."
          }
        ]
      } )
    }
    let QResponse = parameter.resource
    if ( QResponse.resourceType !== "QuestionnaireResponse" ) {
      resolve( {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Invalid response resource."
          }
        ]
      } )
    }

    let answers = {}
    let otherTypes = {
      "birthDate": "Date",
      "vaccinecode": "Coding",
      "expiry": "Date"
    }
    for( let item of QResponse.item ) {
      let linkId = item.linkId
      if ( otherTypes[linkId] ) {
        answers[linkId] = item.answer[0]["value"+otherTypes[linkId]]
      } else {
        answers[linkId] = item.answer[0].valueString
      }
    }
    if ( answers.version !== "RC-2-draft" ) {
      resolve( {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Invalid version."
          }
        ]
      } )
    }
    let pID = "urn:uuid:" + uuidv4()
    let iID = "urn:uuid:" + uuidv4()
    let qrID = "urn:uuid:" + uuidv4()

    let QRContent64 = Buffer.from(JSON.stringify(QResponse.item)).toString('base64')
    let QRContentCBOR = cbor.encode(QResponse.item)
    let QRCBOR45 = base45.encode(QRContentCBOR)

    qrcode.toDataURL( QRCBOR45, { errorCorrectionLevel: 'Q' } ).then( url => {

      let [ header, QRImage ] = url.split(',', 2)

      let now = new Date().toISOString()
      let addBundle = {
        resourceType: "Bundle",
        type: "transaction",
        entry: [
          {
            fullUrl: pID,
            resource: {
              resourceType: "Patient",
              id: pID,
              name: [
                {
                  text: answers.name
                }
              ],
              birthDate: answers.birthDate
            },
            request: {
              method: "POST",
              url: "Patient"
            }
          },
          {
            fullUrl: iID,
            resource: {
              resourceType: "Immunization",
              id: iID,
              identifier: [
                {
                  value: iID
                }
              ],
              status: "completed",
              vaccineCode: {
                coding: [
                  answers.vaccinecode
                ]
              },
              lotNumber: answers.lot,
              expirationDate: answers.expiry,
              performer: {
                actor: {
                  type: "Practitioner",
                  identifier: {
                    value: answers.hw
                  }
                }
              },
              protocolApplied: [
                {
                  authority: {
                    type: "Organization",
                    identifier: {
                      value: answers.pha
                    }
                  },
                  doseNumberPositiveInt: 1
                }
              ]
            },
            request: {
              method: "POST",
              url: "Immunization"
            }
          },
          {
            fullUrl: qrID,
            resource: {
              resourceType: "DocumentReference",
              id: qrID,
              status: "current",
              category: {
                coding: [
                  {
                    system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Category-Usage-CodeSystem",
                    value: "who"
                  }
                ]
              },
              subject: pID,
              content: [
                {
                  attachment: {
                    contentType: "image/png",
                    data: QRImage
                  },
                  format: {
                    system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Format-CodeSystem",
                    code: "image"
                  }
                },
                {
                  attachment: {
                    contentType: "application/json",
                    data: QRContent64
                  },
                  format: {
                    system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Format-CodeSystem",
                    code: "serialized"
                  }
                },
              ]
            },
            request: {
              method: "POST",
              url: "DocumentReference"
            }
          },
          {
            resource: {
              resourceType: "Composition",
              id: answers.paperid,
              identifier: [
                {
                  value: answers.paperid
                }
              ],
              type: {
                coding: [
                  {
                    system: "http://loinc.org",
                    code: "82593-5"
                  }
                ]
              },
              category: [
                {
                  coding: [
                    {
                      code: "svc-covid19"
                    }
                  ]
                }
              ],
              subject: pID,
              date: now,
              author: [
                {
                  type: "Organization",
                  identifier: {
                    value: answers.pha
                  }
                }
              ],
              title: "International Certificate of Vaccination or Prophylaxis",
              section: [
                {
                  code: {
                    coding: [
                      {
                        system: "http://loinc.org",
                        code: "11369-6"
                      }
                    ]
                  },
                  entry: [
                    {
                      reference: iID
                    }
                  ]
                },
                {
                  code: {
                    coding: [
                      {
                        system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-SectionCode-CodeSystem",
                        value: "qrdoc"
                      }
                    ]
                  },
                  entry: [
                    {
                      reference: qrID
                    }
                  ]
                }
              ]
            },
            request: {
              method: "PUT",
              url: "Composition/" + answers.paperid
            }
          }
        ]
      }


      /*
  let QRCode = {
    resourceType: "Binary"
  }
  let QRContent = {
    resourceType: "QuestionnaireResponse"
  }
  let certificateUri = ""
  let returnParameters = {
    resourceType: "Parameters",
    parameter: [
      {
        name: "qr-code",
        resource: QRCode
      },
      {
        name: "qr-content",
        resource: QRContent
      },
      {
        name: "certificate",
        valueUri: certificateUri
      }
    ]
  }
  */

      fetch( FHIR_SERVER, {
        method: 'POST',
        body: JSON.stringify( addBundle ),
        headers: { 'Content-Type': 'application/fhir+json' }
      } )
        .then( res => res.json() ).then( json => {
        // Hacky for now, but Composition was 4th, so the return 
        // will be, too.
        /*
        let compRegexp = /^Composition\/([^\/]+)\/_history\/([^\/]+)$/
        let [ compLoc, compID, compVers ] = json.entry[3].response.location.match( compRegexp )
        */
        fetch( FHIR_SERVER + "Composition/" + answers.paperid + "/$document" )
        .then( res => res.json() ).then( json => {
          resolve( json )
        } )
        .catch( err => {
          resolve( {
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "error",
                code: "exception",
                diagnostics: err.message
              }
            ]
          } )
        } )
      } )
        .catch( err => {
        resolve( {
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "exception",
              diagnostics: err.message
            }
          ]
        } )
      } )

      //resolve( addBundle )
    } ).catch( err => {
      resolve( {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "exception",
            diagnostics: err.message
          }
        ]
      } )
    } )

  } )
}
