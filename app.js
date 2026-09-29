var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
require("dotenv").config();

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/usersRouter");
var productsRouter = require("./routes/productsRouter");
var newsRouter = require("./routes/newsRouter");
var oderRouter = require("./routes/oderRouter");
const database = require("./config/db");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Cấu hình CORS cho phép Web Admin, Swagger UI gọi API
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Middleware đảm bảo kết nối DB cho mỗi request trên Serverless Vercel
app.use(async (req, res, next) => {
  await database.connectDB();
  next();
});

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/api/usersRouter", usersRouter);
app.use("/api/productsRouter", productsRouter);
app.use("/api/newsRouter", newsRouter);
app.use("/api/oderRouter", oderRouter);

// Giao diện Swagger UI tài liệu API
app.get(["/api-docs", "/swagger"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "swagger.html"));
});


// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
