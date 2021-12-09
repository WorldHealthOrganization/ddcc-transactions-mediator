/**
 * Creates a payload that can be passed to COSE library to make the full certificate.
 * 
 * certificate: JSON object of certificate to put in the hcert
 * claimKey: claim key for the certificate (1 for EU)
 * expiration: expiration in unixtime for the hcert
 * issuer (optional): issuer iso3166-2
 * issuedAt (optional): time issued in unixtime, defaults to current time
 */
export const createPayload = ( certificate, claimKey, expiration, issuer, issuedAt ) => {
    let payload = new Map()
    payload.set( 4, expiration )
    payload.set( 6, issuedAt || Math.floor(Date.now()/1000) )
    if ( issuer ) {
        payload.set( 1, issuer )
    }
    let hcert = new Map()
    hcert.set( claimKey, certificate )
    payload.set( -260, hcert )
    return payload

}