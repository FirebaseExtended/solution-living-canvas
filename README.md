# Living Canvas: A web-based puzzle game powered by Generative AI

This is a demo app that shows how to build an AI-powered web game using Angular, PhaserJS, Gemini, Imagen, Veo and Firebase App Hosting.

**Explore the demo and its underlying concepts in more detail on the solutions page at https://developers.google.com/solutions/learn/living-canvas**

Living Canvas is a web-based puzzle game where users draw on the screen to bring objects to life. The drawings are analysed with Gemini and transformed into higher fidelity graphics using Gemini, Imagen and Veo before dropping the graphics into the game world with gameplay properties attached by Gemini.

*This project is intended for demonstration purposes only. It is not
intended for use in a production environment.*

## Try it out today

We recommend trying out this project in Antigravity. Open this repository in Antigravity to get started.

### Prerequisites

1. A new Firebase project
   - *We recommended using a new Firebase project for this demo. This [simplifies cleanup](#delete-and-clean-up-deployed-services) to avoid incurring on-going costs after trying out this demo app.*
1. [Activate billing on your Google Cloud / Firebase Project](https://console.cloud.google.com/billing/linkedaccount?project=_)
1. [Enable Vertex AI and recommended APIs](https://console.cloud.google.com/vertex-ai) in the Google Cloud console.
1. [Get a Gemini API key for your project in Google AI Studio.](https://aistudio.google.com/app/apikey)

> [!NOTE]
> Enabling billing and deploying services may incur a cost. Follow the steps under [Delete and clean up deployed services](#delete-and-clean-up-deployed-services) to remove any deployed services after trying out this demo.

## Running Locally

### Client

```
cd client
npm install
ng serve
```

### Server

```
cd server
npm install
npm run dev
```

## Running in Antigravity

1. Open the project in Antigravity.
2. Follow the steps under [Prerequisites](#prerequisites) to set up your Google Cloud project and API keys in your environment variables.
3. Start the client and server development servers.
4. The app is now ready!

## Deploying the app

You can deploy the backend and frontend to Firebase App Hosting using the Firebase CLI:

`firebase apphosting:backends:create --project PROJECT_ID --location us-central1`



## Delete and clean up deployed services

To avoid continued billing for the resources that you have created as part of trying out this demo app, delete the Firebase project or disable the deployed services.

If you have created a new project to test this app, follow [these steps to delete the project](https://support.google.com/firebase/answer/9137886?hl=en) through the Firebase console.

Alternatively, if you followed the steps to deploy Cloud Firestore, Functions and Cloud Storage for Firebase to an existing project, follow these steps to remove them manually through the console:
* [Delete data from Cloud Firestore](https://firebase.google.com/docs/firestore/using-console#delete_data)
* [Delete Cloud Functions](https://firebase.google.com/docs/functions/manage-functions?gen=2nd#delete_functions)
* [Delete Cloud Storage](https://firebase.google.com/docs/storage/manage-stored-files#delete)
* [Delete Cloud Run services](https://cloud.google.com/run/docs/managing/services#delete)

## Additional Information

This app is not an officially supported Google Product.




















<!-- 

# Folder Structure

- **client**: client app development, using Angular and PhaserJS
- **server**: server that serves the application, using Express.js

## Google Cloud project setup

Install the GCloud SDK to have access to GCloud on the command-line: https://cloud.google.com/sdk/docs/install

Via the Google Cloud console, create a project:
- https://console.cloud.google.com/welcome
- And enable the Gemini API: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?
- And enable the Vertex API: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com

Back in the terminal console, authenticate with GCloud to connect the Cloud project to the server app on the command-line:
```
gcloud auth login
gcloud config set project PROJECT_ID
``` -->
