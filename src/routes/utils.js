// @strip-block
'use strict'
const canvas = require('canvas')
const handlebars = require("handlebars")
const nodeHtmlToImage = require('node-html-to-image')
const { v4: uuidv4 } = require('uuid')
const cbor = require('cbor')
const base45 = require('base45')
const qrcode = require('qrcode')
const fetch = require('node-fetch')
const fs = require('fs')

import logger from '../logger'
import {FHIR_SERVER} from '../config/config'

let urn

let fullHtml = "<h4>SHC : SVC Covid 19 ({{version}})</h4><table><tr><td><ul>    <li>Name: {{name}}</li>    <li>Date of Birth: {{birthDate}}</li>    <li>Vaccine Code: {{vaccinecode.code}} </li>    <li>Expiration Date: {{expiry}}</li>    <li>Health Worker: {{hw}} </li>    <li>Public Health Authority: {{pha}}</li>    <li>SHF ID: {{paperid}}</li>    <li>Singature: {{signature}}</li>   </ul>  </td><td>   <img alt='SVC QR Code' src='{{dataURL}}'/>  </td> </tr></table>"
let textHtml = '<h4>SHC : SVC Covid 19 ({{version}})</h4><ul>  <li>Name: {{name}}</li>  <li>Date of Birth: {{birthDate}}</li>  <li>Vaccine Code: {{vaccinecode.code}} </li>  <li>Expiration Date: {{expiry}}</li>  <li>Health Worker: {{hw}} </li>  <li>Public Health Authority: {{pha}}</li>  <li>SHF ID: {{paperid}}</li>  <li>Singature: {{signature}}</li> </ul>'
let patientHtml = '<ul> <li>Name: {{name}}</li> <li>Date of Birth: {{birthDate}}</li> <li>SHF ID: {{paperid}}</li></ul>'
let immunizationHtml = '<ul>  <li>Vaccine Code: {{vaccinecode.code}} </li>  <li>Expiration Date: {{expiry}}</li>  <li>Health Worker: {{hw}} </li>  <li>Public Health Authority: {{pha}}</li>  <li>SHF ID: {{paperid}}</li></ul>'

let fullTemplate = handlebars.compile(fullHtml)
let textTemplate = handlebars.compile(textHtml)
let patientTemplate = handlebars.compile(patientHtml)
let immunizationTemplate = handlebars.compile(immunizationHtml)


export const setMediatorUrn = mediatorUrn => {
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
  /* openhim:start */
  response = {
    'x-mediator-urn': urn,
    status: openhimTransactionStatus,
    response: {
      status: httpResponseStatusCode,
      headers: {'content-type': responseContentType || 'application/json'},
      body: responseBody,
      timestamp: new Date()
    },
    properties: {property: 'Primary Route'}
  }
  /* openhim:end */
  return response
}




function renderHtmlToImage(options) {
    logger.info('Rendering ' + JSON.stringify(options))
    return nodeHtmlToImage({
	html:'<html><head><style>' + (options.css || '') + '</style><style>body{'
	    + ' width:' + (options.width || 400)
	    + ' height:' + (options.height || 400)
	    + '}</style></head><body>' + options.html 
    }).then( res => {
	logger('Resolving render')
	resolve( res)
    })    
}

export const buildErrorObject = (
  errorMessage
) => {
  return buildReturnObject( 'Failed', 401, errorMessage )
}

export const retrieveDocumentReference  = (shcid) => {
    logger.info('Retrieving Document Reference ' + shcid)
    logger.info( FHIR_SERVER + 'DocumentReference/' + shcid )
    return new Promise( (resolve) => {
	fetch( FHIR_SERVER + 'DocumentReference/' + shcid , {
            method: 'GET',
            headers: { 'Content-Type': 'application/fhir+json' }
	} )
            .then( res => res.json() ).then( json => {
		logger.info('Retrieved Document Reference ID=' + shcid)
		resolve(json)
	    }).catch( err => {
		logger.info('Error retrieving Document Reference ID=' + shcid)
		resolve( {'error': JSON.stringify(err)})
	    })

    })
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
    let pID = uuidv4()
    let iID = uuidv4()
    let qrID = uuidv4()

    let QRContent64 = Buffer.from(JSON.stringify(QResponse.item)).toString('base64')
    let QRContentCBOR = cbor.encode(QResponse.item)
    let QRCBOR45 = base45.encode(QRContentCBOR)
    let canvasElementQR = canvas.createCanvas(400,400);
    const ctxQR = canvasElementQR.getContext('2d')
    let watermark = 'WHO-SVC: ' + qrID

    qrcode.toCanvas( canvasElementQR , QRCBOR45, { errorCorrectionLevel: 'Q' } ).then( canvasElementQR => {
	let xoff = Math.max(0,Math.floor ( (canvasElementQR.width - ctxQR.measureText(watermark).width) / 2))
	ctxQR.fillText(watermark, xoff ,10)
		
	answers['dataURL'] = canvasElementQR.toDataURL()
	let [header,QRImage] = answers['dataURL'].split(',')
		
	let fullDiv = '<div xmlns="http://www.w3.org/1999/xhtml">' + fullTemplate(answers) + '</div>'
	let textDiv = '<div xmlns="http://www.w3.org/1999/xhtml">' + textTemplate(answers) + '</div>'
	let patientDiv = '<div xmlns="http://www.w3.org/1999/xhtml">' + patientTemplate(answers) + '</div>'
	let immunizationDiv = '<div xmlns="http://www.w3.org/1999/xhtml">' + immunizationTemplate(answers) + '</div>'

	logger.info('a0' )
	let options = {width:400,height:400,html:textDiv}
 	let textDivImage =  renderHtmlToImage(options)
     	
	let canvasElement = canvas.createCanvas(
	    options.width + canvasElementQR.width +40 ,
	    Math.max(options.height,canvasElementQR.height))
	const ctx = canvasElement.getContext('2d')
	logger.info('a2')
	ctx.fillStyle = 'white'
	ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
	ctx.drawImage(canvasElementQR,options.width + 20,0)
	logger.info('a3.0' + textDivImage) //why is textDivImage a promise still?

	ctx.drawImage(textDivImage,10,0) 
	logger.info('a4')



	
      let now = new Date().toISOString()
      let addBundle = {
        resourceType: "Bundle",
        type: "transaction",
        entry: [
          {
            fullUrl: "urn:uuid:"+pID,
            resource: {
              resourceType: "Patient",
	      id: pID,
	      text : {
		  div : patientDiv,
		  status : 'generated'
	      },		
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
            fullUrl: "urn:uuid:"+iID,
            resource: {
              resourceType: "Immunization",
              id: iID,
              identifier: [
                {
                  value: "urn:uuid:"+iID
                }
              ],
	      text : {
		  div : immunizationDiv,
		  status : 'generated'
	      },		
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
            fullUrl: "urn:uuid:"+qrID,
            resource: {
              resourceType: "DocumentReference",
	      id: qrID, 
      	      status: "current",
              category: {
                coding: [
                  {
                    system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Category-Usage-CodeSystem",
                    code: "who"
                  }
                ]
              },
              subject: "urn:uuid:"+pID,
	      text : {
		  div : fullDiv,
		  status : 'generated'
	      },
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
	      text : {
		  div : fullDiv,
		  status : 'generated'
	      },
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
              subject: "urn:uuid:"+pID,
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
                      reference: "urn:uuid:"+iID
                    }
                  ]
                },
                {
                  code: {
                    coding: [
                      {
                        system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-SectionCode-CodeSystem",
                        code: "qrdoc"
                      }
                    ]
                  },
                  entry: [
                    {
                      reference: "urn:uuid:"+qrID
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
