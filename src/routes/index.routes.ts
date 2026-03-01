import { Router } from "express";
import authRouter from "./auth.routes.js";
import userRouter from "./user.routes.js";
import adminRouter from "./admin.routes.js";
import uploadsRouter from "./uploads.routes.js";

const indexRouter = Router();

indexRouter.use("/api/auth", authRouter);
indexRouter.use("/api/user", userRouter);
indexRouter.use("/api/admin", adminRouter);
indexRouter.use("/api/uploads", uploadsRouter);

export default indexRouter;