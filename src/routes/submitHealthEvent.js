'use strict'

import logger from '../logger'
import {buildHealthCertificate, buildReturnObject, buildErrorObject} from './utils'


module.exports = async (_req, res) => {
  logger.info('Submit Health Event Endpoint Triggered')
  let returnBundle = {
    resourceType: "Bundle",
    type: "batch-response",
    entry: []
  }

  let batch = _req.body

  if ( batch.resourceType !== 'Bundle' || batch.type !== 'batch' 
    || !batch.entry ) {
    res.send( buildErrorObject( { 
      resourceType: "OperationOutcome",
      issue: [
        {
          severity: "error",
          code: "structure",
          diagnostics: "Invalid resource type submitted"
        }
      ] 
    } ) )
  }

  for( let entry of batch.entry ) {
    let responseEntry = {
      resource: {},
      response: {}
    }
    if ( entry.request.method === "POST" 
      && entry.request.url === "QuestionnaireResponse/$generateHealthCertificate"
    ) {
      responseEntry.resource = await buildHealthCertificate( entry.resource )
      responseEntry.response.status = "201"
    } else {
      responseEntry.response.status = "404"
      responseEntry.resource = {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "not-found",
            diagnostics: "Can't handle this type of request"
          }
        ]
      }
    }
    returnBundle.entry.push( responseEntry )
  }

  const returnObject = buildReturnObject(
    'Successful',
    200,
    returnBundle
  )
  return res.send(returnObject)
}
