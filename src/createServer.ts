import express from "express";
import cookieParser from "cookie-parser";
import passport from "passport";
import indexRouter from "./routes/index.routes.js";
import "./config/passport.config.js";
import "dotenv/config";

export function createServer() {
    const app = express();

    app.use(express.json());
    app.use(cookieParser());
    app.use(passport.initialize());

    app.get("/", (req, res) => {
        res.send("Hello, World!");
    });

    app.use(indexRouter);
    return app;
}
