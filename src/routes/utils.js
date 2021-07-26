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


function initializeDDCCOptions() {
  let options = {
    resources: {},
    questionnaire : "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire",
    //version : "RC-2-draft",
    responseTypes :  { //this should be sourced from the questionnaire
      "birthDate": "Date",
      "sex": "Coding",
      "vaccine": "Coding",
      "brand": "Coding",
      "manufacturer": "Coding",
      "ma_holder": "Coding",
      "date": "Date",
      "vaccine_valid": "Date",
      "dose": "Integer",
      "total_doses": "Integer",
      "country": "Coding",
      "disease": "Coding",
      "due_date": "Date",
      "valid_from": "Date",
      "valid_until": "Date"
    },
    divs :	{    //divs: mustache template should be defined for each resource in the bundle being sent to the DDCC Service Registey
      Composition : "<h4>DDCC</h4><table><tr><td><ul>    <li>Name: {{responses.name}}</li>    <li>Date of Birth: {{responses.birthDate}}</li>    <li>Vaccine Code: {{responses.vaccinecode.code}} </li>    <li>Expiration Date: {{responses.expiry}}</li>    <li>Health Worker: {{responses.hw}} </li>    <li>Public Health Authority: {{responses.pha}}</li>    <li>DDCC ID: {{responses.hcid}}</li>    <li>Singature: {{responses.signature}}</li>   </ul>  </td><td>   <img alt='DDCC QR Code' src='{{responses.dataURLs.QR}}'/>  </td> </tr></table>",
      DocumentReference : '<h4>DDCC</h4><ul>  <li>Name: {{responses.name}}</li>  <li>Date of Birth: {{responses.birthDate}}</li>  <li>Vaccine Code: {{responses.vaccinecode.code}} </li>  <li>Expiration Date: {{responses.expiry}}</li>  <li>Health Worker: {{responses.hw}} </li>  <li>Public Health Authority: {{responses.pha}}</li>  <li>DDCC ID: {{responses.hcid}}</li>  <li>Singature: {{signatures.QR}}</li> </ul>',
      Patient : '<ul> <li>Name: {{responses.name}}</li> <li>Date of Birth: {{responses.birthDate}}</li> <li>DDCC ID: {{responses.hcid}}</li></ul>',
      Immunization : '<ul>  <li>Vaccine Code: {{responses.vaccinecode.code}} </li>  <li>Expiration Date: {{responses.expiry}}</li>  <li>Health Worker: {{responses.hw}} </li>  <li>Public Health Authority: {{responses.pha}}</li>  <li>DDCC ID: {{responses.hcid}}</li></ul>'
    },
    responses : {},
    ids : {},
    images : {},
    dataURLs : {},	  
    content64 : {},
  }
  options.templates = initializeTemplates(options)
  options.now = new Date().toISOString()

  return options
}

function initializeTemplates(options) {
  let templates = {}
  /* What's this for?  It just gets replaced. 
  for ( let [key,div] of Object.entries(options.divs)) {
    templates[key] = uuidv4()
  }
  */
  for ( let [key,div] of Object.entries(options.divs)) {
    templates[key] = handlebars.compile(div)
  }

  return templates
}

function processDDCCBundle(options) {
  options.ids.QuestionnaireResponse = uuidv4()
  if ( options.resources.Composition 
    && options.resources.Composition.subject 
    && options.resources.Composition.subject.reference
    && options.resources.Composition.subject.reference.startsWith("Patient/")
  ) {
    options.ids.Patient = options.resources.Composition.subject.reference.substring(8)
  } else {
    options.ids.Patient = uuidv4()
  }
  options.ids.Immunization = uuidv4()
  options.ids.ImmunizationRecommendation = uuidv4()
  options.ids.DocumentReference = uuidv4()
  options.ids.Composition = options.responses.hcid
  return {
    resourceType: "Bundle",	
    type: "transaction",
    entry: [
      createRegistrationEntryQuestionnaireResponse(options),
      createRegistrationEntryPatient(options),
      createRegistrationEntryImmunization(options),
      createRegistrationEntryImmunizationRecommendation(options),
      createRegistrationEntryDocumentReferenceQR(options),
      createRegistrationEntryComposition(options)
    ]
  }    
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




function renderHtmlToImage(imgoptions) {
  logger.info('Rendering ' + JSON.stringify(imgoptions))
  return nodeHtmlToImage({
    html:'<html><head><style>' + (imgoptions.css || '') + '</style><style>body{'
    + ' width:' + (imgoptions.width || 400)
    + ' height:' + (imgoptions.height || 400)
    + '}</style></head><body>' + imgoptions.html ,
    puppeteerArgs: {
      headless: true,
      args: [ '--no-sandbox' ]
    }
  })
  /*
    .then( image  => {
  logger('Resolving render')
  resolve( image)
    })    
    */
}

export const buildErrorObject = (
  errorMessage
) => {
  return buildReturnObject( 'Failed', 401, errorMessage )
}

export const retrieveDocumentReference  = (hcid) => {
  logger.info('Retrieving Document Reference ' + hcid)
  logger.info( FHIR_SERVER + 'DocumentReference/' + hcid )
  return new Promise( (resolve) => {
    fetch( FHIR_SERVER + 'DocumentReference/' + hcid , {
      method: 'GET',
      headers: { 'Content-Type': 'application/fhir+json' }
    } )
      .then( res => res.json() ).then( json => {
        logger.info('Retrieved Document Reference ID=' + hcid)
        resolve(json)
      }).catch( err => {
        logger.info('Error retrieving Document Reference ID=' + hcid)
        resolve( {'error': JSON.stringify(err)})
      })

  })
}

const retrieveResource = (id) => {
  return new Promise( (resolve) => {
    fetch( FHIR_SERVER + id, {
      method: 'GET',
      headers: { 'Content-Type': 'application/fhir+json' }
    } )
      .then( res => res.json() ).then( json => {
        resolve(json)
      }).catch( err => {
        logger.info('Error retrieving Resource ID=' + id)
        resolve( {'error': JSON.stringify(err)})
      })

  })
}


function createRegistrationEntry(options,resourceType) {
  return {
    //fullUrl: "urn:uuid:"+options.ids[resourceType],
    resource: {
      resourceType: resourceType,
      id: options.ids[resourceType],
      text: {
        div : options.divs[resourceType] || "",
        status : 'generated'
      },
      date: options.now
    },
    request: {
      method: "PUT",				
      url: resourceType + "/" + options.ids[resourceType]
    }
  }
}

function createRegistrationEntryQuestionnaireResponse(options) {
  let entry = createRegistrationEntry(options,'QuestionnaireResponse')
  entry.resource = options.resources.QuestionnaireResponse
  entry.resource.id = options.ids.QuestionnaireResponse
  entry.resource.subject = { reference: "Patient/"+options.ids.Patient }
  return entry
}

function createRegistrationEntryComposition(options) {
  let entry = createRegistrationEntry(options,'Composition')
  if ( options.resources.Composition ) {
    entry.resource = options.resources.Composition
    entry.resource.date = options.now
    entry.resource.status = "amended"
  } else {
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
            code: "ddcc-vs"
          }
        ]
      }
    ]
    entry.resource.subject = { reference: "Patient/"+options.ids.Patient }
    entry.resource.title =  "International Certificate of Vaccination or Prophylaxis"
    entry.resource.section = []
  }
  // added immunization to entry as well due to bug in HAPI on $document
  entry.resource.event = [
    {
      period: {
        start: options.responses.valid_from,
        end: options.responses.valid_until
      }
    }
  ]
  entry.resource.author =  [
    {
      type: "Organization",
      identifier: { value: options.responses.pha }
    }
  ]
  entry.resource.section.push( 
    {
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "11369-6"
          }
        ]
      },
      author: [
        {
          type: "Organization",
          identifier: { value: options.responses.pha }
        }
      ],
      focus: { reference: "Immunization/"+options.ids.Immunization },
      entry: [
        { reference: "Immunization/"+options.ids.Immunization },
        { reference: "ImmunizationRecommendation/"+options.ids.ImmunizationRecommendation },
        { reference: "DocumentReference/"+options.ids.DocumentReference }
      ]
    }
  )

  return entry

}

function createRegistrationEntryDocumentReferenceQR(options) {
  let entry = createRegistrationEntry(options,'DocumentReference')
  entry.resource.status = "current"
  entry.resource.category = {
    coding: [
      {
        system: "https://WorldHealthOrganization.github.io/ddcc/CodeSystem/DDCC-QR-Category-Usage-CodeSystem",
        code: "who"
      }
    ]
  }
  entry.resource.subject = { reference: "Patient/"+options.ids.Patient }
  entry.resource.content = [
    {
      attachment: {
        contentType: "image/png",
        data: options.images.QR
      },
      format: {
        system: "https://WorldHealthOrganization.github.io/ddcc/CodeSystem/DDCC-QR-Format-CodeSystem",
        code: "image"
      }
    },
    {
      attachment: {
        contentType: "application/json",
        data: options.content64.QR
      },
      format: {
        system: "https://WorldHealthOrganization.github.io/ddcc/CodeSystem/DDCC-QR-Format-CodeSystem",
        code: "serialized"
      }
    },
  ]
  return entry
}

function createRegistrationEntryPatient(options) {
  let entry = createRegistrationEntry(options,'Patient')
  entry.resource.name = [
    {
      text: options.responses.name
    }
  ]
  entry.resource.identifier = [
    {
      value: options.responses.identifier
    }
  ]
  entry.resource.birthDate = options.responses.birthDate
  entry.resource.gender = options.responses.sex
  return entry
}

function createRegistrationEntryImmunization(options) {
  let entry = createRegistrationEntry(options,'Immunization')
  entry.resource.extension = [
    {
      url: "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineBrand",
      valueCoding: options.responses.brand
    },
    {
      url: "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineMarketAuthorization",
      valueCoding: options.responses.ma_holder
    },
    {
      url: "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCCountryOfVaccination",
      valueCoding: options.responses.country
    },
    {
      url: "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineValidFrom",
      valueDateTime: options.responses.vaccine_valid
    }
  ]
  entry.resource.status = "completed"
  entry.resource.vaccineCode = {
    coding: [
      options.responses.vaccine
    ]
  }
  entry.resource.patient = { reference: "Patient/"+options.ids.Patient }
  entry.resource.manufacturer = { identifier: options.responses.manufacturer }
  entry.resource.lotNumber =  options.responses.lot
  entry.resource.occurenceDateTime = options.responses.date
  entry.resource.location = { display: options.responses.centre }
  entry.resource.performer =  {
    actor: {
      type: "Practitioner",
      identifier: {
        value: options.responses.hw
      }
    }
  }
  entry.resource.protocolApplied = [
    {
      authority: {
        type: "Organization",
        identifier: {
          value: options.responses.pha
        }
      },
      targetDisease: [ { coding: [ options.responses.disease ] } ],
      doseNumberPositiveInt: options.responses.dose,
      seriesDosesPositiveInt: options.responses.total_doses
    }
  ]
  return entry
}

function createRegistrationEntryImmunizationRecommendation(options) {
  let entry = createRegistrationEntry(options,'ImmunizationRecommendation')
  entry.resource.patient = { reference: "Patient/"+options.ids.Patient }
  entry.resource.date = options.responses.date

  entry.resource.recommendation = [
    {
      vaccineCode: [ {
        coding: [
          options.responses.vaccine
        ]
      } ],
      targetDisease: { coding: [ options.responses.disease ] },
      forecastStatus: { coding: [ {
        system: "http://terminology.hl7.org/2.1.0/CodeSystem-immunization-recommendation-status.html",
        code: "due"
      } ] 
      },
      dateCriterion: [
        {
          code: {
            coding: [ {
              system: "http://loinc.org",
              code: "30980-7"
            } ]
          },
          value: options.responses.due_date
        }
      ],
      doseNumberPositiveInt: options.responses.dose+1,
      seriesDosesPositiveInt: options.responses.total_doses
    }
  ]
  entry.resource.supportingImmunization = { reference: "Immunization/" + options.ids.Immunization }

  return entry
}





function processAttachments(options) {
  let images = {}
  for (let[key,dataURL] of Object.entries(options.dataURLs)) {
    let [header,image] = dataURL.split(',')
    images[key] = image
  }
  return images
}

function processDivs(options) {
  let divs = {} 
  for (let [key,template] of Object.entries(options.templates )) {
    divs[key] = '<div xmlns="http://www.w3.org/1999/xhtml">'
      + template(options)
      + '</div>'
  }
  return divs
}


function processResponses(QResponse,options) {
  let responses = {}

  for( let item of QResponse.item ) {
    let linkId = item.linkId
    if ( options.responseTypes[linkId] ) {
      responses[linkId] = item.answer[0]["value"+options.responseTypes[linkId]]
    } else {
      responses[linkId] = item.answer[0].valueString
    }
  }
  return responses
}



//one needs to be defined for each questtonnaire handled
let QResponseInitializers = {
  "http://WorldHealthOrganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire":initializeDDCCOptions
}
let QResponseProcessors = {
  "http://WorldHealthOrganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire":processDDCCBundle
}


export const buildHealthCertificate = (
  DDCCParameters
) => {
  return new Promise( async (resolve) => {

    if ( DDCCParameters.resourceType !== "Parameters" || !DDCCParameters.parameter ) {
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
    let parameter = DDCCParameters.parameter.find( param => param.name === "response" )
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


    if ( ! (QResponse.questionnaire in QResponseProcessors)
      || ! (QResponse.questionnaire in QResponseInitializers)) {
      resolve( {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "required",
            diagnostics: "Do not know how to handle " + QResponse.questionnaire  
          }
        ]
      } )
    }

    let options = QResponseInitializers[QResponse.questionnaire]()
    options.resources.QuestionnaireResponse = QResponse
    options.responses = processResponses(QResponse,options)
    let existingComposition = await retrieveResource("Composition/"+options.responses.hcid)
    if ( existingComposition && existingComposition.resourceType === "Composition" ) {
      options.resources.Composition = existingComposition
    }
/* version can be related to the questionnaire so taking this out for now.
    if ( options.responses.version !== options.version ) {
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
    */

    //Need to verify that this is what we want to stringify. (for discussion)
    options.content64['QR'] = Buffer.from(JSON.stringify(QResponse.item)).toString('base64') 

    //in future should have all the QR codes generated (e.g. DGC, ICAO)
    let canvasElementQR = canvas.createCanvas(400,400);
    let QRContentCBOR = cbor.encode(QResponse.item)
    let QRCBOR45 = base45.encode(QRContentCBOR)

    qrcode.toCanvas( canvasElementQR , QRCBOR45, { errorCorrectionLevel: 'Q' } ).then(
      async( canvasElementQR ) => {
        const ctxQR = canvasElementQR.getContext('2d')
        let watermark = 'WHO-DDCC: ' + options.ids.DocumentReference //this is the hcid
        let xoff = Math.max(0,Math.floor ( (canvasElementQR.width - ctxQR.measureText(watermark).width) / 2))
        ctxQR.fillText(watermark, xoff ,10)

        options.dataURLs = {
          'QR' : canvasElementQR.toDataURL()
        }

        options.images = processAttachments(options)
        options.divs = processDivs(options)

        //logger.info('a0' )
        let imgoptions = {width:400,height:400,html:options.divs.DocumentReference}
        let textDivImage =  await renderHtmlToImage(imgoptions)

        //really we should be doing this at the end after we processed all QR codes generated
        //what is getting attached here is the representation of the DDCC
        //from the the QResps and all of QR codes	      
        let canvasElement = canvas.createCanvas(
          options.width + canvasElementQR.width +40 ,
          Math.max(options.height,canvasElementQR.height))
        const ctx = canvasElement.getContext('2d')
        logger.info('a2')
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        ctx.drawImage(canvasElementQR,options.width + 20,0)
        //logger.info('a3.0' + textDivImage) //why is textDivImage a promise still?
        //logger.info('a3 ' + JSON.stringify(textDivImage))

        //ctx.drawImage(canvas.createImageData(new Uint8ClampedArray(textDivImage),imgoptions.width,imgoptions.height),10,0) 
        ctx.putImageData(canvas.createImageData(new Uint8ClampedArray(textDivImage),imgoptions.width,imgoptions.height),10,0) 
        //ctx.putImageData(textDivImage,10,0) 
        logger.info('a4')


        let addBundle = QResponseProcessors[QResponse.questionnaire](options)

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
            fetch( FHIR_SERVER + "Composition/" + options.responses.hcid + "/$document" )
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
