'use strict'

import logger from '../logger'
import {buildHealthCertificate, buildReturnObject} from './utils'

module.exports = (_req, res) => {
  logger.info('Generate Health Certificate Endpoint Triggered')

  let returnParameters = buildHealthCertificate( _req.body )

  const returnObject = buildReturnObject(
    'Successful',
    200,
    returnParameters
  )
  return res.send(returnObject)
}
