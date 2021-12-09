'use strict'

import express from 'express'

import routes from './routes/'
//import logger from './logger'

const app = express()

app.use(express.json( { type: [ "application/fhir+json", "application/json" ] } ))

app.use('/', routes)

export default app