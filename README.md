# README

Node ftp sync with [Render](https://render.com) support.

## Deployment

See https://render.com/docs/deploy-node-express-app or follow the steps below:

Create a new web service with the following values:
  * Build Command: `yarn`
  * Start Command: `node app.js`
  * Secret file: `ftp_servers.json` : ``[{"server": "", "user": "", "password": ""}]``

That's it! Your web service will be live on your Render URL as soon as the build finishes.
