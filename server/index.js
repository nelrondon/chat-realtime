import express from "express";
import logger from "morgan";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

import { Server } from "socket.io";
import { createServer } from "node:http";

dotenv.config();

const PORT = process.env.PORT ?? 1234;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

const db = createClient({
  url: "libsql://chat-messages-nelrondon.aws-us-east-1.turso.io",
  authToken: process.env.DB_TOKEN,
});

await db.execute(
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT)`
);

app.use(logger("dev"));

app.disable("x-powered-by");

io.on("connection", async (socket) => {
  const { username } = socket.handshake.auth;
  console.log(`Se ha conectado! => ${username}`);

  socket.on("disconnect", () => {
    console.log(`Se ha desconectado! => ${username}`);
  });

  socket.on("mensaje", async (msg) => {
    let result;
    try {
      result = await db.execute({
        sql: "INSERT INTO messages (content, user) VALUES (:msg, :username)",
        args: { msg, username },
      });
    } catch (e) {
      console.error(e);
    }

    io.emit("mensaje", msg, result.lastInsertRowid.toString(), username);
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT id, content, user FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      results.rows.forEach((row) => {
        socket.emit("mensaje", row.content, row.id.toString(), row.user);
      });
    } catch (e) {}
  }
});

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/");
  //   res.sendFile(process.cwd() + "/client/style.css");
});

server.listen(PORT, () => {
  console.log(`server listening on port http://localhost:${PORT}`);
});
