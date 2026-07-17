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

import sharp from "sharp";
import fs from "fs";

// Helper functions for image processing
function getDirPath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  if (slashIndex >= 0) {
    return path.substring(0, slashIndex);
  }

  // try Windows path
  return path.substring(0, path.lastIndexOf("\\"));
}

export async function resizeImage(
  inputFilePath: string,
  outputFilePath: string
): Promise<void> {
  try {
    // Check if input file exists
    if (!fs.existsSync(inputFilePath)) {
      throw new Error(`Input file not found: ${inputFilePath}`);
    }

    // Check if output directory exists
    const outputDir = getDirPath(outputFilePath);
    if (!fs.existsSync(outputDir)) {
      throw new Error(`Output directory not found: ${outputDir}`);
    }

    await sharp(inputFilePath).resize(64, 64).toFile(outputFilePath);

    // Verify the output file was created
    if (!fs.existsSync(outputFilePath)) {
      throw new Error(`Failed to save resized image to: ${outputFilePath}`);
    }

    console.log("Image resized successfully!");
  } catch (error: any) {
    console.error("Error resizing image:", error);
    throw error;
  }
}

export async function applyRoundedCornersAndBorder(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const cornerRadius = 16;
  const borderWidth = 2; // Adjust border width as needed
  const borderColor = "black"; // Border color

  try {
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Check if output directory exists
    const outputDir = getDirPath(outputPath);
    if (!fs.existsSync(outputDir)) {
      throw new Error(`Output directory not found: ${outputDir}`);
    }

    const cornerRadius = 16;
    const borderWidth = 4; // Uniform border width around all sides
    const borderColor = "black"; // Border color

    const innerWidth = 128;
    const innerHeight = 128;

    // Calculate total dimensions (including border on all sides)
    const totalWidth = innerWidth + 2 * borderWidth;
    const totalHeight = innerHeight + 2 * borderWidth;

    // Create a rounded corner mask for the inner image
    const mask = Buffer.from(
      `<svg width="${innerWidth}" height="${innerHeight}"><rect x="0" y="0" width="${innerWidth}" height="${innerHeight}" rx="${cornerRadius}" ry="${cornerRadius}"/></svg>`
    );

    // Create a background with the border color
    const background = Buffer.from(
      `<svg width="${totalWidth}" height="${totalHeight}"><rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${borderColor}" rx="${
        cornerRadius + borderWidth
      }" ry="${cornerRadius + borderWidth}"/></svg>`
    );

    const roundedInnerImageBuffer = await sharp(inputPath)
      .resize(innerWidth, innerHeight)
      .composite([
        {
          input: mask,
          blend: "dest-in", // Use the mask to determine which parts of the image to keep
        },
      ])
      .toBuffer();

    await sharp(background)
      .composite([
        {
          input: roundedInnerImageBuffer,
          blend: "over",
          left: borderWidth,
          top: borderWidth,
        },
        {
          input: background,
          blend: "dest-in",
        },
      ])
      .toFile(outputPath);

    // Verify the output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Failed to save processed image to: ${outputPath}`);
    }

    console.log(`Image with rounded corners and border saved to ${outputPath}`);
  } catch (error: any) {
    console.error("Error processing image:", error);
    throw error;
  }
}
