'use strict'

export const SERVER_PORT = process.env.SERVER_PORT || 4321
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

// OpenHIM
export const OPENHIM_URL = process.env.OPENHIM_URL || 'https://localhost:8080'
export const OPENHIM_USERNAME =
  process.env.OPENHIM_USERNAME || 'root@openhim.org'
export const OPENHIM_PASSWORD =
  process.env.OPENHIM_PASSWORD || 'instant101'
export const TRUST_SELF_SIGNED = process.env.TRUST_SELF_SIGNED === 'true'

// FHIR server
export const FHIR_SERVER = process.env.FHIR_SERVER || 'http://localhost:8081/fhir/'

// DHS FHIR server
export const DHS_FHIR_SERVER = process.env.DHS_FHIR_SERVER || undefined
export const DHS_QUERY = process.env.DHS_QUERY || "Immunization?target-disease=840539006&_lastUpdated=gt"
