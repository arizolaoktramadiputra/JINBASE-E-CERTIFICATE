const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('../../server');

const handler = serverless(app);

exports.handler = async (event, context) => {
    // Initialize Netlify Blobs for Lambda compatibility mode.
    connectLambda(event);

    return handler(event, context);
};