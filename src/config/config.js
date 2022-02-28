'use strict'

export const SERVER_PORT = process.env.SERVER_PORT || 4321
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

// OpenHIM
export const STANDALONE = process.env.STANDALONE || false
export const OPENHIM_URL = process.env.OPENHIM_URL || 'https://localhost:8080'
export const OPENHIM_USERNAME =
  process.env.OPENHIM_USERNAME || 'root@openhim.org'
export const OPENHIM_PASSWORD =
  process.env.OPENHIM_PASSWORD || 'instant101'
export const TRUST_SELF_SIGNED = process.env.TRUST_SELF_SIGNED === 'true'

// FHIR server
export const FHIR_SERVER = process.env.FHIR_SERVER || 'http://localhost:8081/fhir/'

// Matchbox server (StructureMap)
export const MATCHBOX_SERVER = process.env.MATCHBOX_SERVER || 'http://localhost:8080/matchbox/fhir/'

// SYSTEMS
export const DDCC_CANONICAL_BASE = "http://worldhealthorganization.github.io/ddcc/"
export const FOLDER_IDENTIFIER_SYSTEM = "http://worldhealthorganization.github.io/ddcc/Folder"
export const SUBMISSIONSET_IDENTIFIER_SYSTEM = "http://worldhealthorganization.github.io/ddcc/SubmissionSet"
export const DDCC_IDENTIFIER_SYSTEM = "http://worldhealthorgnaization.github.io/ddcc/Document"

export const SHC_ISSUER = 'https://localhost:4321/shc_issuer';

// File for key
export const PRIVATE_KEY_FILE = process.env.PRIVATE_KEY_FILE || './priv.pem'