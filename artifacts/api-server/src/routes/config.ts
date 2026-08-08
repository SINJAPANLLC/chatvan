import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Public Square config — Application ID and Location ID are publishable (not secret)
router.get("/config/payment", (_req, res) => {
  res.json({
    squareApplicationId: process.env.SQUARE_APPLICATION_ID ?? "",
    squareLocationId: process.env.SQUARE_LOCATION_ID ?? "",
    squareEnvironment: process.env.SQUARE_ENVIRONMENT ?? "production",
  });
});

export default router;
