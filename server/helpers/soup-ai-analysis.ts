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

import { SafetySetting, VertexAI } from "@google-cloud/vertexai";
import { getGoogleCloudConfig } from "../config";
import { config as aiConfig } from "./ai-config-helper";

const { projectId, location } = getGoogleCloudConfig();

interface AnalysisResult {
  type: string;
  attributes?: string[];
  shouldRemove?: boolean;
}

interface CommandResult {
  verb: string;
  target: string;
}

interface Schema {
  type: string;
  properties: {
    [key: string]: {
      type: string;
      description?: string;
      properties?: {
        [key: string]: {
          type: string;
          description?: string;
        };
      };
    };
  };
  required?: string[];
}

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: projectId,
  location: location,
});

function getAttributes() {
  let attributes = "";
  for (let i = 0; i < aiConfig.attributes.length; i++) {
    attributes += ` '${aiConfig.attributes[i].key}'`;
    if (i < aiConfig.attributes.length - 1) {
      attributes += ",";
    }
  }

  return attributes;
}

function getTypes() {
  let types = "";
  for (let i = 0; i < aiConfig.types.length; i++) {
    types += ` '${aiConfig.types[i].is}'`;
    if (i < aiConfig.types.length - 1) {
      types += ",";
    }
  }
  return types;
}

// [START image_to_config]
export async function imageToConfig(
  base64Image: string
): Promise<AnalysisResult> {
  try {
    if (!base64Image) {
      throw new Error("No image data provided");
    }

    const types = getTypes();

    // "analysis_initialGuess": "If this image contains a drawing,
    // which of these options are the best way to describe this image?
    // If the image contains written text, what does the text say?
    // Or say 'none' if the image does not match any of the types.
    // {{types}}",
    const textPrompt = aiConfig.buildPrompt("analysis_initialGuess", {
      types: types,
    });

    const result = await sendMultimodalRequest(
      textPrompt,
      base64Image,
      "imageToConfig"
    );

    if (result === "__BLOCKED__") {
      return aiConfig.getSafetySettingsResponse();
    }

    if (!result) {
      throw new Error("No response received from AI model");
    }

    let typeMatched = false;
    let finalResult: AnalysisResult;

    try {
      finalResult = JSON.parse(result) as AnalysisResult;
    } catch (error: any) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }

    // Check for inappropriate content early
    if (aiConfig.isInappropriateContent(finalResult.type)) {
      return aiConfig.getSafetySettingsResponse();
    }

    console.debug("Gemini Analysis - Initial Guess:", finalResult);

    for (let i = 0; i < aiConfig.types.length; i++) {
      if (finalResult.type.includes(aiConfig.types[i].is)) {
        console.log("Gemini Analysis - Found type:", aiConfig.types[i].is);

        finalResult.type = aiConfig.types[i].is;
        finalResult.attributes = aiConfig.types[i].attributes;
        typeMatched = true;
        break;
      }
    }

    if (!typeMatched) {
      console.debug(
        "Gemini Analysis - No type matched, asking for generic analysis"
      );

      // "analysis_genericGuess": "What do you think this image
      // is a drawing of? Describe it in one or two words max."
      const genericGuessText = await sendMultimodalRequest(
        aiConfig.prompts["analysis_genericGuess"],
        base64Image,
        "imageToConfig"
      );

      if (genericGuessText === "__BLOCKED__") {
        return aiConfig.getSafetySettingsResponse();
      }

      if (!genericGuessText) {
        throw new Error("No response received for generic analysis");
      }

      let genericGuess: AnalysisResult;

      try {
        genericGuess = JSON.parse(genericGuessText) as AnalysisResult;
      } catch (error: any) {
        throw new Error(
          `Failed to parse generic analysis response: ${error.message}`
        );
      }

      // Check for inappropriate content in generic guess
      if (aiConfig.isInappropriateContent(genericGuess.type)) {
        return aiConfig.getSafetySettingsResponse();
      }

      const attributes = getAttributes();

      // "analysis_attributesGuess": "Given this list of attributes,
      // which of these attributes are true for a {{type}} ?
      // The attributes are: {{attributes}}
      const attributesGuessText = await sendMultimodalRequest(
        aiConfig.buildPrompt("analysis_attributesGuess", {
          type: genericGuess.type,
          attributes: attributes,
        }),
        false,
        "attributesList"
      );

      // ...
      // [END image_to_config]

      // Check for inappropriate content in attributes guess
      if (attributesGuessText === "__BLOCKED__") {
        return aiConfig.getSafetySettingsResponse();
      }

      if (!attributesGuessText) {
        throw new Error("No response received for attributes analysis");
      }

      let attributesGuess;
      try {
        attributesGuess = JSON.parse(attributesGuessText);
      } catch (error: any) {
        throw new Error(
          `Failed to parse attributes analysis response: ${error.message}`
        );
      }

      console.log(
        "Gemini Analysis - Attributes:",
        typeof attributesGuess,
        attributesGuess
      );

      const combinedResult: AnalysisResult = {
        type: genericGuess.type,
        attributes: [],
      };

      for (let i = 0; i < aiConfig.attributes.length; i++) {
        const attribute = aiConfig.attributes[i].key;
        let attributesDict: { [key: string]: any } = {};

        if ("attributes" in attributesGuess) {
          attributesDict = attributesGuess.attributes;
        } else {
          attributesDict = attributesGuess;
        }

        const attributeValue = attributesDict[attribute];

        if (attributeValue) {
          if ("mapsTo" in aiConfig.attributes[i]) {
            combinedResult.attributes?.push(
              aiConfig.attributes[i].mapsTo as string
            );
          } else {
            combinedResult.attributes?.push(attribute);
          }
        }
      }

      return combinedResult;
    }

    return finalResult;
  } catch (error: any) {
    console.error("Error in imageToConfig:", error);
    throw error;
  }
}

export async function imageToText(
  base64Image: string,
  textPrompt: string
): Promise<string> {
  try {
    if (!base64Image) {
      throw new Error("No image data provided");
    }
    if (!textPrompt) {
      throw new Error("No text prompt provided");
    }

    const result = await sendMultimodalRequest(
      textPrompt,
      base64Image,
      "imageToText"
    );

    if (!result) {
      throw new Error("No response received from AI model");
    }

    console.log("Result from sendMultimodalRequest:", result);
    return result;
  } catch (error: any) {
    console.error("Error in imageToText:", error);
    throw error;
  }
}

async function sendMultimodalRequest(
  textPrompt: string,
  base64Image: string | false,
  schemaType: string,
  model: string = "gemini-2.0-flash-exp"
): Promise<string> {
  try {
    if (!textPrompt) {
      throw new Error("No text prompt provided");
    }

    console.log(
      `Preparing multimodal request... with schema ${schemaType} and with text: ${textPrompt}`
    );

    let schema: Schema | null = null;

    switch (schemaType) {
      case "imageToConfig":
        schema = {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
          },
        };
        break;
      case "imageToConfigWithAttributes":
        schema = {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
            attributes: { type: "STRING" },
          },
        };
        break;
      case "imageToConfigWithAttributesInJson":
        schema = {
          type: "OBJECT",
          properties: {
            type: { type: "STRING" },
            attributes: {
              type: "OBJECT",
              properties: {},
            },
          },
        };

        for (let i = 0; i < aiConfig.attributes.length; i++) {
          schema.properties.attributes.properties![aiConfig.attributes[i].key] =
            {
              type: "INTEGER",
            };
        }

        console.log("Schema:", JSON.stringify(schema, null, 2));
        break;
      case "textToCommand":
        schema = {
          type: "OBJECT",
          properties: {
            verb: {
              type: "STRING",
              description:
                "The action to perform. Must be one of: setFire, destroy, douse, magnetize, electrify",
            },
            target: {
              type: "STRING",
              description:
                "The object to perform the action on. Must be one of the provided target values",
            },
          },
          required: ["verb", "target"],
        };
        break;
    }

    const generativeVisionModel = vertexAI.getGenerativeModel({
      model: model,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        topP: 0.1,
        topK: 1,
      },
      safetySettings: aiConfig.getSafetySettings() as SafetySetting[],
    });

    if (schema !== null) {
      // @ts-ignore Property 'generationConfig' is private and only accessible within class 'GenerativeModel'.
      generativeVisionModel.generationConfig.responseSchema = schema;
    }

    const textPart = { text: textPrompt };
    const request: any = {
      contents: [{ role: "user", parts: [textPart] }],
    };

    if (base64Image !== false) {
      const filePart = {
        inline_data: { data: base64Image, mimeType: "image/png" },
      };
      request.contents[0].parts.push(filePart);
    }

    const streamingResult = await generativeVisionModel.generateContentStream(
      request
    );
    const contentResponse = await streamingResult.response;
    console.log(
      "Content response finish reason:",
      contentResponse?.candidates?.[0]
    );

    // Check if the response is blocked by the safety settings
    if (contentResponse?.candidates?.[0]?.finishReason === "SAFETY") {
      return "__BLOCKED__";
    }
    console.log(
      "Content response candidates:",
      contentResponse?.candidates?.[0]?.content?.parts?.[0]?.text
    );

    if (!contentResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid response format from AI model");
    }

    return contentResponse.candidates[0].content.parts[0].text;
  } catch (error: any) {
    console.error("Error in sendMultimodalRequest:", error);
    if (error.code === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    } else if (error.code === 400) {
      throw new Error("Invalid request parameters");
    } else if (error.code === 401 || error.code === 403) {
      throw new Error("Authentication failed. Please check your credentials.");
    }
    throw error;
  }
}

function getVerbs() {
  let verbList = "";
  for (let i = 0; i < aiConfig.verbs.length; i++) {
    verbList += `"${aiConfig.verbs[i].key}"`;
    if (i < aiConfig.verbs.length - 1) {
      verbList += ",";
    }
  }
  return verbList;
}

function getTargetList(currentTargets: string[]) {
  let targetList = "";

  if (currentTargets && Array.isArray(currentTargets)) {
    for (let i = 0; i < currentTargets.length; i++) {
      targetList += `"${currentTargets[i]}"`;
      if (i < currentTargets.length - 1) {
        targetList += ",";
      }
    }
  }

  targetList += ',"LAST_OBJECT","LAST_CREATED","ALL"';

  return targetList;
}

// [START text_to_command]
export async function textToCommand(
  textCommand: string | null,
  currentTargets: any
): Promise<CommandResult> {
  try {
    let verbList = getVerbs();
    let targetList = getTargetList(currentTargets);

    // "analysis_textToCommand": You are a JSON parser.
    // Your task is to extract a verb and target from the
    // given text and return them in a specific JSON format.
    // The response MUST be a valid JSON object with EXACTLY
    // TWO fields: 'verb' and 'target'. BOTH fields are REQUIRED.
    // The verb MUST be one of these exact values: {{verbs}}
    // The target MUST be one of these exact values: {{targets}}
    // IMPORTANT: The target MUST be an object that can be acted
    // upon (like 'key', 'metal', etc.) and NOT an attribute or
    // property. For example, if the text is 'set the key on fire',
    // you MUST return exactly this JSON: { \"verb\": \"setFire\",
    // \"target\": \"key\" } Do not include any other text,
    // markdown, or formatting - just the JSON object.
    // The response MUST be parseable by JSON.parse() and MUST
    // contain BOTH verb and target fields. The target field MUST
    // be present and MUST be one of the provided target values.
    // Here is the text to analyze: {{text}}
    const commandText = await sendMultimodalRequest(
      aiConfig.buildPrompt("analysis_textToCommand", {
        text: textCommand ?? "",
        verbs: verbList,
        targets: targetList,
      }),
      false,
      "textToCommand"
    );

    // ...
    // [END text_to_command]

    if (!commandText) {
      throw new Error("No response received from AI model");
    }

    const cleanedText = commandText
      ? commandText
          .trim()
          .replace(/```json\n?|\n?```/g, "")
          .trim()
      : "";

    let command;
    try {
      command = JSON.parse(cleanedText);
    } catch (error: any) {
      throw new Error(`Failed to parse command response: ${error.message}`);
    }

    if (!command || typeof command !== "object") {
      throw new Error("Invalid command format: response is not an object");
    }

    const missingFields = [];
    if (!("verb" in command)) missingFields.push("verb");
    if (!("target" in command)) missingFields.push("target");

    if (missingFields.length > 0) {
      throw new Error(
        `Invalid command format: missing required fields: ${missingFields.join(
          ", "
        )}`
      );
    }

    if (
      typeof command.verb !== "string" ||
      typeof command.target !== "string"
    ) {
      throw new Error(
        "Invalid command format: verb and target must be strings"
      );
    }

    const validVerbs = aiConfig.verbs.map((v) => v.key);
    const validTargets = [
      ...(currentTargets || []),
      "LAST_OBJECT",
      "LAST_CREATED",
      "ALL",
    ];

    if (!validVerbs.includes(command.verb)) {
      throw new Error(
        `Invalid verb: ${command.verb}. Must be one of: ${validVerbs.join(
          ", "
        )}`
      );
    }

    if (!validTargets.includes(command.target)) {
      throw new Error(
        `Invalid target: ${command.target}. Must be one of: ${validTargets.join(
          ", "
        )}`
      );
    }

    return {
      verb: command.verb.toLowerCase(),
      target: command.target.toLowerCase(),
    };
  } catch (error: any) {
    console.error("Error in textToCommand:", error);
    throw error;
  }
}
