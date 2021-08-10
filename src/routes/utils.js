// @strip-block
"use strict"
const canvas = require("canvas")
const handlebars = require("handlebars")
const nodeHtmlToImage = require("node-html-to-image")
const { v4: uuidv4 } = require("uuid")
const cbor = require("cbor")
const cose = require("cose-js")
const base45 = require("base45")
const qrcode = require("qrcode")
const fetch = require("node-fetch")
const fs = require("fs")
const zlib = require("zlib")
const crypto = require("crypto")

const FOLDER_IDENTIFIER_SYSTEM = "http://worldhealthorganization.github.io/ddcc/Folder"
const SUBMISSIONSET_IDENTIFIER_SYSTEM = "http://worldhealthorganization.github.io/ddcc/SubmissionSet"

import { createDDCC, createQRPDF } from "./createPDF"
import logger from "../logger"
import { FHIR_SERVER, DHS_FHIR_SERVER, DHS_QUERY } from "../config/config"
import { doc } from "prettier"

let urn

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048
})

function initializeDDCCOptions() {
  let options = {
    resources: {},
    questionnaire: "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire",
    //version : "RC-2-draft",
    responseTypes: {
      //this should be sourced from the questionnaire
      birthDate: "Date",
      sex: "Coding",
      vaccine: "Coding",
      brand: "Coding",
      manufacturer: "Coding",
      ma_holder: "Coding",
      date: "Date",
      vaccine_valid: "Date",
      dose: "Integer",
      total_doses: "Integer",
      country: "Coding",
      disease: "Coding",
      due_date: "Date",
      valid_from: "Date",
      valid_until: "Date"
    },
    divs: {
      //divs: mustache template should be defined for each resource in the bundle being sent to the DDCC Service Registey
      Composition:
        "<h4>DDCC</h4><table><tr><td><ul>    <li>Name: {{responses.name}}</li>    <li>Date of Birth: {{responses.birthDate}}</li>    <li>Vaccine Code: {{responses.vaccinecode.code}} </li>    <li>Expiration Date: {{responses.expiry}}</li>    <li>Health Worker: {{responses.hw}} </li>    <li>Public Health Authority: {{responses.pha}}</li>    <li>DDCC ID: {{responses.hcid}}</li>    <li>Singature: {{responses.signature}}</li>   </ul>  </td><td>   <img alt='DDCC QR Code' src='{{responses.dataURLs.QR}}'/>  </td> </tr></table>",
      DocumentReference:
        "<h4>DDCC</h4><ul>  <li>Name: {{responses.name}}</li>  <li>Date of Birth: {{responses.birthDate}}</li>  <li>Vaccine Code: {{responses.vaccinecode.code}} </li>  <li>Expiration Date: {{responses.expiry}}</li>  <li>Health Worker: {{responses.hw}} </li>  <li>Public Health Authority: {{responses.pha}}</li>  <li>DDCC ID: {{responses.hcid}}</li>  <li>Singature: {{signatures.QR}}</li> </ul>",
      Patient:
        "<ul> <li>Name: {{responses.name}}</li> <li>Date of Birth: {{responses.birthDate}}</li> <li>DDCC ID: {{responses.hcid}}</li></ul>",
      Immunization:
        "<ul>  <li>Vaccine Code: {{responses.vaccinecode.code}} </li>  <li>Expiration Date: {{responses.expiry}}</li>  <li>Health Worker: {{responses.hw}} </li>  <li>Public Health Authority: {{responses.pha}}</li>  <li>DDCC ID: {{responses.hcid}}</li></ul>"
    },
    responses: {},
    ids: {},
    images: {},
    pdfs: {},
    dataURLs: {},
    content64: {}
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
  for (let [key, div] of Object.entries(options.divs)) {
    templates[key] = handlebars.compile(div)
  }

  return templates
}

function processDDCCBundle(options) {
  options.ids.QuestionnaireResponse = uuidv4()
  if (
    options.resources.List &&
    options.resources.List.subject &&
    options.resources.List.subject.reference &&
    options.resources.List.subject.reference.startsWith("Patient/")
  ) {
    options.ids.Patient = options.resources.List.subject.reference.substring(8)
  } else {
    options.ids.Patient = uuidv4()
  }
  options.ids.Immunization = uuidv4()
  options.ids.ImmunizationRecommendation = uuidv4()
  //options.ids.DocumentReference = uuidv4()
  //options.ids.Composition = uuidv4()
  //options.ids.Composition = options.responses.hcid
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      createRegistrationEntryQuestionnaireResponse(options),
      createRegistrationEntryPatient(options),
      createRegistrationEntryImmunization(options),
      createRegistrationEntryImmunizationRecommendation(options)
      //createRegistrationEntryDocumentReferenceQR(options),
      //createRegistrationEntryComposition(options)
    ]
  }
}

function processDDCCDocDetails(options) {
  options.ids.DocumentReference = uuidv4()
  options.ids.Composition = uuidv4()
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [createRegistrationEntryDocumentReferenceQR(options), createRegistrationEntryComposition(options)]
  }
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
  /* openhim:start */
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
  /* openhim:end */
  return response
}

function renderHtmlToImage(imgoptions) {
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
  /*
    .then( image  => {
  logger('Resolving render')
  resolve( image)
    })    
    */
}

export const buildErrorObject = (errorMessage) => {
  return buildReturnObject("Failed", 401, errorMessage)
}

export const retrieveDocumentReference = (hcid) => {
  logger.info("Retrieving Document Reference " + hcid)
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
}

const retrieveResource = (id, server) => {
  if (!server) server = FHIR_SERVER
  return new Promise((resolve) => {
    fetch(server + id, {
      method: "GET",
      headers: { "Content-Type": "application/fhir+json" }
    })
      .then((res) => res.json())
      .then((json) => {
        resolve(json)
      })
      .catch((err) => {
        logger.info("Error retrieving Resource ID=" + id)
        resolve({ error: JSON.stringify(err) })
      })
  })
}

function createRegistrationEntry(options, resourceType) {
  return {
    //fullUrl: "urn:uuid:"+options.ids[resourceType],
    resource: {
      resourceType: resourceType,
      id: options.ids[resourceType],
      text: {
        div: options.divs[resourceType] || "",
        status: "generated"
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
  let entry = createRegistrationEntry(options, "QuestionnaireResponse")
  entry.resource = options.resources.QuestionnaireResponse
  //entry.resource.id = options.ids.QuestionnaireResponse
  entry.resource.subject = { reference: "Patient/" + options.ids.Patient }
  return entry
}

function createRegistrationEntryComposition(options) {
  let entry = createRegistrationEntry(options, "Composition")
  /*
  if ( options.resources.Composition ) {
    entry.resource = options.resources.Composition
    entry.resource.date = options.now
    entry.resource.status = "amended"
  } else {
  */
  entry.resource.type = {
    coding: [
      {
        system: "http://loinc.org",
        code: "82593-5"
      }
    ]
  }
  entry.resource.category = [
    {
      coding: [
        {
          code: "ddcc-vs"
        }
      ]
    }
  ]
  entry.resource.subject = { reference: "Patient/" + options.ids.Patient }
  entry.resource.title = "International Certificate of Vaccination or Prophylaxis"
  entry.resource.section = []
  //}
  // added immunization to entry as well due to bug in HAPI on $document
  entry.resource.event = [
    {
      period: {
        start: options.responses.valid_from,
        end: options.responses.valid_until
      }
    }
  ]
  entry.resource.author = [
    {
      type: "Organization",
      identifier: { value: options.responses.pha }
    }
  ]
  entry.resource.section.push({
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
    focus: { reference: "Immunization/" + options.ids.Immunization },
    entry: [
      { reference: "Immunization/" + options.ids.Immunization },
      {
        reference: "ImmunizationRecommendation/" + options.ids.ImmunizationRecommendation
      },
      { reference: "DocumentReference/" + options.ids.DocumentReference }
    ]
  })

  return entry
}

function createRegistrationEntryDocumentReferenceQR(options) {
  let entry = createRegistrationEntry(options, "DocumentReference")
  entry.resource.status = "current"
  entry.resource.category = {
    coding: [
      {
        system: "https://WorldHealthOrganization.github.io/ddcc/CodeSystem/DDCC-QR-Category-Usage-CodeSystem",
        code: "who"
      }
    ]
  }
  entry.resource.subject = { reference: "Patient/" + options.ids.Patient }
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
    {
      attachment: {
        contentType: "application/pdf",
        data: options.pdfs.QR
      },
      format: {
        system: "https://WorldHealthOrganization.github.io/ddcc/CodeSystem/DDCC-QR-Format-CodeSystem",
        code: "pdf"
      }
    }
  ]
  return entry
}

function createRegistrationEntryPatient(options) {
  let entry = createRegistrationEntry(options, "Patient")
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
  let entry = createRegistrationEntry(options, "Immunization")
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
    coding: [options.responses.vaccine]
  }
  entry.resource.patient = { reference: "Patient/" + options.ids.Patient }
  entry.resource.manufacturer = { identifier: options.responses.manufacturer }
  entry.resource.lotNumber = options.responses.lot
  entry.resource.occurrenceDateTime = options.responses.date
  entry.resource.location = { display: options.responses.centre }
  entry.resource.performer = {
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
      targetDisease: [{ coding: [options.responses.disease] }],
      doseNumberPositiveInt: options.responses.dose,
      seriesDosesPositiveInt: options.responses.total_doses
    }
  ]
  return entry
}

function createRegistrationEntryImmunizationRecommendation(options) {
  let entry = createRegistrationEntry(options, "ImmunizationRecommendation")
  entry.resource.patient = { reference: "Patient/" + options.ids.Patient }
  entry.resource.date = options.responses.date

  entry.resource.recommendation = [
    {
      vaccineCode: [
        {
          coding: [options.responses.vaccine]
        }
      ],
      targetDisease: { coding: [options.responses.disease] },
      forecastStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/2.1.0/CodeSystem-immunization-recommendation-status.html",
            code: "due"
          }
        ]
      },
      dateCriterion: [
        {
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "30980-7"
              }
            ]
          },
          value: options.responses.due_date
        }
      ],
      doseNumberPositiveInt: options.responses.dose + 1,
      seriesDosesPositiveInt: options.responses.total_doses
    }
  ]
  entry.resource.supportingImmunization = {
    reference: "Immunization/" + options.ids.Immunization
  }

  return entry
}

function processAttachments(options) {
  let images = {}
  for (let [key, dataURL] of Object.entries(options.dataURLs)) {
    let [header, image] = dataURL.split(",")
    images[key] = image
  }
  return images
}

function processDivs(options) {
  let divs = {}
  for (let [key, template] of Object.entries(options.templates)) {
    divs[key] = '<div xmlns="http://www.w3.org/1999/xhtml">' + template(options) + "</div>"
  }
  return divs
}

function processResponses(QResponse, options) {
  let responses = {}

  for (let item of QResponse.item) {
    let linkId = item.linkId
    if (options.responseTypes[linkId]) {
      responses[linkId] = item.answer[0]["value" + options.responseTypes[linkId]]
    } else {
      responses[linkId] = item.answer[0].valueString
    }
  }
  return responses
}

function reverseResponses(immunization, patient, recommendation, hcid) {
  let responses = {}
  try {
    responses.name = patient.name[0].text
  } catch (err) {}
  responses.birthDate = patient.birthDate
  try {
    responses.identifier = patient.identifier[0].value
  } catch (err) {}
  responses.sex = patient.gender
  try {
    responses.vaccine = immunization.vaccineCode.coding[0]
  } catch (err) {}
  try {
    responses.brand = immunization.extension.find(
      (ext) => ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineBrand"
    ).valueCoding
  } catch (err) {}
  try {
    responses.manufacturer = immunization.manufacturer.identifier
  } catch (err) {}
  try {
    responses.ma_holder = immunization.extension.find(
      (ext) =>
        ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineMarketAuthorization"
    ).valueCoding
  } catch (err) {}
  responses.lot = immunization.lotNumber
  responses.date = immunization.occurrenceDateTime
  try {
    responses.vaccine_valid = immunization.extension.find(
      (ext) => ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineValidFrom"
    ).valueDateTime
  } catch (err) {}
  try {
    responses.dose = immunization.protocolApplied[0].doseNumberPositiveInt
  } catch (err) {}
  try {
    responses.total_doses = immunization.protocolApplied[0].seriesDosesPositiveInt
  } catch (err) {}
  try {
    responses.country = immunization.extension.find(
      (ext) => ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCCountryOfVaccination"
    ).valueCoding
  } catch (err) {}
  try {
    responses.centre = immunization.location.display
  } catch (err) {}
  try {
    responses.hw = immunization.performer.actor.identifier.value
  } catch (err) {}
  try {
    responses.disease = immunization.protocolApplied[0].targetDisease[0].coding[0]
  } catch (err) {}
  try {
    responses.due_date = recommendation.recommendation[0].dateCriterion[0].value
  } catch (err) {}
  try {
    responses.pha = immunization.protocolApplied[0].authority.identifier.value
  } catch (err) {}
  responses.hcid = hcid
  /*
   * Not sure where to pull this from when pulled from resources
  responses.valid_from = ""
  responses.valid_to = ""
  */
  return responses
}

function addQResponseItem(linkId, answerType, answer) {
  return {
    linkId: linkId,
    answer: [
      {
        ["value" + answerType]: answer
      }
    ]
  }
}

function reverseQuestionnaireResponse(questionnaireUrl, immunization, patient, recommendation, hcid) {
  let response = {
    resourceType: "QuestionnaireResponse",
    questionnaire: questionnaireUrl,
    status: "completed",
    authored: new Date().toISOString(),
    item: []
  }
  try {
    response.item.push(
      addQResponseItem(
        "name",
        "String",
        patient.name[0].text || patient.name[0].given.join(" ") + " " + patient.name[0].family
      )
    )
  } catch (err) {}
  response.item.push(addQResponseItem("birthDate", "Date", patient.birthDate))
  try {
    response.item.push(addQResponseItem("identifier", "String", patient.identifier[0].value))
  } catch (err) {}
  response.item.push(
    addQResponseItem("sex", "Coding", { code: patient.gender, system: "http://hl7.org/fhir/administrative-gender" })
  )
  try {
    response.item.push(addQResponseItem("vaccine", "Coding", immunization.vaccineCode.coding[0]))
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem(
        "brand",
        "Coding",
        immunization.extension.find(
          (ext) => ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineBrand"
        ).valueCoding
      )
    )
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem(
        "manufacturer",
        "Coding",
        immunization.manufacturer.identifier || immunization.manufacturer.reference
      )
    )
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem(
        "ma_holder",
        "Coding",
        immunization.extension.find(
          (ext) =>
            ext.url ===
            "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineMarketAuthorization"
        ).valueCoding
      )
    )
  } catch (err) {}
  response.item.push(addQResponseItem("lot", "String", immunization.lotNumber))
  response.item.push(addQResponseItem("date", "Date", immunization.occurrenceDateTime))
  try {
    response.item.push(
      addQResponseItem(
        "vaccine_valid",
        "Date",
        immunization.extension.find(
          (ext) => ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCVaccineValidFrom"
        ).valueDateTime
      )
    )
  } catch (err) {}
  try {
    response.item.push(addQResponseItem("dose", "Integer", immunization.protocolApplied[0].doseNumberPositiveInt))
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem("total_doses", "Integer", immunization.protocolApplied[0].seriesDosesPositiveInt)
    )
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem(
        "country",
        "Coding",
        immunization.extension.find(
          (ext) =>
            ext.url === "https://WorldHealthOrganization.github.io/ddcc/StructureDefinition/DDCCCountryOfVaccination"
        ).valueCoding
      )
    )
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem("centre", "String", immunization.location.display || immunization.location.reference)
    )
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem(
        "hw",
        "String",
        immunization.performer.actor.reference || immunization.performer.actor.identifier.value
      )
    )
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem("disease", "Coding", immunization.protocolApplied[0].targetDisease[0].coding[0])
    )
  } catch (err) {}
  try {
    response.item.push(addQResponseItem("due_date", "Date", recommendation.recommendation[0].dateCriterion[0].value))
  } catch (err) {}
  try {
    response.item.push(
      addQResponseItem(
        "pha",
        "String",
        immunization.protocolApplied[0].authority.reference ||
          immunization.protocolApplied[0].authority.identifier.value
      )
    )
  } catch (err) {}
  response.item.push(addQResponseItem("hcid", "String", hcid))
  /*
   * Not sure where to pull this from when pulled from resources
  responses.valid_from = ""
  responses.valid_to = ""
  */
  return response
}

//one needs to be defined for each questtonnaire handled
let QResponseInitializers = {
  "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire": initializeDDCCOptions
}
let QResponseProcessors = {
  "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire": processDDCCBundle
}

function putPDBEntry(resource) {
  return {
    resource,
    request: {
      method: "PUT",
      url: resource.resourceType + "/" + resource.id
    }
  }
}
function postPDBEntry(resourceType, tempId) {
  return {
    fullUrl: "urn:uuid:" + tempId,
    resource: {
      resourceType: resourceType
    },
    request: {
      method: "POST",
      url: resourceType
    }
  }
}

function createPDBSubmissionSet(options, folderId, docRefId, binaryRefId) {
  let entry = postPDBEntry("List", uuidv4())
  entry.resource.identifier = [
    {
      use: "usual",
      system: SUBMISSIONSET_IDENTIFIER_SYSTEM,
      value: entry.resource.id
    }
  ]
  entry.resource.subject = {
    reference: "Patient/" + options.resources.Patient.id
  }
  entry.resource.status = "current"
  entry.resource.mode = "working"
  entry.resource.code = {
    coding: [
      {
        system: "http://profiles.ihe.net/ITI/MHD/CodeSystem/MHDlistTypes",
        code: "submissionset"
      }
    ]
  }
  entry.resource.date = options.now
  entry.resource.entry = [
    {
      item: { reference: "urn:uuid:" + docRefId }
    },
    {
      item: { reference: "urn:uuid:" + binaryRefId }
    },
    {
      item: { reference: "List/" + folderId }
    }
  ]
  return entry
}

function createPDBBinaryReference(options, binaryRefId, binaryId) {
  let entry = postPDBEntry("DocumentReference", binaryRefId)
  entry.resource.status = "current"
  entry.resource.subject = {
    reference: "Patient/" + options.resources.Patient.id
  }
  entry.resource.date = options.now
  entry.resource.content = [
    {
      attachment: {
        contentType: "application/pdf",
        url: "urn:uuid:" + binaryId
      }
    }
  ]
  return entry
}

function createPDBPDF(options) {
  // This still needs to process options.resources.List to look for previous DocRefs it can retrieve
  let details = {
    hcid: options.responses.hcid,
    name: options.responses.name,
    site: options.responses.centre,
    id: options.responses.identifier,
    sex: options.responses.gender,
    birthDate: options.responses.birthDate
  }
  let dose = {
    date: options.responses.date,
    lot: options.responses.lot,
    vaccine: options.responses.vaccine.display || options.responses.vaccine.code,
    hw: options.responses.hw,
    qr: options.images.QR
  }
  if (options.responses.dose === 1) {
    details.dose1 = dose
    if (details.total_doses > 1) {
      details.dose1.second = true
    } else {
      details.dose1.second = false
    }
    if (options.responses.due_date) {
      details.dose1.date_due = options.responses.due_date
    }
  } else if (options.responses.dose === 2) {
    details.dose2 = dose
  }
  return createDDCC(details)
}

function createPDBBinary(options, binaryId) {
  let entry = postPDBEntry("Binary", binaryId)

  entry.resource.contentType = "application/pdf"
  entry.resource.data = options.pdfs.DDCC
  return entry
}
function createPDBDocumentReference(options, docRefId, docId) {
  let entry = postPDBEntry("DocumentReference", docRefId)
  entry.resource.status = "current"
  entry.resource.subject = {
    reference: "Patient/" + options.resources.Patient.id
  }
  entry.resource.date = options.now
  entry.resource.content = [
    {
      attachment: {
        contentType: "application/fhir",
        url: FHIR_SERVER + "Bundle/" + docId
      }
    }
  ]
  return entry
}

function createPDBFolder(options, folderId, docRefId, binaryRefId) {
  let entry
  if (options.resources.List) {
    entry = putPDBEntry(options.resources.List)
    entry.resource.date = options.now
  } else {
    let resource = {
      resourceType: "List",
      id: folderId,
      extension: [
        {
          url: "http://profiles.ihe.net/ITI/MHD/StructureDefinition/ihe-designationType",
          valueCodeableConcept: {
            coding: [
              {
                system: "http://worldhealthorganization.github.io/ddcc/CodeSystem/DDCC-Folder-DesignationType",
                code: "ddcc"
              }
            ]
          }
        }
      ],
      identifier: [
        {
          use: "usual",
          system: FOLDER_IDENTIFIER_SYSTEM,
          value: options.responses.hcid
        },
        {
          use: "official",
          system: FOLDER_IDENTIFIER_SYSTEM,
          value: options.responses.hcid
        }
      ],
      status: "current",
      mode: "working",
      code: {
        coding: [
          {
            system: "http://profiles.ihe.net/ITI/MHD/CodeSystem/MHDlistTypes",
            code: "folder"
          }
        ]
      },
      subject: { reference: "Patient/" + options.resources.Patient.id },
      date: options.now,
      entry: []
    }
    entry = putPDBEntry(resource)
  }
  entry.resource.entry.push({
    item: { reference: "urn:uuid:" + docRefId }
  })
  entry.resource.entry.push({
    item: { reference: "urn:uuid:" + binaryRefId }
  })
  return entry
}

function createProvideDocumentBundle(doc, options, DHSUpdate) {
  let docRefId = uuidv4()
  let binaryRefId = uuidv4()
  let binaryId = uuidv4()
  let folderId
  if ( options.resources.List ) {
    folderId = options.resources.List.id
  } else {
    folderId = uuidv4()
  }
  createPDBPDF(options).then((pdf) => {
    options.pdfs.DDCC = Buffer.from(pdf).toString('base64')


    let PDBBinary = createPDBBinary(options, binaryId)
    let PDBBinaryReference = createPDBBinaryReference(options, binaryRefId, binaryId)


    let provideDocumentBundle = {
      resourceType: "Bundle",
      type: "transaction",
      entry: [
        createPDBSubmissionSet(options, folderId, docRefId, binaryRefId),
        createPDBDocumentReference(options, docRefId, doc.id),
        PDBBinary,
        PDBBinaryReference,
        createPDBFolder(options, folderId, docRefId, binaryRefId),
        putPDBEntry(options.resources.Patient)
      ]
    }

    // Should change this to the a different config in case the registry is somewhere else.
    fetch(FHIR_SERVER, {
      method: "POST",
      body: JSON.stringify(provideDocumentBundle),
      headers: { "Content-Type": "application/fhir+json" }
    })
      .then((res) => res.json())
      .then((json) => {
        logger.info("Saved provideDocumentBundle.")
      })
      .catch((err) => {
        logger.error(err.message)
      })

    if ( DHSUpdate ) {
      let DHSBundle = {
        resourceType: "Bundle",
        type: "transaction",
        entry: [
          PDBBinary,
          PDBBinaryReference
        ]
      }
      fetch( DHSUpdate, {
        method: "POST",
        body: JSON.stringify(DHSBUndle),
        headers: { "Content-Type": "application/fhir+json" }
      })
        .then((res) => res.json())
        .then((json) => {
          logger.info("Saved Binary to DHS Server.")
        })
        .catch((err) => {
          logger.error(err.message)
        })
    }
  })
}

export const buildHealthCertificate = (DDCCParameters, DHSUpdate) => {
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
      let immunizationParam = DDCCParameters.parameter.find((param) => param.name === "immunization")
      let hcidParam = DDCCParameters.parameter.find((param) => param.name === "hcid")
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
      } else if (
        immunizationParam &&
        immunizationParam.valueReference &&
        immunization.valueReference.reference &&
        hcidParam &&
        hcidParam.valueString
      ) {
        QResponse = false
        let immunization = await retrieveResource(immunizationParam.valueReference.reference)
        let addPatient = await retrieveResource(imm.patient.reference)
        let recommendation = await retrieveResource(
          "ImmunizationRecommendation?support=" + immunizationParam.valueReference.reference
        )
        if (recommendation && recommendation.entry && recommendation.entry.length > 0) {
          recommendation = recommendation.entry[0].resource
        }
        // NEED A BETTER WAY TO DO THIS
        let options = initializeDDCCOptions()
        options.responses = reverseResponses(immunization, addPatient, recommendation, hcidParam.valueString)
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

    if (QResponse !== false) {
      if (!(QResponse.questionnaire in QResponseProcessors) || !(QResponse.questionnaire in QResponseInitializers)) {
        resolve({
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
      options.responses = processResponses(QResponse, options)
    }

    compileHealthCertificate(options, QResponse, DHSUpdate).then((results) => {
      resolve(results)
    })
  })
}

function compileHealthCertificate(options, QResponse, DHSUpdate) {
  return new Promise(async (resolve) => {
    let existingFolder = await retrieveResource(
      "List?identifier=" + FOLDER_IDENTIFIER_SYSTEM + "|" + options.responses.hcid
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

    //Need to verify that this is what we want to stringify. (for discussion)
    options.content64["QR"] = Buffer.from(JSON.stringify(options.responses)).toString("base64")

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

    qrcode
      .toCanvas(canvasElementQR, QRCOSE45, { errorCorrectionLevel: "Q" })
      .then(async (canvasElementQR) => {
        const ctxQR = canvasElementQR.getContext("2d")
        let watermark = "WHO-DDCC: " + options.responses.hcid //this is the hcid
        let xoff = Math.max(0, Math.floor((canvasElementQR.width - ctxQR.measureText(watermark).width) / 2))
        ctxQR.fillText(watermark, xoff, 10)

        options.dataURLs = {
          QR: canvasElementQR.toDataURL()
        }

        options.images = processAttachments(options)
        options.divs = processDivs(options)
        for (let idx in options.images) {
          let pdf = await createQRPDF(options.images[idx])
          options.pdfs[idx] = Buffer.from(pdf).toString("base64")
        }

        //logger.info('a0' )
        let imgoptions = {
          width: 400,
          height: 400,
          html: options.divs.DocumentReference
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

        if (QResponse !== false) {
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
                  who: { identifier: { value: options.responses.hcid } },
                  data: sign.toString("base64")
                }

                fetch(FHIR_SERVER + "Bundle/" + docId, {
                  method: "PUT",
                  body: JSON.stringify(doc),
                  headers: { "Content-Type": "application/fhir+json" }
                })
                  .then((res) => res.json())
                  .then((docAdded) => {
                    createProvideDocumentBundle(doc, options, DHSUpdate)

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
  })
}

var checkDHSTime = new Date()
var pingDHSFailures = 0
var checkDHSTimer
const DHS_INITIAL_DELAY = 1000
const DHS_INTERVAL = 10000

export const checkDHS = () => {
  if (DHS_FHIR_SERVER) {
    clearTimeout(checkDHSTimer)
    checkDHSTimer = setTimeout(pingDHS, DHS_INITIAL_DELAY)
  } else {
    logger.info("NO DHS", DHS_FHIR_SERVER)
  }
}

function pingDHS() {
  logger.info("Checking DHS server " + DHS_FHIR_SERVER + " " + checkDHSTime.toISOString())
  fetch(DHS_FHIR_SERVER + DHS_QUERY + checkDHSTime.toISOString(), {
    method: "GET",
    headers: { "Content-Type": "application/fhir+json" }
  })
    .then((res) => res.json())
    .then(async (json) => {
      pingDHSFailures = 0
      if (json.resourceType !== "Bundle") {
        logger.info("Failed to get DHS Query " + JSON.stringify(json))
      } else {
        checkDHSTime = new Date(json.meta.lastUpdated)
        if (json.total > 0 && json.entry && json.entry.length > 0) {
          for (let entry of json.entry) {
            let immunization = entry.resource
            let addPatient = await retrieveResource(immunization.patient.reference, DHS_FHIR_SERVER)
            let recommendation = await retrieveResource(
              "ImmunizationRecommendation?support=" + immunization.id,
              DHS_FHIR_SERVER
            )
            if (recommendation && recommendation.entry && recommendation.entry.length > 0) {
              recommendation = recommendation.entry[0].resource
            }

            let hcid
            try {
              hcid = addPatient.identifier[0].value
            } catch (err) {
              hcid = uuidv4()
            }
            let QResponse = reverseQuestionnaireResponse(
              "http://worldhealthorganization.github.io/ddcc/DDCCVSCoreDataSetQuestionnaire",
              immunization,
              addPatient,
              recommendation,
              hcid
            )
            // NEED A BETTER WAY TO DO THIS
            //let options = initializeDDCCOptions()
            //options.responses = reverseResponses(immunization, addPatient, recommendation, addPatient.identifier[0].value )
            buildHealthCertificate(QResponse, DHS_FHIR_SERVER).then((results) => {
              if (results.resourceType === "Bundle" && results.type === "document") {
                fetch(DHS_FHIR_SERVER + "Bundle/" + results.id, {
                  method: "PUT",
                  body: JSON.stringify(results),
                  headers: { "Content-Type": "application/fhir+json" }
                })
                  .then((res) => res.json())
                  .then((saveOutput) => {
                    logger.info("Saved document to DHS server " + results.id)
                  })
                  .catch((err) => {
                    logger.info("Failed to save document to DHS server " + JSON.stringify(err))
                  })
              }
            })
          }
        }
        checkDHSTimer = setTimeout(pingDHS, DHS_INTERVAL)
      }
    })
    .catch((err) => {
      pingDHSFailures++
      logger.info(err.message)
      logger.info("FAILED to retrieve DHS Query " + pingDHSFailures)
      if (pingDHSFailures > 10) {
        logger.info("Too many DHS failures in a row so stopping.")
      } else {
        checkDHSTimer = setTimeout(pingDHS, DHS_INTERVAL)
      }
    })
}
