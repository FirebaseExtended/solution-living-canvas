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

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const aiHelper = require("./helpers/ai-config-helper.js");
const imagenWrapper = require("./helpers/imagen-generation.js");
const geminiWrapper = require("./helpers/gemini-generation.js");

const readFile = promisify(fs.readFile);

async function runPregeneration() {
  for (var j = 0; j < aiHelper.config.visualStyles.length; j++) {
    const visualStyleId = aiHelper.config.visualStyles[j].id;
    const visualStylePrompt = aiHelper.config.visualStyles[j].prompt;

    for (var i = 0; i < aiHelper.config.pregenerated.length; i++) {
      const pregen = aiHelper.config.pregenerated[i];
      console.log("Id:", pregen.id);
      console.log("Filename:", pregen.filename);

      const filepath = path.join(
        __dirname,
        "../client/public/assets/generated/",
        visualStyleId,
        pregen.filename
      );

      switch (pregen.type) {
        case "object":
          //   continue;
          console.log("Type: object");

          await imagenWrapper.generateImageWithImagen(
            "imagen_pregen_object",
            pregen.description || pregen.id,
            visualStylePrompt,
            filepath
          );
          break;
      }
    }
  }
}

runPregeneration();
