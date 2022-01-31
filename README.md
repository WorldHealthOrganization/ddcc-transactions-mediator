# WHO SVC Transactions Mediator
**FROM: Openhim Production Bootstrap Mediator**

## Startup

To startup this mediator, you are expected to have the following:

- An instance of the OpenHIM-Core, OpenHIM-Console, and MongoDB running
- An OpenHIM user account with permissions to access the API endpoint
- An OpenHIM Client setup (clientId and password)

**If not,** please see [this tutorial](https://github.com/jembi/openhim-mediator-tutorial)

---

### Configuring Mediator

This mediator is configured using environment variables.

> An [environment variable](https://medium.com/chingu/an-introduction-to-environment-variables-and-how-to-use-them-f602f66d15fa) is a variable whose value is set outside the program, typically through functionality built into the operating system or micro-service. An environment variable is made up of a name/value pair, and any number may be created and available for reference at a point in time.

The following variables can be set:

| Environment Variable | Default | Description |
| --- | --- | --- |
| SERVER_PORT | 4321 | The exposed port of the mediator |
| OPENHIM_URL | <https://localhost:8080> | The location of the the OpenHIM API |
| OPENHIM_USERNAME | root@openhim.org | Registered OpenHIM Username |
| OPENHIM_PASSWORD | openhim-password | Password of the registered OpenHIM user |
| TRUST_SELF_SIGNED | `false` | In development environments the OpenHIM uses self-signed certificates therefore it is insecure. To allow the mediator to communicate with the OpenHIM via HTTPS this variable can be set to `true` to ignore the security risk. **This should only be done in a development environment** |

---

### Supporting Software

This mediator requires a FHIR server as well as a [Matchbox FHIR server](https://github.com/ahdis/matchbox) for handling structure maps.  You can set
environment variables so the server knows where to access them.

| Environment Variable | Default | Description |
| --- | --- | --- |
| FHIR_SERVER | http://localhost:8081/fhir/ | The path to the FHIR API. |
| MATCHBOX_SERVER | http://localhost:8080/matchbox/fhir/ | The path to the Matchbox FHIR API |

You can use docker-compose to start docker versions of the required software using the docker-compose.support.yml file:

```
docker-compose -f docker-compose.support.yml up
```

---

### Node && NPM

To run the mediator open a terminal and navigate to the project directory and run the following commands:

```sh
npm install

<Environment_Variables> npm run openhim
```

Example start command:

```sh
SERVER_PORT=4321 OPENHIM_PASSWORD=password npm openhim
```

To run the server in standalone mode without OpenHIM, you can use:

```
<Environment_Variables> npm run start
```

---

### Configuring OpenHIM

To route requests from a client to destination systems, the OpenHIM needs to have `channels` configured to listen for specific requests and send them to specific endpoints.

This mediator is configured (within [mediatorConfig.json](mediatorConfig.json)) to create some default channels and endpoints. To create these channels navigate to the mediators page on the OpenHIM Console.

---

## Sending Requests

To make a basic POST request, open a terminal (or Postman) and make the following request:

```sh
curl --request POST --data "{}" --user admin:password http://localhost:5001/testEndpoint
```

The user details here are your OpenHIM ClientId and password.
