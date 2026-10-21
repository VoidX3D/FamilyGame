/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* The OpenAPI description of this service.
 *
 * It is the same document a Swagger UI, Postman or a code generator would
 * read, so the docs page on /api/docs and the machine readable file on
 * /api/openapi.json can never drift apart.
 */

const servers = [
  { url: "https://familygame.wisp.uno", description: "Production" },
  { url: "http://localhost:3000", description: "Local development" },
];

function errorResponse(description) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
}

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Family Game Hub API",
    version: "1.0.0",
    summary: "Rooms, games and content for a private family party game.",
    description: [
      "The API behind the Family Game Hub.",
      "",
      "Players join a room with a five character code. The host signs in with a passcode over REST and then drives the room over a Socket.IO connection.",
      "",
      "REST is used for the things that happen before and around a game: signing in, reading and editing the game content, and checking that the service is alive.",
      "",
      "Socket.IO carries everything that happens during a game: the room state, the player actions and the host controls. The events are listed at the bottom of this page.",
    ].join("\n"),
    contact: { name: "Family Game Hub" },
    license: { name: "Private use" },
  },
  servers,
  tags: [
    { name: "Service", description: "Is the service alive, and what is in it?" },
    { name: "Games", description: "The games a host can start." },
    { name: "Admin", description: "Host sign in and session." },
    { name: "Content", description: "The words, questions, people and places the games use." },
  ],
  paths: {
    "/": {
      get: {
        tags: ["Service"],
        summary: "What this service is",
        operationId: "getService",
        responses: {
          200: {
            description: "The service answered.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    service: { type: "string", example: "familygame-api" },
                    status: { type: "string", example: "ok" },
                    version: { type: "string", example: "1.0.0" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api": {
      get: {
        tags: ["Service"],
        summary: "The API index",
        description:
          "What this service offers and where to find it. The front end is served from another host, so the API address on its own used to land on a page that did not exist.",
        operationId: "getApiIndex",
        responses: {
          200: {
            description: "The index.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    name: { type: "string", example: "Family Game Hub API" },
                    version: { type: "string", example: "1.0.0" },
                    documentation: { type: "string", example: "/api/docs" },
                    openapi: { type: "string", example: "/api/openapi.json" },
                    endpoints: {
                      type: "object",
                      additionalProperties: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/healthz": {
      get: {
        tags: ["Service"],
        summary: "Everything worth knowing about the running service",
        description:
          "The uptime, the number of rooms and players, the content status, the allowed frontends and the memory the process is using. It is public on purpose, so a monitor or a curious family member can see that the thing is working.",
        operationId: "getHealth",
        responses: {
          200: {
            description: "The service is healthy.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Health" } },
            },
          },
        },
      },
    },
    "/api/games": {
      get: {
        tags: ["Games"],
        summary: "The games a host can start",
        operationId: "getGames",
        responses: {
          200: {
            description: "The catalogue.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    locale: { type: "string", example: "en" },
                    games: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Game" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/login": {
      post: {
        tags: ["Admin"],
        summary: "Sign in as the host",
        description:
          "Exchanges the host passcode for an opaque bearer token. The token is valid for twelve hours and is sent back with every admin request.",
        operationId: "adminLogin",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["passcode"],
                properties: {
                  passcode: { type: "string", example: "familygameadmin" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Signed in.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    token: { type: "string" },
                    expiresAt: { type: "number", description: "Epoch milliseconds." },
                  },
                },
              },
            },
          },
          401: errorResponse("The passcode was wrong."),
          429: errorResponse("Too many attempts from this address."),
        },
      },
    },
    "/api/admin/me": {
      get: {
        tags: ["Admin"],
        summary: "Check that a token is still good",
        operationId: "adminMe",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "The token is valid.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    expiresAt: { type: "number" },
                  },
                },
              },
            },
          },
          401: errorResponse("The token is missing or expired."),
        },
      },
    },
    "/api/admin/logout": {
      post: {
        tags: ["Admin"],
        summary: "Sign out",
        operationId: "adminLogout",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "The token was revoked.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/content": {
      get: {
        tags: ["Content"],
        summary: "Every collection and its entries",
        operationId: "getContent",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "The content, with the collections and their counts.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    collections: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Collection" },
                    },
                    items: {
                      type: "object",
                      additionalProperties: { type: "array" },
                    },
                    status: { $ref: "#/components/schemas/ContentStatus" },
                  },
                },
              },
            },
          },
          401: errorResponse("The token is missing or expired."),
        },
      },
    },
    "/api/admin/content/{key}": {
      put: {
        tags: ["Content"],
        summary: "Replace a collection",
        description:
          "The whole collection is replaced. Every entry is checked first, and if anything is wrong nothing is saved and the errors come back with the row they belong to.",
        operationId: "putContent",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "oneOfUsWords",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Saved.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" }, key: { type: "string" } },
                },
              },
            },
          },
          400: errorResponse("Some entries were not valid."),
          401: errorResponse("The token is missing or expired."),
          404: errorResponse("There is no collection with that name."),
        },
      },
    },
    "/api/admin/content/{key}/reset": {
      post: {
        tags: ["Content"],
        summary: "Put a collection back to the built in list",
        operationId: "resetContent",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "oneOfUsWords",
          },
        ],
        responses: {
          200: {
            description: "Reset.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean" } } },
              },
            },
          },
          401: errorResponse("The token is missing or expired."),
          404: errorResponse("There is no collection with that name."),
        },
      },
    },
    "/api/admin/content/reset": {
      post: {
        tags: ["Content"],
        summary: "Put every collection back to the built in list",
        operationId: "resetAllContent",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Reset.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean" } } },
              },
            },
          },
          401: errorResponse("The token is missing or expired."),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "The token from /api/admin/login.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: false },
          error: { type: "string", example: "not_found" },
          message: { type: "string" },
          errors: { type: "array", items: { type: "string" } },
        },
      },
      Game: {
        type: "object",
        properties: {
          id: { type: "string", example: "one-of-us" },
          name: { type: "string", example: "One of Us" },
          tagline: { type: "string" },
          minPlayers: { type: "number", example: 3 },
          maxPlayers: { type: "number", example: 10 },
          maxRounds: { type: "number", example: 3 },
          hasScore: { type: "boolean" },
        },
      },
      Collection: {
        type: "object",
        properties: {
          key: { type: "string", example: "oneOfUsWords" },
          label: { type: "string" },
          game: { type: "string" },
          kind: { type: "string", example: "record" },
          count: { type: "number" },
        },
      },
      ContentStatus: {
        type: "object",
        properties: {
          file: { type: "string", nullable: true },
          persisted: { type: "boolean" },
          error: { type: "string", nullable: true },
        },
      },
      Health: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          service: { type: "string" },
          version: { type: "string" },
          environment: { type: "string", example: "production" },
          uptimeSeconds: { type: "number" },
          rooms: { type: "number" },
          players: { type: "number" },
          games: { type: "number" },
          adminSessions: { type: "number" },
          content: { $ref: "#/components/schemas/ContentStatus" },
          allowedOrigins: { type: "array", items: { type: "string" } },
          node: { type: "string", example: "v22.11.0" },
          memory: {
            type: "object",
            properties: {
              rssMb: { type: "number" },
              heapUsedMb: { type: "number" },
            },
          },
          time: { type: "string", format: "date-time" },
        },
      },
    },
  },
  "x-socketio": {
    description:
      "Everything that happens during a game travels over Socket.IO rather than REST.",
    events: [
      { name: "state", direction: "server to client", summary: "The whole room and game state." },
      { name: "room:check", direction: "client to server", summary: "Check whether a room code exists." },
      { name: "room:join", direction: "client to server", summary: "Join a room, with a name or a seat token." },
      { name: "room:leave", direction: "client to server", summary: "Leave the room." },
      { name: "game:action", direction: "client to server", summary: "A player action, such as a vote or a guess." },
      { name: "draw:stroke", direction: "both", summary: "A point on the drawing board. It has its own channel, because it is a stream." },
      { name: "draw:sync", direction: "both", summary: "Ask for the drawing so far after joining mid turn." },
      { name: "admin:createRoom", direction: "client to server", summary: "Create the room, or get the one this host already has." },
      { name: "admin:startGame", direction: "client to server", summary: "Start one game." },
      { name: "admin:startPlaylist", direction: "client to server", summary: "Start a game night." },
      { name: "admin:nextPlaylistGame", direction: "client to server", summary: "Start the next game of the night." },
      { name: "admin:nextRound", direction: "client to server", summary: "Move to the next round." },
      { name: "admin:gameAction", direction: "client to server", summary: "A host control, such as skipping a turn." },
      { name: "admin:endGame", direction: "client to server", summary: "End the current game." },
      { name: "admin:endPlaylist", direction: "client to server", summary: "End the game night." },
    ],
  },
};
