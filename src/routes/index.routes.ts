import { Router } from "express";
import authRouter from "./auth.routes.js";
import userRouter from "./user.routes.js";

const indexRouter = Router();

indexRouter.use("/api/auth", authRouter);
indexRouter.use("/api/user", userRouter);

export default indexRouter;