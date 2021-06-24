'use strict'

import express from 'express'

const routes = express.Router()

routes.get('/', (req,res) => {
  res.status(200).json({ok:1})
} )


module.exports = routes
