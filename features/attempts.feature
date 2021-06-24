Feature: Testing out cucumber-js
  Just testing out how to do things
  with cucumber-js.

  Scenario: testing mocking fetch
    Given A FHIR server would return:
      | url | opts | result |
      | http://localhost:8081/fhir | { "method": "GET", "headers": { "Content-Type": "application/fhir+json" } } | { "ok": true } |
      | http://localhost:8081/fhir/Patient | { "method": "GET", "headers": { "Content-Type": "application/fhir+json" } } | { "ok": true } |

    When I do something that fetches it

  Scenario: testing express routes
    When I fetch test
    Then I get results
