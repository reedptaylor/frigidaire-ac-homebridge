# homebridge-frigidaire-ac-plugin
![NPM Version](https://img.shields.io/npm/v/%40reedptaylor%2Fhomebridge-frigidaire-ac-plugin)

Plugin for Frigidaire AC units to add support to Homebridge. Uses reverse engineered Frigidaire API with contributions from:
- https://github.com/karlg100/frigidaire
- https://github.com/marekbrz/frigidaire
- https://www.npmjs.com/package/@samthegeek/frigidaire

## Getting started 

### Installation

```sudo npm install -g homebridge-frigidaire-ac-plugin```

### Configuration

You will be required to ste your username and password used to sign in to the Frigidaire app.

If you do not provide a Device ID, one will be automatically regenerated on every homebridge restart. It is recommended to provide a static value here.

It is recommended to to keep API Polling Interval at 10000ms (10s) to reduce rate limiting.

It is recommend to turn on Refresh Token Caching to reduce the chances of hitting the authentication rate limit.