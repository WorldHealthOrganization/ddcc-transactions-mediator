'use strict'

import {mediatorSetup} from './openhim'
import {SERVER_PORT,STANDALONE} from './config/config'
import logger from './logger'

import app from './app'

app.listen(SERVER_PORT, () => {
  logger.info(`Server listening on Port ${SERVER_PORT}...`)
  if (!STANDALONE) {
    mediatorSetup()
  }
})
