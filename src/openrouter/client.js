/**
 * OpenRouter API Client.
 * Provides HTTP client functionality for OpenRouter API calls.
 *
 * @author Claude + Rob
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../config');
const { log } = require('../utils/logger');

/**
 * Makes an HTTP request to the OpenRouter API.
 * @param {string} endpoint - The API endpoint (e.g., '/chat/completions')
 * @param {Object} data - The request payload
 * @param {Object} [options={}] - Additional request options
 * @returns {Promise<Object>} The API response
 */
async function makeRequest(endpoint, data, options = {}) {
  const url = new URL(endpoint, config.OPENROUTER_BASE_URL);
  
  const requestData = JSON.stringify(data);
  
  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData),
      'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/Garblesnarff/gemini-mcp-server',
      'X-Title': 'Gemini MCP Server with Smart Tool Intelligence',
      'User-Agent': 'Gemini-MCP-Server/2.2.0',
      ...options.headers
    }
  };

  // Log the request details for debugging
  if (config.DEBUG_ADVANCED_IMAGE) {
    log(`OpenRouter request URL: ${url.toString()}`, 'openrouter-client');
    log(`OpenRouter request headers: ${JSON.stringify(requestOptions.headers, null, 2)}`, 'openrouter-client');
    log(`OpenRouter request body: ${requestData}`, 'openrouter-client');
  }

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            log(`OpenRouter API request successful: ${res.statusCode}`, 'openrouter-client');
            resolve(response);
          } else {
            // Enhanced error logging with full response details
            const errorDetails = {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              body: response
            };
            
            log(`OpenRouter API error: ${JSON.stringify(errorDetails, null, 2)}`, 'openrouter-client');
            
            // Extract detailed error information
            let errorMessage = 'Unknown error';
            if (response.error) {
              errorMessage = response.error.message || response.error.code || JSON.stringify(response.error);
            } else if (response.message) {
              errorMessage = response.message;
            } else if (typeof response === 'string') {
              errorMessage = response;
            }
            
            reject(new Error(`OpenRouter API error (${res.statusCode}): ${errorMessage}`));
          }
        } catch (parseError) {
          log(`Failed to parse OpenRouter API response: ${parseError.message}`, 'openrouter-client');
          log(`Raw response: ${responseData}`, 'openrouter-client');
          reject(new Error(`Invalid JSON response from OpenRouter API: ${parseError.message}. Raw response: ${responseData.substring(0, 200)}...`));
        }
      });
    });
    
    req.on('error', (error) => {
      log(`OpenRouter API request failed: ${error.message}`, 'openrouter-client');
      reject(new Error(`OpenRouter API request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      log('OpenRouter API request timed out', 'openrouter-client');
      req.abort();
      reject(new Error('OpenRouter API request timed out'));
    });
    
    // Set timeout (30 seconds)
    req.setTimeout(30000);
    
    req.write(requestData);
    req.end();
  });
}

/**
 * Makes a chat completion request to OpenRouter.
 * @param {Object} messages - Array of message objects
 * @param {Object} modelConfig - Model configuration
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<Object>} The chat completion response
 */
async function chatCompletion(messages, modelConfig, options = {}) {
  const payload = {
    model: modelConfig.model,
    messages,
    ...modelConfig.generationConfig,
    ...options
  };

  log(`Making chat completion request to OpenRouter with model: ${modelConfig.model}`, 'openrouter-client');
  
  return makeRequest('/api/v1/chat/completions', payload);
}

module.exports = {
  makeRequest,
  chatCompletion,
};