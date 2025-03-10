const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const Chat = require("./models/chatModel");

dotenv.config();
connectDB();

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.get("/status", (req, res) => {
  res.send({ status: "API is running" });
});
app.get("/", (req, res) => {
  res.send("API is running");
});
app.use("/api", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Set to store online users
const onlineUsers = new Set();

io.on("connection", (socket) => {
  console.log("Connected to socket.io");

  // Store the userId on the socket object
  let userId = null;

  socket.on("setup", (userData) => {
    userId = userData._id; // Store the userId explicitly
    socket.join(userId);
    console.log(`User joined room: ${userId}`);

    onlineUsers.add(userId);
    io.emit("onlineUsers", Array.from(onlineUsers)); // Broadcast updated list
    socket.emit("connection");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
    console.log("User joined chat room: " + room);
  });

  socket.on("new message", async (newMessageRecieved) => {
    try {
      const chat = await Chat.findById(newMessageRecieved.chat).populate(
        "users"
      );
      if (!chat) {
        console.log("Chat not found");
        return;
      }
      io.to(newMessageRecieved.chat).emit("messageR", newMessageRecieved);
      console.log(newMessageRecieved, "socketmessage");

      const recipients = chat.users.filter(
        (user) =>
          user._id.toString() !== newMessageRecieved.sender._id.toString()
      );

      recipients.forEach((user) => {
        io.to(user._id.toString()).emit(
          "newMessageNotification",
          newMessageRecieved
        );
      });
    } catch (error) {
      console.error("Error sending new message:", error);
    }
  });

  socket.on("typing", (room) => {
    socket.in(room).emit("typing");
  });

  socket.on("stop typing", (room) => {
    socket.in(room).emit("stop typing");
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
    if (userId) {
      onlineUsers.delete(userId); // Remove the stored userId
      io.emit("onlineUsers", Array.from(onlineUsers)); // Broadcast updated list
      console.log(`User ${userId} removed from onlineUsers`);
    }
  });
});
