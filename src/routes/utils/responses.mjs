export const processResponses = (QResponse, options) => {
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

export const reverseResponses = (immunization, patient, recommendation, hcid) => {
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
      (ext) => ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineBrand"
    ).valueCoding
  } catch (err) {}
  try {
    responses.manufacturer = immunization.manufacturer.identifier
  } catch (err) {}
  try {
    responses.ma_holder = immunization.extension.find(
      (ext) =>
        ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineMarketAuthorization"
    ).valueCoding
  } catch (err) {}
  responses.lot = immunization.lotNumber
  responses.date = immunization.occurrenceDateTime
  try {
    responses.vaccine_valid = immunization.extension.find(
      (ext) => ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineValidFrom"
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
      (ext) => ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCCountryOfVaccination"
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

const addQResponseItem = (linkId, answerType, answer) => {
  return {
    linkId: linkId,
    answer: [
      {
        ["value" + answerType]: answer
      }
    ]
  }
}

export const reverseQuestionnaireResponse = (questionnaireUrl, immunization, patient, recommendation, hcid) => {
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
          (ext) => ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineBrand"
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
            "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineMarketAuthorization"
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
          (ext) => ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCVaccineValidFrom"
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
            ext.url === "http://worldhealthorganization.github.io/ddcc/StructureDefinition/DDCCCountryOfVaccination"
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
        immunization.performer[0].actor.reference || immunization.performer[0].actor.identifier.value
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