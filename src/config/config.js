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

// KEYS for testing
export const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDHtKl+uM5y/VOC
M5BKHu2Dn94A1aWAkVgR6gATnVVqCgSOdyx5JCTwDC7AR7FLQfmL+3XKWQCguZBo
yOhuujVRTowliYZ2Fv8wNl6sYZTq2IDtSpyn09Us6drUu85EsoejsgLo3yMRFqLo
WsCXp3QjMpZb40lvNPfQ3yxZmmm2wAAWPFcUMB0NCacNR0qji8LmuHKStCtPOem8
qTksLU/FYywnnKlp7+GGk0keBd1iM3i73zVODHA11zvXsORQYXHQAQGfRPGBt8Lr
rXaL9+Nugd0Gtwk4puChwQgA1Cf6xaX5G1tznpVoyDkYL1fETQQDthC+0q6LU99J
DnLbhTOLAgMBAAECggEAarnSGzcInctkZaDI69O7eyxkqG2FFUCXoHs9rz3V9+WC
qeBmlBcM5nycP4YQ6fdINdcdDBakj0CcPGOiVAqPk/Q2UZk9kr6XglyMG/PKcfdi
b24AanB67JXNrQLxKSV/96uagnk9dFR0m1hktKd5GZZfZJwDErtr9ORP/1LWTCM+
E0aHy9AsCsbImSCXRisrVlHwo6XV0laphpro19E0q8zSw4x/wIrmG3rZmQs6RD/K
ZNa1URMCgYIsQBmWkWgmfLg5/4egPbnh0letevRfldqzg/EaXkhgP3EvQpeLcN0a
YnrJRAuVZVlaMDbpze0l84NpPS1q66EW+hTclnfRAQKBgQDqdJeN1wdFz/4Uneq2
6/zI+YLt0juMf34udOmqoHwPE5UiUkJK1S7qjfwMKqKsBc3Snzn6xd7xDuoeqdpf
JjZJR6kod+I/W7H0qb4ns2KAmNFOkpdtqgSGvvMj0OlKapXbVrMY/GJdfd1bferO
dp52OSsr2xalZDQ7yiFq/Gz0aQKBgQDaDpsdiqNYYupzccAY3y+m/9LhVYh0xGo/
r5DmAM0cskL/TiqDcQG0nV0xz+q2N9Xt4mWmxO4VobAVU6/C8zZT4oUO5LaMr5jQ
KAUPyqczvykPzvVm0WRDJA0Njy49+/NdLHxJ9YEIMiXtjfrnD4gMrOLc7svDvH7u
upmZCd2Z0wKBgQCK6KtGaWkwrqu+MVX4LNdnh5VQLGgFtR/gjHpJEq6ODC8m14/Z
YHdcluUHnFcnDoVEzfv/HS8aqZiCtGXiS/SL9D4/8M+GdGB6Mfus7/ZjdKdGI0o+
uiXWY9oQlV0zLvU8sCCKpDXvaHw3EeKFkvgN2Y8/e53uPfFIn1ivV4GCSQKBgQDS
KH+RMjwKBJOHnhsRHZG0txzMdf4k4+Su6ouRUTZeMORnYTOSKQkGxR+70XKaGihB
tBBacbQw/vtRIq3kCznSESBCYWYbI2X5QIjYVm1dbyCpDsLvTGIAX6+A4P0lWj2M
EELdmRK6DnMFh/BIX2y1Iq8nVbLnPDVt6kP8/kgoZwKBgC+pBZc5FnSUiZmyy9uD
kZggZXqRQMnlqNA3ehLW7vu9S/yy5TTnodXNbPCkf/IbTDrMQQebAHjoVv4s5+In
n+QwMNaiPg148WqUFG65Qb6+gzLeG/L7dTcfFFyEPg/MCzYKbVWCimpy22l7hehG
sqQDJzKHSR3vKYe454N5VPTn
-----END PRIVATE KEY-----`
export const PUBLIC_KEY = `-----BEGIN CERTIFICATE-----
MIIC7DCCAdQCEQD/sbB18TpJaXBSat1Gq2IfMA0GCSqGSIb3DQEBCwUAMDIxIzAh
BgNVBAMMGk5hdGlvbmFsIENTQ0Egb2YgRnJpZXNsYW5kMQswCQYDVQQGEwJGUjAe
Fw0yMTEyMDIyMTM5MDdaFw0yNjEwMTcyMTM5MDdaMDYxJzAlBgNVBAMMHkRTQyBu
dW1iZXIgd29ya2VyIG9mIEZyaWVzbGFuZDELMAkGA1UEBhMCRlIwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDHtKl+uM5y/VOCM5BKHu2Dn94A1aWAkVgR
6gATnVVqCgSOdyx5JCTwDC7AR7FLQfmL+3XKWQCguZBoyOhuujVRTowliYZ2Fv8w
Nl6sYZTq2IDtSpyn09Us6drUu85EsoejsgLo3yMRFqLoWsCXp3QjMpZb40lvNPfQ
3yxZmmm2wAAWPFcUMB0NCacNR0qji8LmuHKStCtPOem8qTksLU/FYywnnKlp7+GG
k0keBd1iM3i73zVODHA11zvXsORQYXHQAQGfRPGBt8LrrXaL9+Nugd0Gtwk4puCh
wQgA1Cf6xaX5G1tznpVoyDkYL1fETQQDthC+0q6LU99JDnLbhTOLAgMBAAEwDQYJ
KoZIhvcNAQELBQADggEBAIJ7IVqA8xA6ClesqfNjqxfbpZJmyj6Tav9F1WzCSTQq
Ye3XqfhglKnEGtNwOeZHZgpcQ/r8G2I+Cxa3VDunXUGY/2xFEsLWTSHug5ykr5J2
B5tuamOfReTjaX9vxpbt559goZ++XsKBj8UDwU8GuM9TaQ3AfjGhL12hjnUroitw
CNzBl86e4Z0+frREXpHkzIdT5fOnwRIdPI0uw2qfQGT4EhDrqoggiufwoGg94rOP
KuskSnJXguOmuuTmNBOEJcJTUu7d6PE3FrXvD5XDnhbfeO+YLBaJszMOc1d3ZqGf
ZWlGoAY9mymwy2v9dcMeeYawL2ZcTfthqkX5B32H3hE=
-----END CERTIFICATE-----`

export const PRIVATE_KEY_EC = {
  "kty": "EC",
  "kid": "0OZJuQ_pm6em_mHSSUMwMC3ZD2EshyDo6NDJhMm7QAY",
  "use": "sig",
  "alg": "ES256",
  "x5c": [],
  "crv": "P-256",
  "x": "sSimT2IyeoHXqlCf_FzpHEVl7vTi8_xRXRgG922oJW4",
  "y": "B_VFOyQ0Rpek9nFqNu5anXT43A--m0MYaPfZ4iCR1xI",
  "d": "_7YL1c_0CDn3NU7SVD9T6jKv9F2AEOQ5HmgTfVflo-o"
}

export const PUBLIC_KEY_EC = {
  "kty": "EC",
  "kid": "0OZJuQ_pm6em_mHSSUMwMC3ZD2EshyDo6NDJhMm7QAY",
  "use": "sig",
  "alg": "ES256",
  "x5c": [],
  "crv": "P-256",
  "x": "sSimT2IyeoHXqlCf_FzpHEVl7vTi8_xRXRgG922oJW4",
  "y": "B_VFOyQ0Rpek9nFqNu5anXT43A--m0MYaPfZ4iCR1xI"
} 

export const SHC_ISSUER = 'https://localhost:4321/shc_issuer';