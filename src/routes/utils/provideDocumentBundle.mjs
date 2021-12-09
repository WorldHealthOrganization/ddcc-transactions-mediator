import { v4 as uuidv4 } from "uuid"
import fetch from "node-fetch"
import logger from "../../logger"
import { FHIR_SERVER, SUBMISSIONSET_IDENTIFIER_SYSTEM, FOLDER_IDENTIFIER_SYSTEM } from "../../config/config"
import { retrieveResource } from "./index"
import { createDDCC } from "./pdf"
//import { reverseResponses } from "./responses"
import { convertBundleToCoreDataSet } from "./logicalModel"

const putPDBEntry = (resource) => {
  return {
    resource,
    request: {
      method: "PUT",
      url: resource.resourceType + "/" + resource.id
    }
  }
}
const postPDBEntry = (resourceType, tempId) => {
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

const createPDBSubmissionSet = (options, folderId, docRefId, binaryRefId) => {
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

const createPDBBinaryReference = (options, binaryRefId, binaryId) => {
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

const createPDBPDF = (doc, options) => {
  return new Promise( async (resolve) => {

    let details = {
      hcid: options.responses.certificate.hcid.value,
      name: options.responses.name,
      id: options.responses.identifier.value,
      sex: options.responses.sex,
      birthDate: options.responses.birthDate
    }
    if ( options.resources.List ) {
      logger.info("Looking at old list", options.resources.List.id)
      let oldDocs = []
      let urlRegex = /(.*)(Bundle\/.+)/
      for( let entry of options.resources.List.entry ) {
        //console.log( "ENTRY",entry )
        if ( entry.item && entry.item.reference && entry.item.reference.startsWith( "DocumentReference" ) ) {
          let docRef = await retrieveResource( entry.item.reference )
          if ( docRef.error ) continue
          try {
            if ( docRef.content[0].attachment.contentType === "application/fhir" ) {
              let matched = docRef.content[0].attachment.url.match( urlRegex )
              //console.log("looking up",matched)
              oldDocs.push( await retrieveResource( matched[2], matched[1] ) )

            }
          } catch( err ) {
            logger.info("Err on ",docRef.id)
            continue
          }
        }
      }
      
      for( let oldDoc of oldDocs ) {
        try {
          let oldResponses = await convertBundleToCoreDataSet( oldDoc )
          //console.log("GOT",oldResponses)
/*
          let immunization = oldDoc.entry.find( entry => entry.resource.resourceType === "Immunization" )
          let immRec = oldDoc.entry.find( entry => entry.resource.resourceType === "ImmunizationRecommendation" )
          let patient = oldDoc.entry.find( entry => entry.resource.resourceType === "Patient" )
          let oldResponses = reverseResponses( immunization.resource, patient.resource, immRec.resource || null, details.hcid )
*/          
          //console.log("OLD RESPONSES",oldResponses)
          let dose = {
            date: oldResponses.vaccination.date,
            lot: oldResponses.vaccination.lot,
            vaccine: oldResponses.vaccination.vaccine 
              && oldResponses.vaccination.vaccine.display || oldResponses.vaccination.vaccine.code,
            brand: oldResponses.vaccination.brand 
              && oldResponses.vaccination.brand.display || oldResponses.vaccination.brand.code,
            manufacturer: (oldResponses.vaccination.manufacturer 
                && (oldResponses.vaccination.manufacturer.display 
                  || oldResponses.vaccination.manufacturer.code))
              || (oldResponses.vaccination.maholder 
                && (oldResponses.vaccination.maholder.display 
                  || oldResponses.vaccination.maholder.code)),
            hw: oldResponses.vaccination.practitioner && oldResponses.vaccination.practitioner.value,
            site: oldResponses.vaccination.centre,
            country: oldResponses.vaccination.country && oldResponses.vaccination.country.display || oldResponses.vaccination.country.code,
            doses: (typeof oldResponses.vaccination.totalDoses === 'number' ? oldResponses.vaccination.totalDoses.toString() : oldResponses.vaccination.totalDoses)
          }

          let docRefs = oldDoc.entry.filter( entry => entry.resource.resourceType === "DocumentReference" )
          let qrRef = docRefs.find( ref => ref.resource.category && ref.resource.category.find( cat => cat.coding && cat.coding.find( coding => coding.code === "who" ) ) )
          if ( qrRef ) {
            let qr = qrRef.resource.content.find( content => content.attachment.contentType === "image/png" )
            dose.qr = qr.attachment.data
          }

          if (oldResponses.vaccination.dose === 1) {
            details.dose1 = dose
            if (oldResponses.vaccination.nextDose) {
              details.dose1.date_due = oldResponses.vaccination.nextDose
            }
          } else if (oldResponses.vaccination.dose === 2) {
            details.dose2 = dose
          }

        } catch( err ) {
          logger.info("Failed to process previous Document: " + oldDoc.id + " " + err.message)
          continue
        }
      }
    }
    //console.log(options.responses)
    let vacc = options.responses.vaccination
    let dose = {
      date: vacc.date,
      lot: vacc.lot,
      vaccine: vacc.vaccine && vacc.vaccine.display || vacc.vaccine.code,
      brand: vacc.brand && vacc.brand.display || vacc.brand.code,
      manufacturer: (vacc.manufacturer 
          && (vacc.manufacturer.display 
            || vacc.manufacturer.code))
        || (vacc.maholder 
          && (vacc.maholder.display
            || vacc.maholder.code)),
      hw: vacc.practitioner && vacc.practitioner.value,
      site: vacc.centre,
      country: vacc.country && vacc.country.display || vacc.country.code,
      doses: (typeof vacc.totalDoses === 'number' ? vacc.totalDoses.toString() : options.responses.vaccination.totalDoses)    }

    let docRefs = doc.entry.filter( entry => entry.resource.resourceType === "DocumentReference" )
    let qrRef = docRefs.find( ref => ref.resource.category && ref.resource.category.find( cat => cat.coding && cat.coding.find( coding => coding.code === "who" ) ) )
    if ( qrRef ) {
      let qr = qrRef.resource.content.find( content => content.attachment.contentType === "image/png" )
      dose.qr = qr.attachment.data
    }


    if (vacc.dose === 1) {
      details.dose1 = dose
      if (vacc.nextDose) {
        details.dose1.date_due = vacc.nextDose
      }
    } else if (vacc.dose === 2) {
      details.dose2 = dose
    }
    //console.log("SENDING DETAILS",details)
    createDDCC(details).then( pdf => {
       resolve(pdf)
     })
  })
}

const createPDBBinary = (options, binaryId) => {
  let entry = postPDBEntry("Binary", binaryId)

  entry.resource.contentType = "application/pdf"
  entry.resource.data = options.pdfs.DDCC
  return entry
}
const createPDBDocumentReference = (options, docRefId, docId) => {
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

const createPDBFolder = (options, folderId, docRefId, binaryRefId) => {
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
          value: options.responses.certificate.hcid.value
        },
        {
          use: "official",
          system: FOLDER_IDENTIFIER_SYSTEM,
          value: options.responses.certificate.hcid.value
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

export const createProvideDocumentBundle = (doc, options) => {
  let docRefId = uuidv4()
  let binaryRefId = uuidv4()
  let binaryId = uuidv4()
  let folderId
  if ( options.resources.List ) {
    folderId = options.resources.List.id
  } else {
    folderId = uuidv4()
  }
  createPDBPDF(doc, options).then((pdf) => {
    options.pdfs.DDCC = Buffer.from(pdf).toString('base64')


    let PDBBinary = createPDBBinary(options, binaryId)
    


    let provideDocumentBundle = {
      resourceType: "Bundle",
      type: "transaction",
      entry: [
        createPDBSubmissionSet(options, folderId, docRefId, binaryRefId),
        createPDBDocumentReference(options, docRefId, doc.id),
        PDBBinary,
        createPDBBinaryReference(options, binaryRefId, binaryId),
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

  })
}