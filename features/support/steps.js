const { Given, When, Then } = require("@cucumber/cucumber");
const assert = require("assert").strict;
require('node-fetch')
const fetchMock = require('fetch-mock')
const request = require('supertest')


//Given("A FHIR server would return:", function( url, args, result ) {
Given("A FHIR server would return:", function(dataTable) {
  for( let request of dataTable.hashes() ) {
    let realOpts = JSON.parse(request.opts)
    realOpts.url = request.url
    if ( realOpts.body ) realOpts.body = JSON.parse(realOpts.body)
    let realResult = JSON.parse(request.result)

    fetchMock.mock( realOpts, realResult )
  }


} )

When("I do something that fetches it", function() {
  fetch( "http://localhost:8081/fhir", { 
    "method": "GET", 
    "headers": { "Content-Type": "application/fhir+json" } 
  } ).then( res => res.json() ).then( json => {
    assert.deepEqual(json, { ok: true })
  } )
})

When("I fetch test", async function() {
  const route = require(process.cwd()+'/lib/routes/test')
  this.setRoute("/", route)

  let response = await request(this.getServer()).get('/')
  this.setResponse('test', response.body)

})
Then("I get results", function() {
  assert.deepEqual(this.getResponse('test'), {ok:1})
})
