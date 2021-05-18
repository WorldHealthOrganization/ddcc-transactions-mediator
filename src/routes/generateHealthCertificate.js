'use strict'

import logger from '../logger'
import {buildHealthCertificate, buildReturnObject, buildErrorObject} from './utils'

module.exports = async (_req, res) => {
  logger.info('Generate Health Certificate Endpoint Triggered')

  let Document = await buildHealthCertificate( _req.body )
  let returnObject

  if ( Document.resourceType !== "Bundle" ) {
    returnObject = buildErrorObject( Document )
  } else {
    returnObject = buildReturnObject(
      'Successful',
      200,
      Document
    )
  }
  return res.send(returnObject)
}
