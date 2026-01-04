import express from "express";
import multer from "multer";
import cors from "cors";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { playlistSchema, parsedImageSchema } from "./schema.js";
import { query } from "./query.js";
import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { connectToDb } from "./db.js";
import { loadAllSecrets, getSecret } from "./secrets.js";
import {
  initializeCloudStorageClient,
  uploadToCloudStorage,
} from "./cloudStorage.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION;
const upload = multer({ storage: multer.memoryStorage() });
let db;

(async () => {
  await loadAllSecrets();
  db = await connectToDb();
  await initializeCloudStorageClient();
  const collection = db.collection("playlists");
  const openai = new OpenAI({ apiKey: getSecret("openai-api-key") });
  const adminPassword = getSecret("admin-password");
  const userPassword = getSecret("user-password");
  const JWT_SECRET = getSecret("jwt-secret");

  let cachedPlaylists = null;
  let cacheTimestamp = 0;
  const ONE_HOUR_IN_MS = 60 * 60 * 1000;

  if (process.env.NODE_ENV === "PROD") {
    app.use(
      cors({
        origin: "https://paulfaa.github.io",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );
  } else {
    app.use(
      cors({
        origin: "http://localhost:4200",
      })
    );
  }

  app.use(bodyParser.json());
  app.use(express.json());
  app.use(cookieParser());

  app.post("/login", (req, res) => {
    const { password } = req.body;
    let role = null;
    if (password === adminPassword) {
      role = "admin";
    } else if (password === userPassword) {
      role = "user";
    }

    if (role) {
      console.log("expires in:", JWT_EXPIRATION);
      const token = jwt.sign({ role }, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION,
      });
      res.status(200).json({
        success: true,
        role,
        token,
      });
      console.log(`User logged in successfully as ${role}`);
    } else {
      res.status(401).json({ message: "Unauthorized" });
      console.log("Login failed - invalid password");
    }
  });

  app.get("/check", authenticateToken, (req, res) => {
    console.log("/check - user is authenticated");

    res.status(200).json({
      authenticated: true,
      role: req.user.role,
    });
  });

  function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      console.log("Authentication failed: No token provided");
      return res.sendStatus(401);
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.log("Authentication failed: Invalid or expired token");
        return res.sendStatus(403);
      }

      req.user = user;
      console.log(`Authentication successful for role: ${user.role}`);
      next();
    });
  }

  app.get("/playlists", async (req, res) => {
    try {
      const now = Date.now();

      if (cachedPlaylists && now - cacheTimestamp < ONE_HOUR_IN_MS) {
        console.log("Serving playlists from cache");
        return res.status(200).json(cachedPlaylists);
      }

      const playlists = await collection
        .find({})
        .sort({ playlistDate: 1 })
        .toArray();
      console.log(`Fetched ${playlists.length} playlists from DB`);

      cachedPlaylists = playlists;
      cacheTimestamp = now;

      res.status(200).json(playlists);
    } catch (err) {
      console.error("Error fetching playlists:", err);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  app.post(
    "/upload",
    authenticateToken,
    upload.single("image"),
    async (req, res) => {
      try {
        const imageBuffer = req.file.buffer;
        const base64Image = imageBuffer.toString("base64");
        const mimeType = req.file.mimetype;
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        const response = await openai.responses.parse({
          model: "gpt-4o-mini",
          input: [
            {
              role: "system",
              content: query,
            },
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: dataUrl,
                },
              ],
            },
          ],
          text: { format: zodTextFormat(parsedImageSchema, "result") },
        });
        cachedPlaylists = null;
        cacheTimestamp = 0;

        const result = response.output_parsed;
        res.status(200).json(result);
      } catch (error) {
        console.error("Error processing image:", error);
        res.status(500).json({ error: "Failed to process image" });
      }
    }
  );

  app.post(
    "/save",
    authenticateToken,
    upload.single("image"),
    async (req, res) => {
      try {
        // Parse playlist data from FormData
        const playlistData = JSON.parse(req.body.playlistData);

        console.log("/save endpoint received payload:", playlistData);
        const parseResult = playlistSchema.safeParse(playlistData);

        if (!parseResult.success) {
          return res.status(400).json({
            error: "Invalid payload",
            details: parseResult.error.flatten(),
          });
        }

        console.log("/save endpoint received valid payload:", parseResult.data);

        // Check if a playlist already exists for the given date
        const existingPlaylist = await collection.findOne({
          playlistDate: parseResult.data.playlistDate,
        });

        if (existingPlaylist) {
          console.log(
            `Playlist for date ${parseResult.data.playlistDate} already exists. Not inserting.`
          );
          return res
            .status(400)
            .json({ error: "Playlist for this date already exists." });
        }

        // If an image was uploaded, upload it to Google Drive
        if (req.file) {
          try {
            const fileName = parseResult.data.playlistDate;
            const imageUrl = await uploadToCloudStorage(
              req.file.buffer,
              fileName,
              req.file.mimetype
            );
            parseResult.data.imageUrl = imageUrl;
            console.log(`Image uploaded to Google Drive: ${imageUrl}`);
          } catch (driveError) {
            console.error("Error uploading to Google Drive:", driveError);
            // Continue without the image URL rather than failing the entire save
          }
        }

        // Insert the playlist into the database
        const insertResult = await collection.insertOne(parseResult.data);
        cachedPlaylists = null;
        cacheTimestamp = 0;

        return res.status(201).json({
          message: `Playlist ${parseResult.data.playlistName} saved successfully`,
          imageUrl: parseResult.data.imageUrl,
        });
      } catch (err) {
        console.error(`Something went wrong in /save endpoint: ${err}\n`);
        return res.status(500).json({ error: "Failed to save playlist" });
      }
    }
  );

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`);
  });
})();

process.on("SIGINT", async () => {
  console.log("\nClosing MongoDB connection...");
  await getMongoClient().close();
  process.exit(0);
});
