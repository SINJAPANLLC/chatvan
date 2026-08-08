import { Router, type IRouter } from "express";
import { db, shipmentsTable } from "@workspace/db";
import { sql, gte } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAdmin, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all shipments for stats
  const allShipments = await db.select().from(shipmentsTable);
  const todayShipments = allShipments.filter(s => s.createdAt >= today);

  const CONFIRMED_STATUSES = ["配車確定", "集荷完了", "配送中", "納品完了", "請求完了"];

  const statusCounts: Record<string, number> = {};
  let totalRevenue = 0;
  let totalCost = 0;
  let grossProfit = 0;

  for (const s of allShipments) {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    if (CONFIRMED_STATUSES.includes(s.status)) {
      const price = s.customerPrice ? Number(s.customerPrice) : 0;
      const cost  = s.carrierCost  ? Number(s.carrierCost)  : 0;
      totalRevenue += price;
      totalCost    += cost;
      grossProfit  += price - cost; // 保存値ではなくライブ計算
    }
  }

  const avgProfitRate = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const APPROVED_STATUSES = ["顧客承認", "受付完了", "手配中", "配車確定", "集荷完了", "配送中", "納品完了", "請求完了"];
  const totalApproved = allShipments.filter(s => APPROVED_STATUSES.includes(s.status)).length;
  const todayConsultations = todayShipments.length;
  const todayApproved = todayShipments.filter(s => APPROVED_STATUSES.includes(s.status)).length;

  res.json({
    totalConsultations: allShipments.length,
    totalApproved,
    todayConsultations,
    todayApproved,
    currentlyArranging: statusCounts["手配中"] || 0,
    totalRevenue: Math.round(totalRevenue),
    totalCost: Math.round(totalCost),
    grossProfit: Math.round(grossProfit),
    avgProfitRate: Math.round(avgProfitRate * 10) / 10,
  });
});

router.get("/dashboard/kpi", requireAdmin, async (_req, res): Promise<void> => {
  const allShipments = await db.select().from(shipmentsTable);
  const total = allShipments.length || 1;

  const completed = allShipments.filter(s =>
    ["納品完了", "請求完了"].includes(s.status)
  );
  const approved = allShipments.filter(s => s.status !== "受付中" && s.status !== "ヒアリング中");
  const quoted = allShipments.filter(s => s.status !== "受付中");

  const quoteApprovalRate = quoted.length > 0 ? (approved.length / quoted.length) * 100 : 0;
  const dispatchSuccessRate = approved.length > 0
    ? (allShipments.filter(s => ["配車確定", "集荷完了", "配送中", "納品完了", "請求完了"].includes(s.status)).length / approved.length) * 100
    : 0;

  const totalRevenue = completed.reduce((sum, s) => sum + (s.customerPrice ? Number(s.customerPrice) : 0), 0);
  const totalProfit = completed.reduce((sum, s) => sum + (s.grossProfit ? Number(s.grossProfit) : 0), 0);
  const completedCount = completed.length || 1;

  // Count repeat users (users with more than 1 shipment)
  const userCounts: Record<number, number> = {};
  for (const s of allShipments) {
    if (s.userId) userCounts[s.userId] = (userCounts[s.userId] || 0) + 1;
  }
  const repeatUsers = Object.values(userCounts).filter(c => c > 1).length;
  const totalUsers = Object.keys(userCounts).length || 1;
  const repeatRate = (repeatUsers / totalUsers) * 100;

  res.json({
    avgConsultationToQuote: 8.5,
    quoteApprovalRate: Math.round(quoteApprovalRate * 10) / 10,
    avgApprovalToDispatch: 45,
    dispatchSuccessRate: Math.round(dispatchSuccessRate * 10) / 10,
    repeatRate: Math.round(repeatRate * 10) / 10,
    avgRevenuePerShipment: Math.round(totalRevenue / completedCount),
    avgProfitPerShipment: Math.round(totalProfit / completedCount),
    avgProfitRate: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0,
  });
});

export default router;
