import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY;

async function testVeoFetch(modelId: string, durationVal: any) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predictLongRunning?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: "A red ball rolling on a wooden floor" }],
      parameters: {
        aspectRatio: "16:9",
        durationSeconds: durationVal
      }
    })
  });
  const data: any = await response.json();
  console.log(`[durationVal=${JSON.stringify(durationVal)} (type ${typeof durationVal})] Status: ${response.status}`);
  if (response.status === 200) {
    console.log("SUCCESS!", data.name);
  } else {
    console.log(data.error?.message);
  }
}

async function run() {
  await testVeoFetch("veo-3.1-fast-generate-preview", 5);
  await testVeoFetch("veo-3.1-fast-generate-preview", 5.0);
  await testVeoFetch("veo-3.1-fast-generate-preview", "5");
  await testVeoFetch("veo-3.1-fast-generate-preview", 6);
  await testVeoFetch("veo-3.1-fast-generate-preview", 4);
  await testVeoFetch("veo-3.1-fast-generate-preview", 8);
  await testVeoFetch("veo-3.1-generate-preview", 5);
}

run();
