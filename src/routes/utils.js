// @strip-blockc
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

//mustache template should be defined for each resource in the bundle being sent to the SHC Service Registey
let divs = {
    Composition : "<h4>SHC : SVC Covid 19 ({{version}})</h4><table><tr><td><ul>    <li>Name: {{name}}</li>    <li>Date of Birth: {{birthDate}}</li>    <li>Vaccine Code: {{vaccinecode.code}} </li>    <li>Expiration Date: {{expiry}}</li>    <li>Health Worker: {{hw}} </li>    <li>Public Health Authority: {{pha}}</li>    <li>SHF ID: {{paperid}}</li>    <li>Singature: {{signature}}</li>   </ul>  </td><td>   <img alt='SVC QR Code' src='{{dataURL}}'/>  </td> </tr></table>",
    DocumentReference : '<h4>SHC : SVC Covid 19 ({{version}})</h4><ul>  <li>Name: {{name}}</li>  <li>Date of Birth: {{birthDate}}</li>  <li>Vaccine Code: {{vaccinecode.code}} </li>  <li>Expiration Date: {{expiry}}</li>  <li>Health Worker: {{hw}} </li>  <li>Public Health Authority: {{pha}}</li>  <li>SHF ID: {{paperid}}</li>  <li>Singature: {{signature}}</li> </ul>',
    Patient : '<ul> <li>Name: {{name}}</li> <li>Date of Birth: {{birthDate}}</li> <li>SHF ID: {{paperid}}</li></ul>',
    Immunization : '<ul>  <li>Vaccine Code: {{vaccinecode.code}} </li>  <li>Expiration Date: {{expiry}}</li>  <li>Health Worker: {{hw}} </li>  <li>Public Health Authority: {{pha}}</li>  <li>SHF ID: {{paperid}}</li></ul>'
}


let templates = {}
for ( let [key,div] of Object.entries(divs)) {
    templates[key] = handlebars.compile(div)
}
    


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



function createRegistrationBundleEntry(answers,resourceType) {
    return {
	fullUrl: "urn:uuid:"+answers.ids[resourceType],
	resource: {
	    resourceType: resourceType,
	    id: answers.ids[resourceType],
	    text: {
		div : answers.divs[resourceType],
		status : 'generated'
	    },
	    date: answers.now
	},
	request: {
	    method: "PUT",				
	    url: resourceType + "/" + answers.ids[resourceType]
	}
    }
}
    
function createRegistrationBundleCompostion(answers) {
    let entry = createRegistryBundleEntry(answers,'Composition')
    entry.resource.type =  {
	coding: [
	    {
		system: "http://loinc.org",
		code: "82593-5"
	    }
	]
    }
    entry.resource.category =  [
	{
	    coding: [
		{
		    code: "svc-covid19"
		}
	    ]
	}
    ]
    entry.resource.subject =  "urn:uuid:"+answers.ids.Patient
    entry.resource.author =  [
	{
	    type: "Organization",
	    identifier: {
		value: answers.responses.pha
	    }
	}
    ]
    entry.resource.title =  "International Certificate of Vaccination or Prophylaxis"
    entry.resource.section =  [
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
		    reference: "urn:uuid:"+answers.ids.Immunization
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
		    reference: "urn:uuid:"+answers.ids.DocumentReference
		}
	    ]
	}
    ]
    return entry

}

function createRegistrationBundleDocumentReference(answers) {
    let entry = createRegistryBundleEntry(answers,'DocumentReference')
    entry.resource.status = "current"
    entry.resource.category = {
	coding: [
	    {
		system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Category-Usage-CodeSystem",
		code: "who"
	    }
	]
    }
    entry.resource.subject =  "urn:uuid:"+answers.ids.Patient
    entry.resource.content = [
	{
	    attachment: {
		contentType: "image/png",
		data: answers.images.QR
	    },
	    format: {
		system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Format-CodeSystem",
		code: "image"
	    }
	},
	{
	    attachment: {
		contentType: "application/json",
		data: answers.content64.QR
	    },
	    format: {
		system: "https://who-int.github.io/svc/refs/heads/rc2/CodeSystem/SHC-QR-Format-CodeSystem",
		code: "serialized"
	    }
	},
    ]
    return entry
}

function createRegistrationBundlePatient(answers) {
    let entry = createRegistryBundleEntry(answers,'Patient')
    entry.resource.name = [
	{
	    text: answers.responses.name
	}
    ]
    entry.resource.birthDate =answers.responses.birthDate
    return entry
}

function createRegistrationBundleImmunization(answers) {
    let entry = createRegistryBundleEntry(answers,'Immunization')
    entry.resource.status = "completed"
    entry.resource.vaccineCode = {
	coding: [
	    answers.responses.vaccinecode
	]
    },
    entry.resource.lotNumber =  answers.responses.lot
    entry.resource.expirationDate = answers.responses.expiry
    entry.resource.performer =  {
	actor: {
	    type: "Practitioner",
	    identifier: {
		value: answers.responses.hw
	    }
	}
    },
    entry.resource.protocolApplied = [
	{
	    authority: {
		type: "Organization",
		identifier: {
		    value: answers.responses.pha
		}
	    },
	    doseNumberPositiveInt: 1
	}
    ]
}

function createRegistrationBundle(answers) {
    return {
	resourceType: "Bundle",	
	type: "transaction",
	entry: [
	    createRegistrationBundlePatient(),
	    createRegistrationBundleImmunization(),
	    createRegistrationBundleDocumentReference(),
	    createRegistrationBundleComposition()
	    ]
    }
}



function generateWHOQR(canvasElement,answers) {
    const ctx = canvasElement.getContext('2d')
    let watermark = 'WHO-SVC: ' + answers.ids.DocumentRefence
    let xoff = Math.max(0,Math.floor ( (canvasElement.width - ctx.measureText(watermark).width) / 2))
    ctx.fillText(watermark, xoff ,10)
}


function processAttachments(answers) {
    let images = {}
    for (let[key,dataURL] of Object.entries(answers.dataURLs)) {
	let [header,image] = dataURL.split(',')
	images[key] = image
    }
    return images
}

function processDivs(answers) {
    let divs = {} 
    for (let [key,template] of Object.entries(templates )) {
	divs[key] = '<div xmlns="http://www.w3.org/1999/xhtml">'
	    + template(answers)
	    + '</div>'
    }
    return divs
}


function processResponses(QResponse) {
    let responses = {}
    let otherTypes = {
	"birthDate": "Date",
	"vaccinecode": "Coding",
	"expiry": "Date"
    }

    for( let item of QResponse.item ) {
	let linkId = item.linkId
	if ( otherTypes[linkId] ) {
	    responses[linkId] = item.answer[0]["value"+otherTypes[linkId]]
	} else {
            responses[linkId] = item.answer[0].valueString
	}
    }
    return responses
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

      let answers = { 	  			  
	  responses : {},
	  ids : {},
	  divs : {},
	  images : {},
	  dataURLs : {},	  
	  content64 : {},
	  now : new Date().toISOString()
      }


      answers.responses = processResponses(QResponse)

      if ( answers.responses.version !== "RC-2-draft" ) {
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

      //needs to be sorted
      answers.ids.Patient = uuidv4()
      answers.ids.Immunization = uuidv4()
      answers.ids.DocumentReference = uuidv4()
      answers.ids.Compostion = null // we retrieve it at the end 


      //Need to verify that this is what we want to stringify. (for discussion)
      answers.content64['QR'] = Buffer.from(JSON.stringify(QResponse.item)).toString('base64') 

      let canvasElementQR = canvas.createCanvas(400,400);
      let QRContentCBOR = cbor.encode(QResponse.item)
      let QRCBOR45 = base45.encode(QRContentCBOR)

      
      qrcode.toCanvas( canvasElementQR , QRCBOR45, { errorCorrectionLevel: 'Q' } ).then(
	  canvasElementQR => {

	      //in future should have all the QR codes generated (e.g. DGC, ICAO)
	      //would need to 
	      answers.dataURLs = {
		  'QR' : canvasElementQR.toDataURL()
	      }
	      
	      answers.images = processAttachments(answers)
	      answers.divs = processDivs(answers) 	     
	      
	      logger.info('a0' )
	      let options = {width:400,height:400,html:answers.divs.text}
 	      let textDivImage =  renderHtmlToImage(options)

	      //really we should be doing this at the end after we processed all QR codes generated
	      //what is getting attached here is the representation of the SHC
	      //from the the QResps and all of QR codes	      
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


	      let addBundle = createRegistrationBundle(answers)


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
		      fetch( FHIR_SERVER + "Composition/" + answers.responses.paperid + "/$document" )
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
