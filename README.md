## Relatively Simple Microservice Project on Sales Management

### Main Services of the Project:
- User Management, contains user CRUD operations and authentication, user tiers are admin, manager, sales representative and customer,
- Customer Management, contains customer CRUD operations and has features to assign notes to current customers,
- Sales Tracking, contains sales CRUD operations, just like Customer Management also has notes feature for sales.

Each service handles their own database management, logging and has basic security features. In addition, there is the API Gateway to provide a proxy to communicate with services. API Gateway holds a record of the services in `registry.json` file and is able to register, unregister and enable/disable the services. Each service, before start up, notifies the gateway to register itself. It also has a manually implemented basic `loadbalancer.js` functionality which uses a *[round-robin](https://en.wikipedia.org/wiki/Load_balancing_(computing)#Round-robin_scheduling)* approach.

For the sake of time and simplicity, there are many things that I decided not to implement or spent time on. Like creating a bit more extensive database structure, adding different load balance approaches, extending service registry for api gateway to hold more detail information, health checks, maybe a bit more different features other than just creating notes and users (basically each service does the same thing but kinda has to as well) and tests tests tests. Initially, a TDD approach was in mind but then it got overlooked, thus the unfinished test files under tests folder. Later on, I **may** do a house keeping.

### Main Tech Stack Used in Project:
- [Nodejs](https://nodejs.org/en) - JavaScript Environment
- [Express](https://expressjs.com/) - Web Application Framework
- [SQLite](https://www.sqlite.org/) - Database
- [Docker](https://www.docker.com/) - Containerization

## Prerequisites and Installment
Make sure to install [Node.js](https://nodejs.org/en) (at least version 18 or higher). To check your installed version:

    node -v

Clone and get inside of the repository:

    git clone https://github.com/FurkanKovan/microservice-sales-management.git

    cd microservice-sales-management

You can create an `.env` file to setup necessary configurations. However, a default value for each environment variable is assigned inside relevant files. Lastly, to install necessary libraries and start the services run:

    npm install

    npm start

To run with Docker, first make sure to download [Docker](https://www.docker.com/) to your system. Then, inside the main folder where docker-compose file is, run:

    docker-compose up --build

To check running services run the command:

    docker ps

To stop running services run the command:

    docker-compose down -v

## Issues
There are couple of issues that I stumbled upon while building the project. After spending quite a while on some of them I decided to move on. Technically, these issues are critical for a real-life scenario and should not be overlooked, they can be solved by using different approaches or tools. However, I did not want to add more complexity because there are other projects that I am looking forward to start.

- *Axios post request hanging:* This might be related to versioning or a basic configuration setting that I overlooked. Basically, when a post request is sent from api gateway to a service, if it is a proper/valid request, the response hangs and does not get resolved. A service in itself does not have this problem. It is either related to response content type, response status codes (although I did test all of these) or database response synchronization issue.
- *Container address setup:* The proper address setup for services and api gateway needs to be made to enable communication between services. Since project scope is to run on local, I did not spent time on docker configuration for the time being.
- *Service volumes in container*: Since there is no image for sqlite on docker, a little bit more work is needed to handle data consistency for services in containers. I did look into this and mount up volumes for sqlite but ultimately decided to opt-out.