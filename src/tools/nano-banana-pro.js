/**
 * Nano Banana Pro Tool for Gemini MCP Server.
 * Uses Gemini 3 Pro Image (Nano Banana Pro) via OpenRouter for professional-grade image generation.
 * Supports up to 14 reference images, 4K resolution, advanced text rendering, and multi-character consistency.
 *
 * @author Claude + Rob
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const BaseTool = require('./base-tool');
const { log } = require('../utils/logger');
const { ensureDirectoryExists, readFileAsBuffer, validateFileSize, getMimeType } = require('../utils/file-utils');
const { validateNonEmptyString, validateString } = require('../utils/validation');
const config = require('../config');
const openRouterService = require('../openrouter/openrouter-service');

class NanoBananaProTool extends BaseTool {
  constructor(intelligenceSystem, geminiService) {
    super(
      'gemini-nano-banana-pro',
      'Generate professional images with Nano Banana Pro (Gemini 3 Pro Image): 4K resolution, up to 14 reference images, advanced text rendering, character consistency, and studio-grade controls',
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the desired image or editing instruction',
          },
          mode: {
            type: 'string',
            enum: ['fusion', 'consistency', 'targeted_edit', 'template', 'standard'],
            description: 'Generation mode: fusion (blend up to 14 images), consistency (maintain character/style for up to 5 characters), targeted_edit (precise localized edits), template (follow layout), standard (basic generation)',
          },
          resolution: {
            type: 'string',
            enum: ['1k', '2k', '4k'],
            description: 'Output resolution: 1k (1024px), 2k (2048px), or 4k (4096px). Higher resolutions cost more.',
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
            description: 'Aspect ratio for the generated image',
          },
          reference_images: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Optional array of file paths to reference images (up to 14 for Nano Banana Pro)',
          },
          context: {
            type: 'string',
            description: 'Optional context for intelligent enhancement (e.g., "professional", "artistic", "infographic")',
          },
        },
        required: ['prompt'],
      },
      intelligenceSystem,
      geminiService,
    );
  }

  /**
   * Executes the Nano Banana Pro image generation tool.
   * @param {Object} args - The arguments for the tool.
   * @param {string} args.prompt - The text description or editing instruction.
   * @param {string} [args.mode='standard'] - The generation mode.
   * @param {string} [args.resolution='1k'] - Output resolution.
   * @param {string} [args.aspect_ratio='1:1'] - Aspect ratio.
   * @param {string[]} [args.reference_images] - Array of file paths to reference images.
   * @param {string} [args.context] - Optional context for intelligent enhancement.
   * @returns {Promise<Object>} A promise that resolves to the tool's result.
   */
  async execute(args) {
    const prompt = validateNonEmptyString(args.prompt, 'prompt');
    const mode = args.mode || 'standard';
    const resolution = args.resolution || '1k';
    const aspectRatio = args.aspect_ratio || '1:1';
    const referenceImagePaths = args.reference_images || [];
    const context = args.context ? validateString(args.context, 'context') : null;

    log(`Nano Banana Pro: mode="${mode}", resolution="${resolution}", aspect_ratio="${aspectRatio}", prompt="${prompt}"`, this.name);

    try {
      // Validate reference images count
      if (referenceImagePaths.length > 14) {
        throw new Error(`Nano Banana Pro supports up to 14 reference images, got ${referenceImagePaths.length}`);
      }

      // Process reference images
      const referenceImages = [];
      if (referenceImagePaths.length > 0) {
        log(`Processing ${referenceImagePaths.length} reference images`, this.name);

        for (let i = 0; i < referenceImagePaths.length; i++) {
          const imagePath = referenceImagePaths[i];
          log(`Processing reference image ${i + 1}/${referenceImagePaths.length}: ${imagePath}`, this.name);

          try {
            if (!path.isAbsolute(imagePath)) {
              throw new Error(`File path must be absolute, got relative path: ${imagePath}`);
            }

            if (!fs.existsSync(imagePath)) {
              throw new Error(`Reference image file not found: ${imagePath}`);
            }

            validateFileSize(imagePath, config.MAX_IMAGE_SIZE_MB);
            const imageBuffer = readFileAsBuffer(imagePath);
            const mimeType = getMimeType(imagePath, config.SUPPORTED_IMAGE_MIMES);

            referenceImages.push({
              data: imageBuffer.toString('base64'),
              mimeType,
            });

            log(`✓ Loaded reference image ${i + 1}: ${imagePath} (${(imageBuffer.length / 1024).toFixed(2)}KB)`, this.name);
          } catch (fileError) {
            throw new Error(`Reference Image Error: Failed to process image ${i + 1} (${imagePath}): ${fileError.message}`);
          }
        }
      }

      // Validate mode requirements
      if (['fusion', 'consistency', 'template'].includes(mode) && referenceImages.length === 0) {
        throw new Error(`Mode "${mode}" requires at least one reference image`);
      }

      if (mode === 'fusion' && referenceImages.length < 2) {
        throw new Error('Fusion mode requires at least 2 reference images');
      }

      // Apply intelligent enhancement
      let enhancedPrompt = prompt;
      if (this.intelligenceSystem.initialized) {
        try {
          const contextForEnhancement = context || mode;
          enhancedPrompt = await this.intelligenceSystem.enhancePrompt(prompt, contextForEnhancement, this.name);
          log('Applied Tool Intelligence enhancement', this.name);
        } catch (err) {
          log(`Tool Intelligence enhancement failed: ${err.message}`, this.name);
        }
      }

      // Check if OpenRouter is available
      if (!openRouterService.isServiceAvailable()) {
        throw new Error('OpenRouter service is not available. Nano Banana Pro requires OpenRouter.');
      }

      // Generate image using Nano Banana Pro
      log('Generating image with Nano Banana Pro via OpenRouter', this.name);
      const imageData = await openRouterService.generateNanaBananaProImage(
        enhancedPrompt,
        referenceImages,
        {
          mode,
          resolution,
          aspect_ratio: aspectRatio,
        }
      );

      if (imageData) {
        log('Successfully generated Nano Banana Pro image', this.name);

        ensureDirectoryExists(config.OUTPUT_DIR, this.name);

        const timestamp = Date.now();
        const hash = crypto.createHash('md5').update(prompt + mode + resolution).digest('hex').substring(0, 8);
        const imageName = `nanobananapro-${mode}-${resolution}-${hash}-${timestamp}.png`;
        const imagePath = path.join(config.OUTPUT_DIR, imageName);

        fs.writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
        log(`Image saved to: ${imagePath}`, this.name);

        // Learn from interaction
        if (this.intelligenceSystem.initialized) {
          try {
            const resultDescription = `Nano Banana Pro image generated (${mode}, ${resolution}): ${imagePath}`;
            await this.intelligenceSystem.learnFromInteraction(
              prompt,
              enhancedPrompt,
              resultDescription,
              context || mode,
              this.name
            );
          } catch (err) {
            log(`Tool Intelligence learning failed: ${err.message}`, this.name);
          }
        }

        // Build response
        let finalResponse = `✓ **Nano Banana Pro** image successfully generated\n\n`;
        finalResponse += `**Mode:** ${mode}\n`;
        finalResponse += `**Resolution:** ${resolution}\n`;
        finalResponse += `**Aspect Ratio:** ${aspectRatio}\n`;
        finalResponse += `**Prompt:** "${prompt}"\n`;
        finalResponse += `**Output:** ${imagePath}`;

        if (referenceImages.length > 0) {
          finalResponse += `\n**Reference Images:** ${referenceImages.length} image(s)`;
        }

        // Cost estimation
        const costEstimate = this.estimateCost(resolution);
        finalResponse += `\n\n💰 **Estimated Cost:** ~$${costEstimate.toFixed(3)}`;

        // Mode-specific details
        switch (mode) {
          case 'fusion':
            finalResponse += `\n\n**Fusion Details:** Blended ${referenceImages.length} images with advanced reasoning`;
            break;
          case 'consistency':
            finalResponse += `\n\n**Consistency Details:** Maintained character/style (supports up to 5 characters)`;
            break;
          case 'targeted_edit':
            finalResponse += `\n\n**Edit Details:** Applied precise localized modifications`;
            break;
          case 'template':
            finalResponse += `\n\n**Template Details:** Followed layout and structure from reference`;
            break;
        }

        // Nano Banana Pro capabilities note
        finalResponse += `\n\n---\n_Powered by Nano Banana Pro (Gemini 3 Pro Image) via OpenRouter_`;

        return {
          content: [
            {
              type: 'text',
              text: finalResponse,
            },
          ],
        };
      }

      throw new Error('No image data returned from Nano Banana Pro');

    } catch (error) {
      log(`Nano Banana Pro error: ${error.message}`, this.name);

      if (error.message.includes('Reference Image Error:')) {
        throw new Error(`${error.message}\n\nSupported formats: ${Object.keys(config.SUPPORTED_IMAGE_MIMES).join(', ')}`);
      } else if (error.message.includes('Mode') && error.message.includes('requires')) {
        throw new Error(`${error.message}\n\nNote: Fusion needs 2+ images, consistency/template need 1+`);
      } else {
        throw new Error(`Nano Banana Pro failed: ${error.message}`);
      }
    }
  }

  /**
   * Estimates the cost based on resolution.
   * Pricing: $0.139 for 1k/2k, $0.24 for 4k
   * @param {string} resolution - The output resolution
   * @returns {number} Estimated cost in USD
   */
  estimateCost(resolution) {
    switch (resolution) {
      case '4k':
        return 0.24;
      case '2k':
      case '1k':
      default:
        return 0.139;
    }
  }
}

module.exports = NanoBananaProTool;
