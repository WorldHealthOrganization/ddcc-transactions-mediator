import pino from 'pino'

import {LOG_LEVEL} from './config/config'

const logger = pino({
  level: LOG_LEVEL,
  prettyPrint: true,
  serializers: {
    err: pino.stdSerializers.err
  }
})

export default logger