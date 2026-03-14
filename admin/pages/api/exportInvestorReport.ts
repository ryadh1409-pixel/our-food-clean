import { computeInvestorMetrics } from '@/lib/analytics';
import nodemailer from 'nodemailer';
import type { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 2) + '..';
}

async function buildPdf(
  metrics: Awaited<ReturnType<typeof computeInvestorMetrics>>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 11;
  const lineHeight = 16;
  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;

  function drawPage1() {
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText('HalfOrder Investor Report', {
      x: margin,
      y,
      size: 22,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 28;

    const dateStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    page.drawText(dateStr, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 36;

    const lines = [
      `Total Users: ${metrics.totalUsers}`,
      `Active Users (last 7 days): ${metrics.activeUsers7d}`,
      `Total Orders: ${metrics.totalOrders}`,
      `Orders Today: ${metrics.ordersToday}`,
      `Match Rate: ${metrics.matchRate.toFixed(1)}%`,
      `Weekly Growth %: ${metrics.weeklyGrowthPercent.toFixed(1)}%`,
    ];
    lines.forEach((line) => {
      page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    });
  }

  function drawPage2() {
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText('Orders last 30 days', {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
    page.drawText(`Total: ${metrics.ordersLast30Days} orders.`, {
      x: margin,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: pageWidth - 2 * margin,
    });
    y -= lineHeight * 2;

    page.drawText('Peak ordering times', {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
    const peakText =
      metrics.peakHours.length > 0
        ? metrics.peakHours
            .map((h) => `${h.hour}:00 – ${h.count} orders`)
            .join(', ')
        : 'No data yet.';
    page.drawText(peakText, {
      x: margin,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: pageWidth - 2 * margin,
    });
  }

  function drawPage3() {
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText('Top Restaurants', {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 28;

    page.drawText('Restaurant', {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText('Orders', {
      x: margin + 280,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText('Avg price', {
      x: pageWidth - margin - 70,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= lineHeight + 4;

    metrics.topRestaurants.slice(0, 25).forEach((r) => {
      page.drawText(truncate(r.name, 38), {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(String(r.total), {
        x: margin + 280,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(`$${r.avgPrice.toFixed(2)}`, {
        x: pageWidth - margin - 70,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;
    });
  }

  function drawPage4() {
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText('Power Users', {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 28;

    page.drawText('Name', {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText('Email', {
      x: margin + 100,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText('Orders', {
      x: pageWidth - margin - 70,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= lineHeight + 4;

    metrics.powerUsers.forEach((u) => {
      page.drawText(truncate(u.name, 14), {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(truncate(u.email, 28), {
        x: margin + 100,
        y,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      page.drawText(String(u.totalOrders), {
        x: pageWidth - margin - 70,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;
    });
  }

  function drawPage5() {
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText('Startup Metrics', {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 28;

    const lines = [
      `Retention Rate (7-day): ${metrics.retentionRate.toFixed(1)}%`,
      `Average Orders per User: ${metrics.avgOrdersPerUser.toFixed(1)}`,
      `Average Order Value: $${metrics.avgOrderValue.toFixed(2)}`,
      `Average Savings per User: $${metrics.avgSavingsPerUser.toFixed(2)}`,
    ];
    lines.forEach((line) => {
      page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    });
  }

  drawPage1();
  drawPage2();
  drawPage3();
  drawPage4();
  drawPage5();

  return doc.save();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success?: boolean; error?: string }>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ADMIN_EMAIL?.trim()) {
    return res.status(500).json({ error: 'ADMIN_EMAIL is not configured' });
  }

  try {
    const metrics = await computeInvestorMetrics();
    const pdfBytes = await buildPdf(metrics);

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth:
        SMTP_USER && SMTP_PASS
          ? { user: SMTP_USER, pass: SMTP_PASS }
          : undefined,
    });

    await transporter.sendMail({
      from: SMTP_USER || ADMIN_EMAIL,
      to: ADMIN_EMAIL,
      subject: 'HalfOrder Investor Metrics Report',
      text: 'Attached is the latest analytics report.',
      html: '<p>Attached is the latest analytics report.</p>',
      attachments: [
        {
          filename: `HalfOrder-Investor-Report-${new Date().toISOString().slice(0, 10)}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    });

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('exportInvestorReport:', e);
    res.status(500).json({
      error:
        e instanceof Error ? e.message : 'Failed to export and send report',
    });
  }
}
