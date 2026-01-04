import { Storage } from "@google-cloud/storage";
import { getSecret } from "./secrets.js";

let storage = null;
let bucketName = "playlist-photos";

/**
 * Initializes the Google Cloud Storage client with service account credentials
 */
export async function initializeCloudStorageClient() {
  try {
    const serviceAccountKey = JSON.parse(getSecret("service-account-key"));

    storage = new Storage({
      credentials: serviceAccountKey,
      projectId: serviceAccountKey.project_id,
    });

    console.log("Google Cloud Storage client initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Google Cloud Storage client:", error);
    throw error;
  }
}

/**
 * Uploads a file to Google Cloud Storage
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} fileName - The name of the file
 * @param {string} mimeType - The MIME type of the file
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
export async function uploadToCloudStorage(fileBuffer, fileName, mimeType) {
  if (!storage) {
    throw new Error("Google Cloud Storage client not initialized");
  }

  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    await file.save(fileBuffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log(`File uploaded to GCS successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error("Error uploading file to Google Cloud Storage:", error);
    throw error;
  }
}
