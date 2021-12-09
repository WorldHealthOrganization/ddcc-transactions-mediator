import logger from "../../logger"
import { transform } from "./structureMaps"

export const processDDCCBundle = (coreDataSet) => {

  return new Promise((resolve) => {
    transform( "CoreDataSetVSToAddBundle", coreDataSet )
    .then((transformed) => {
      logger.info("Converted coreDataSet to addBundle")
      resolve(transformed)
    }).catch((err) => {
      logger.info("Error converting coreDataSet to addBundle")
      resolve({ error: JSON.stringify(err) })
    })
  })

}

/*
import { DHS_FHIR_SERVER } from "../../config/config"
import { v4 as uuidv4 } from "uuid"

export const processDDCCBundle = (options) => {
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
  
export const processDDCCDocDetails = (options) => {
  options.ids.DocumentReference = uuidv4()
  options.ids.Composition = uuidv4()
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [createRegistrationEntryDocumentReferenceQR(options), createRegistrationEntryComposition(options)]
  }
}

const createRegistrationEntry = (options, resourceType) => {
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
  
const createRegistrationEntryQuestionnaireResponse = (options) => {
  let entry = createRegistrationEntry(options, "QuestionnaireResponse")
  entry.resource = options.resources.QuestionnaireResponse
  //entry.resource.id = options.ids.QuestionnaireResponse
  entry.resource.subject = { reference: "Patient/" + options.ids.Patient }
  return entry
}
  
const createRegistrationEntryComposition = (options) => {
  let entry = createRegistrationEntry(options, "Composition")

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
      { reference: "ImmunizationRecommendation/" + options.ids.ImmunizationRecommendation  },
      { reference: "DocumentReference/" + options.ids.DocumentReference }
    ]
  })
  
  return entry
}
  
const createRegistrationEntryDocumentReferenceQR = (options) => {
  let entry = createRegistrationEntry(options, "DocumentReference")
  entry.resource.status = "current"
  entry.resource.description = "QR code for Covid 19 Immunization"
  entry.resource.category = {
    coding: [
    {
      system: "http://worldhealthorganization.github.io/ddcc/CodeSystem/DDCC-QR-Category-Usage-CodeSystem",
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
      system: "http://worldhealthorganization.github.io/ddcc/CodeSystem/DDCC-QR-Format-CodeSystem",
      code: "image"
    }
    },
    {
    attachment: {
      contentType: "application/json",
      data: options.content64.QR
    },
    format: {
      system: "http://worldhealthorganization.github.io/ddcc/CodeSystem/DDCC-QR-Format-CodeSystem",
      code: "serialized"
    }
    },
    {
    attachment: {
      contentType: "application/pdf",
      data: options.pdfs.QR
    },
    format: {
      system: "http://worldhealthorganization.github.io/ddcc/CodeSystem/DDCC-QR-Format-CodeSystem",
      code: "pdf"
    }
    }
  ]
  return entry
}
  
const createRegistrationEntryPatient = (options) => {
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
  if ( options.remote_ids.Patient ) {
    entry.resource.identifier.push( {
      system: DHS_FHIR_SERVER,
      value: options.remote_ids.Patient
    })
  }
  
  entry.resource.birthDate = options.responses.birthDate
  entry.resource.gender = options.responses.sex
  return entry
}
  
const createRegistrationEntryImmunization = (options) => {
  let entry = createRegistrationEntry(options, "Immunization")
  entry.resource.extension = [
    {
      url: "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineBrand",
      valueCoding: options.responses.brand
    },
    {
      url: "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineMarketAuthorization",
      valueCoding: options.responses.ma_holder
    },
    {
      url: "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCCountryOfVaccination",
      valueCode: options.responses.country.code
    },
    {
      url: "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineValidFrom",
      valueDate: options.responses.vaccine_valid
    }
  ]
  if ( options.remote_ids.Immunization ) {
    entry.resource.identifier = [ {
      system: DHS_FHIR_SERVER,
      value: options.remote_ids.Immunization
    } ]
  }
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
  
const createRegistrationEntryImmunizationRecommendation = (options) => {
  let entry = createRegistrationEntry(options, "ImmunizationRecommendation")
  if ( options.remote_ids.ImmunizationRecommendation ) {
    entry.resource.identifier = [{
      system: DHS_FHIR_SERVER,
      value: options.remote_ids.ImmunizationRecommendation
    } ]
  }
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
    seriesDosesPositiveInt: options.responses.total_doses,
    supportingImmunization: {
      reference: "Immunization/" + options.ids.Immunization
    }
    }
  ]
  
  return entry
}
*/