const production = process.env.NODE_ENV === 'production'
if (!production) {
  require('dotenv').config('../../.env')
}

const jwt = require('jsonwebtoken')
const OSTSDK = require('@ostdotcom/ost-sdk-js')

const ost = new OSTSDK({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  apiEndpoint: process.env.API_BASE_URL_LATEST,
})

const tokenService = require('token-service')(ost)
const balancesService = require('balances-service')(ost)
const ledgerService = require('ledger-service')(ost)

const CacheControlExpirationTime = 86400

const apiGatewayResponse = {
  statusCode: 400,
  headers: {
    'Content-type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `public, max-age=${CacheControlExpirationTime}`,
    Expires: new Date(Date.now() + CacheControlExpirationTime).toUTCString(),
  },
  body: null,
  isBase64Encoded: false,
}

// Get OST user ID from token
function getUserIdFromToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET).user.ost.id
}

// Get Vinzy user ID from token
function getVinzyUserIdFromToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET).user._id
}

// Get user token balance
async function getUserBalance(ostUserID) {
  return await balancesService.fetch(ostUserID)
}

// Get user transactions
async function getUserTransactions(ostUserID, page_no = 1, limit = 10) {
  return await ledgerService.fetch(ostUserID, { page_no, limit })
}

// Get Branded Token details and conversion rates
async function getTokenDetails() {
  return await tokenService.fetchFiltered()
}

module.exports.profile = async event => {
  const token = event.queryStringParameters.token
  const transactionsPage = event.queryStringParameters.transactionsPage
  const transactionsPerPage = event.queryStringParameters.transactionsPerPage
  const select = (event.queryStringParameters.select || 'balance,transactions,token').split(',')
  const ostUserID = getUserIdFromToken(token)
  const vinzyUserID = getVinzyUserIdFromToken(token)

  const responseBody = { profile: { ostUserID, vinzyUserID } }

  try {
    if (select.includes('balance')) {
      responseBody.balance = (await getUserBalance(ostUserID)).data.balance
    }

    if (select.includes('transactions')) {
      responseBody.transactions = (await getUserTransactions(
        ostUserID,
        transactionsPage,
        transactionsPerPage
      )).data.transactions
    }

    if (select.includes('token')) {
      const token = await getTokenDetails()
      responseBody.token = token.data.token
      responseBody.price_points = token.data.price_points
    }

    apiGatewayResponse.statusCode = 200
    apiGatewayResponse.body = JSON.stringify(responseBody)
  } catch (err) {
    apiGatewayResponse.body = JSON.stringify(err.message)
  }

  return apiGatewayResponse
}