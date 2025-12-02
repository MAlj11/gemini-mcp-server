/**
 * OpenRouter Service for Advanced Image Generation.
 * Handles image generation requests through OpenRouter API using Gemini 2.5 Flash Image Preview (free).
 *
 * @author Claude + Rob
 */

const { chatCompletion } = require('./client');
const config = require('../config');
const { log } = require('../utils/logger');

class OpenRouterService {
  constructor() {
    this.isAvailable = true;
  }

  /**
   * Generates advanced images using OpenRouter's free Gemini 2.5 Flash Image model.
   * @param {string} modelType - The model type (e.g., 'ADVANCED_IMAGE_GENERATION')
   * @param {string} prompt - The text prompt for image generation
   * @param {Array<{data: string, mimeType: string}>} [referenceImages] - Reference images for fusion/consistency
   * @param {Object} [options] - Additional options
   * @param {string} [options.mode] - Generation mode: 'fusion', 'consistency', 'targeted_edit', 'template'
   * @returns {Promise<string>} Base64 encoded image data
   */
  async generateAdvancedImage(modelType, prompt, referenceImages = [], options = {}) {
    if (!this.isAvailable) {
      throw new Error('OpenRouter service is not available');
    }

    try {
      const modelConfig = config.OPENROUTER_MODELS[modelType];
      if (!modelConfig) {
        throw new Error(`OpenRouter model configuration not found for type: ${modelType}`);
      }

      log(`Starting OpenRouter advanced image generation with model: ${modelConfig.model}`, 'openrouter-service');

      // Build messages array for chat completion format
      const messages = [];

      // Add mode-specific system message
      if (options.mode) {
        let systemMessage = '';
        switch (options.mode) {
          case 'fusion':
            systemMessage = 'You are an advanced image generation AI. Blend and fuse the provided reference images into a single cohesive new image with seamless integration, balanced elements, unified color palette, and natural transitions.';
            break;
          case 'consistency':
            systemMessage = 'You are an advanced image generation AI. Maintain character and style consistency from the reference images while creating the new image. Preserve key features, consistent lighting, matching art style, and recognizable elements.';
            break;
          case 'targeted_edit':
            systemMessage = 'You are an advanced image editing AI. Apply targeted, precise edits to the reference image as specified. Make specific modifications only, preserve surrounding areas, ensure natural transitions, and maintain image quality.';
            break;
          case 'template':
            systemMessage = 'You are an advanced image generation AI. Follow the visual template and layout from the reference image while generating new content. Maintain layout structure, proportions, design hierarchy, and consistent formatting.';
            break;
          default:
            systemMessage = 'You are an advanced image generation AI. Create high-quality images based on the provided description.';
        }
        messages.push({ role: 'system', content: systemMessage });
      }

      // Build the user message with text and images
      const userMessageContent = [
        { type: 'text', text: prompt }
      ];

      // Add reference images to the message
      if (referenceImages && referenceImages.length > 0) {
        referenceImages.forEach((image, index) => {
          userMessageContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${image.mimeType};base64,${image.data}`
            }
          });
        });
        log(`Added ${referenceImages.length} reference images to OpenRouter request`, 'openrouter-service');
      }

      messages.push({
        role: 'user',
        content: userMessageContent
      });

      // Make the request through OpenRouter with correct modalities
      log(`Making OpenRouter request with ${messages.length} messages`, 'openrouter-service');
      const response = await chatCompletion(messages, modelConfig, {
        modalities: ['image', 'text'] // Correct format for image generation
      });

      // Extract image data from response (fixed parsing)
      if (config.DEBUG_ADVANCED_IMAGE || config.DEBUG) {
        log(`OpenRouter response structure: ${JSON.stringify(response, null, 2)}`, 'openrouter-service');
      } else {
        log(`OpenRouter response received with ${response?.choices?.length || 0} choices`, 'openrouter-service');
      }
      
      if (response && response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        
        // Check for images in the correct location
        if (choice.message && choice.message.images && choice.message.images.length > 0) {
          const imageObj = choice.message.images[0]; // First image object
          log(`Found image object in choice.message.images: ${JSON.stringify(imageObj)}`, 'openrouter-service');
          
          // Handle different image object formats
          let imageUrl = null;
          if (imageObj && typeof imageObj === 'object') {
            if (imageObj.image_url && imageObj.image_url.url) {
              imageUrl = imageObj.image_url.url; // OpenRouter format
            } else if (imageObj.url) {
              imageUrl = imageObj.url; // Direct URL format
            }
          } else if (typeof imageObj === 'string') {
            imageUrl = imageObj; // Direct string format
          }
          
          // Extract base64 data from data URL
          if (imageUrl && typeof imageUrl === 'string' && imageUrl.includes('data:image')) {
            const match = imageUrl.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
            if (match && match[1]) {
              log('Successfully extracted image data from OpenRouter images field', 'openrouter-service');
              return match[1];
            }
          }
        }
        
        // Fallback: check if content contains image data (some models might return it here)
        if (choice.message && choice.message.content) {
          const content = choice.message.content;
          
          if (typeof content === 'string' && content.includes('data:image')) {
            const match = content.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
            if (match && match[1]) {
              log('Found image data in message content as fallback', 'openrouter-service');
              return match[1];
            }
          }
        }

        // Additional fallback locations
        if (choice.image_data) {
          log('Found image data in choice.image_data', 'openrouter-service');
          return choice.image_data;
        }

        if (choice.images && choice.images.length > 0) {
          log('Found image data in choice.images array', 'openrouter-service');
          const imageUrl = choice.images[0];
          if (typeof imageUrl === 'string' && imageUrl.includes('base64,')) {
            const base64Data = imageUrl.split('base64,')[1];
            return base64Data;
          }
        }
      }

      const responsePreview = config.DEBUG_ADVANCED_IMAGE ? 
        JSON.stringify(response, null, 2) : 
        `${response?.choices?.length || 0} choices, first choice keys: ${Object.keys(response?.choices?.[0] || {})}`;
      
      throw new Error(`No image data found in OpenRouter response. Response: ${responsePreview}`);

    } catch (error) {
      log(`OpenRouter advanced image generation failed: ${error.message}`, 'openrouter-service');
      
      // Mark service as temporarily unavailable on certain errors
      if (error.message.includes('rate limit') || error.message.includes('quota')) {
        log('OpenRouter rate limited or quota exceeded, marking as temporarily unavailable', 'openrouter-service');
        this.isAvailable = false;
        // Re-enable after 5 minutes
        setTimeout(() => {
          this.isAvailable = true;
          log('OpenRouter service re-enabled after cooldown', 'openrouter-service');
        }, 5 * 60 * 1000);
      }

      throw error;
    }
  }

  /**
   * Checks if the OpenRouter service is available.
   * @returns {boolean} True if service is available
   */
  isServiceAvailable() {
    return this.isAvailable && config.USE_OPENROUTER_FOR_ADVANCED_IMAGE;
  }

  /**
   * Generates images using Nano Banana Pro (Gemini 3 Pro Image) via OpenRouter.
   * Supports up to 14 reference images, 4K resolution, and advanced editing.
   * @param {string} prompt - The text prompt for image generation
   * @param {Array<{data: string, mimeType: string}>} [referenceImages] - Up to 14 reference images
   * @param {Object} [options] - Additional options
   * @param {string} [options.mode] - Generation mode: 'fusion', 'consistency', 'targeted_edit', 'template', 'standard'
   * @param {string} [options.resolution] - Output resolution: '1k', '2k', '4k'
   * @param {string} [options.aspect_ratio] - Aspect ratio: '1:1', '16:9', '9:16', etc.
   * @returns {Promise<string>} Base64 encoded image data
   */
  async generateNanaBananaProImage(prompt, referenceImages = [], options = {}) {
    if (!this.isAvailable) {
      throw new Error('OpenRouter service is not available');
    }

    try {
      const modelConfig = config.OPENROUTER_MODELS.NANO_BANANA_PRO;
      if (!modelConfig) {
        throw new Error('Nano Banana Pro model configuration not found');
      }

      // Validate reference images count (max 14 for Nano Banana Pro)
      if (referenceImages.length > 14) {
        throw new Error(`Nano Banana Pro supports up to 14 reference images, got ${referenceImages.length}`);
      }

      log(`Starting Nano Banana Pro image generation with model: ${modelConfig.model}`, 'openrouter-service');
      log(`Options: resolution=${options.resolution || '1k'}, aspect_ratio=${options.aspect_ratio || '1:1'}, mode=${options.mode || 'standard'}`, 'openrouter-service');

      // Build messages array
      const messages = [];

      // Add mode-specific system message
      if (options.mode) {
        let systemMessage = '';
        switch (options.mode) {
          case 'fusion':
            systemMessage = 'You are Nano Banana Pro, an advanced image generation AI. Blend and fuse the provided reference images into a single cohesive new image with seamless integration, balanced elements, unified color palette, and natural transitions. Use your advanced reasoning to understand the relationships between images.';
            break;
          case 'consistency':
            systemMessage = 'You are Nano Banana Pro, an advanced image generation AI. Maintain character and style consistency from the reference images while creating the new image. Preserve key features, consistent lighting, matching art style, and recognizable elements across up to 5 characters.';
            break;
          case 'targeted_edit':
            systemMessage = 'You are Nano Banana Pro, an advanced image editing AI. Apply targeted, precise edits to the reference image as specified. Make specific modifications only, preserve surrounding areas, ensure natural transitions, and maintain image quality. Use localized editing for precise control.';
            break;
          case 'template':
            systemMessage = 'You are Nano Banana Pro, an advanced image generation AI. Follow the visual template and layout from the reference image while generating new content. Maintain layout structure, proportions, design hierarchy, and consistent formatting.';
            break;
          default:
            systemMessage = 'You are Nano Banana Pro, Google\'s most advanced image generation AI built on Gemini 3 Pro. Create high-quality images with superior reasoning, text rendering, and visual fidelity.';
        }
        messages.push({ role: 'system', content: systemMessage });
      }

      // Build the user message with text and images
      const userMessageContent = [
        { type: 'text', text: prompt }
      ];

      // Add reference images to the message
      if (referenceImages && referenceImages.length > 0) {
        referenceImages.forEach((image, index) => {
          userMessageContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${image.mimeType};base64,${image.data}`
            }
          });
        });
        log(`Added ${referenceImages.length} reference images to Nano Banana Pro request`, 'openrouter-service');
      }

      messages.push({
        role: 'user',
        content: userMessageContent
      });

      // Build request options with Nano Banana Pro specific parameters
      const requestOptions = {
        modalities: ['image', 'text']
      };

      // Add aspect ratio configuration if specified
      if (options.aspect_ratio) {
        requestOptions.image_config = {
          aspect_ratio: options.aspect_ratio
        };
        log(`Set aspect ratio to: ${options.aspect_ratio}`, 'openrouter-service');
      }

      // Make the request through OpenRouter
      log(`Making Nano Banana Pro request with ${messages.length} messages`, 'openrouter-service');
      const response = await chatCompletion(messages, modelConfig, requestOptions);

      // Log response for debugging
      if (config.DEBUG_ADVANCED_IMAGE || config.DEBUG) {
        log(`Nano Banana Pro response structure: ${JSON.stringify(response, null, 2)}`, 'openrouter-service');
      } else {
        log(`Nano Banana Pro response received with ${response?.choices?.length || 0} choices`, 'openrouter-service');
      }

      // Extract image data from response
      if (response && response.choices && response.choices.length > 0) {
        const choice = response.choices[0];

        // Check for images in the correct location
        if (choice.message && choice.message.images && choice.message.images.length > 0) {
          const imageObj = choice.message.images[0];
          log(`Found image object in choice.message.images`, 'openrouter-service');

          // Handle different image object formats
          let imageUrl = null;
          if (imageObj && typeof imageObj === 'object') {
            if (imageObj.image_url && imageObj.image_url.url) {
              imageUrl = imageObj.image_url.url;
            } else if (imageObj.url) {
              imageUrl = imageObj.url;
            }
          } else if (typeof imageObj === 'string') {
            imageUrl = imageObj;
          }

          // Extract base64 data from data URL
          if (imageUrl && typeof imageUrl === 'string' && imageUrl.includes('data:image')) {
            const match = imageUrl.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
            if (match && match[1]) {
              log('Successfully extracted image data from Nano Banana Pro response', 'openrouter-service');
              return match[1];
            }
          }
        }

        // Fallback: check message content
        if (choice.message && choice.message.content) {
          const content = choice.message.content;
          if (typeof content === 'string' && content.includes('data:image')) {
            const match = content.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
            if (match && match[1]) {
              log('Found image data in message content as fallback', 'openrouter-service');
              return match[1];
            }
          }
        }

        // Additional fallback locations
        if (choice.image_data) {
          log('Found image data in choice.image_data', 'openrouter-service');
          return choice.image_data;
        }

        if (choice.images && choice.images.length > 0) {
          log('Found image data in choice.images array', 'openrouter-service');
          const imageUrl = choice.images[0];
          if (typeof imageUrl === 'string' && imageUrl.includes('base64,')) {
            const base64Data = imageUrl.split('base64,')[1];
            return base64Data;
          }
        }
      }

      throw new Error('No image data found in Nano Banana Pro response');

    } catch (error) {
      log(`Nano Banana Pro image generation failed: ${error.message}`, 'openrouter-service');

      // Handle rate limiting
      if (error.message.includes('rate limit') || error.message.includes('quota')) {
        log('Nano Banana Pro rate limited, marking as temporarily unavailable', 'openrouter-service');
        this.isAvailable = false;
        setTimeout(() => {
          this.isAvailable = true;
          log('OpenRouter service re-enabled after cooldown', 'openrouter-service');
        }, 5 * 60 * 1000);
      }

      throw error;
    }
  }
}

// Export a singleton instance
const openRouterService = new OpenRouterService();
module.exports = openRouterService;