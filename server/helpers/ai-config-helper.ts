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

import fs from "fs";

interface SafetyCategory {
	category: string;
	threshold: string;
	description: string;
}

interface SafetyThresholds {
	[key: string]: string;
}

interface AIConfig {
  prompts: {
    [key: string]: string;
  };
  models: {
    [key: string]: string;
  };
  types: Array<{
    is: string;
    attributes: string[];
  }>;
  attributes: Array<{
    key: string;
    mapsTo?: string;
  }>;
  verbs: Array<{
    key: string;
  }>;
  visualStyles: Array<{
    id: string;
    prompt: string;
  }>;
  buildPrompt: (
    promptKey: string,
    valueObj: { [key: string]: string }
  ) => string;
  stringTemplateParser: (
    expression: string,
    valueObj: { [key: string]: string }
  ) => string;
	safetySettings: {
		categories: SafetyCategory[];
		defaultThreshold: string;
		thresholds: SafetyThresholds;
	};
	inappropriateKeywords: string[];
	safetySettingsResponse: {
		type: string;
		attributes: string[];
		shouldRemove: boolean;
	};
  cache: {
    enabled: boolean;
    poolSize: number;
    cacheDir: string;
  };
}

interface CacheConfig {
  enabled: boolean;
  poolSize: number;
  cacheDir: string;
}

import path from "path";

const configPath = fs.existsSync("./ai-config.json")
  ? "./ai-config.json"
  : fs.existsSync("./server/ai-config.json")
  ? "./server/ai-config.json"
  : path.join(__dirname, "../ai-config.json");

const aiConfig: AIConfig = JSON.parse(
  fs.readFileSync(configPath, "utf8")
);


function stringTemplateParser(
  expression: string,
  valueObj: { [key: string]: string }
): string {
  const templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;
  let text = expression.replace(templateMatcher, (substring, value, index) => {
    value = valueObj[value];
    return value;
  });
  return text;
}

function buildPrompt(
  promptKey: string,
  valueObj: { [key: string]: string }
): string {
  if (promptKey && promptKey.length > 0 && aiConfig.prompts[promptKey]) {
    return stringTemplateParser(aiConfig.prompts[promptKey], valueObj);
  }
  return "";
}

function getSafetySettings() {
	return aiConfig.safetySettings.categories.map((category) => ({
		category: category.category,
		threshold: category.threshold,
	}));
}

function getInappropriateKeywords() {
	return aiConfig.inappropriateKeywords;
}

function getSafetySettingsResponse() {
	return aiConfig.safetySettingsResponse;
}

function isInappropriateContent(type: string): boolean {
  return aiConfig.inappropriateKeywords.some(keyword => 
    type.toLowerCase().includes(keyword)
  );
}

function getCacheConfig(): CacheConfig {
  return {
    enabled: aiConfig.cache?.enabled ?? true,
    poolSize: aiConfig.cache?.poolSize ?? 4,
    cacheDir: aiConfig.cache?.cacheDir ?? "generated/cache",
  };
}

// Add the functions to the config object
const config = {
  ...aiConfig,
  buildPrompt,
  stringTemplateParser,
	getSafetySettings,
	getInappropriateKeywords,
	getSafetySettingsResponse,
	isInappropriateContent,
  getCacheConfig,
};
export { config };

