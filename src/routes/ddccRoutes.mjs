'use strict'

import express from 'express'

import { buildReturnObject ,buildErrorObject, retrieveDocumentReference, buildHealthCertificate } from './utils'
import {STANDALONE} from '../config/config'
import logger from '../logger'

const routes = express.Router()

routes.get('/DocumentReference/:ddccid/([\$])getQRCode', async (_req, res) => {
  let ddccid = _req.params.ddccid
  logger.info('Retrieve QR Code endpoint triggered ID=' + ddccid)

  let Document = await retrieveDocumentReference(ddccid)
  let returnObject

  if ( Document.resourceType !== "DocumentReference" ) {
    logger.info("Did not recieve expected DocumentReference ID=" + ddccid )
    logger.info("Recevied: " + JSON.stringify(Document))
    returnObject = buildErrorObject("Could not retrieve DocumentReference")
  } else {
    logger.info("Processing DocumentReference ID=" + ddccid)
    let attachment = Document.content[0].attachment
    //attachment really should be obtained via a fhirpath query against a category/type/code (e.g. whp, icao, dgc...)
    let image = Buffer.from(attachment.data, 'base64')

    returnObject = buildReturnObject(
      'Successful',
      '200',
      image,
      attachment.contentType
    )
    res.set('Content-Type', attachment.contentType)
    res.set('Content-Disposition', 'inline; filename=QRCode_' + ddccid + '.png');

    if ( !STANDALONE ) {
      res.set('Content-Type', 'application/json')
    }
  }

  return res.send(returnObject)

} )

routes.post('/submitHealthEvent', async (_req, res) => {
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
      if ( responseEntry.resource.resourceType === "OperationOutcome" ) {
        responseEntry.response.status = "500"
      } else {
        responseEntry.response.status = "201"
      }
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
} )

routes.post('/generateHealthCertificate', async (_req, res) => {
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
} )

export default routes
