import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY;

async function testImagenFetch() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: "A red apple" }],
      parameters: { sampleCount: 1, aspectRatio: "1:1" }
    })
  });
  const data: any = await response.json();
  console.log("Response status:", response.status);
  if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
    console.log("Success! Image generated, base64 length:", data.predictions[0].bytesBase64Encoded.length);
  } else {
    console.log("Response data:", data);
  }
}

testImagenFetch();
