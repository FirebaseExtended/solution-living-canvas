/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { GenerateContentConfig, GoogleGenAI } from "@google/genai";
import fs from "fs";
import { getGoogleCloudConfig } from "../config";
import { config as aiConfig } from "./ai-config-helper";
import { cacheManager } from "./cache-manager";

const { projectId, location } = getGoogleCloudConfig();

interface GenerationConfig {
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  seed: number;
  responseModalities: string[];
  safetySettings: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        inlineData: {
          data: string;
        };
      }>;
    };
    finishReason: string;
  }>;
}

// Initialize Vertex with your Cloud project and location
const ai = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location || "us-central1",
});

// Set up generation config
const generationConfig: GenerationConfig = {
  maxOutputTokens: 8192,
  temperature: 1,
  topP: 0.95,
  seed: 0,
  responseModalities: ["TEXT", "IMAGE"],
  safetySettings: aiConfig.getSafetySettings(),
};

async function generateImageBuffer(
  objectType: string,
  visualStyle: string,
  promptId: string = "gemini_generation"
): Promise<string> {
  try {
    // Try to get from cache first
    const cachedResult = await cacheManager.getCachedImage(
      objectType,
      visualStyle,
      "gemini"
    );
    if (cachedResult.success && cachedResult.data) {
      console.log(
        `Retrieved cached image for ${objectType} in ${visualStyle} style`
      );
      return cachedResult.data as string;
    }

    // If not in cache, proceed with normal image generation
    const model = aiConfig.models["generation_gemini"];
    if (!model) {
      throw new Error("Gemini model configuration not found");
    }

    const textPrompt = aiConfig.buildPrompt(promptId, {
      type: objectType,
      visualStyle: visualStyle,
    });

    const vertexChat = ai.chats.create({
      model: model,
      config: generationConfig as GenerateContentConfig,
    });

    const response = await sendGeminiMessage(
      vertexChat,
      textPrompt,
      "" // Empty input image for generation
    );

    if (!response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      throw new Error("Invalid response format from Gemini API");
    }

    const base64Image = response.candidates[0].content.parts[0].inlineData.data;

    // Cache the generated image
    const cacheResult = await cacheManager.cacheImage(
      objectType,
      visualStyle,
      base64Image,
      "gemini"
    );
    if (!cacheResult.success) {
      console.warn("Failed to cache image:", cacheResult.error);
    }

    return base64Image;
  } catch (error) {
    console.error("Error in generateImageBuffer:", error);
    throw error;
  }
}

// [START image_generation]
export async function generateImageWithGemini(
  promptId: string,
  objectType: string,
  inputImageData: string,
  visualStyle: string,
  filepath: string
): Promise<string> {
  try {
    // Check cache first
    const cachedResult = await cacheManager.getCachedImage(
      objectType,
      visualStyle,
      "gemini"
    );
    if (
      cachedResult.success &&
      cachedResult.data &&
      typeof cachedResult.data === "string"
    ) {
      console.log(
        `Using cached image for ${objectType} in ${visualStyle} style`
      );
      fs.writeFileSync(filepath, Buffer.from(cachedResult.data, "base64"));
      return filepath;
    }

    // If no cache hit, proceed with generation
    const model = aiConfig.models["generation_gemini"];
    if (!model) {
      throw new Error("Gemini model configuration not found");
    }

    const textPrompt = aiConfig.buildPrompt(promptId, {
      type: objectType,
      visualStyle: visualStyle,
    });

    const vertexChat = ai.chats.create({
      model: model,
      config: generationConfig as GenerateContentConfig,
    });

    if (inputImageData.startsWith("data:image/png;base64,")) {
      inputImageData = inputImageData.slice(22);
    }

    const response = await sendGeminiMessage(
      vertexChat,
      textPrompt,
      inputImageData
    );

    // // Check for inappropriate content in the response
    console.log("response from gemini", response);
    console.log("response safety", response.candidates?.[0]);

    if (response?.candidates?.[0]?.finishReason === "SAFETY") {
      return "__BLOCKED__";
    }

    if (!response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      throw new Error("Invalid response format from Gemini API");
    }

    const generatedImageData =
      response.candidates[0].content.parts[0].inlineData.data;

    // ...
    // [END image_generation]

    // Save to file
    fs.writeFileSync(filepath, generatedImageData, "base64");

    if (!fs.existsSync(filepath)) {
      throw new Error("Failed to save generated image");
    }

    // Cache the generated image
    await cacheManager.cacheImage(
      objectType,
      visualStyle,
      generatedImageData,
      "gemini"
    );

    console.log(`Saved image ${filepath}`);
    return filepath;
  } catch (error) {
    console.error("Error in generateImageWithGemini:", error);
    throw error;
  }
}

async function sendGeminiMessage(
  vertexChat: any,
  textData: string,
  inputImageData: string
): Promise<GeminiResponse> {
  try {
    const response = await vertexChat.sendMessage({
      message: [
        {
          text: textData,
        },
        {
          inlineData: {
            mimeType: "image/png",
            data: inputImageData,
          },
        },
      ],
    });

    if (!response) {
      throw new Error("No response received from Gemini API");
    }

    return response;
  } catch (error) {
    console.error("Error in sendGeminiMessage:", error);
    throw error;
  }
}

// Export the base64 generation function for direct access
export { generateImageBuffer };
