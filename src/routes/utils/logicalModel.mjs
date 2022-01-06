import logger from "../../logger"
import { transform } from "./structureMaps"

export const convertQRToCoreDataSet = (QResponse) => {

  return new Promise((resolve) => {
    transform( "QRespToVSCoreDataSet", QResponse )
    .then((transformed) => {
      logger.info("Converted QResp to CoreDataSet")
      resolve(transformed)
    }).catch((err) => {
      logger.info("Error converting QResp to CoreDataSet")
      resolve({ error: JSON.stringify(err) })
    })
  })

}

export const convertBundleToCoreDataSet = (bundle) => {
  return new Promise((resolve) => {
    transform( "ResourcesToVSCoreDataSet", bundle )
    .then((transformed) => {
      logger.info("Converted Bundle to CoreDataSet")
      resolve(transformed)
    }).catch((err) => {
      logger.info("Error converting Bundle to CoreDataSet")
      resolve({ error: JSON.stringify(err) })
    })
  })
}