import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  listTrips,
  createTrip,
  deleteTrip,
  getTripSummary,
  createPlace,
  assignPlaceToDay,
  createReservation,
  createPackingItem,
  togglePackingItem,
  createBudgetItem,
  createTodo,
  toggleTodo,
  loadDb,
} from "./db";

dotenv.config();

// Ensure DB is loaded on startup
loadDb();

const SUPPORTED_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommended)", provider: "google" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (legacy)", provider: "google" },
  { id: "gemma-4-31b-it", label: "Gemma 4 31B IT", provider: "google" },
] as const;

const DEFAULT_MODEL = "gemini-2.5-flash";
const PORT = Number(process.env.PORT) || 3000;
const ENV_PATH = path.resolve(process.cwd(), ".env");
const DIST_PATH = path.resolve(process.cwd(), "dist");

const SYSTEM_INSTRUCTION = `You are a helpful travel planning assistant.
You have access to tools that let you build trips, plan itinerary days, save places, create reservations, add packing checklists, budgets, and tasks.

When the user asks you to create a trip, schedule an activity, add a place, create a reservation (hotel, flight, restaurant, etc.), add packing items, or create a todo list, ALWAYS use the corresponding tools to execute these actions. After executing the tools, explain what you did.

Always respond in the following JSON format:
{
  "text": "Your conversational response here. Keep it brief, helpful, and engaging.",
  "itinerary": [
    {
      "day": "Day 1",
      "items": [
        {
          "time": "09:00 AM",
          "placeName": "Exact Place Name (e.g., Louvre Museum, Paris)",
          "description": "Short 1-sentence explanation of what to do.",
          "price": "Estimated price (e.g., $$, Free, $20)"
        }
      ]
    }
  ]
}
If you are displaying an itinerary that is stored in the database, or recommending one, return it in the "itinerary" array as shown above. If the user isn't asking for an itinerary, return an empty array for \`itinerary\`.`;

type ModelId = (typeof SUPPORTED_MODELS)[number]["id"];

function isSupportedModel(id: string): id is ModelId {
  return SUPPORTED_MODELS.some((m) => m.id === id);
}

function resolveModel(requested: unknown): ModelId {
  if (typeof requested !== "string") return DEFAULT_MODEL;
  const trimmed = requested.trim();
  return isSupportedModel(trimmed) ? trimmed : DEFAULT_MODEL;
}

function writeEnvKey(key: string, value: string): void {
  let content = "";
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, "utf8");
  }
  const regex = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${value.replace(/"/g, '\\"')}"`;
  content = regex.test(content) ? content.replace(regex, line) : `${content}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, content);
}

const geminiTools: any[] = [
  {
    functionDeclarations: [
      {
        name: "list_trips",
        description: "List all trips the user has created.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "create_trip",
        description: "Create a new trip. Generates itinerary days automatically when start_date and end_date are provided.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "The title of the trip (e.g., Iceland Road Trip)" },
            description: { type: "STRING", description: "Optional description of the trip" },
            start_date: { type: "STRING", description: "Start date (YYYY-MM-DD)" },
            end_date: { type: "STRING", description: "End date (YYYY-MM-DD)" },
            currency: { type: "STRING", description: "Three-letter currency code (e.g. USD, EUR)" }
          },
          required: ["title"]
        }
      },
      {
        name: "get_trip_summary",
        description: "Retrieve a complete summary of the trip including its days, assignments, places, reservations, and checklists.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER", description: "The ID of the trip" }
          },
          required: ["tripId"]
        }
      },
      {
        name: "create_place",
        description: "Seed a place/POI into the trip's place pool. You can immediately assign it to a day using assign_place_to_day afterwards.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            name: { type: "STRING" },
            description: { type: "STRING" },
            lat: { type: "NUMBER" },
            lng: { type: "NUMBER" },
            address: { type: "STRING" },
            google_place_id: { type: "STRING" },
            osm_id: { type: "STRING" },
            notes: { type: "STRING" },
            price: { type: "NUMBER" },
            currency: { type: "STRING" }
          },
          required: ["tripId", "name"]
        }
      },
      {
        name: "assign_place_to_day",
        description: "Add an existing place from the trip's pool onto an itinerary day timeline.",
        parameters: {
          type: "OBJECT",
          properties: {
            dayId: { type: "INTEGER", description: "Day ID to assign to" },
            placeId: { type: "INTEGER", description: "Place ID to assign" },
            notes: { type: "STRING", description: "Special notes for this day's visit" },
            place_time: { type: "STRING", description: "Time of day (e.g., '09:00')" },
            end_time: { type: "STRING", description: "End time (e.g., '11:00')" }
          },
          required: ["dayId", "placeId"]
        }
      },
      {
        name: "create_reservation",
        description: "Create a reservation (hotel, restaurant, flight, transport booking). Links to hotel accommodation if place_id, start_day_id, and end_day_id are provided.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            title: { type: "STRING" },
            type: { type: "STRING", description: "Type: hotel, restaurant, event, tour, activity, or other" },
            reservation_time: { type: "STRING", description: "Date/time string" },
            location: { type: "STRING" },
            confirmation_number: { type: "STRING" },
            notes: { type: "STRING" },
            day_id: { type: "INTEGER" },
            place_id: { type: "INTEGER", description: "Place ID for hotel type" },
            start_day_id: { type: "INTEGER", description: "Check-in Day ID" },
            end_day_id: { type: "INTEGER", description: "Check-out Day ID" },
            price: { type: "NUMBER", description: "Cost of the booking" }
          },
          required: ["tripId", "title", "type"]
        }
      },
      {
        name: "create_packing_item",
        description: "Add an item to the packing list.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            name: { type: "STRING" },
            category: { type: "STRING" }
          },
          required: ["tripId", "name"]
        }
      },
      {
        name: "toggle_packing_item",
        description: "Check or uncheck a packing list item.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            itemId: { type: "INTEGER" },
            checked: { type: "BOOLEAN" }
          },
          required: ["tripId", "itemId", "checked"]
        }
      },
      {
        name: "create_budget_item",
        description: "Add a custom expense tracking line item.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            name: { type: "STRING" },
            category: { type: "STRING" },
            total_price: { type: "NUMBER" },
            note: { type: "STRING" }
          },
          required: ["tripId", "name", "category", "total_price"]
        }
      },
      {
        name: "create_todo",
        description: "Add a generic planner task/to-do item.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            name: { type: "STRING" }
          },
          required: ["tripId", "name"]
        }
      },
      {
        name: "toggle_todo",
        description: "Toggle checklist completion status of a planner task.",
        parameters: {
          type: "OBJECT",
          properties: {
            tripId: { type: "INTEGER" },
            todoId: { type: "INTEGER" },
            checked: { type: "BOOLEAN" }
          },
          required: ["tripId", "todoId", "checked"]
        }
      }
    ]
  }
];

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  // --- REST DATABASE API ---

  app.get("/api/trips", (_req, res) => {
    res.json({ trips: listTrips() });
  });

  app.post("/api/trips", (req, res) => {
    const { title, description, start_date, end_date, currency } = req.body;
    try {
      const result = createTrip({ title, description, start_date, end_date, currency });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to create trip" });
    }
  });

  app.get("/api/trips/:id/summary", (req, res) => {
    const id = Number(req.params.id);
    const summary = getTripSummary(id);
    if (!summary) return res.status(404).json({ error: "Trip not found" });
    res.json(summary);
  });

  app.delete("/api/trips/:id", (req, res) => {
    const id = Number(req.params.id);
    const success = deleteTrip(id);
    res.json({ success });
  });

  app.post("/api/packing/:id/toggle", (req, res) => {
    const id = Number(req.params.id);
    const { tripId, checked } = req.body;
    const result = togglePackingItem(Number(tripId), id, Boolean(checked));
    res.json({ success: !!result, item: result });
  });

  app.post("/api/todo/:id/toggle", (req, res) => {
    const id = Number(req.params.id);
    const { tripId, checked } = req.body;
    const result = toggleTodo(Number(tripId), id, Boolean(checked));
    res.json({ success: !!result, todo: result });
  });

  app.get("/api/models", (_req, res) => {
    res.json({
      models: SUPPORTED_MODELS,
      defaultModel: DEFAULT_MODEL,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post("/api/key", (req: Request, res: Response) => {
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey) {
      return res.status(400).json({ error: "API key is required." });
    }
    try {
      process.env.GEMINI_API_KEY = apiKey;
      writeEnvKey("GEMINI_API_KEY", apiKey);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to persist API key:", err);
      res.status(500).json({ error: "Failed to save API key to .env" });
    }
  });

  app.post("/api/chat", async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "Missing GEMINI_API_KEY. Add it via the chat settings or your .env file.",
      });
    }

    const { prompt, history, tripId } = req.body ?? {};
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const selectedModel = resolveModel(req.body?.model);
    const isGemma = selectedModel.startsWith("gemma-");

    try {
      const ai = new GoogleGenAI({ apiKey });

      const contents: any[] = [];
      if (Array.isArray(history)) contents.push(...history);
      contents.push(prompt);

      // System context based on currently active trip (if any)
      let activeTripContext = "";
      if (tripId) {
        activeTripContext = `\n\nActive Trip context: The user is currently viewing the trip with ID ${tripId}. Perform actions/insertions on this trip if requested. If you need day IDs or place IDs, run get_trip_summary with tripId: ${tripId} first to fetch them.`;
      }

      let tripUpdated = false;

      // Handler maps
      const toolHandlers: Record<string, (args: any) => any> = {
        list_trips: () => {
          return { trips: listTrips() };
        },
        create_trip: (args) => {
          tripUpdated = true;
          return createTrip(args);
        },
        get_trip_summary: (args) => {
          const id = Number(args.tripId);
          return getTripSummary(id) || { error: "Trip not found" };
        },
        create_place: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          const { name, description, lat, lng, address, notes, website, phone, price, currency, google_place_id, osm_id } = args;
          return createPlace(id, { name, description, lat, lng, address, notes, website, phone, price, currency, google_place_id, osm_id });
        },
        assign_place_to_day: (args) => {
          tripUpdated = true;
          const dayId = Number(args.dayId);
          const placeId = Number(args.placeId);
          const { notes, place_time, end_time } = args;
          return assignPlaceToDay(dayId, placeId, { notes, place_time, end_time });
        },
        create_reservation: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          return createReservation(id, args);
        },
        create_packing_item: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          return createPackingItem(id, args.name, args.category);
        },
        toggle_packing_item: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          const itemId = Number(args.itemId);
          return togglePackingItem(id, itemId, args.checked) || { error: "Item not found" };
        },
        create_budget_item: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          return createBudgetItem(id, args.name, args.category, args.total_price, args.note);
        },
        create_todo: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          return createTodo(id, args.name);
        },
        toggle_todo: (args) => {
          tripUpdated = true;
          const id = Number(args.tripId);
          const todoId = Number(args.todoId);
          return toggleTodo(id, todoId, args.checked) || { error: "Todo not found" };
        }
      };

      let loopCount = 0;
      const maxLoops = 10;
      let finalResponse: any = null;

      while (loopCount < maxLoops) {
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION + activeTripContext,
            tools: geminiTools,
            ...(isGemma ? {} : { responseMimeType: "application/json" }),
          },
        });

        const calls = response.functionCalls;
        if (calls && calls.length > 0) {
          console.log(`[AI Chat] Model triggered ${calls.length} function calls`);

          // Append model's turn with tool requests
          contents.push({
            role: "model",
            parts: calls.map(c => ({
              functionCall: {
                name: c.name,
                args: c.args
              }
            }))
          });

          // Run each handler
          const responseParts = [];
          for (const call of calls) {
            const toolName = call.name;
            if (!toolName) continue;
            const handler = toolHandlers[toolName];
            let result;
            if (handler) {
              try {
                result = await handler(call.args);
              } catch (e: any) {
                console.error(`Error in tool execution: ${toolName}`, e);
                result = { error: e.message || "Failed execution" };
              }
            } else {
              result = { error: `Tool ${toolName} not implemented` };
            }

            responseParts.push({
              functionResponse: {
                name: toolName,
                response: result
              }
            });
          }

          // Append function response turn
          contents.push({
            role: "function",
            parts: responseParts
          });

          loopCount++;
        } else {
          finalResponse = response;
          break;
        }
      }

      if (!finalResponse) {
        throw new Error("Failed to generate content (too many tool execution hops)");
      }

      res.json({ text: finalResponse.text, model: selectedModel, tripUpdated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Gemini API error:", message);
      if (/API key not valid/i.test(message)) {
        return res.status(400).json({
          error: "Invalid GEMINI_API_KEY. Update it via chat settings or your .env file.",
        });
      }
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_PATH));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.resolve(DIST_PATH, "index.html"));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
