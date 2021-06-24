const { setWorldConstructor, World } = require("@cucumber/cucumber");
const express = require('express')
const app = express()

class CustomWorld extends World {
  constructor(options) {
    super(options)
    this.response = {}
    app.use(express.json())
  }

  setResponse(key, response) {
    this.response[key] = response
  }
  getResponse(key) {
    return this.response[key]
  }

  setRoute(path, route) {
    app.use(path, route)
  }
  getServer() {
    return app
  }

}

setWorldConstructor(CustomWorld);
