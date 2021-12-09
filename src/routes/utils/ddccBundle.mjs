import logger from "../../logger"
import { transform } from "./structureMaps"

export const processDDCCBundle = (coreDataSet) => {

  return new Promise((resolve) => {
    transform( "CoreDataSetVSToAddBundle", coreDataSet )
    .then((transformed) => {
      logger.info("Converted coreDataSet to addBundle")
      resolve(transformed)
    }).catch((err) => {
      logger.info("Error converting coreDataSet to addBundle")
      resolve({ error: JSON.stringify(err) })
    })
  })

}