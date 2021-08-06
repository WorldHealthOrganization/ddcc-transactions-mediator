// @strip-block
'use strict'

import openhim from './openhim'
import {SERVER_PORT} from './config/config'
import logger from './logger'
import {checkDHS} from './routes/utils'

import app from './app'

app.listen(SERVER_PORT, () => {
  logger.info(`Server listening on Port ${SERVER_PORT}...`)
  checkDHS()
  /* openhim:start */
  openhim.mediatorSetup()
  /* openhim:end */
})
